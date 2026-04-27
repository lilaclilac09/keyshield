"""
openclaw_with_keyshield.py — OpenClaw agent with KeyShield key management
==========================================================================

What this shows:
  An OpenClaw-style autonomous Solana trading agent that uses KeyShield
  for ALL its API keys. The agent has its own ed25519 keypair, NEVER sees
  any plaintext API keys, and gets all credentials injected by the proxy.

Why this matters:
  Traditional agents have OPENAI_API_KEY, ANTHROPIC_API_KEY, HELIUS_API_KEY
  in their .env file. Anyone who reads the env can drain your accounts.
  With KeyShield: the agent only has its own ed25519 private key. The
  vault keys are encrypted on the server and only decrypted at request
  time (zero-trust proxy).

Setup (one-time):
  1. Owner runs install.sh:
       curl -fsSL http://localhost:8000/install.sh | bash
     This generates the agent keypair and writes .env

  2. Owner stores keys in their vault (via dashboard or CLI):
       ks_store openai    sk-proj-...
       ks_store anthropic sk-ant-...
       ks_store helius    your-helius-key

  3. Owner registers the agent in the dashboard Agents tab

  4. Run this script — agent self-authenticates and starts trading

Architecture (latency budget):
  ┌──────────────┐
  │ Pyth Hermes  │ ── SSE price stream (push, ~50ms)
  └──────┬───────┘
         ▼
  ┌──────────────┐    ┌────────────┐
  │ OpenClaw     │ ──▶│ KeyShield  │ ── proxy → Helius (RPC)
  │ trading bot  │    │ proxy      │ ── proxy → OpenAI (analysis)
  │ (this file)  │    │ (no keys   │ ── proxy → Anthropic (deep think)
  └──────┬───────┘    │  in agent) │ ── proxy → 0x       (swap quote)
         │            └────────────┘ ── proxy → Titan    (private mempool)
         ▼
  ┌──────────────┐
  │ Solana RPC   │ ── via KeyShield proxy with method-level cache
  └──────────────┘
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass

# Load .env automatically
from dotenv import load_dotenv
load_dotenv()

import httpx
from keyshield_sdk import AgentKeyShield


# ─── 1. The agent — initialized once at startup ──────────────────────────────

agent = AgentKeyShield(
    owner_wallet     = os.environ["KS_OWNER_WALLET"],
    private_key_hex  = os.environ["KS_AGENT_KEY"],
    vault_passphrase = os.environ["KS_VAULT_PASS"],
    base_url         = os.environ.get("KS_BASE", "http://localhost:8000"),
)
agent.authenticate()  # signs challenge, gets owner's session token
print(f"[startup] authenticated as agent {agent.pubkey_b58[:16]}…")
print(f"[startup] vault keys available: {agent.list_keys()}")


# ─── 2. OpenClaw-style data classes ──────────────────────────────────────────

@dataclass
class PriceTick:
    symbol:    str
    price:     float
    timestamp: float


@dataclass
class TradeDecision:
    should_trade: bool
    side:         str       # "buy" | "sell"
    confidence:   float     # 0..1
    reasoning:    str
    model_used:   str
    latency_ms:   float


# ─── 3. Helpers — every API call goes through KeyShield proxy ────────────────

async def get_solana_balance(wallet: str) -> float:
    """
    Query Solana balance via Helius. The Helius API key is injected by KeyShield.
    Method-level cache (5s TTL for getBalance) is automatic.
    """
    r = await asyncio.to_thread(
        agent.proxy, "helius", "",
        method="POST",
        json={"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [wallet]},
    )
    lamports = r.json()["result"]["value"]
    print(f"  [helius] {wallet[:8]}… = {lamports / 1e9:.4f} SOL "
          f"(cache: {r.headers.get('x-ks-cache')}, "
          f"key: {r.headers.get('x-ks-key-type')})")
    return lamports / 1e9


async def quick_signal(price_data: list[PriceTick]) -> TradeDecision:
    """
    Fast trade signal using Groq (~100ms). For URGENT decisions only.
    """
    t0 = time.monotonic()
    prices_str = ", ".join(f"{p.symbol}=${p.price:.2f}" for p in price_data[-5:])

    r = await asyncio.to_thread(
        agent.proxy, "groq", "openai/v1/chat/completions",
        method="POST",
        json={
            "model": "llama-3.1-70b-versatile",
            "messages": [
                {"role": "system", "content":
                    "You are a trading signal classifier. Reply ONLY with JSON: "
                    "{should_trade: bool, side: 'buy'|'sell', confidence: 0..1, reason: str}"},
                {"role": "user", "content": f"Recent ticks: {prices_str}. Trade now?"},
            ],
            "max_tokens": 100,
            "response_format": {"type": "json_object"},
        },
    )
    latency = (time.monotonic() - t0) * 1000
    if r.is_error:
        return TradeDecision(False, "hold", 0, f"groq error: {r.text[:100]}", "groq", latency)

    content = r.json()["choices"][0]["message"]["content"]
    parsed  = json.loads(content)
    return TradeDecision(
        should_trade = parsed.get("should_trade", False),
        side         = parsed.get("side", "hold"),
        confidence   = parsed.get("confidence", 0),
        reasoning    = parsed.get("reason", ""),
        model_used   = "groq/llama-3.1-70b",
        latency_ms   = latency,
    )


async def deep_analysis(context: str) -> str:
    """
    Deep analysis using Claude — for complex reasoning when latency doesn't matter.
    """
    r = await asyncio.to_thread(
        agent.proxy, "anthropic", "v1/messages",
        method="POST",
        headers={"anthropic-version": "2023-06-01"},
        json={
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": context}],
        },
    )
    return r.json()["content"][0]["text"]


async def get_swap_quote(sell_token: str, buy_token: str, amount: int) -> dict:
    """
    Get a 0x swap quote. KeyShield injects 0x-api-key header.
    """
    r = await asyncio.to_thread(
        agent.proxy, "0x", f"swap/v1/quote?sellToken={sell_token}&buyToken={buy_token}&sellAmount={amount}",
        method="GET",
    )
    return r.json()


# ─── 4. The main agent loop ──────────────────────────────────────────────────

async def main():
    """OpenClaw-style decision loop. Every 5 seconds, evaluate the market."""
    price_history: list[PriceTick] = []
    iteration = 0

    print("\n[loop] starting agent loop. Ctrl+C to stop.\n")

    while True:
        iteration += 1
        print(f"\n──── iteration {iteration} ────")
        t0 = time.monotonic()

        # 1. Pull fresh data — Solana balance via Helius (cached)
        try:
            sol_balance = await get_solana_balance("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
        except Exception as e:
            print(f"  [error] {e}")
            await asyncio.sleep(5)
            continue

        # 2. Mock a price tick (in production you'd subscribe to Pyth/Hermes SSE)
        price = 145.32 + (iteration % 7) * 0.5
        price_history.append(PriceTick("SOL/USD", price, time.time()))
        if len(price_history) > 20: price_history.pop(0)
        print(f"  [tick] SOL/USD = ${price:.2f} (history: {len(price_history)})")

        # 3. Quick signal (fast, every iteration)
        signal = await quick_signal(price_history)
        print(f"  [signal] {signal.side} confidence={signal.confidence:.2f} "
              f"in {signal.latency_ms:.0f}ms via {signal.model_used}")
        print(f"           reason: {signal.reasoning[:60]}…")

        # 4. Deep analysis (slow, every 5 iterations)
        if iteration % 5 == 0:
            print("  [deep]   running Claude deep analysis…")
            try:
                summary = await deep_analysis(
                    f"Recent SOL ticks: {[p.price for p in price_history]}. "
                    f"Current balance: {sol_balance:.4f} SOL. "
                    "Should I rotate into stables?"
                )
                print(f"  [deep]   {summary[:150]}…")
            except Exception as e:
                print(f"  [deep]   error: {e}")

        # 5. If high-confidence signal, get a swap quote
        if signal.should_trade and signal.confidence > 0.7:
            print(f"  [trade] requesting 0x quote for {signal.side}…")
            # In production: proxy to 0x, validate, then submit via Titan
            # quote = await get_swap_quote(...)

        elapsed = (time.monotonic() - t0) * 1000
        print(f"  [iter]  total {elapsed:.0f}ms")

        await asyncio.sleep(5)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[exit] agent stopped")
