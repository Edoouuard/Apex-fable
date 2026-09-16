import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";

/** Every market the terminal can reach today. */
export type ChainKey = "ethereum" | "arbitrum" | "base" | "optimism" | "polygon" | "solana";

export type EvmChainKey = Exclude<ChainKey, "solana">;

export const EVM_CHAINS: Record<EvmChainKey, { key: EvmChainKey; id: number; name: string; viem: Chain; rpcEnv: string; defaultRpc: string; nativeSymbol: string; wrappedNative: `0x${string}`; explorer: string }> = {
  ethereum: {
    key: "ethereum",
    id: 1,
    name: "Ethereum",
    viem: mainnet,
    rpcEnv: "RPC_ETHEREUM",
    defaultRpc: "https://ethereum-rpc.publicnode.com",
    nativeSymbol: "ETH",
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    explorer: "https://etherscan.io",
  },
  arbitrum: {
    key: "arbitrum",
    id: 42161,
    name: "Arbitrum",
    viem: arbitrum,
    rpcEnv: "RPC_ARBITRUM",
    defaultRpc: "https://arbitrum-one-rpc.publicnode.com",
    nativeSymbol: "ETH",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    explorer: "https://arbiscan.io",
  },
  base: {
    key: "base",
    id: 8453,
    name: "Base",
    viem: base,
    rpcEnv: "RPC_BASE",
    defaultRpc: "https://base-rpc.publicnode.com",
    nativeSymbol: "ETH",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    explorer: "https://basescan.org",
  },
  optimism: {
    key: "optimism",
    id: 10,
    name: "Optimism",
    viem: optimism,
    rpcEnv: "RPC_OPTIMISM",
    defaultRpc: "https://optimism-rpc.publicnode.com",
    nativeSymbol: "ETH",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    explorer: "https://optimistic.etherscan.io",
  },
  polygon: {
    key: "polygon",
    id: 137,
    name: "Polygon",
    viem: polygon,
    rpcEnv: "RPC_POLYGON",
    defaultRpc: "https://polygon-bor-rpc.publicnode.com",
    nativeSymbol: "POL",
    wrappedNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    explorer: "https://polygonscan.com",
  },
};

export const SOLANA = {
  key: "solana" as const,
  name: "Solana",
  rpcEnv: "RPC_SOLANA",
  defaultRpc: "https://api.mainnet-beta.solana.com",
  nativeSymbol: "SOL",
  explorer: "https://solscan.io",
};

export const ALL_CHAIN_KEYS: ChainKey[] = ["ethereum", "arbitrum", "base", "optimism", "polygon", "solana"];

export function isEvmChain(key: ChainKey): key is EvmChainKey {
  return key !== "solana";
}

export function chainKeyFromId(id: number): EvmChainKey | undefined {
  return (Object.values(EVM_CHAINS).find((c) => c.id === id) ?? undefined)?.key;
}

export function chainDisplayName(key: ChainKey): string {
  return key === "solana" ? SOLANA.name : EVM_CHAINS[key].name;
}

export function rpcUrl(key: ChainKey): string {
  if (key === "solana") return process.env[SOLANA.rpcEnv] || SOLANA.defaultRpc;
  const c = EVM_CHAINS[key];
  return process.env[c.rpcEnv] || c.defaultRpc;
}

const clientCache = new Map<EvmChainKey, PublicClient>();

/** Server-side viem client for reads and simulation. */
export function publicClient(key: EvmChainKey): PublicClient {
  let c = clientCache.get(key);
  if (!c) {
    c = createPublicClient({ chain: EVM_CHAINS[key].viem, transport: http(rpcUrl(key), { batch: true }) }) as PublicClient;
    clientCache.set(key, c);
  }
  return c;
}

export function explorerTx(key: ChainKey, hash: string): string {
  return key === "solana" ? `${SOLANA.explorer}/tx/${hash}` : `${EVM_CHAINS[key].explorer}/tx/${hash}`;
}
