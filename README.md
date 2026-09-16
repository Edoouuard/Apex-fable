# Intent — a prompt-to-trade terminal

Type what you want. See exactly what will happen. Sign once in your own wallet.

```
"swap 0.5 ETH to USDC on base"
"buy $200 of SOL"
"sell half my ARB for USDC with 0.2% slippage"
"sell 1 ETH at 5000 on arbitrum"                      → resting limit order
"buy 20 USDC of ETH every day for 30 days on base"    → DCA schedule
```

Words become one structured intent. Every configured venue prices it; the best executable quote wins. Policy guardrails check size, slippage and price against a reference. You get a plain-English sentence plus the exact steps (wrap → approve → swap/sign), then sign in MetaMask/Rabby/Phantom. Private keys never touch this app in the web UI.

## What is real

| Market | Venue | Key needed | Order types |
|---|---|---|---|
| Ethereum, Arbitrum, Base | [CoW Protocol](https://docs.cow.fi) order book (`api.cow.fi`) | no | market (batch-auction, MEV-protected), **limit** (resting, zero-fee until fill) |
| All 5 EVM chains | [0x Swap API v2](https://0x.org/docs) AllowanceHolder | `ZEROX_API_KEY` | market |
| All 5 EVM chains | [1inch Aggregation v6](https://portal.1inch.dev) | `ONEINCH_API_KEY` | market |
| Solana | [Jupiter Swap v1](https://dev.jup.ag) (`lite-api.jup.ag`) | no (optional key) | market |
| Any | DCA scheduler | — | repeated market fills (browser: signs each fill while the tab is open; CLI daemon: unattended with a local key) |

Live integrations, no mocks: real quotes, real EIP-712 CoW order signing and submission, real 0x/1inch calldata, real Jupiter versioned transactions, real balances via viem multicall / Solana RPC, real reference prices from CoinGecko.

Out of scope for now (the parser will say so instead of guessing): perps, leverage, options, bridging, lending, staking, transfers.

## Run it

```bash
cp .env.example .env.local     # nothing is required to start; keys unlock more venues
npm install
npm run dev                    # http://localhost:3000
```

- **No keys at all:** CoW on Ethereum/Arbitrum/Base + Jupiter on Solana, rules-based prompt parsing.
- **`ANTHROPIC_API_KEY`:** Claude reads free-form prompts (tool-use with a strict JSON schema, validated by zod, rules parser as fallback). Set `ANTHROPIC_MODEL` to pin a model.
- **`ZEROX_API_KEY` / `ONEINCH_API_KEY`:** adds those aggregators on every EVM chain, including Optimism and Polygon.
- **Own RPCs:** public endpoints are defaults; set `RPC_*` for reliability.

### CLI and unattended schedules

```bash
npm run trade -- "swap 0.1 eth to usdc on base"           # plan → confirm → execute
npm run trade -- "sell 1 eth at 5000 on base" --dry-run   # plan only
npm run trade -- "buy 25 usdc of eth daily for 30 days"   # first fill now, saves the schedule
npm run trade -- --daemon                                 # keeps filling saved schedules
```

The CLI signs with `EVM_PRIVATE_KEY` / `SOLANA_PRIVATE_KEY` from the environment. Use a dedicated hot wallet with only what you intend to trade.

## Guardrails (server-side, on every plan)

| Env | Default | Effect |
|---|---|---|
| `INTENT_MAX_SLIPPAGE_BPS` | 300 | refuse prompts asking for more |
| `INTENT_DEFAULT_SLIPPAGE_BPS` | 50 | used when the prompt doesn't say |
| `INTENT_MAX_NOTIONAL_USD` | 10000 | refuse larger trades; DCA totals count |
| `INTENT_MAX_PRICE_DEVIATION_BPS` | 300 | refuse quotes this far below the CoinGecko reference |
| `INTENT_ALLOWED_CHAINS` | all six | fence the terminal to specific markets |
| `INTENT_AUTO_CONFIRM_UNDER_USD` | 0 | CLI `--yes` still honours caps; the web UI always shows the plan before signing |

Also enforced: sell-side balance check, exact-amount approvals (never unlimited), `eth_call` simulation of swap calldata before it's shown, limit-price sanity vs. market, native-ETH sells auto-wrapped for CoW, gas reserve kept back on "sell all ETH".

## How it's built

```
prompt ──▶ lib/intent/parse.ts ──▶ Intent (zod)          "swap 0.5 ETH → USDC on base, side=sell"
                 │  Claude tool-use, rules fallback
                 ▼
          lib/plan/build.ts                                resolve tokens (registry or onchain metadata)
                 │                                         resolve "half", "$200", "all" via balances + prices
                 ├─▶ lib/venues/*  (cow, zerox, oneinch, jupiter)   fan out, pick best executable quote
                 ├─▶ lib/policy.ts                         caps, deviation, confirmation
                 └─▶ Plan { summary, legs, steps[] }       steps: evm_tx | cow_order | solana_tx
                 ▼
          lib/execution/runner.ts                          one runner, two signers:
                 ├─ browser.ts  (wagmi injected wallet + Phantom, venue calls proxied through /api)
                 └─ server.ts   (viem local account + Solana keypair, for CLI/daemon)
```

- `app/api/intent` → parse. `app/api/plan` → build (quotes, policy, simulation). `app/api/cow/orders` → submit/poll. `app/api/solana/swap` → Jupiter tx build. `app/api/portfolio` → cross-chain holdings.
- Adding a market = one adapter implementing `VenueAdapter` in `lib/venues/types.ts` and a step kind the runner knows how to sign. The intent schema is venue-agnostic on purpose.

## Tests

```bash
npm test          # parser grammar, policy, CoW fee/slippage math + EIP-712 hash stability, venue routing
npm run typecheck
npm run build
```

## Honest limits

- The browser DCA runs while the tab is open and asks for a signature per fill; that's what a non-custodial wallet means. Unattended DCA is the CLI daemon.
- CoW market orders settle in a batch auction: typically under a minute, occasionally a few. The runner polls up to four minutes and shows the order on `explorer.cow.fi`.
- Reference prices come from CoinGecko's free tier (60s cache). If a token has no reference, the size cap can't be enforced and the plan says so.
- The token registry is a curated list per chain; unknown tokens work by pasting the address/mint.
