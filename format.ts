import { formatUnits, parseUnits } from "viem";

export function toRaw(human: string, decimals: number): bigint {
  return parseUnits(human as `${number}`, decimals);
}

export function fromRaw(raw: string | bigint, decimals: number, maxFrac = 6): string {
  const s = formatUnits(BigInt(raw), decimals);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, maxFrac).replace(/0+$/, "");
  const int = Number(i).toLocaleString("en-US");
  return frac ? `${int}.${frac}` : int;
}

export function usd(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 100 ? 0 : 2 });
}

export function pct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function duration(seconds: number): string {
  if (seconds % 604800 === 0) return `${seconds / 604800} week${seconds / 604800 > 1 ? "s" : ""}`;
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds / 86400 > 1 ? "s" : ""}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 > 1 ? "s" : ""}`;
  return `${Math.round(seconds / 60)} min`;
}
