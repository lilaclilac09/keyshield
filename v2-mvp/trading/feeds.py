"""
trading/feeds.py — Pyth / Hermes real-time price feed (v2 migration)

Architecture note on latency:
  SSE (Server-Sent Events) > polling.
  Hermes SSE pushes price updates the instant Pyth validators publish them.
  Do NOT poll /latest — you'll be 200-500ms behind the stream.

Usage:
  feed = PythFeed(ks_token="your_ks_token")
  feed.subscribe(SOL_USD, ETH_USD)

  async for price in feed.stream():
      print(price)               # arrives <1ms after Pyth publishes

Price IDs (Pyth network standard):
  SOL/USD : ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
  ETH/USD : ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
  BTC/USD : e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
  USDC/USD: eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a
  BONK/USD: 72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419
  JUP/USD : 0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Callable

import httpx

# ── Well-known Pyth price IDs ─────────────────────────────────────────────────

PRICE_IDS = {
    "SOL/USD":  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "ETH/USD":  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "BTC/USD":  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    "USDC/USD": "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
    "BONK/USD": "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    "JUP/USD":  "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
    "WIF/USD":  "0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc",
    "PYTH/USD": "0x0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff",
}

HERMES_BASE = "https://hermes.pyth.network"


@dataclass
class Price:
    symbol:     str
    price_id:   str
    price:      float          # USD price, confidence-adjusted
    conf:       float          # ± confidence interval
    expo:       int            # raw exponent
    publish_ts: int            # unix timestamp from Pyth
    received_ts: float = field(default_factory=time.monotonic)

    @property
    def age_ms(self) -> float:
        """Milliseconds since Pyth published this price."""
        return (time.time() - self.publish_ts) * 1000

    @property
    def latency_ms(self) -> float:
        """Milliseconds from received to now (how stale in your process)."""
        return (time.monotonic() - self.received_ts) * 1000

    def __repr__(self) -> str:
        return (
            f"Price({self.symbol} ${self.price:.6f} ±{self.conf:.6f} "
            f"age={self.age_ms:.0f}ms)"
        )


def _parse_price_update(raw: dict, id_to_symbol: dict[str, str]) -> Price | None:
    """Parse a Hermes SSE price update into a Price object."""
    try:
        pid   = "0x" + raw["id"]
        sym   = id_to_symbol.get(pid, pid[:10] + "…")
        p     = raw["price"]
        expo  = p["expo"]
        price = int(p["price"]) * (10 ** expo)
        conf  = int(p["conf"])  * (10 ** expo)
        return Price(
            symbol=sym,
            price_id=pid,
            price=price,
            conf=conf,
            expo=expo,
            publish_ts=int(p["publish_time"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


class PythFeed:
    """
    Real-time price feed via Pyth / Hermes SSE.

    Design: one persistent SSE connection per feed instance.
    Reconnects automatically on drop (exponential back-off, max 30s).

    Latency profile:
      Network RTT to Hermes: ~30-60ms (US regions)
      SSE push delay: <5ms from Pyth validators
      Total: typically 35-65ms fresher than HTTP polling

    Usage:
      async with PythFeed(symbols=["SOL/USD", "ETH/USD"]) as feed:
          async for price in feed.stream():
              handle(price)

    Or with a callback (non-blocking, runs in background):
      feed = PythFeed(symbols=["SOL/USD"])
      feed.on_price(my_handler)
      await feed.start()
    """

    def __init__(
        self,
        symbols: list[str] | None = None,
        price_ids: list[str] | None = None,
        ks_base: str = "http://localhost:8000",
        ks_token: str | None = None,
        use_proxy: bool = False,          # True = route through KeyShield proxy
    ):
        # Resolve price IDs
        self._id_to_symbol: dict[str, str] = {}
        ids: list[str] = []

        if symbols:
            for sym in symbols:
                pid = PRICE_IDS.get(sym)
                if not pid:
                    raise ValueError(f"Unknown symbol {sym!r}. Add it to PRICE_IDS or pass price_ids=.")
                ids.append(pid.lstrip("0x"))
                self._id_to_symbol["0x" + pid.lstrip("0x")] = sym

        if price_ids:
            for pid in price_ids:
                pid = pid.lstrip("0x")
                ids.append(pid)
                self._id_to_symbol["0x" + pid] = pid[:8] + "…"

        if not ids:
            raise ValueError("Provide at least one symbol or price_id")

        self._ids = ids
        self._use_proxy = use_proxy
        self._ks_base   = ks_base.rstrip("/")
        self._ks_token  = ks_token

        self._handlers:  list[Callable[[Price], None]] = []
        self._queue:     asyncio.Queue[Price] = asyncio.Queue()
        self._task:      asyncio.Task | None  = None
        self._running    = False
        self._latest:    dict[str, Price] = {}   # symbol → latest price

    # ── Public API ─────────────────────────────────────────────────────────────

    def on_price(self, handler: Callable[[Price], None]) -> None:
        """Register a callback. Called from the event loop thread — keep it fast."""
        self._handlers.append(handler)

    async def stream(self) -> AsyncIterator[Price]:
        """Async generator. Yields prices as they arrive from Pyth."""
        await self.start()
        try:
            while self._running:
                try:
                    price = await asyncio.wait_for(self._queue.get(), timeout=5.0)
                    yield price
                except asyncio.TimeoutError:
                    continue
        finally:
            await self.stop()

    async def start(self) -> None:
        """Start the background SSE listener."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._sse_loop())

    async def stop(self) -> None:
        """Stop the background SSE listener."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def latest(self, symbol: str) -> Price | None:
        """Get the most recent price for a symbol (non-blocking)."""
        return self._latest.get(symbol)

    async def snapshot(self) -> dict[str, Price]:
        """
        HTTP fetch of latest prices — use only for initialization.
        For ongoing data, use stream() or on_price().
        """
        ids_qs = "&".join(f"ids[]={i}" for i in self._ids)
        url = f"{HERMES_BASE}/v2/updates/price/latest?{ids_qs}&encoding=json&parsed=true"

        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()

        result: dict[str, Price] = {}
        for item in data.get("parsed", []):
            p = _parse_price_update(item, self._id_to_symbol)
            if p:
                result[p.symbol] = p
                self._latest[p.symbol] = p
        return result

    # ── Context manager ────────────────────────────────────────────────────────

    async def __aenter__(self) -> "PythFeed":
        await self.start()
        return self

    async def __aexit__(self, *_) -> None:
        await self.stop()

    # ── Internal SSE loop ──────────────────────────────────────────────────────

    async def _sse_url(self) -> str:
        ids_qs = "&".join(f"ids[]={i}" for i in self._ids)
        if self._use_proxy and self._ks_token:
            return f"{self._ks_base}/proxy/pyth/v2/updates/price/stream?{ids_qs}&encoding=json&parsed=true"
        return f"{HERMES_BASE}/v2/updates/price/stream?{ids_qs}&encoding=json&parsed=true"

    async def _sse_loop(self) -> None:
        backoff = 1.0
        while self._running:
            try:
                url = await self._sse_url()
                hdrs = {"Accept": "text/event-stream"}
                if self._use_proxy and self._ks_token:
                    hdrs["Authorization"] = f"Bearer {self._ks_token}"

                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("GET", url, headers=hdrs) as resp:
                        resp.raise_for_status()
                        backoff = 1.0   # reset on successful connect
                        buf = ""
                        async for line in resp.aiter_lines():
                            if not self._running:
                                return
                            if line.startswith("data:"):
                                buf = line[5:].strip()
                            elif line == "" and buf:
                                try:
                                    payload = json.loads(buf)
                                    for item in payload.get("parsed", []):
                                        p = _parse_price_update(item, self._id_to_symbol)
                                        if p:
                                            self._latest[p.symbol] = p
                                            await self._queue.put(p)
                                            for h in self._handlers:
                                                h(p)
                                except (json.JSONDecodeError, KeyError):
                                    pass
                                buf = ""
            except asyncio.CancelledError:
                return
            except Exception:
                # Reconnect with exponential back-off
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)


# ── Simple moving average + threshold signal ──────────────────────────────────

class PriceSignal:
    """
    Tracks a rolling window and fires when price moves beyond a threshold.

    Used by TradingAgent to decide when to trigger a trade.

    window=20, threshold=0.005 → fire when price moves >0.5% from 20-bar SMA.
    """

    def __init__(self, window: int = 20, threshold: float = 0.005):
        self._prices: list[float] = []
        self._window    = window
        self._threshold = threshold

    def update(self, price: float) -> tuple[bool, float]:
        """
        Push a new price. Returns (signal_fired, deviation_pct).
        signal_fired is True when deviation exceeds threshold.
        """
        self._prices.append(price)
        if len(self._prices) > self._window:
            self._prices.pop(0)

        if len(self._prices) < self._window:
            return False, 0.0

        sma = sum(self._prices) / len(self._prices)
        dev = abs(price - sma) / sma
        return dev >= self._threshold, dev
