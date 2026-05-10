"""Trading orchestrator — ties all trading agents together."""

from __future__ import annotations

import asyncio
import logging

from .market_data import MarketDataAgent, PriceFeed, PriceFeedConfig
from .risk import RiskAgent
from .analysis import AnalysisAgent, ModelRouter
from .execution import ExecutionAgent
from .models import TradingState

logger = logging.getLogger(__name__)


class TradingOrchestrator:
    """Main trading orchestrator.

    Flow:
      1. MarketDataAgent receives price update
      2. Signal fires (deviation > threshold)
      3. RiskAgent checks (fast path)
      4. AnalysisAgent + ZeroXRouter run in parallel
      5. If both agree → ExecutionAgent submits

    Latency:
      - Parallel path (Groq): ~200ms
      - Serial path (GPT-4o): ~700ms
    """

    def __init__(
        self,
        symbols: list[str],
        ks_token: str = "",
        dry_run: bool = True,
        max_position_usd: float = 500.0,
    ):
        self.state = TradingState()
        self.ks_token = ks_token
        self.dry_run = dry_run
        self.max_position_usd = max_position_usd

        # Create feeds and agents
        self.feeds = [PriceFeed(PriceFeedConfig(s)) for s in symbols]
        self.risk_agent = RiskAgent(max_position_usd=max_position_usd)
        self.model_router = ModelRouter(ks_token=ks_token)
        self.analysis_agent = AnalysisAgent(router=self.model_router)
        self.execution_agent = ExecutionAgent()

        # Connect signal handler
        self._signal_handler = lambda price: self._on_signal(price)

    async def start(self) -> None:
        """Start the trading pipeline."""
        logger.info(
            "Starting TradingOrchestrator (%s, dry_run=%s)",
            [f.config.symbol for f in self.feeds],
            self.dry_run,
        )
        mda = MarketDataAgent(self.feeds, ks_token=self.ks_token)
        mda.subscribe(self._signal_handler)
        await mda.start()

    async def stop(self) -> None:
        """Stop the trading pipeline."""
        logger.info("Stopping TradingOrchestrator")

    async def _on_signal(self, price) -> None:
        """Handle a price signal — main hot path."""
        symbol = price.symbol if hasattr(price, "symbol") else price
        logger.debug("Signal on %s", symbol)

        # Step 1: Risk check (fast path)
        risk_result = self.risk_agent.check(
            symbol=symbol,
            side="long",
            size_usd=self.max_position_usd,
        )
        if not risk_result.ok:
            logger.debug("Risk rejected: %s", risk_result.reason)
            return

        # Step 2: Parallel — analysis + quote
        analysis_task = asyncio.create_task(
            self.analysis_agent.confirm(symbol, price.price, price.confidence),
        )
        quote_task = asyncio.create_task(
            self.execution_agent.zerox.quote(
                sell_token="USDC",
                buy_token=symbol,
                sell_amount=int(self.max_position_usd * 1000),
            ),
        )

        (should_trade, confidence, reason), quote = await asyncio.gather(
            analysis_task,
            quote_task,
        )

        if not should_trade:
            logger.debug("Analysis rejected: %s", reason)
            return

        # Step 3: Execute
        if self.dry_run:
            logger.info(
                "Dry run — would trade %s at $%.4f (impact %.2f%%)",
                symbol,
                quote.price,
                quote.price_impact_pct * 100,
            )
        else:
            bundle = await self.execution_agent.execute_eth_swap(
                "USDC",
                symbol,
                int(self.max_position_usd * 1000),
            )
            logger.info("Executed swap — bundle %s", bundle.bundle_hash)
