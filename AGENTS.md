# KeyShield — Agent Design Guide

> How to wire AI agents, trading bots, and API aggregators into KeyShield's zero-trust proxy. When to use which agent. Why each design decision.

> **Design vs code.** This guide is the *intended* agent stack. The protocol
> surface that actually exists on `main` is documented in
> [SPEC.md](SPEC.md) (every clause is marked ✅ / ⚠️ / 📋). Inline notes
> in §§2, 4, 8, 11 flag missing modules so you are not sent to a file
> that is not in the repo. Dashboard is `src/web/` on **:3000**; the
> Python control plane is **:8001**. `:8000` is the optional Rust
> `ks-proxy` (local only).

---

## Table of Contents

1. [The Core Idea](#1-the-core-idea)
2. [How Keys Plug In](#2-how-keys-plug-in)
3. [Latency Budget — What Takes How Long](#3-latency-budget)
4. [Agent Types and When to Use Each](#4-agent-types)
5. [The Full Trading Stack](#5-the-full-trading-stack)
6. [0x Protocol Integration](#6-0x-protocol)
7. [Titan Builder Integration](#7-titan-builder)
8. [Pyth / Hermes Price Feeds](#8-pyth--hermes-price-feeds)
9. [AI Model Aggregator](#9-ai-model-aggregator)
10. [OpenClaw + Hermes Agent Wiring](#10-openclaw--hermes-agent-wiring)
11. [Running the Trading Bot](#11-running-the-trading-bot)
12. [RPC Guide — Helius for Solana](#12-rpc-guide)
13. [Architecture Decision Record](#13-architecture-decisions)

---

## 1. The Core Idea

Your agent needs an OpenAI key, a Helius key, and a 0x key. The old way:

```python
# 🔴 WRONG — key is in your code, your logs, your CI env
import openai
client = openai.OpenAI(api_key="sk-proj-...")
```

The KeyShield way:

```python
# 🟢 RIGHT — key is in the vault, injected at request time
# Target DX. Both in-repo clients (`keyshield_sdk` in src/backend/,
# `keyshield` in packages/sdk-py) still target removed /manage endpoints
# and do not send X-Upstream-API-Key — see SPEC.md §10.3.
from keyshield import KeyShield   # pip install -e packages/sdk-py
ks = KeyShield("http://localhost:8001", token=os.environ["KS_TOKEN"])
client = ks.openai_client()   # same OpenAI SDK, zero raw keys in config
```

The agent only ever holds the session token. The real API key lives in
an AES-256-GCM ciphertext that is **encrypted on the user's device**
(WebAuthn-PRF → HKDF → AES-GCM, see Path A) and stored on a Cloudflare
Worker that cannot decrypt it. At usage time, the SDK / web client
decrypts the key locally and forwards it to the Python proxy in the
`X-Upstream-API-Key` header — the proxy uses it once for the upstream
call and **never persists it**.

---

## 2. How Keys Plug In

### Architecture summary

| Concern | Where | Contract |
|---|---|---|
| Vault **storage** (ciphertext sync) | Cloudflare Worker (`src/infra/sync-worker/`) | `PUT/GET/DELETE /vault/:id` over Bearer token; server is zero-knowledge |
| Vault **usage** (per-request key injection) | Python FastAPI (`src/backend/`) | `/proxy/:upstream/...` with `X-Upstream-API-Key: <decrypted-key>` — never persisted |
| Vault **shim** (extension / local-dev) | Python FastAPI `/manage/*` | SQLite `vault_shim.db`. Used by the browser extension and `/vproxy/*`. **Not** zero-knowledge. Still present (restored in `59c8bebac`). |

`/manage/*` is **not** removed. Path A (Device Vault → Cloudflare worker)
is the zero-knowledge path. The shim is the compatibility path for the
extension and for `/vproxy/*` server-side key injection. See SPEC.md §3.

### Step 1 — Store your keys once

```bash
# Option A: web UI (Path A — Device Vault, in src/web/)
# Go to https://app.ks.aileena.xyz → Vault → New secret → select provider → paste key
# Locally: npm run dev:web  →  http://localhost:3000
# (src/_archive/web-v2/ is gone; Path A lives in src/web/lib/{vault,sync,sync-auth,vault-session}.ts)
# The dashboard encrypts client-side via WebAuthn-PRF → HKDF → AES-GCM and
# pushes ciphertext to the Cloudflare sync-worker.

# Option B: REST shim (browser extension / local-dev — NOT Path A)
# source src/backend/keyshield-cli.sh   # or curl -fsSL $KS_BASE/install.sh
# Store via the dashboard, the extension, or:
curl -s -X POST http://localhost:8001/manage/store \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"upstream":"openai","value":"sk-proj-xxx"}'   # field is `value`, not `apiKey`

# Option C: Python SDK (target DX — current clients still POST apiKey to /manage/store)
from keyshield import KeyShield
ks = KeyShield("http://localhost:8001")
ks.login("your_wallet", "your_passphrase")   # /auth/login returns 403 today
ks.store("openai",    "sk-proj-xxx")
ks.store("anthropic", "sk-ant-xxx")
ks.store("helius",    "xxx")
ks.store("0x",        "xxx")
ks.store("groq",      "gsk_xxx")
```

> **Note (2026-10):** Path A is in `src/web/`, not an archive. The
> TypeScript CLI (`src/sdk/packages/cli`) and both Python SDKs still
> talk to removed endpoints (`/auth/login`, `/manage/list`,
> `/manage/decrypt/{upstream}`) and send `apiKey` instead of `value`.
> Use the dashboard or the REST calls above until they are realigned
> (SPEC.md §10.3).

### Step 2 — Login and get a token

```bash
# Web UI: log in at https://app.ks.aileena.xyz (or http://localhost:3000), then Developer → copy token

# Python (target — /auth/login is 403; use wallet-login or the dashboard token)
token = ks.login("my_wallet", "my_passphrase")
# token = "<base64url(payload)>.<base64url(HMAC)>"
# Session tokens are minted as ksv2_<payload>.<hmac> (SPEC.md §4.2). Both proxies accept the prefix.
```

### Step 3 — Set the token in your agent environment

```bash
export KS_TOKEN="<token from the Developer tab>"
export KS_BASE="http://localhost:8001"   # Python control plane; :8000 is Rust ks-proxy
```

### Step 4 — Agent calls the proxy

```python
import os, openai
from keyshield import KeyShield

ks     = KeyShield(os.environ.get("KS_BASE", "http://localhost:8001"),
                   token=os.environ["KS_TOKEN"])
openai = ks.openai_client()   # target: decrypt locally, POST /proxy/openai/...
                              # with X-Upstream-API-Key. Current SDK does not
                              # send that header — use REST until it does.
```

On the Path A `/proxy/*` path the **client** decrypts and sends the raw
key per request, so the agent process does see it in memory. "Never
persists the key" holds for the server. `/vproxy/*` injects a shim-stored
plaintext key server-side; the agent then only holds the session token.

That's it. Rotate keys from the dashboard; the next request picks up the
new ciphertext from the sync-worker (Path A) or the new shim row (`/vproxy`).

---

## 3. Latency Budget

Understanding where time is spent is how you design a fast system.

```
Event: Pyth price update arrives
│
├─ PythFeed SSE receive:           <1ms   (event already pushed to us)
├─ PriceSignal.update():           <0.1ms (in-process math)
├─ RiskAgent.check():              <0.1ms (in-process logic)
│
│  ← PARALLEL START HERE ────────────────────────
│
├─ [Thread A] AI confirmation:
│   └─ groq/llama-3.1-70b:        ~100ms
│   └─ gpt-4o-mini:               ~400ms
│   └─ claude-haiku:              ~200ms
│
├─ [Thread B] 0x quote:           ~150ms
│   └─ parse + validate:          ~5ms
│
│  ← PARALLEL END: max(A, B) not A+B
│
├─ Decision logic:                 <1ms
├─ Build TX (web3):                <5ms
├─ Titan submit:                   ~50ms
│
Total (parallel, Groq):    ~200ms
Total (serial, Groq):      ~350ms
Total (serial, GPT-4o):    ~700ms
```

**Rule: anything that can run in parallel, run in parallel.**
`asyncio.gather()` is your main tool. `parallel_quote_and_analyze()` is
the intended helper in `execution.py` — it is **not implemented** yet;
call `asyncio.gather(analyst.confirm(...), router.quote(...))` yourself.

### RPC latency tiers

| RPC method | Latency | Cache in KeyShield? |
|-----------|---------|-------------------|
| Helius `getBalance` | ~50ms | 5s TTL |
| Helius `getAccountInfo` | ~50ms | 5s TTL |
| Helius `getAsset` (NFT metadata) | ~80ms | 300s TTL |
| Helius `getSignaturesForAddress` | ~100ms | 30s TTL |
| Pyth SSE price (already subscribed) | <1ms | push-based |
| Pyth HTTP latest price | ~60ms | poll |
| 0x quote | ~150ms | no (quotes expire) |
| Titan simulate | ~100ms | no |
| Titan submit | ~50ms | no |

---

## 4. Agent Types

### MarketDataAgent

**What:** Subscribes to Pyth/Hermes SSE. Runs continuously, fires callbacks.

**When to use:** Any time you need real-time prices. This is the only agent that should be always-on.

**When NOT to use:** For a one-shot price check. Use `feed.snapshot()` instead.

**Latency:** <1ms per tick after connection established.

**Pattern:**
```python
from src.backend.trading.market_data import MarketDataAgent, PriceFeed, PriceFeedConfig

feed = PriceFeed(PriceFeedConfig("SOL/USD"))
mda = MarketDataAgent(feeds=[feed], ks_token=token)
mda.subscribe(my_callback)   # called on every tick
await mda.start()            # background task, never blocks
```

There is no `trading.feeds` module and no `PythFeed` / `PRICE_IDS`.
`PriceFeed` in `market_data.py` is an in-process holder — it does not
open a Hermes SSE connection yet.

---

### RiskAgent

**What:** Synchronous gate — approves or rejects trade proposals before any API call.

**When to use:** Always, before firing expensive operations (quote, AI).

**Key checks:**
- Position size cap (per-symbol)
- Total portfolio exposure cap
- Trade rate limit (per day)
- Pyth confidence interval (reject if market is illiquid)
- 0x price impact (reject if slippage too high)

**Latency:** <0.1ms (pure Python, no network).

**Pattern:**
```python
ok, reason = risk.check(symbol, "long", size_usd, price=current_price)
if not ok:
    return   # do NOT proceed to API calls
```

---

### AnalysisAgent

**What:** Sends price signal context to an AI model, gets a trade/no-trade decision.

**When to use:** After RiskAgent approves, PARALLEL with the swap quote.

**Model selection:**
| Scenario | Model | Why |
|----------|-------|-----|
| Real-time trading (<200ms) | groq/llama-3.1-70b | Fastest available |
| Normal analysis | gpt-4o-mini | Balance of cost/speed/accuracy |
| Strategy planning | claude-opus-4-5 | Best reasoning for complex decisions |
| Structured JSON output | gpt-4o-mini | Best JSON mode reliability |
| Batch analysis (many signals) | mistral-small | Cheapest per token |

**Pattern:**
```python
# Run PARALLEL with quote — not sequential
analysis_task = asyncio.create_task(analyst.confirm(symbol, price, deviation))
quote_task    = asyncio.create_task(router.quote("USDC", "ETH", 100_000_000))
(should_trade, conf, reason), quote = await asyncio.gather(analysis_task, quote_task)
```

**Prompt design rules:**
1. Keep context < 500 tokens for urgent path
2. Always ask for JSON output
3. Include: symbol, price, deviation %, recent history
4. Never include: wallet addresses, position sizes, PnL (privacy)
5. Temperature = 0.05 (deterministic decisions, not creative)

---

### ExecutionAgent

**What:** Signs and submits transactions after all checks pass.

**When to use:** Last step after RiskAgent + AnalysisAgent both approve.

**EVM flow (0x + Titan):**
```
ZeroXRouter.quote() → calldata
  → signer_fn(tx_data) → signed hex
  → TitanExecutor.send_bundle() → bundle_hash
```

**Solana flow (Jupiter + Helius) — 📋 not implemented:**
```
JupiterRouter.quote() → quote_response     # JupiterRouter does not exist
  → JupiterRouter.swap_transaction() → base64 TX
  → wallet.sign(tx) → signed TX
  → helius.sendTransaction() → signature
```

`ExecutionAgent` in `src/backend/trading/execution.py` covers the EVM
path (`ZeroXRouter` + `TitanExecutor`) only.

**Why Titan bundles over public mempool:**
- Public mempool: your TX is visible to searchers → they can sandwich you
- Titan bundle: goes directly to Titan's block builder, never broadcast to public mempool
- Result: ~20% better effective price on large swaps

**Note on signing:** Never store private keys in code or env vars. Use:
- Hardware wallet (Ledger, Trezor)
- AWS KMS
- Solana's `@solana/web3.js` with browser wallet
- For bots: dedicated signing service with separate key management

---

### MonitorAgent — 📋 not implemented

**What:** Polls Helius RPC for transaction confirmations. Updates state on success/failure.

**When to use:** Always — spawn a watch task for every submitted transaction.

**Pattern (target):**
```python
monitor.watch(tx_signature, {
    "symbol": "SOL",
    "amount": 1.5,
    "type": "buy",
})
# MonitorAgent polls every 2s until confirmed or failed
```

Named in `trading/__init__.py`'s docstring and in the diagram below;
there is no `MonitorAgent` class.

---

## 5. The Full Trading Stack

```
┌─────────────────────────────────────────────────────┐
│                 TradingOrchestrator                  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │            MarketDataAgent                   │   │
│  │   Pyth SSE → price ticks → PriceSignal      │   │
│  └─────────────────────┬────────────────────────┘   │
│                        │ signal fired                │
│                        ▼                            │
│  ┌──────────────────────────────────────────────┐   │
│  │              RiskAgent                       │   │
│  │  check position size, exposure, conf, rate  │   │
│  └─────────────────────┬────────────────────────┘   │
│                        │ approved                    │
│                        ▼                            │
│  ┌────────────────────────────────┐                 │
│  │       asyncio.gather()        │                 │
│  │  ┌───────────────┐ ┌────────┐ │                 │
│  │  │ AnalysisAgent │ │ZeroX   │ │                 │
│  │  │ groq / claude │ │Router  │ │                 │
│  │  └───────┬───────┘ └───┬────┘ │                 │
│  └──────────┼─────────────┼──────┘                 │
│             │ both agree  │                         │
│             ▼             ▼                         │
│  ┌──────────────────────────────────────────────┐   │
│  │             ExecutionAgent                   │   │
│  │  sign TX → Titan (ETH) or Helius (SOL)      │   │
│  └─────────────────────┬────────────────────────┘   │
│                        │ submitted                   │
│                        ▼                            │
│  ┌──────────────────────────────────────────────┐   │
│  │              MonitorAgent                    │   │
│  │   Helius RPC polls → confirmed/failed        │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  All API keys managed by KeyShield proxy             │
│  TradingState shared across all agents               │
└─────────────────────────────────────────────────────┘
```

---

## 6. 0x Protocol

0x is a DEX aggregator for EVM chains (Ethereum, Polygon, Base, Arbitrum, etc.).

### What it does

Finds the best swap route across Uniswap, Curve, Balancer, DODO, and dozens of other DEXes. Returns calldata you sign and send.

### Store your key

```bash
# Get a free key at https://0x.org/docs/api
ks_store 0x "your-0x-api-key"
```

### Get a quote

```python
from src.backend.trading.execution import ZeroXRouter

async with ZeroXRouter(ks_token=token) as router:
    quote = await router.quote(
        sell_token="USDC",
        buy_token="ETH",
        sell_amount=1_000_000,     # 1 USDC (6 decimals)
    )
    print(f"Buy {quote.buy_amount} wei ETH")
    print(f"Price: ${quote.price:.4f}")
    print(f"Impact: {quote.price_impact:.3%}")
    print(f"Gas: {quote.gas}")
    print(f"Took: {quote.fetch_ms:.0f}ms")

    # quote.to + quote.data + quote.value → send to your wallet
```

### Price impact rules

| Impact | Action |
|--------|--------|
| < 0.1% | Always OK |
| 0.1% - 0.5% | OK for routine trades |
| 0.5% - 2% | Warn, check liquidity |
| > 2% | Reject (RiskAgent default) |

### Supported chains

```python
ZeroXRouter(ks_token, chain_id=1)      # Ethereum
ZeroXRouter(ks_token, chain_id=137)    # Polygon
ZeroXRouter(ks_token, chain_id=42161)  # Arbitrum
ZeroXRouter(ks_token, chain_id=8453)   # Base
ZeroXRouter(ks_token, chain_id=10)     # Optimism
```

---

## 7. Titan Builder

Titan Builder is a **neutral** block builder on Ethereum (endpoint: `rpc.titanbuilder.xyz`). "Neutral" means they do zero in-house searching — they only build blocks from bundles submitted by external searchers and users.

**What Titan protects:** bundles and private transactions. When you send a transaction inside a bundle, Titan will never unbundle it or broadcast it to the public mempool. A standalone EOA transaction submitted directly to their RPC endpoint has the same mempool exposure as any other transaction.

### Why it matters for trading

**Public mempool flow:**
```
You submit TX → public mempool → searcher sees it → searcher frontruns → you get worse price
```

**Titan bundle flow:**
```
You submit bundle → Titan builder → block included directly → no public mempool exposure
```

**Cost:** Standard gas. No API key required. Titan supports `refundPercent` (MEV kickback to your address) on bundles that generate value.

### Store your key

```bash
# Sign up at https://docs.titanbuilder.xyz
ks_store titan "your-titan-api-key"
```

### Simulate before submit (always)

```python
from src.backend.trading.execution import TitanExecutor

async with TitanExecutor(ks_token=token) as titan:
    # Simulate first — checks for reverts and estimates cost
    sim = await titan.simulate_bundle([signed_tx_hex])
    if sim.get("results", [{}])[0].get("error"):
        print("TX would revert — aborting")
        return

    # Now submit
    bundle = await titan.send_bundle(
        [signed_tx_hex],
        simulate_first=True,     # set True to auto-simulate
    )
    print(f"Bundle: {bundle.bundle_hash}")
```

### Bundle strategies

**Single TX bundle** — simplest, protects your swap from frontrunning.

**Multi-TX bundle** — atomic: all succeed or all revert.
```python
# Example: approve + swap as atomic bundle (prevents partial execution)
bundle = await titan.send_bundle([
    approve_tx_hex,     # approve USDC spend
    swap_tx_hex,        # execute the swap
])
```

**Target specific block:**
```python
from web3 import Web3
w3 = Web3(Web3.HTTPProvider("..."))
current = w3.eth.block_number
bundle = await titan.send_bundle([tx], target_block=current + 1)
```

---

## 8. Pyth / Hermes Price Feeds

Pyth is the lowest-latency price oracle for crypto, equities, and forex.
Hermes is the gateway that streams Pyth prices via SSE.

### Price IDs

```python
# Target: from trading.feeds import PRICE_IDS
# Today there is no trading.feeds module and no PRICE_IDS map.
# Look up IDs at https://pyth.network/price-feeds and pass them yourself.

print("SOL/USD")   # 0xef0d8b6f...
print("ETH/USD")   # 0xff61491a...
print("BTC/USD")   # 0xe62df6c8...
print("JUP/USD")   # 0x0a0408d6...
```

### SSE stream (recommended) — 📋 `PythFeed` is not implemented

```python
from src.backend.trading.market_data import PriceFeed, PriceFeedConfig, PriceSignal

# Target API (not in the repo):
# async with PythFeed(symbols=["SOL/USD", "ETH/USD"]) as feed:
#     async for price in feed.stream():
#         print(price)

feed = PriceFeed(PriceFeedConfig("SOL/USD"))
feed.update(price=185.42, confidence=0.045, age_ms=12)
```

### One-shot snapshot

```python
# Don't use this in a loop — use the stream once PythFeed exists
snap = feed.snapshot()   # PriceFeed.snapshot() → _PriceData | None
```

### Via KeyShield proxy

```python
# Target: /proxy/pyth/ with X-Upstream-API-Key.
# `pyth` is not a Python /proxy provider today (SPEC.md §8).
# MarketDataAgent(feeds=..., ks_token=..., use_proxy=True) accepts the
# flags but does not open an SSE connection yet.
```

### Signal detection

```python
from src.backend.trading.market_data import PriceSignal

signal = PriceSignal(window=20, threshold=0.005)  # 0.5% from 20-bar SMA

def on_price(price):
    fired, deviation = signal.update(price.price)
    if fired:
        print(f"Signal! {price.symbol} deviated {deviation:.2%}")
        # → trigger analysis + quote
```

---

## 9. AI Model Aggregator

One interface, every model, routed by task type.

### How routing works

```
URGENT    → groq/llama-3.1-70b    (fastest, ~100ms)
ANALYSIS  → gpt-4o-mini           (balanced, ~400ms)
RESEARCH  → claude-opus-4-5       (best reasoning, ~2.5s)
STRUCTURE → gpt-4o-mini           (best JSON mode)
```

If the primary model fails, it falls back to the next model for that task type automatically.

### Usage

```python
from src.backend.trading.analysis import ModelRouter, TaskType

async with ModelRouter(ks_token=token) as router:
    # Fast decision (Groq)
    resp = await router.chat(
        "SOL up 3% in 5 minutes. Buy or wait?",
        task=TaskType.URGENT,
        max_tokens=128,
    )
    print(resp.content)     # {"trade": true, "confidence": 0.82, "reason": "..."}
    print(f"{resp.latency_ms:.0f}ms | ${resp.cost_usd:.5f}")

    # Deep research (Claude Opus)
    resp = await router.chat(
        "Analyze the current SOL/ETH ratio and suggest a rebalancing strategy",
        task=TaskType.RESEARCH,
        max_tokens=2048,
    )

    # Batch — analyze 5 signals at once
    responses = await router.parallel([
        "SOL signal: +2.3% deviation",
        "ETH signal: -1.8% deviation",
        "BTC signal: +0.9% deviation",
    ], task=TaskType.URGENT)

    # Race — fastest model wins
    resp = await router.race(
        "Buy or sell SOL now?",
        models=["llama-3.1-70b-versatile", "gpt-4o-mini"],
    )
```

### Caching

Identical prompts within 60 seconds return cached results — no API call, zero cost.

```python
router = ModelRouter(ks_token=token, cache=True)   # default
# Same prompt twice → second call returns in 0ms from cache
```

### Budget cap

```python
router = ModelRouter(ks_token=token, budget_usd=1.00)  # hard stop at $1
# Raises RuntimeError if budget exceeded
print(f"Spent: ${router.spent:.4f}")
```

---

## 10. OpenClaw + Hermes Agent Wiring

### OpenClaw session pattern

OpenClaw orchestrates agents across multiple sessions. Each agent in this stack maps to an OpenClaw tool:

```python
# OpenClaw tool registry (pseudo-code)
from openclaw import ToolRegistry, Tool

registry = ToolRegistry()

@registry.tool("get_price")
async def get_price(symbol: str) -> dict:
    snapshot = await feed.snapshot()
    p = snapshot[symbol]
    return {"price": p.price, "conf": p.conf, "age_ms": p.age_ms}

@registry.tool("analyze_signal")
async def analyze_signal(symbol: str, deviation: float) -> dict:
    should_trade, conf, reason = await analyst.confirm(symbol, 0, deviation)
    return {"trade": should_trade, "confidence": conf, "reason": reason}

@registry.tool("get_swap_quote")
async def get_swap_quote(sell: str, buy: str, amount: int) -> dict:
    quote = await router.quote(sell, buy, sell_amount=amount)
    return {"price": quote.price, "impact": quote.price_impact, "gas": quote.gas}

@registry.tool("execute_swap")
async def execute_swap(sell: str, buy: str, amount: int) -> dict:
    result = await exec_agent.execute_eth_swap(sell, buy, amount, WALLET)
    return {"bundle_hash": result["bundle"].bundle_hash}
```

### Hermes agent — which one

"Hermes" in this context is Pyth's price streaming gateway. The intended
wrapper is `PythFeed` in `feeds.py` — that file is not in the repo.
`PriceFeed` / `MarketDataAgent` in `src/backend/trading/market_data.py`
are the current placeholders.

If you're using a separate Hermes AI agent framework:
- MarketDataAgent pushes prices to Hermes agent context via callback
- AnalysisAgent sends enriched context (price + history + signal) to Hermes
- Hermes returns a structured decision
- ExecutionAgent acts on the decision

### Memory across sessions

```python
# TradingState is the shared memory
state = TradingState()

# Persist it between sessions
import json, pickle
with open("state.pkl", "wb") as f:
    pickle.dump(state, f)

# Load next session
with open("state.pkl", "rb") as f:
    state = pickle.load(f)
```

---

## 11. Running the Trading Bot

### Quickstart

```bash
# 1. Store your keys (Path A via the dashboard, or the /manage/store shim)
#    source src/backend/keyshield-cli.sh  # GET /install.sh serves the same file
# Dashboard: http://localhost:3000  →  Vault  →  Developer → copy token
curl -s -X POST http://localhost:8001/manage/store \
  -H "Authorization: Bearer $KS_TOKEN" -H "Content-Type: application/json" \
  -d '{"upstream":"openai","value":"sk-proj-xxx"}'

# 2. Copy your session token from the Developer panel
export KS_TOKEN="<token from the Developer tab>"
export KS_BASE="http://localhost:8001"

# 3. There is no `src.backend.trading.agent` module and
#    TradingOrchestrator has no __main__. Wire it yourself:
#        from src.backend.trading.orchestrator import TradingOrchestrator
#    DRY_RUN / CHAIN / MAX_POSITION_USD are the intended env contract.
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KS_TOKEN` | required | Session token from KeyShield dashboard |
| `KS_BASE` | `http://localhost:8001` | Python control plane. `:8000` is the optional Rust `ks-proxy` (local only). Prod example: `https://keyshield-production.up.railway.app` |
| `CHAIN` | `solana` | `solana` or `ethereum` (intended; not read by an entrypoint yet) |
| `DRY_RUN` | `true` | `false` to enable real execution (intended) |
| `MAX_POSITION_USD` | `500` | Per-trade size limit (intended) |

### Logging

```bash
# Intended format: 2026-04-27 12:34:56 [Orch] Signal on SOL/USD: 0.82% deviation
# There is no `python3 -m trading.agent` entrypoint.
```

---

## 12. RPC Guide

### Why Helius over public RPC

| | Public RPC | Helius |
|--|-----------|--------|
| Rate limit | ~10 req/s | 100+ req/s |
| Latency | 200-500ms | 30-80ms |
| WebSocket | unreliable | stable |
| getAsset (NFT) | often slow | fast + enhanced |
| Cost | free | free tier + paid |

### Using Helius via KeyShield

```python
# Store your Helius key once (dashboard Device Vault, or the /manage/store shim)
# ks.store("helius", "...")  # current SDK sends apiKey; backend reads `value`

# Call via the Python control plane. Path A: decrypt locally and send
# X-Upstream-API-Key. Shim: /vproxy/helius/ resolves the stored value.
import httpx
client = httpx.AsyncClient(
    base_url="http://localhost:8001/proxy/helius/",
    headers={
        "Authorization": f"Bearer {ks_token}",
        "X-Upstream-API-Key": helius_key,   # required on /proxy/*; omit on /vproxy/*
    },
)

# Get SOL balance
r = await client.post("", json={
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getBalance",
    "params": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
})
balance = r.json()["result"]["value"]
print(f"Balance: {balance / 1e9:.4f} SOL")
```

### Cached RPC methods

KeyShield automatically caches these methods:

| Method | TTL | Why |
|--------|-----|-----|
| `getBalance` | 5s | changes slowly |
| `getAccountInfo` | 5s | state changes slowly |
| `getAsset` | 300s | NFT metadata is immutable |
| `getAssetsByOwner` | 30s | portfolio changes slowly |
| `getSignaturesForAddress` | 30s | history is immutable |
| `getTransaction` | 60s | confirmed TXs don't change |

### Batch RPC (Helius)

```python
# 5 RPC calls in 1 HTTP round trip
results = ks.batch([
    {"upstream": "helius", "body": {"jsonrpc": "2.0", "id": 1,
     "method": "getBalance", "params": ["WALLET1"]}},
    {"upstream": "helius", "body": {"jsonrpc": "2.0", "id": 2,
     "method": "getBalance", "params": ["WALLET2"]}},
    {"upstream": "helius", "body": {"jsonrpc": "2.0", "id": 3,
     "method": "getAssetsByOwner", "params": ["WALLET1", {"page": 1}]}},
])
```

---

## 13. Architecture Decisions

### Why split storage (CF Worker) from usage (Python proxy)?

Two surfaces have different threat models. Storage benefits from
zero-knowledge: the user's passkey-PRF derives the AES key on-device,
the server only ever sees ciphertext. Usage benefits from a stateful
billing/agents/sharing layer: rate limits, x402 payment receipts, and
agent attribution all need a server. Splitting them lets the storage
tier be inspectable + boring (it's just R2 + a Bearer-token check) and
the usage tier be feature-rich without holding plaintext at rest.

### Why SSE over WebSocket for Pyth?

Hermes SSE is simpler (HTTP, auto-reconnect, works behind proxies) and has the same latency as WebSocket for this use case. Pyth publishes every ~400ms, so sub-millisecond difference doesn't matter. Use SSE unless you need true bidirectional messaging.

### Why Titan over Flashbots?

Both are neutral block builders that protect bundles from public mempool exposure — neither is a "private mempool" in the traditional sense. Titan does not run its own searching; Flashbots has historically been more MEV-searcher-centric. Titan requires no API key and no searcher relationship. For production at scale (>$50k per transaction), measure actual execution quality against both builders.

### Why asyncio.gather() instead of sequential?

Quote fetching (~150ms) and AI analysis (~100ms) are completely independent. Running them in parallel cuts the hot path from 250ms to 150ms — a 40% improvement that compounds on every trade.

### Why Groq for urgent decisions?

Groq runs LLMs on custom LPU (Language Processing Unit) hardware. p50 latency for llama-3.1-70b is ~100ms vs ~800ms on standard GPU infrastructure. For real-time trading decisions, this is the difference between catching a move and missing it.

### Why not put raw keys in agent environment variables?

- Env vars are visible to all processes on the host
- They appear in crash dumps, `ps aux` output, and process listings
- CI/CD systems often log env vars in pipeline output
- Rotation requires redeploying every agent that uses the key
- KeyShield solves all of these: encrypt once on-device, sync the
  ciphertext, rotate from the dashboard, agents never see the raw key

### When to use an API aggregator (model router)

Use the ModelRouter when:
- You want automatic fallback if one provider has downtime
- You're mixing time-sensitive (Groq) and deep reasoning (Claude) tasks in the same pipeline
- You want cost tracking across all providers in one place
- You need to switch models A/B without changing agent code

Don't use it when:
- You always want a specific model with no fallback
- You need streaming responses (add streaming support first)
- Latency of the router logic itself matters (it's sub-millisecond but still overhead)

---

## GitNexus — Cloud Agents vs desktop

Cursor Cloud Agents **do not** load the desktop GitNexus stdio MCP
(`npx gitnexus setup` → `~/.cursor/mcp.json`). That is why
`gitnexus_impact` / `gitnexus_detect_changes` are often missing here.

Do **not** stall and write only “GitNexus MCP was not connected.”

1. Probe MCP (`GetDynamicTools` pattern `gitnexus`).
2. If absent, use the CLI wrapper: [`scripts/gitnexus-cloud.sh`](scripts/gitnexus-cloud.sh).
3. Follow the runbook: [`docs/internal/GITNEXUS.md`](docs/internal/GITNEXUS.md).
4. Log repeats in [`docs/internal/RECURRING_ISSUES.md`](docs/internal/RECURRING_ISSUES.md) (issue **R1**).

`npx gitnexus analyze` without `--index-only` rewrites the tagged block
below. Cloud Agents must pass `--index-only` (the wrapper does).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project can be indexed by GitNexus as **keyshield**. The on-disk
index (`.gitnexus/`) is gitignored and **machine-local**. A leftover
`meta.json` from another host (WSL path, old commit) is foreign storage —
delete it (`rm -rf .gitnexus` or `./scripts/gitnexus-cloud.sh analyze`)
before re-indexing.

Prefer MCP tools when the `gitnexus` namespace is connected (desktop
Cursor after `npx gitnexus setup`). On Cloud Agents, use the CLI.

> If any GitNexus tool warns the index is stale, run
> `./scripts/gitnexus-cloud.sh analyze` (or `npx gitnexus analyze --index-only`)
> first.

## Always Do

- **Before editing a function / class / method:** run impact analysis
  (MCP `impact` / `gitnexus_impact`, or CLI
  `./scripts/gitnexus-cloud.sh impact --direction upstream <symbol>`).
  Report blast radius (callers, flows, risk). Docs-only edits may skip
  this step.
- **Before committing symbol changes:** run detect-changes
  (MCP `detect_changes` / `gitnexus_detect_changes`, or CLI
  `./scripts/gitnexus-cloud.sh detect-changes --scope all`).
- **Warn** if impact returns HIGH or CRITICAL before proceeding.
- Exploring: MCP `query` / CLI `./scripts/gitnexus-cloud.sh query "…"`.
- Symbol 360°: MCP `context` / CLI `./scripts/gitnexus-cloud.sh context <name>`.

If MCP is absent **and** the CLI fails (`gitnexus doctor` + the error),
fall back to `rg` / call-graph by hand and record the failure in
`docs/internal/RECURRING_ISSUES.md`. Do not invent a GitNexus report.

## Never Do

- NEVER treat a missing MCP namespace as a reason to stop the task.
- NEVER ignore HIGH or CRITICAL risk from impact (MCP or CLI).
- NEVER rename symbols with blind find-and-replace when MCP `rename`
  or a graph-aware edit is available (desktop). On Cloud, grep + compile
  is the fallback; still do not drive-by rename public APIs.
- NEVER commit symbol edits without detect-changes (MCP or CLI) unless
  both layers failed and that failure is recorded.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/keyshield/context` | Overview + staleness (MCP only) |
| `npx gitnexus status` / `list` | Same facts via CLI |
| `gitnexus://repo/keyshield/clusters` | Functional areas (MCP) |
| `gitnexus://repo/keyshield/processes` | Execution flows (MCP) |

## CLI

Skill markdown under `.claude/skills/gitnexus/` is **not in this repo**
(`gitnexus setup` installs it on the operator machine). Use:

| Task | Command |
|------|---------|
| Index / repair foreign leftover | `./scripts/gitnexus-cloud.sh analyze` |
| Blast radius | `./scripts/gitnexus-cloud.sh impact --direction upstream <symbol>` |
| Uncommitted / vs-main impact | `./scripts/gitnexus-cloud.sh detect-changes --scope all` |
| How does X work? | `./scripts/gitnexus-cloud.sh query "…"` |
| Symbol context | `./scripts/gitnexus-cloud.sh context <name>` |
| Full attach + Cloud procedure | `docs/internal/GITNEXUS.md` |

<!-- gitnexus:end -->
