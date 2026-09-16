import { describe, expect, it } from "vitest";
import { parseIntentDeterministic as parse } from "@/lib/intent/fallback";

describe("rules parser", () => {
  it("market sell with chain and slippage", () => {
    const i = parse("swap 0.5 ETH to USDC on base with 0.3% slippage");
    expect(i).toMatchObject({ kind: "swap", chain: "base", side: "sell", sell: { token: "ETH", amount: { kind: "exact", value: "0.5" } }, buy: { token: "USDC" }, maxSlippageBps: 30 });
  });
  it("infers solana from the token", () => {
    expect(parse("buy $200 of SOL")).toMatchObject({ kind: "swap", chain: "solana", side: "sell", sell: { token: "USDC", amount: { kind: "usd", value: 200 } }, buy: { token: "SOL" } });
  });
  it("infers arbitrum from ARB", () => {
    expect(parse("sell half my ARB for USDC")).toMatchObject({ kind: "swap", chain: "arbitrum", sell: { token: "ARB", amount: { kind: "percent", value: 50 } } });
  });
  it("all-balance sells", () => {
    expect(parse("dump all my USDC into ETH on arbitrum")).toMatchObject({ kind: "swap", chain: "arbitrum", sell: { token: "USDC", amount: { kind: "all" } }, buy: { token: "ETH" } });
  });
  it("buy-side exact amount", () => {
    expect(parse("buy 0.25 ETH with USDC on optimism")).toMatchObject({ kind: "swap", chain: "optimism", side: "buy", buy: { token: "ETH", amount: { kind: "exact", value: "0.25" } }, sell: { token: "USDC" } });
  });
  it("buy with a sell amount", () => {
    expect(parse("buy ETH with 500 USDC on base")).toMatchObject({ kind: "swap", side: "sell", sell: { token: "USDC", amount: { kind: "exact", value: "500" } }, buy: { token: "ETH" } });
  });
  it("uses wallet chain when nothing else decides", () => {
    expect(parse("swap 1 ETH to USDC", { defaultChain: "arbitrum" })).toMatchObject({ chain: "arbitrum" });
    expect(parse("swap 1 ETH to USDC")).toMatchObject({ chain: "base" });
  });
  it("venue preference", () => {
    expect(parse("swap 1 ETH to USDC on base via cow")).toMatchObject({ venue: "cow" });
  });
  it("limit sell", () => {
    expect(parse("sell 1 ETH at 5000 USDC on arbitrum")).toMatchObject({ kind: "limit", chain: "arbitrum", side: "sell", sell: { token: "ETH", amount: { kind: "exact", value: "1" } }, buy: { token: "USDC" }, limitPrice: { value: 5000, quotedAs: "buyPerSell" } });
  });
  it("limit buy paying stables", () => {
    expect(parse("buy ETH at or below 3000 with 900 USDC on base")).toMatchObject({ kind: "limit", side: "sell", sell: { token: "USDC", amount: { kind: "exact", value: "900" } }, buy: { token: "ETH" }, limitPrice: { value: 3000, quotedAs: "sellPerBuy" } });
  });
  it("dca daily", () => {
    expect(parse("buy 20 USDC of ETH every day for 30 days on base")).toMatchObject({ kind: "dca", chain: "base", sell: { token: "USDC", amountPerFill: { kind: "exact", value: "20" } }, buy: { token: "ETH" }, everySeconds: 86400, fills: 30 });
  });
  it("dca weekly in dollars x N", () => {
    expect(parse("dca $50 into SOL weekly x12")).toMatchObject({ kind: "dca", chain: "solana", sell: { token: "USDC", amountPerFill: { kind: "usd", value: 50 } }, everySeconds: 604800, fills: 12 });
  });
  it("passes addresses through", () => {
    expect(parse("swap 100 USDC to 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed on base")).toMatchObject({ buy: { token: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" } });
  });
  it("refuses what it can't do", () => {
    expect(parse("open a 10x long on ETH")).toMatchObject({ kind: "unsupported" });
    expect(parse("what is the price of eth")).toMatchObject({ kind: "unsupported" });
  });
});
