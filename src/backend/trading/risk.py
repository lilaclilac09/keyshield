"""Risk agent — synchronous gate for trade proposals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class RiskCheckResult:
    """Result of a risk check."""

    ok: bool
    reason: str = ""
    details: dict = None  # type: ignore[assignment]

    def __post_init__(self):
        if self.details is None:
            self.details = {}


# ─── Custom exceptions ──────────────────────────────────────────────


class PositionSizeExceeded(Exception):
    """Position size exceeds configured limit."""


class ExposureLimitExceeded(Exception):
    """Portfolio exposure exceeds configured limit."""


class RateLimitExceeded(Exception):
    """Trade rate limit exceeded (per day)."""


class ConfidenceTooLow(Exception):
    """AI confidence below configured threshold."""


class RiskAgent:
    """Risk agent — synchronous gate that approves or rejects trade proposals.

    Key checks:
      - Position size cap (per-symbol)
      - Total portfolio exposure cap
      - Trade rate limit (per day)
      - Confidence interval (reject if market is illiquid)
      - Price impact (reject if slippage too high)

    Latency: <0.1ms (pure Python, no network).
    """

    def __init__(
        self,
        max_position_usd: float = 500.0,
        max_exposure_pct: float = 10.0,
        max_daily_trades: int = 50,
        min_confidence: float = 0.6,
        max_slippage_pct: float = 2.0,
    ):
        self.max_position_usd = max_position_usd
        self.max_exposure_pct = max_exposure_pct
        self.max_daily_trades = max_daily_trades
        self.min_confidence = min_confidence
        self.max_slippage_pct = max_slippage_pct
        self._daily_trade_count = 0
        self._portfolio_value_usd: float = 0.0

    def set_portfolio_value(self, value_usd: float) -> None:
        """Set the current portfolio value."""
        self._portfolio_value_usd = value_usd

    def record_trade(self) -> None:
        """Record a trade for rate limiting."""
        self._daily_trade_count += 1

    def reset_daily_trades(self) -> None:
        """Reset daily trade counter."""
        self._daily_trade_count = 0

    def check(
        self,
        symbol: str,
        side: str,
        size_usd: float,
        current_price: Optional[float] = None,
        confidence: float = 1.0,
        price_impact_pct: float = 0.0,
    ) -> RiskCheckResult:
        """Check if a trade proposal passes risk gate.

        Args:
            symbol: Trading pair (e.g., "SOL/USD")
            side: "long", "short", or "flat"
            size_usd: Position size in USD
            current_price: Current price of the asset
            confidence: Price confidence from oracle
            price_impact_pct: Expected price impact

        Returns:
            RiskCheckResult with ok=True if all checks pass.
        """
        # 1. Position size check
        if size_usd > self.max_position_usd:
            return RiskCheckResult(
                ok=False,
                reason=f"Position size ${size_usd:.0f} exceeds limit ${self.max_position_usd:.0f}",
                details={"size_usd": size_usd, "limit": self.max_position_usd},
            )

        # 2. Rate limit check
        if self._daily_trade_count >= self.max_daily_trades:
            return RiskCheckResult(
                ok=False,
                reason=f"Daily trade limit ({self.max_daily_trades}) reached",
                details={
                    "count": self._daily_trade_count,
                    "limit": self.max_daily_trades,
                },
            )

        # 3. Exposure check
        if self._portfolio_value_usd > 0:
            exposure_pct = (size_usd / self._portfolio_value_usd) * 100
            if exposure_pct > self.max_exposure_pct:
                return RiskCheckResult(
                    ok=False,
                    reason=f"Exposure {exposure_pct:.1f}% exceeds limit {self.max_exposure_pct}%",
                    details={"exposure_pct": exposure_pct},
                )

        # 4. Price impact check
        if price_impact_pct > self.max_slippage_pct:
            return RiskCheckResult(
                ok=False,
                reason=f"Price impact {price_impact_pct:.1f}% exceeds limit {self.max_slippage_pct}%",
                details={"impact_pct": price_impact_pct},
            )

        # 5. Confidence check
        if confidence < self.min_confidence:
            return RiskCheckResult(
                ok=False,
                reason=f"Confidence {confidence:.3f} below threshold {self.min_confidence}",
                details={"confidence": confidence},
            )

        # All checks passed
        return RiskCheckResult(ok=True)

    def approve(self, symbol: str, side: str, size_usd: float, **kwargs) -> bool:
        """Convenience method — returns True if trade is approved."""
        result = self.check(symbol, side, size_usd, **kwargs)
        return result.ok
