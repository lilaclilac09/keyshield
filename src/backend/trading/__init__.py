"""
trading/ — Trading domain.

Components (per spec 10):
- MarketDataAgent — subscribes to Pyth/Hermes SSE, fires PriceSignal callbacks
- RiskAgent — synchronous gate (position size, exposure, rate limit)
- AnalysisAgent — sends price signal context to AI model, gets trade/no-trade
- ExecutionAgent — signs and submits transactions after all checks pass
- MonitorAgent — polls Helius RPC for transaction confirmations
- ZeroXRouter — 0x protocol DEX aggregation (EVM chains)
- TitanExecutor — private block builder (Ethereum)

Architecture:
- MarketDataAgent pushes prices to PriceSignal
- Signal fires → RiskAgent checks → AnalysisAgent + ZeroXRouter run in parallel
- If both agree → ExecutionAgent submits
"""

from __future__ import annotations

# Re-export trading domain
from .orchestrator import TradingOrchestrator
from .market_data import MarketDataAgent, PriceSignal, PriceFeed
from .risk import (
    RiskAgent,
    RiskCheckResult,
    PositionSizeExceeded,
    ExposureLimitExceeded,
    RateLimitExceeded,
    ConfidenceTooLow,
)
from .analysis import AnalysisAgent, ModelRouter, TaskType
from .execution import ExecutionAgent, ZeroXRouter, TitanExecutor
from .models import (
    TradingState,
    TradeAction,
    PositionSide,
    RiskPolicy,
)
from .market_data import PriceFeedConfig

__all__ = [
    "TradingOrchestrator",
    # Market data
    "MarketDataAgent",
    "PriceSignal",
    "PriceFeed",
    "PriceFeedConfig",
    # Risk
    "RiskAgent",
    "RiskCheckResult",
    "PositionSizeExceeded",
    "ExposureLimitExceeded",
    "RateLimitExceeded",
    "ConfidenceTooLow",
    # Analysis
    "AnalysisAgent",
    "ModelRouter",
    "TaskType",
    # Execution
    "ExecutionAgent",
    "ZeroXRouter",
    "TitanExecutor",
    # Models
    "TradingState",
    "TradeAction",
    "PositionSide",
    "RiskPolicy",
]
