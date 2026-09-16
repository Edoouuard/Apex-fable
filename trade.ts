#!/usr/bin/env tsx
/**
 * intent CLI — the same pipeline as the web terminal, driven from a shell.
 *
 *   npm run trade -- "swap 0.1 eth to usdc on base"          # plan, confirm interactively, execute
 *   npm run trade -- "buy \$50 of sol" --yes                  # skip confirmation (policy still applies)
 *   npm run trade -- "sell 1 eth at 5000" --dry-run           # plan only
 *   npm run trade -- "buy 20 usdc of eth daily for 30 days"   # DCA: first fill now, rest by the daemon
 *   npm run trade -- --daemon                                 # run pending schedules from .intent/schedules.json
 *
 * Signing uses EVM_PRIVATE_KEY / SOLANA_PRIVATE_KEY from the environment.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseIntent } from "@/lib/intent/parse";
import type { DcaIntent, SwapIntent } from "@/lib/intent/schema";
import { buildPlan, PlanError } from "@/lib/plan/build";
import type { Plan } from "@/lib/plan/types";
import { runPlan } from "@/lib/execution/runner";
import { serverIO, serverSigner } from "@/lib/execution/server";
import { usd } from "@/lib/format";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const prompt = args.filter((a) => !a.startsWith("--")).join(" ");

const SCHED_DIR = ".intent";
const SCHED_FILE = `${SCHED_DIR}/schedules.json`;
type Schedule = { id: string; intent: DcaIntent; account: string; filled: number; nextAt: number; log: { at: number; ok: boolean; note: string }[] };

function loadSchedules(): Schedule[] {
  return existsSync(SCHED_FILE) ? (JSON.parse(readFileSync(SCHED_FILE, "utf8")) as Schedule[]) : [];
}
function saveSchedules(s: Schedule[]) {
  mkdirSync(SCHED_DIR, { recursive: true });
  writeFileSync(SCHED_FILE, JSON.stringify(s, null, 2));
}

function printPlan(plan: Plan) {
  console.log("\n" + plan.summary + "\n");
  console.log(`  out   ${plan.sell.human} ${plan.sell.token.symbol}  ${usd(plan.sell.usd)}`);
  console.log(`  in    ${plan.buy.human} ${plan.buy.token.symbol}  ${usd(plan.buy.usd)}${plan.minReceive ? `  (min ${plan.minReceive.human})` : ""}`);
  if (plan.route) console.log(`  route ${plan.route}`);
  for (const a of plan.attempts) console.log(`        ${a.venue.padEnd(8)} ${a.ok ? "quoted" : "no quote"}  ${a.error ?? ""} (${a.ms} ms)`);
  for (const v of plan.policy.violations) console.log(`  BLOCKED  ${v}`);
  for (const w of plan.policy.warnings) console.log(`  note     ${w}`);
  console.log("  steps:");
  plan.steps.forEach((s, i) => console.log(`    ${i + 1}. ${s.label}${s.kind === "evm_tx" && s.simulated ? " (simulated)" : ""}`));
  console.log("");
}

async function executePlan(plan: Plan): Promise<boolean> {
  const signer = serverSigner();
  const results = await runPlan(plan, signer, serverIO, (rs) => {
    const r = rs[rs.findIndex((x) => x.status === "running")] ?? rs[rs.length - 1];
    if (r) process.stdout.write(`  ${r.status.padEnd(8)} ${plan.steps.find((s) => s.id === r.id)?.label ?? ""} ${r.hash ?? r.orderUid ?? ""} ${r.error ?? ""}\n`);
  });
  const ok = results.every((r) => r.status === "done");
  console.log(ok ? "\nSettled." : "\nStopped. Nothing after the failed step was sent.");
  for (const r of results) if (r.explorerUrl) console.log(`  ${r.explorerUrl}`);
  return ok;
}

async function runDaemon() {
  console.log("intent daemon: watching schedules (ctrl-c to stop)");
  const signer = serverSigner();
  for (;;) {
    const scheds = loadSchedules();
    const now = Date.now();
    for (const s of scheds) {
      if (s.filled >= s.intent.fills || s.nextAt > now) continue;
      const swap: SwapIntent = { kind: "swap", chain: s.intent.chain, sell: { token: s.intent.sell.token, amount: s.intent.sell.amountPerFill }, buy: { token: s.intent.buy.token }, side: "sell", maxSlippageBps: s.intent.maxSlippageBps, venue: "auto" };
      const account = s.intent.chain === "solana" ? signer.solanaAddress : signer.evmAddress;
      if (!account) {
        s.log.push({ at: now, ok: false, note: "no signer for this chain" });
        continue;
      }
      try {
        const plan = await buildPlan(swap, { account });
        if (plan.policy.violations.length) throw new Error(plan.policy.violations.join("; "));
        console.log(`\n[${new Date().toISOString()}] fill ${s.filled + 1}/${s.intent.fills}: ${plan.summary}`);
        const ok = await executePlan(plan);
        s.log.push({ at: now, ok, note: ok ? plan.summary : "execution failed" });
        if (ok) s.filled += 1;
      } catch (e) {
        s.log.push({ at: now, ok: false, note: (e as Error).message });
        console.log(`  fill failed: ${(e as Error).message}`);
      }
      s.nextAt = now + s.intent.everySeconds * 1000; // failed fills retry next period, not immediately
      saveSchedules(scheds);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

async function main() {
  if (flags.has("--daemon")) return runDaemon();
  if (!prompt) {
    console.log('usage: npm run trade -- "<what you want>" [--yes] [--dry-run] | --daemon');
    process.exit(1);
  }
  const signer = serverSigner();
  const { intent, parser } = await parseIntent(prompt, { defaultChain: process.env.INTENT_DEFAULT_CHAIN });
  console.log(`read by ${parser}: ${JSON.stringify(intent)}`);
  if (intent.kind === "unsupported") {
    console.log(intent.reason);
    process.exit(2);
  }
  const account = intent.chain === "solana" ? signer.solanaAddress : signer.evmAddress;
  if (!account) {
    console.log(intent.chain === "solana" ? "Set SOLANA_PRIVATE_KEY to trade on Solana." : "Set EVM_PRIVATE_KEY to trade on EVM chains.");
    process.exit(2);
  }
  let plan: Plan;
  try {
    plan = await buildPlan(intent, { account });
  } catch (e) {
    console.log(e instanceof PlanError ? e.message : (e as Error).stack);
    process.exit(2);
  }
  printPlan(plan);
  if (flags.has("--dry-run")) return;
  if (plan.policy.violations.length) {
    console.log("Blocked by policy; nothing sent.");
    process.exit(3);
  }
  if (!flags.has("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question("Sign and send? [y/N] ")).trim().toLowerCase();
    rl.close();
    if (ans !== "y" && ans !== "yes") {
      console.log("Cancelled.");
      return;
    }
  }
  const ok = await executePlan(plan);
  if (ok && intent.kind === "dca") {
    const scheds = loadSchedules();
    scheds.push({ id: plan.id, intent, account, filled: 1, nextAt: Date.now() + intent.everySeconds * 1000, log: [{ at: Date.now(), ok: true, note: plan.summary }] });
    saveSchedules(scheds);
    console.log(`Schedule saved to ${SCHED_FILE}. Run \`npm run trade -- --daemon\` to keep filling.`);
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
