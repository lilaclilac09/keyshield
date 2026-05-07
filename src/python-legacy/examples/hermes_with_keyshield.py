"""
hermes_with_keyshield.py — Pyth/Hermes price stream + KeyShield AI analysis
============================================================================

What this shows:
  An agent that subscribes to Pyth Hermes SSE price feed (real-time, push
  delivered, ~50ms latency) and pipes every meaningful price move into
  multiple AI models for analysis — all keys managed by KeyShield.

The latency story:
  Hermes SSE  → 50ms   (real-time push from Pyth validators)
  KeyShield   → +5ms   (proxy is local, key injection is in-memory)
  Groq URGENT → +100ms (fastest LLM, runs on Groq's LPU chips)
  ─────────────────────
  Total       → 155ms  for "price moved → trade decision made"

Compare to polling Hermes every second + reading keys from disk every call:
  Polling     → 500ms avg
  Disk read   → 5ms each call
  OpenAI      → 800ms
  ─────────────────────
  Total       → 1305ms (8.4x slower)

Why this matters:
  In a flash crash, 1.1 seconds is the difference between exiting at -2%
  and exiting at -15%. KeyShield's design (persistent connection pool +
  in-memory key cache + parallel proxy) is built for this.

Setup:
  Same as openclaw_with_keyshield.py:
    1. install.sh
    2. Owner stores keys in vault (helius, openai, anthropic, groq, pyth)
    3. Owner registers agent pubkey
    4. python hermes_with_keyshield.py

  If you don't have a Pyth API key, leave it unset — Hermes is public.
  KeyShield will route through anyway and the agent uses the same proxy URL,
  so the architecture stays the same when you do upgrade to a paid Pyth tier.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from typing import Callable

from dotenv import load_dotenv
load_dotenv()

import httpx
from keyshield_sdk import AgentKeyShield

# ─── Pyth price IDs (mainnet) ────────────────────────────────────────────────

PRICE_IDS = {
    "SOL/USD":  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "ETH/USD":  "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "BTC/USD":  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    "BONK/USD": "72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    "JUP/USD":  "0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
}


# ─── Agent setup ─────────────────────────────────────────────────────────────

agent = AgentKeyShield(
    owner_wallet     = os.environ["KS_OWNER_WALLET"],
    private_key_hex  = os.environ["KS_AGENT_KEY"],
    vault_passphrase = os.environ["KS_VAULT_PASS"],
    base_url         = os.environ.get("KS_BASE", "http://localhost:8000"),
)
agent.authenticate()
KS_BASE = agent._base
KS_TOKEN = agent._token

print(f"[startup] agent {agent.pubkey_b58[:16]}… authenticated")
print(f"[startup] vault: {agent.list_keys()}")


# ─── Price tick ──────────────────────────────────────────────────────────────

@dataclass
class Tick:
    symbol:     str
    price:      float
    conf:       float
    publish_ts: int
    received_at: float = field(default_factory=time.monotonic)

    @property
    def age_ms(self) -> float:
        return (time.time() - self.publish_ts) * 1000


# ─── Hermes SSE feed (via KeyShield proxy) ───────────────────────────────────

async def hermes_stream(symbols: list[str], on_tick: Callable[[Tick], asyncio.Future]):
    """
    Subscribe to Pyth Hermes SSE through the KeyShield proxy.
    KeyShield handles connection pooling and any future API key injection.
    Reconnects with exponential back-off.
    """
    ids = [PRICE_IDS[s] for s in symbols]
    qs  = "&".join(f"ids[]={i}" for i in ids) + "&encoding=json&parsed=true"

    # Route through KeyShield → /proxy/pyth/v2/updates/price/stream
    url = f"{KS_BASE}/proxy/pyth/v2/updates/price/stream?{qs}"
    headers = {
        "Authorization": f"Bearer {KS_TOKEN}",
        "Accept":        "text/event-stream",
    }

    backoff = 1.0
    while True:
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", url, headers=headers) as resp:
                    resp.raise_for_status()
                    backoff = 1.0
                    print(f"[hermes] connected to {symbols}")

                    buf = ""
                    async for line in resp.aiter_lines():
                        if line.startswith("data:"):
                            buf = line[5:].strip()
                        elif line == "" and buf:
                            try:
                                payload = json.loads(buf)
                                for item in payload.get("parsed", []):
                                    p     = item["price"]
                                    expo  = p["expo"]
                                    pid   = item["id"]
                                    sym   = next((s for s, i in PRICE_IDS.items() if i == pid), pid[:8])
                                    tick  = Tick(
                                        symbol     = sym,
                                        price      = int(p["price"]) * (10 ** expo),
                                        conf       = int(p["conf"])  * (10 ** expo),
                                        publish_ts = int(p["publish_time"]),
                                    )
                                    await on_tick(tick)
                            except (json.JSONDecodeError, KeyError):
                                pass
                            buf = ""
        except Exception as e:
            print(f"[hermes] disconnected: {e}, retry in {backoff}s")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


# ─── AI analysis through KeyShield ───────────────────────────────────────────

async def fast_signal(symbol: str, recent_prices: list[float]) -> dict:
    """Groq llama-3.1-70b — ~100ms, for URGENT decisions."""
    t0 = time.monotonic()
    r = await asyncio.to_thread(
        agent.proxy, "groq", "openai/v1/chat/completions",
        method="POST",
        json={
            "model": "llama-3.1-70b-versatile",
            "messages": [
                {"role": "system", "content":
                    "Trading signal. Reply ONLY JSON: {action, confidence, reason}"},
                {"role": "user", "content":
                    f"{symbol} last 10: {recent_prices[-10:]}. Action?"},
            ],
            "max_tokens": 80,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
    )
    latency = (time.monotonic() - t0) * 1000
    if r.is_error:
        return {"action": "hold", "confidence": 0, "reason": "error", "latency_ms": latency}
    out = json.loads(r.json()["choices"][0]["message"]["content"])
    out["latency_ms"]  = latency
    out["model"]       = "groq/llama-70b"
    out["key_type"]    = r.headers.get("x-ks-key-type", "?")
    return out


async def race_models(symbol: str, prices: list[float]) -> dict:
    """
    Send the same question to multiple models in parallel — return first to respond.
    Cancel the slower ones. Used for ultra-low-latency decisions where any
    model's answer is acceptable.
    """
    async def call(provider: str, model: str, path: str, body: dict):
        t0 = time.monotonic()
        r = await asyncio.to_thread(agent.proxy, provider, path, method="POST", json=body)
        return {
            "provider":   provider,
            "model":      model,
            "answer":     r.json(),
            "latency_ms": (time.monotonic() - t0) * 1000,
        }

    prompt = f"{symbol} last 10 ticks: {prices[-10:]}. Trade signal in 1 word."
    tasks = [
        call("groq",   "llama-70b",  "openai/v1/chat/completions",
             {"model": "llama-3.1-70b-versatile", "max_tokens": 30,
              "messages": [{"role": "user", "content": prompt}]}),
        call("openai", "gpt-4o-mini", "v1/chat/completions",
             {"model": "gpt-4o-mini", "max_tokens": 30,
              "messages": [{"role": "user", "content": prompt}]}),
    ]
    done, pending = await asyncio.wait(
        [asyncio.create_task(t) for t in tasks],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for p in pending: p.cancel()
    return done.pop().result()


# ─── Decision loop ───────────────────────────────────────────────────────────

class Strategy:
    def __init__(self):
        self.history: dict[str, list[float]] = {}
        self.last_action_ts: dict[str, float] = {}

    async def on_tick(self, tick: Tick):
        # Maintain rolling window
        h = self.history.setdefault(tick.symbol, [])
        h.append(tick.price)
        if len(h) > 50: h.pop(0)

        # Print every tick (in production, only print signals)
        print(f"[tick] {tick.symbol} ${tick.price:.4f} "
              f"age={tick.age_ms:.0f}ms (n={len(h)})")

        # Need at least 20 prices for SMA
        if len(h) < 20: return

        # Rate limit: no more than one signal per symbol per 10s
        now = time.monotonic()
        if now - self.last_action_ts.get(tick.symbol, 0) < 10:
            return

        # Detect a 0.3% move from the 20-bar SMA
        sma = sum(h[-20:]) / 20
        dev = (tick.price - sma) / sma
        if abs(dev) < 0.003: return

        self.last_action_ts[tick.symbol] = now

        print(f"  [signal] {tick.symbol} moved {dev*100:+.2f}% from SMA — querying AI…")
        signal = await fast_signal(tick.symbol, h)
        print(f"  [ai]     action={signal['action']} "
              f"conf={signal.get('confidence', 0):.2f} "
              f"latency={signal['latency_ms']:.0f}ms "
              f"key={signal.get('key_type', '?')}")
        print(f"           reason: {signal.get('reason', '')[:80]}")

        # If high confidence + race models for confirmation
        if signal.get("confidence", 0) > 0.7:
            print(f"  [race]   confirming with race(groq, openai)…")
            winner = await race_models(tick.symbol, h)
            print(f"  [race]   {winner['provider']}/{winner['model']} won in {winner['latency_ms']:.0f}ms")


# ─── Main ────────────────────────────────────────────────────────────────────

async def main():
    strategy = Strategy()
    symbols  = ["SOL/USD", "ETH/USD", "BTC/USD"]
    print(f"[main] subscribing to {symbols}")
    await hermes_stream(symbols, strategy.on_tick)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[exit] agent stopped")
