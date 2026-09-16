import { afterEach, describe, expect, it, vi } from "vitest";
import { findToken } from "@/lib/tokens/registry";
import { routeQuote, availableVenues } from "@/lib/venues";
import { cowAdapter } from "@/lib/venues/cow";
import { zeroXAdapter } from "@/lib/venues/zerox";
import { oneInchAdapter } from "@/lib/venues/oneinch";

const req = { chain: "base" as const, sell: findToken("base", "WETH")!, buy: findToken("base", "USDC")!, side: "sell" as const, amount: "1000000000000000000", taker: "0x000000000000000000000000000000000000dEaD", slippageBps: 50 };
const q = (venue: "cow" | "0x" | "1inch", buy: string) => ({ venue, chain: "base" as const, sellToken: req.sell, buyToken: req.buy, sellAmount: req.amount, buyAmount: buy, minBuyAmount: buy, route: venue, raw: {} });

describe("router", () => {
  afterEach(() => vi.restoreAllMocks());
  it("picks the highest buy amount and records every attempt", async () => {
    vi.spyOn(cowAdapter, "quote").mockResolvedValue(q("cow", "3001000000"));
    vi.spyOn(zeroXAdapter, "quote").mockResolvedValue(q("0x", "3002000000"));
    vi.spyOn(oneInchAdapter, "quote").mockRejectedValue(new Error("429"));
    const r = await routeQuote(req);
    expect(r.best?.venue).toBe("0x");
    expect(r.attempts.map((a) => a.venue).sort()).toEqual(["0x", "1inch", "cow"]);
    expect(r.attempts.find((a) => a.venue === "1inch")?.ok).toBe(false);
  });
  it("honours an explicit venue", async () => {
    const spy = vi.spyOn(cowAdapter, "quote").mockResolvedValue(q("cow", "1"));
    const zx = vi.spyOn(zeroXAdapter, "quote");
    const r = await routeQuote(req, "cow");
    expect(r.best?.venue).toBe("cow");
    expect(spy).toHaveBeenCalled();
    expect(zx).not.toHaveBeenCalled();
  });
  it("reports keyless venues as available and keyed ones only when configured", () => {
    delete process.env.ZEROX_API_KEY;
    delete process.env.ONEINCH_API_KEY;
    expect(availableVenues("base")).toEqual(["cow"]);
    expect(availableVenues("solana")).toEqual(["jupiter"]);
    expect(availableVenues("polygon")).toEqual([]);
    process.env.ZEROX_API_KEY = "x";
    expect(availableVenues("polygon")).toEqual(["0x"]);
    delete process.env.ZEROX_API_KEY;
  });
});
