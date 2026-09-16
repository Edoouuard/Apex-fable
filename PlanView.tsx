"use client";

import { fromRaw, pct, usd } from "@/lib/format";
import type { Plan, StepResult } from "@/lib/plan/types";
import { venueName } from "@/lib/plan/build";

export function PlanView({ plan, results, onConfirm, running, done, schedule }: { plan: Plan; results: StepResult[]; onConfirm: () => void; running: boolean; done: boolean; schedule?: { fill: number; of: number; nextAt?: number } }) {
  const blocked = plan.policy.violations.length > 0;
  const failed = results.some((r) => r.status === "failed");
  return (
    <>
      <p className="understood">{plan.summary}</p>

      <div className="legs">
        <div className="leg">
          <div className="amt">{plan.sell.human}</div>
          <div className="sym">{plan.sell.token.symbol} out</div>
          <div className="usd">{usd(plan.sell.usd)}</div>
        </div>
        <div className="arrow">→</div>
        <div className="leg">
          <div className="amt">{plan.buy.human}</div>
          <div className="sym">{plan.buy.token.symbol} in{plan.minReceive ? `, at least ${plan.minReceive.human}` : ""}</div>
          <div className="usd">{usd(plan.buy.usd)}</div>
        </div>
      </div>

      <dl className="kv">
        <dt>Route</dt>
        <dd>{plan.route ?? "—"}</dd>
        {plan.intent.kind !== "limit" && (
          <>
            <dt>Max slippage</dt>
            <dd>{pct(plan.slippageBps)}</dd>
          </>
        )}
        {plan.attempts.length > 1 && (
          <>
            <dt>Venues asked</dt>
            <dd>
              <div className="routes">
                {plan.attempts.map((a) => (
                  <div className={`route ${a.ok && a.venue === plan.venue ? "best" : ""}`} key={a.venue}>
                    <span className="v">{venueName(a.venue)}</span>
                    <span className="why">{a.ok ? (a.buyAmount ? `${fromRaw(a.buyAmount, plan.buy.token.decimals)} ${plan.buy.token.symbol}` : "quoted") : a.error}</span>
                    <span>{a.ms} ms</span>
                  </div>
                ))}
              </div>
            </dd>
          </>
        )}
      </dl>

      {(plan.policy.violations.length > 0 || plan.policy.warnings.length > 0) && (
        <div className="notes">
          {plan.policy.violations.map((v) => (
            <div className="stop" key={v}>Blocked: {v}</div>
          ))}
          {plan.policy.warnings.map((w) => (
            <div className="warn" key={w}>Note: {w}</div>
          ))}
        </div>
      )}

      <div className="steps">
        {plan.steps.map((s, i) => {
          const r = results.find((x) => x.id === s.id);
          const st = r?.status ?? "pending";
          return (
            <div className={`step ${st}`} key={s.id}>
              <span className="n">{i + 1}</span>
              <span>{s.label}{s.kind === "evm_tx" && s.simulated ? " (simulated)" : ""}</span>
              <span className="st">
                {st === "running" && <span className="spin" />}
                {st === "pending" ? "waiting for you" : st === "running" ? "in wallet…" : st === "done" ? "done" : st === "failed" ? "failed" : "skipped"}
                {r?.explorerUrl && (
                  <>
                    {" "}
                    <a href={r.explorerUrl} target="_blank" rel="noreferrer">view</a>
                  </>
                )}
              </span>
              {r?.error && <span className="err">{r.error}</span>}
            </div>
          );
        })}
      </div>

      <div className="actions">
        {!done && !failed && (
          <button className="btn primary" onClick={onConfirm} disabled={blocked || running}>
            {running ? "Signing…" : plan.intent.kind === "limit" ? "Sign and place order" : plan.intent.kind === "dca" ? "Sign first fill and start schedule" : "Confirm and sign"}
          </button>
        )}
        {done && !schedule && <span className="status ok">Settled.</span>}
        {failed && <span className="status">Stopped. Nothing after the failed step was sent.</span>}
        {schedule && (
          <span className="status">
            Fill {schedule.fill} of {schedule.of}
            {schedule.nextAt ? ` · next at ${new Date(schedule.nextAt).toLocaleTimeString()} (keep this tab open)` : schedule.fill >= schedule.of ? " · schedule complete" : ""}
          </span>
        )}
        {!done && plan.expiresAt && <span className="status">Quote good until {new Date(plan.expiresAt).toLocaleTimeString()}</span>}
      </div>
    </>
  );
}
