import { describe, expect, it } from "vitest";
import { evaluate, loadPolicy } from "@/lib/policy";

describe("policy", () => {
  const p = loadPolicy({ INTENT_MAX_SLIPPAGE_BPS: "300", INTENT_MAX_NOTIONAL_USD: "1000", INTENT_AUTO_CONFIRM_UNDER_USD: "50", INTENT_ALLOWED_CHAINS: "base,solana", INTENT_MAX_PRICE_DEVIATION_BPS: "300" } as unknown as NodeJS.ProcessEnv);
  it("blocks disallowed chains, oversize, and bad prices", () => {
    const v = evaluate(p, { chain: "ethereum", slippageBps: 500, notionalUsd: 5000, priceDeviationBps: 800 });
    expect(v.violations).toHaveLength(4);
  });
  it("passes a small in-policy trade without confirmation", () => {
    const v = evaluate(p, { chain: "base", slippageBps: 50, notionalUsd: 20, priceDeviationBps: 10 });
    expect(v.violations).toEqual([]);
    expect(v.requiresConfirmation).toBe(false);
  });
  it("requires confirmation above the auto threshold and when price is unknown", () => {
    expect(evaluate(p, { chain: "base", slippageBps: 50, notionalUsd: 500 }).requiresConfirmation).toBe(true);
    const unknown = evaluate(p, { chain: "base", slippageBps: 50 });
    expect(unknown.requiresConfirmation).toBe(true);
    expect(unknown.warnings.length).toBeGreaterThan(0);
  });
  it("defaults are sane", () => {
    const d = loadPolicy({} as unknown as NodeJS.ProcessEnv);
    expect(d.allowedChains).toHaveLength(6);
    expect(d.autoConfirmUnderUsd).toBe(0);
  });
});
