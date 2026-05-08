"""Market data — PriceFeed, PriceSignal, MarketDataAgent."""
from __future__ import annotations

import time
from typing import Callable, Optional


class PriceFeedConfig:
    """Configuration for a price feed."""

    def __init__(self, symbol: str, base: str = "USD", decimals: int = 8):
        self.symbol = symbol
        self.base = base
        self.decimals = decimals


class _PriceData:
    """Internal price data."""

    def __init__(self, symbol: str, price: float, confidence: float, age_ms: int):
        self.symbol = symbol
        self.price = price
        self.confidence = confidence
        self.age_ms = age_ms


class PriceFeed:
    """Single price feed (Pyth/price oracle)."""

    def __init__(self, config: PriceFeedConfig):
        self.config = config
        self._price: Optional[_PriceData] = None

    @property
    def price(self) -> Optional[float]:
        return self._price.price if self._price else None

    def update(self, price: float, confidence: float = 1.0, age_ms: int = 0) -> None:
        self._price = _PriceData(
            symbol=self.config.symbol,
            price=price,
            confidence=confidence,
            age_ms=age_ms,
        )

    def snapshot(self) -> Optional[_PriceData]:
        return self._price


class PriceSignal:
    """Signal detector — fires when price deviates from recent average."""

    def __init__(self, window: int = 20, threshold: float = 0.005):
        self.window = window
        self.threshold = threshold
        self._prices: list[float] = []

    def update(self, price: float) -> tuple[bool, float]:
        """Update with a new price. Returns (fired, deviation)."""
        self._prices.append(price)
        if len(self._prices) > self.window:
            self._prices.pop(0)
        if len(self._prices) < 5:
            return False, 0.0
        sma = sum(self._prices) / len(self._prices)
        deviation = abs(price - sma) / sma
        fired = deviation >= self.threshold
        return fired, deviation

    def reset(self) -> None:
        self._prices.clear()


class MarketDataAgent:
    """Market data agent — subscribes to Pyth/Hermes SSE, fires callbacks."""

    def __init__(self, feeds: list[PriceFeed], ks_token: str = "", use_proxy: bool = False):
        self.feeds = feeds
        self._callbacks: list[Callable] = []
        self._running = False
        self.ks_token = ks_token
        self.use_proxy = use_proxy

    def subscribe(self, callback: Callable) -> None:
        """Subscribe to price updates."""
        self._callbacks.append(callback)

    async def start(self) -> None:
        """Start the agent (subscribe to feeds)."""
        self._running = True
        # In production, this connects to Pyth SSE stream
        # For now, just initialize feeds
        for feed in self.feeds:
            if not feed.config.symbol.startswith("http"):
                feed.update(0.0)

    async def stop(self) -> None:
        """Stop the agent."""
        self._running = False

    async def _process_price_update(self, price_data: _PriceData) -> None:
        """Process a single price update and fire callbacks."""
        for callback in self._callbacks:
            callback(price_data)
