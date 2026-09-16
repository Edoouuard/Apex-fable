import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Optional peer packages reached through @wagmi/connectors' Coinbase/Base connector, which we don't use.
    for (const m of ["@x402/core/client", "@x402/evm", "@x402/evm/exact/client", "@x402/evm/upto/client", "@x402/svm/exact/client"]) {
      config.resolve.alias[m] = false;
    }
    return config;
  },
};

export default nextConfig;
