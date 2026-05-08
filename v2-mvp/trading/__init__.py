"""
KeyShield Trading Module — v2 migration.

Ported from src/python-legacy/trading/ with minor path adjustments.

Modules:
  agent.py   — TradingOrchestrator + MarketDataAgent, RiskAgent, AnalysisAgent, ExecutionAgent, MonitorAgent
  execution.py — ZeroXRouter, TitanExecutor, JupiterRouter, SwapQuote, BundleResult
  feeds.py   — PythFeed, PriceSignal, Price dataclass, PRICE_IDS
  models.py  — ModelRouter, TaskType, MODEL_REGISTRY
"""

from .agent import (
    TradingOrchestrator,
    MarketDataAgent,
    RiskAgent,
    AnalysisAgent,
    ExecutionAgent,
    MonitorAgent,
    Agent,
    TradingState,
    Position,
)
from .execution import (
    SwapQuote,
    BundleResult,
    ZeroXRouter,
    TitanExecutor,
    JupiterRouter,
    parallel_quote_and_analyze,
)
from .feeds import (
    Price,
    PythFeed,
    PriceSignal,
    PRICE_IDS,
)
from .models import (
    ModelRouter,
    TaskType,
    ModelResponse,
    MODEL_REGISTRY,
    ModelConfig,
)

__all__ = [
    # agent
    "TradingOrchestrator",
    "MarketDataAgent",
    "RiskAgent",
    "AnalysisAgent",
    "ExecutionAgent",
    "MonitorAgent",
    "Agent",
    "TradingState",
    "Position",
    # execution
    "SwapQuote",
    "BundleResult",
    "ZeroXRouter",
    "TitanExecutor",
    "JupiterRouter",
    "parallel_quote_and_analyze",
    # feeds
    "Price",
    "PythFeed",
    "PriceSignal",
    "PRICE_IDS",
    # models
    "ModelRouter",
    "TaskType",
    "ModelResponse",
    "MODEL_REGISTRY",
    "ModelConfig",
]
