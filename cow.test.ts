import { afterEach, describe, expect, it, vi } from "vitest";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { findToken } from "@/lib/tokens/registry";
import { cowAdapter, cowLimitOrder, cowTypedData, hydrateTypedData, COW_SETTLEMENT, COW_VAULT_RELAYER } from "@/lib/venues/cow";

const taker = "0x000000000000000000000000000000000000dEaD";

describe("cow adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("folds the fee into sellAmount, applies slippage to buyAmount, and wraps native ETH", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ quote: { sellToken: "0x", buyToken: "0x", sellAmount: "990000000000000000", buyAmount: "3000000000", feeAmount: "10000000000000000", validTo: 0, appData: "0x", kind: "sell", partiallyFillable: false, sellTokenBalance: "erc20", buyTokenBalance: "erc20", signingScheme: "eip712" }, from: taker, expiration: new Date(Date.now() + 60000).toISOString(), id: 42, verified: true }), { status: 200 }),
    );
    const q = await cowAdapter.quote({ chain: "base", sell: findToken("base", "ETH")!, buy: findToken("base", "USDC")!, side: "sell", amount: "1000000000000000000", taker, slippageBps: 50 });
    expect(q).not.toBeNull();
    expect(q!.sellAmount).toBe("1000000000000000000");
    expect(q!.buyAmount).toBe("3000000000");
    expect(q!.minBuyAmount).toBe("2985000000");
    expect(q!.wrapNative?.amount).toBe("1000000000000000000");
    expect(q!.allowance?.spender).toBe(COW_VAULT_RELAYER);
    const raw = q!.raw as { order: { feeAmount: string; sellToken: string }; quoteId: number };
    expect(raw.order.feeAmount).toBe("0");
    expect(raw.order.sellToken.toLowerCase()).toBe("0x4200000000000000000000000000000000000006");
    expect(raw.quoteId).toBe(42);
  });

  it("does not quote on chains CoW doesn't serve", async () => {
    expect(cowAdapter.supports("polygon")).toBe(false);
    expect(cowAdapter.supports("solana")).toBe(false);
    expect(cowAdapter.supports("arbitrum")).toBe(true);
  });

  it("typed data survives JSON and produces a stable EIP-712 hash", async () => {
    const order = cowLimitOrder({ chain: "ethereum", sell: findToken("ethereum", "WETH")!, buy: findToken("ethereum", "USDC")!, taker, sellAmount: 10n ** 18n, buyAmount: 5000n * 10n ** 6n, kind: "sell", validTo: 1800000000 });
    const td = cowTypedData(1, order);
    const roundTripped = hydrateTypedData(JSON.parse(JSON.stringify(td)));
    expect(roundTripped.domain.verifyingContract).toBe(COW_SETTLEMENT);
    const h1 = hashTypedData(roundTripped as never);
    const h2 = hashTypedData(hydrateTypedData(td) as never);
    expect(h1).toBe(h2);
    // and a wallet can sign it
    const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const sig = await acct.signTypedData(roundTripped as never);
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});
