"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig } from "wagmi";
import { browserIO, browserSigner } from "@/lib/execution/browser";
import { runPlan } from "@/lib/execution/runner";
import type { Intent, SwapIntent } from "@/lib/intent/schema";
import type { Plan, StepResult } from "@/lib/plan/types";
import { PlanView } from "./PlanView";
import { Holdings, VenueList, WalletBar, useWallets } from "./Rail";

type Entry = {
  id: string;
  prompt: string;
  phase: "parsing" | "planning" | "ready" | "running" | "done" | "error";
  parser?: string;
  intent?: Intent;
  plan?: Plan;
  results: StepResult[];
  error?: string;
  schedule?: { fill: number; of: number; nextAt?: number };
};

const EXAMPLES = ["swap 0.05 ETH to USDC on base", "buy $25 of SOL", "sell 0.1 ETH at 5000 on arbitrum", "buy 20 USDC of ETH every day for 7 days on base"];

let seq = 0;

export function Terminal() {
  const w = useWallets();
  const config = useConfig();
  const [prompt, setPrompt] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const ta = useRef<HTMLTextAreaElement>(null);

  const patch = useCallback((id: string, p: Partial<Entry> | ((e: Entry) => Partial<Entry>)) => {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...(typeof p === "function" ? p(e) : p) } : e)));
  }, []);

  const accountFor = useCallback((intent: Intent): string | undefined => {
    if (intent.kind === "unsupported") return undefined;
    return intent.chain === "solana" ? w.sol : w.evm;
  }, [w.evm, w.sol]);

  const plan = useCallback(async (id: string, intent: Intent) => {
    const account = accountFor(intent);
    if (!account) {
      patch(id, { phase: "error", error: intent.kind !== "unsupported" && intent.chain === "solana" ? "Connect a Solana wallet to trade there." : "Connect an EVM wallet to trade on that chain." });
      return undefined;
    }
    patch(id, { phase: "planning" });
    const res = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent, account }) });
    const j = await res.json();
    if (!res.ok) {
      patch(id, { phase: "error", error: j.error ?? "couldn't build a plan" });
      return undefined;
    }
    patch(id, { phase: "ready", plan: j.plan, results: [] });
    return j.plan as Plan;
  }, [accountFor, patch]);

  const submit = useCallback(async (text: string) => {
    const p = text.trim();
    if (!p) return;
    const id = `e${++seq}`;
    setEntries((es) => [{ id, prompt: p, phase: "parsing", results: [] }, ...es]);
    setPrompt("");
    try {
      const res = await fetch("/api/intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: p, context: { defaultChain: w.evmChain ?? (w.sol && !w.evm ? "solana" : undefined) } }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "couldn't read that");
      const intent = j.intent as Intent;
      patch(id, { intent, parser: j.parser });
      if (intent.kind === "unsupported") {
        patch(id, { phase: "error", error: intent.reason });
        return;
      }
      await plan(id, intent);
    } catch (e) {
      patch(id, { phase: "error", error: (e as Error).message });
    }
  }, [w.evmChain, w.evm, w.sol, patch, plan]);

  const execute = useCallback(async (id: string, thePlan: Plan) => {
    patch(id, { phase: "running" });
    const signer = browserSigner(config, w.evm, w.sol);
    const results = await runPlan(thePlan, signer, browserIO, (r) => patch(id, { results: r }));
    const ok = results.every((r) => r.status === "done");
    patch(id, { phase: ok ? "done" : "error" });
    setRefreshKey((k) => k + 1);
    return ok;
  }, [config, w.evm, w.sol, patch]);

  const confirm = useCallback(async (id: string) => {
    const e = entries.find((x) => x.id === id);
    if (!e?.plan) return;
    const ok = await execute(id, e.plan);
    if (ok && e.plan.schedule) scheduleNext(id, e.plan, 1);
  }, [entries, execute]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleNext = useCallback((id: string, first: Plan, filled: number) => {
    const sched = first.schedule!;
    if (filled >= sched.fills) {
      patch(id, { schedule: { fill: filled, of: sched.fills } });
      return;
    }
    const nextAt = Date.now() + sched.everySeconds * 1000;
    patch(id, { schedule: { fill: filled, of: sched.fills, nextAt } });
    timers.current[id] = setTimeout(async () => {
      const dca = first.intent;
      if (dca.kind !== "dca") return;
      const swap: SwapIntent = { kind: "swap", chain: dca.chain, sell: { token: dca.sell.token, amount: dca.sell.amountPerFill }, buy: { token: dca.buy.token }, side: "sell", maxSlippageBps: dca.maxSlippageBps, venue: "auto" };
      const fresh = await plan(id, swap); // fresh quote each fill
      if (!fresh) return;
      const ok = await execute(id, { ...fresh, schedule: sched, intent: dca });
      if (ok) scheduleNext(id, first, filled + 1);
    }, sched.everySeconds * 1000);
  }, [patch, plan, execute]);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          Intent <small>say what you want, sign once</small>
        </div>
        <WalletBar w={w} />
      </header>

      <div className="layout">
        <section>
          <form
            className="prompt"
            onSubmit={(e) => {
              e.preventDefault();
              submit(prompt);
            }}
          >
            <textarea
              ref={ta}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(prompt);
                }
              }}
              placeholder="What do you want to do?"
              rows={2}
              autoFocus
              aria-label="Describe the trade you want"
            />
            <button className="btn primary go" type="submit" disabled={!prompt.trim()}>
              Read it
            </button>
          </form>
          <p className="hint">
            Try:{" "}
            {EXAMPLES.map((x) => (
              <button type="button" key={x} onClick={() => { setPrompt(x); ta.current?.focus(); }}>
                {x}
              </button>
            ))}
          </p>

          <div className="ledger">
            {entries.map((e) => (
              <article className="entry" key={e.id}>
                <div className="entry-head">
                  <span>
                    <q>{e.prompt}</q>
                  </span>
                  <span>{e.parser === "claude" ? "read by Claude" : e.parser === "rules" ? "read by rules" : ""}</span>
                </div>
                <div className="entry-body">
                  {e.phase === "parsing" && <p className="understood muted"><span className="spin" />Reading…</p>}
                  {e.phase === "planning" && <p className="understood muted"><span className="spin" />Pricing across venues…</p>}
                  {e.phase === "error" && !e.plan && <p className="understood err">{e.error}</p>}
                  {e.plan && (
                    <PlanView plan={e.plan} results={e.results} running={e.phase === "running"} done={e.phase === "done"} onConfirm={() => confirm(e.id)} schedule={e.schedule} />
                  )}
                  {e.phase === "error" && e.plan && e.error && <p className="understood err">{e.error}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="rail">
          <div>
            <h3>You hold</h3>
            <Holdings evm={w.evm} sol={w.sol} refreshKey={refreshKey} />
          </div>
          <div>
            <h3>Live venues</h3>
            <VenueList />
          </div>
          <div>
            <h3>How it works</h3>
            <p className="empty">
              Your words become one structured intent. Every configured venue prices it; the best executable quote wins. You see exactly what will happen, then sign in your own wallet. Keys never leave it.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
