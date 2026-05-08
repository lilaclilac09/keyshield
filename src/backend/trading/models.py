"""Trading models — shared types and Pydantic schemas."""
from __future__ import annotations

import time
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class TradeAction(str, Enum):
    """Trade decision from AnalysisAgent."""
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    WAIT = "wait"


class PositionSide(str, Enum):
    """Position direction."""
    LONG = "long"
    SHORT = "short"
    FLAT = "flat"


# ─── Risk policy ─────────────────────────────────────────────────────

class RiskPolicy(BaseModel):
    """Risk policy for a trading symbol."""

    max_position_size_usd: float = 500.0
    max_exposure_pct: float = 10.0  # 10% of portfolio
    min_confidence: float = 0.6
    max_daily_trades: int = 50
    max_slippage_pct: float = 2.0


# ─── Trading state ─────────────────────────────────────────────────

class _PriceData(BaseModel):
    price: float
    timestamp: float
    confidence: float
    source: str = "pyth"


class _Position(BaseModel):
    symbol: str
    side: PositionSide = PositionSide.FLAT
    size_usd: float = 0.0
    entry_price: float = 0.0
    exit_price: Optional[float] = None
    pnl_usd: float = 0.0


class TradingState(BaseModel):
    """Shared state for the trading pipeline."""

    prices: dict[str, _PriceData] = {}
    positions: dict[str, _Position] = {}
    daily_trade_count: int = 0
    last_trade_time: float = 0.0
    total_pnl_usd: float = 0.0
    risk_policy: RiskPolicy = Field(default_factory=RiskPolicy)

    def add_price(self, symbol: str, price: float, confidence: float = 1.0, source: str = "pyth") -> None:
        self.prices[symbol] = _PriceData(
            price=price,
            timestamp=time.time(),
            confidence=confidence,
            source=source,
        )

    def get_price(self, symbol: str) -> Optional[float]:
        p = self.prices.get(symbol)
        return p.price if p else None

    def get_deviation(self, symbol: str, window: int = 20, threshold: float = 0.005) -> tuple[bool, float]:
        """Check if current price deviates from recent average."""
        prices = self._get_recent_prices(symbol, window)
        if len(prices) < 5:
            return False, 0.0
        sma = sum(prices) / len(prices)
        current = prices[-1]
        deviation = abs(current - sma) / sma
        fired = deviation >= threshold
        return fired, deviation

    def _get_recent_prices(self, symbol: str, n: int) -> list[float]:
        p = self.prices.get(symbol)
        if not p:
            return []
        return [p.price]
