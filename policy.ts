import type { ChainKey } from "@/lib/chains";

/**
 * Guardrails that sit between an intent and a signature. Every trade passes
 * through here; nothing in the prompt can loosen them.
 */
export type Policy = {
  maxSlippageBps: number;
  defaultSlippageBps: number;
  maxNotionalUsd: number;
  /** Trades at or under this size skip the confirmation step. 0 = always confirm. */
  autoConfirmUnderUsd: number;
  allowedChains: ChainKey[];
  /** Refuse trades whose price is this far off the CoinGecko reference (bps). 0 disables. */
  maxPriceDeviationBps: number;
};

const ALL: ChainKey[] = ["ethereum", "arbitrum", "base", "optimism", "polygon", "solana"];

export function loadPolicy(env: NodeJS.ProcessEnv = process.env): Policy {
  const num = (k: string, d: number) => (env[k] !== undefined && env[k] !== "" ? Number(env[k]) : d);
  const chains = env.INTENT_ALLOWED_CHAINS ? (env.INTENT_ALLOWED_CHAINS.split(",").map((s) => s.trim().toLowerCase()) as ChainKey[]).filter((c) => ALL.includes(c)) : ALL;
  return {
    maxSlippageBps: num("INTENT_MAX_SLIPPAGE_BPS", 300),
    defaultSlippageBps: num("INTENT_DEFAULT_SLIPPAGE_BPS", 50),
    maxNotionalUsd: num("INTENT_MAX_NOTIONAL_USD", 10_000),
    autoConfirmUnderUsd: num("INTENT_AUTO_CONFIRM_UNDER_USD", 0),
    allowedChains: chains,
    maxPriceDeviationBps: num("INTENT_MAX_PRICE_DEVIATION_BPS", 300),
  };
}

export type PolicyVerdict = {
  /** Hard stops. Non-empty means the plan must not be executed. */
  violations: string[];
  /** Things worth a look before signing. */
  warnings: string[];
  requiresConfirmation: boolean;
};

export function evaluate(p: Policy, args: { chain: ChainKey; slippageBps: number; notionalUsd?: number; priceDeviationBps?: number }): PolicyVerdict {
  const violations: string[] = [];
  const warnings: string[] = [];
  if (!p.allowedChains.includes(args.chain)) violations.push(`${args.chain} is not in INTENT_ALLOWED_CHAINS`);
  if (args.slippageBps > p.maxSlippageBps) violations.push(`slippage ${args.slippageBps / 100}% exceeds the ${p.maxSlippageBps / 100}% cap`);
  if (args.notionalUsd !== undefined && args.notionalUsd > p.maxNotionalUsd) violations.push(`trade size $${args.notionalUsd.toFixed(0)} exceeds the $${p.maxNotionalUsd} cap`);
  if (args.notionalUsd === undefined) warnings.push("no USD reference price for this pair; size cap not enforced");
  if (args.priceDeviationBps !== undefined && p.maxPriceDeviationBps > 0 && args.priceDeviationBps > p.maxPriceDeviationBps) {
    violations.push(`quote is ${(args.priceDeviationBps / 100).toFixed(2)}% worse than the reference price (cap ${p.maxPriceDeviationBps / 100}%)`);
  } else if (args.priceDeviationBps !== undefined && args.priceDeviationBps > 100) {
    warnings.push(`quote is ${(args.priceDeviationBps / 100).toFixed(2)}% below the reference price`);
  }
  const requiresConfirmation = p.autoConfirmUnderUsd <= 0 || args.notionalUsd === undefined || args.notionalUsd > p.autoConfirmUnderUsd;
  return { violations, warnings, requiresConfirmation };
}
