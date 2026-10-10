# KeyShield — Agent Design Guide

> How to wire AI agents, trading bots, and API aggregators into KeyShield's zero-trust proxy. When to use which agent. Why each design decision.

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
from keyshield_sdk import KeyShield
ks = KeyShield(token=os.environ["KS_TOKEN"])
client = ks.openai_client()   # same OpenAI SDK, zero raw keys
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
| Vault **usage** (per-request key injection) | Python FastAPI (`src/backend/`) | `POST /proxy/:upstream/...` with `X-Upstream-API-Key: <decrypted-key>` header — never persisted |

`/manage/*` (server-side plaintext storage) is removed; storage is
exclusively client-encrypted via Path A.

### Step 1 — Store your keys once

```bash
# Option A: web UI (Path A — dashboard with Device Vault)
# Go to https://app.ks.aileena.xyz → Vault → New secret → select provider → paste key
# (locally: http://localhost:5173 once `cd src/_archive/web-v2 && npm run dev` is running)
# NOTE: 2026-05-10 — the dashboard was archived to src/_archive/web-v2/ when
# `dashboard/` was renamed to src/web/. The Device Vault UI hasn't been
# reintegrated into the new src/web/ yet — clone the archive locally for
# the full Path A flow.
# The dashboard encrypts client-side via WebAuthn-PRF → HKDF → AES-GCM and
# pushes ciphertext to the Cloudflare sync-worker.

# Option B: CLI
source keyshield-cli.sh
ks_store openai      "sk-proj-xxx"
ks_store anthropic   "sk-ant-api03-xxx"
ks_store helius      "your-helius-key"
ks_store 0x          "your-0x-api-key"
ks_store groq        "gsk_xxx"

# Option C: Python SDK
from keyshield_sdk import KeyShield
ks = KeyShield()
ks.login("your_wallet", "your_passphrase")
ks.store("openai",    "sk-proj-xxx")
ks.store("anthropic", "sk-ant-xxx")
ks.store("helius",    "xxx")
ks.store("0x",        "xxx")
ks.store("groq",      "gsk_xxx")
```

> **Note (2026-05-10):** Path A vault UI was archived to
> `src/_archive/web-v2/` when the new `src/web/` dashboard replaced it.
> The CLI and Python SDK still write Path A ciphertext to the Cloudflare
> sync-worker — the Python backend never sees plaintext at storage time —
> via the modules at `src/_archive/web-v2/lib/{vault,sync,sync-auth}.ts`.
> Reintegrating the visual flow into `src/web/` is on the punch list.

### Step 2 — Login and get a token

```bash
# Web UI: log in at https://app.ks.aileena.xyz, then Developer → copy token

# Python
token = ks.login("my_wallet", "my_passphrase")
# token = "ksv2_xxxxx..."
```

### Step 3 — Set the token in your agent environment

```bash
export KS_TOKEN="ksv2_xxxxx..."
```

### Step 4 — Agent calls the proxy

```python
import os, openai
from keyshield_sdk import KeyShield

ks     = KeyShield(token=os.environ["KS_TOKEN"])
openai = ks.openai_client()   # SDK decrypts the vault entry locally,
                              # then sends it to /proxy/openai/...
                              # in the X-Upstream-API-Key header.
```

That's it. Your agent never has the raw key. Rotate keys from the
dashboard without touching agent code; the next request picks up the
new ciphertext from the sync-worker and decrypts it on the client.

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
`asyncio.gather()` is your main tool. `parallel_quote_and_analyze()` in `execution.py` does this for the hot path.

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
mda = MarketDataAgent(state, symbols=["SOL/USD"], ks_token=token)
mda.subscribe(my_callback)   # called on every tick
await mda.start()            # background task, never blocks
```

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

**Solana flow (Jupiter + Helius):**
```
JupiterRouter.quote() → quote_response
  → JupiterRouter.swap_transaction() → base64 TX
  → wallet.sign(tx) → signed TX
  → helius.sendTransaction() → signature
```

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

### MonitorAgent

**What:** Polls Helius RPC for transaction confirmations. Updates state on success/failure.

**When to use:** Always — spawn a watch task for every submitted transaction.

**Pattern:**
```python
monitor.watch(tx_signature, {
    "symbol": "SOL",
    "amount": 1.5,
    "type": "buy",
})
# MonitorAgent polls every 2s until confirmed or failed
```

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
from trading.execution import ZeroXRouter

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
from trading.execution import TitanExecutor

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
from trading.feeds import PRICE_IDS

# Built-in:
print(PRICE_IDS["SOL/USD"])   # 0xef0d8b6f...
print(PRICE_IDS["ETH/USD"])   # 0xff61491a...
print(PRICE_IDS["BTC/USD"])   # 0xe62df6c8...
print(PRICE_IDS["JUP/USD"])   # 0x0a0408d6...

# Add custom tokens by looking up the ID at:
# https://pyth.network/price-feeds
```

### SSE stream (recommended)

```python
from trading.feeds import PythFeed

async with PythFeed(symbols=["SOL/USD", "ETH/USD"]) as feed:
    async for price in feed.stream():
        print(price)
        # Price(SOL/USD $185.4200 ±0.0450 age=12ms)
```

### One-shot snapshot

```python
# Don't use this in a loop — use the stream
feed = PythFeed(symbols=["SOL/USD"])
prices = await feed.snapshot()
sol_price = prices["SOL/USD"]
```

### Via KeyShield proxy

```python
# Routes through /proxy/pyth/ — your Pyth API key forwarded
# in the X-Upstream-API-Key header (never persisted server-side)
feed = PythFeed(
    symbols=["SOL/USD"],
    ks_token=your_token,
    use_proxy=True,
)
```

### Signal detection

```python
from trading.feeds import PriceSignal

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
from trading.models import ModelRouter, TaskType

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

"Hermes" in this context is Pyth's price streaming gateway. The `PythFeed` class in `feeds.py` wraps it.

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
# 1. Store your keys (Path A — encrypted client-side, synced via CF Worker)
source keyshield-cli.sh
ks_login your_wallet your_passphrase
ks_store openai    "sk-proj-xxx"
ks_store groq      "gsk_xxx"
ks_store helius    "your-helius-key"
ks_store 0x        "your-0x-key"

# 2. Copy your session token from the Developer panel
export KS_TOKEN="ksv2_xxxxx..."

# 3. Run (dry run — no real transactions)
cd keyshield
DRY_RUN=true python3 -m src.backend.trading.agent

# 4. When ready, enable live trading
DRY_RUN=false CHAIN=ethereum MAX_POSITION_USD=100 python3 -m src.backend.trading.agent
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KS_TOKEN` | required | Session token from KeyShield dashboard |
| `KS_BASE` | `http://localhost:8000` | KeyShield Python API base URL (e.g. `https://keyshield-production.up.railway.app` in prod) |
| `CHAIN` | `solana` | `solana` or `ethereum` |
| `DRY_RUN` | `true` | `false` to enable real execution |
| `MAX_POSITION_USD` | `500` | Per-trade size limit |

### Logging

```bash
# All agent activity logged to stdout
# Format: 2026-04-27 12:34:56 [Orch] Signal on SOL/USD: 0.82% deviation
# Set level:
LOGLEVEL=DEBUG python3 -m trading.agent
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
# Store your Helius key once (web-v2 dashboard or CLI; both write Path A
# ciphertext to the Cloudflare sync-worker)
ks.store("helius", "your-helius-api-key")

# Call via the Python proxy. The SDK decrypts the entry locally and
# attaches it as X-Upstream-API-Key on the request.
import httpx
client = httpx.AsyncClient(
    base_url="http://localhost:8000/proxy/helius/",
    headers={"Authorization": f"Bearer {ks_token}"},
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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **keyshield** (6516 symbols, 11707 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/keyshield/context` | Codebase overview, check index freshness |
| `gitnexus://repo/keyshield/clusters` | All functional areas |
| `gitnexus://repo/keyshield/processes` | All execution flows |
| `gitnexus://repo/keyshield/process/{name}` | Step-by-step execution trace |

## CLI

`gitnexus` is **not** on macOS PATH. Do not run it from `~`.
`.gitnexus/run.cjs` is gitignored — use the wrapper:

```
cd /path/to/keyshield
node src/scripts/gitnexus.cjs impact "status_strip" --direction upstream
node src/scripts/gitnexus.cjs detect-changes --scope all
npm run gitnexus -- impact status_strip --direction upstream
```

Never paste `<符号>`. That is a placeholder. From `$HOME`, `node src/scripts/gitnexus.cjs` looks for `/Users/you/src/scripts/gitnexus.cjs` and throws MODULE_NOT_FOUND.

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
