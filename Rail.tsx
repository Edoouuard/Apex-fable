"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";
import { solanaProvider } from "@/lib/execution/browser";
import { shortAddr, usd } from "@/lib/format";
import { chainKeyFromId } from "@/lib/chains";

export type Holding = { chain: string; chainName: string; symbol: string; amount: string; usd?: number };

export function useWallets() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [sol, setSol] = useState<string | undefined>();

  useEffect(() => {
    const p = solanaProvider();
    if (p?.publicKey) setSol(p.publicKey.toBase58());
  }, []);

  const connectSol = useCallback(async () => {
    const p = solanaProvider();
    if (!p) {
      window.open("https://phantom.app", "_blank");
      return;
    }
    const r = await p.connect();
    setSol(r.publicKey.toBase58());
  }, []);
  const disconnectSol = useCallback(async () => {
    await solanaProvider()?.disconnect();
    setSol(undefined);
  }, []);

  return {
    evm: isConnected ? address : undefined,
    evmChain: chainKeyFromId(chainId),
    sol,
    connectEvm: () => connect({ connector: connectors[0] }),
    disconnectEvm: () => disconnect(),
    connectSol,
    disconnectSol,
  };
}

export function WalletBar({ w }: { w: ReturnType<typeof useWallets> }) {
  return (
    <div className="wallets">
      {w.evm ? (
        <button className="btn" onClick={w.disconnectEvm} title="Disconnect">
          <span className="dot" />
          {shortAddr(w.evm)}
          {w.evmChain ? ` on ${w.evmChain}` : ""}
        </button>
      ) : (
        <button className="btn" onClick={w.connectEvm}>Connect EVM wallet</button>
      )}
      {w.sol ? (
        <button className="btn" onClick={w.disconnectSol} title="Disconnect">
          <span className="dot" />
          {shortAddr(w.sol)} on solana
        </button>
      ) : (
        <button className="btn" onClick={w.connectSol}>Connect Solana wallet</button>
      )}
    </div>
  );
}

export function Holdings({ evm, sol, refreshKey }: { evm?: string; sol?: string; refreshKey: number }) {
  const [data, setData] = useState<{ holdings: Holding[]; total: number; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!evm && !sol) {
      setData(null);
      return;
    }
    let live = true;
    setLoading(true);
    const q = new URLSearchParams();
    if (evm) q.set("evm", evm);
    if (sol) q.set("sol", sol);
    fetch(`/api/portfolio?${q}`)
      .then((r) => r.json())
      .then((j) => live && setData(j))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [evm, sol, refreshKey]);

  if (!evm && !sol) return <p className="empty">Connect a wallet to see what you hold across markets.</p>;
  if (loading && !data) return <p className="empty"><span className="spin" />Reading balances</p>;
  if (!data) return null;
  return (
    <div className="holdings">
      {data.holdings.length === 0 && <p className="empty">Nothing found on the listed tokens.</p>}
      {data.holdings.map((h) => (
        <div className="holding" key={`${h.chain}:${h.symbol}`}>
          <span>
            {h.amount} {h.symbol}
            <span className="c">{h.chainName}</span>
          </span>
          <span className="u">{usd(h.usd)}</span>
        </div>
      ))}
      {data.holdings.length > 0 && (
        <div className="total">
          <span>Total</span>
          <span>{usd(data.total)}</span>
        </div>
      )}
      {data.errors.map((e) => (
        <p className="empty" key={e}>{e}</p>
      ))}
    </div>
  );
}

export function VenueList() {
  const [v, setV] = useState<{ venues: Record<string, string[]>; parser: string } | null>(null);
  useEffect(() => {
    fetch("/api/venues").then((r) => r.json()).then(setV).catch(() => undefined);
  }, []);
  if (!v) return null;
  return (
    <div className="venues">
      {Object.entries(v.venues).map(([chain, venues]) => (
        <div key={chain}>
          <b>{chain}</b>
          {venues.length ? venues.join(", ") : "none configured"}
        </div>
      ))}
      <div style={{ marginTop: 6 }}>
        <b>parser</b>
        {v.parser === "claude" ? "Claude" : "rules only (set ANTHROPIC_API_KEY)"}
      </div>
    </div>
  );
}
