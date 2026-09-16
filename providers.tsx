"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { http } from "viem";
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";
import { WagmiProvider, createConfig } from "wagmi";
import { injected } from "@wagmi/core";

/** Injected wallets only (MetaMask, Rabby, Coinbase Wallet extension) — no project id, no third-party relay. */
export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, base, optimism, polygon],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_RPC_ETHEREUM || "https://ethereum-rpc.publicnode.com"),
    [arbitrum.id]: http(process.env.NEXT_PUBLIC_RPC_ARBITRUM || "https://arbitrum-one-rpc.publicnode.com"),
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_BASE || "https://base-rpc.publicnode.com"),
    [optimism.id]: http(process.env.NEXT_PUBLIC_RPC_OPTIMISM || "https://optimism-rpc.publicnode.com"),
    [polygon.id]: http(process.env.NEXT_PUBLIC_RPC_POLYGON || "https://polygon-bor-rpc.publicnode.com"),
  },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
