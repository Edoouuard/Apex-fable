import { TOKENS, type Token } from "@/lib/tokens/registry";

/** CoinGecko simple price, cached for 60s. No key needed at this rate. */
const cache = new Map<string, { at: number; usd: number }>();
const TTL = 60_000;

export async function usdPrices(ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const missing: string[] = [];
  const now = Date.now();
  for (const id of new Set(ids)) {
    const c = cache.get(id);
    if (c && now - c.at < TTL) out[id] = c.usd;
    else missing.push(id);
  }
  if (missing.length) {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(missing.join(","))}&vs_currencies=usd`;
    const headers: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    const res = await fetch(url, { headers, next: { revalidate: 60 } } as RequestInit);
    if (res.ok) {
      const j = (await res.json()) as Record<string, { usd?: number }>;
      for (const id of missing) {
        const p = j[id]?.usd;
        if (typeof p === "number") {
          cache.set(id, { at: now, usd: p });
          out[id] = p;
        }
      }
    }
  }
  return out;
}

export async function usdPriceOf(token: Token): Promise<number | undefined> {
  if (!token.coingeckoId) return undefined;
  const p = await usdPrices([token.coingeckoId]);
  return p[token.coingeckoId];
}

export function allCoingeckoIds(): string[] {
  return [...new Set(TOKENS.map((t) => t.coingeckoId).filter((x): x is string => !!x))];
}
