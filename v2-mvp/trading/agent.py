"""
trading/agent.py — Agent orchestrator for trading (v2 migration)

Full agent graph:

                     ┌─────────────────────────┐
                     │   TradingOrchestrator    │
                     │   (main event loop)      │
                     └────────────┬────────────┘
                                  │
          ┌───────────────────────┼─────────────────────────┐
          ▼                       ▼                          ▼
     ┌─────────────┐       ┌───────────────┐        ┌──────────────────┐
     │ MarketData  │       │  Analysis     │        │   Execution      │
     │ Agent       │       │  Agent        │        │   Agent          │
     │             │       │               │        │                  │
     │ Pyth SSE    │──────►│ ModelRouter   │──────► │ 0x quote         │
     │ price feed  │ price │ groq/claude   │ signal │ Titan bundle     │
     └─────────────┘ tick  └───────────────┘        └──────────────────┘
           │                                                  │
           ▼                                                  ▼
     ┌─────────────┐                                  ┌──────────────────┐
     │ Risk        │                                  │   Monitor        │
     │ Agent       │◄─────────────────────────────────│   Agent          │
     │             │         position update          │                  │
     │ stop-loss   │                                  │ Helius confirms  │
     │ size limits │                                  │ tx status        │
     └─────────────┘                                  └──────────────────┘

Agent lifecycle:
  1. MarketDataAgent subscribes to Pyth SSE — always running
  2. On each price tick, PriceSignal checks if threshold crossed
  3. If signal: RiskAgent checks position limits
  4. If risk OK: PARALLEL — AnalysisAgent + QuoteAgent
  5. If both agree: ExecutionAgent submits via Titan (ETH) or Helius (SOL)
  6. MonitorAgent watches for confirmation

OpenClaw integration:
  Each agent class below can be used standalone OR wrapped in an OpenClaw session.
  Use the OpenClaw SDK to chain agents across sessions.
  OpenClaw handles: memory persistence, tool calling, retries, result routing.

Hermes integration:
  Hermes is the price oracle. PythFeed (feeds.py) wraps the Hermes SSE API.
  TradingOrchestrator feeds Hermes prices into AnalysisAgent context.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .feeds import PythFeed, PriceSignal, Price
from .execution import ZeroXRouter, TitanExecutor, JupiterRouter, SwapQuote, parallel_quote_and_analyze
from .models import ModelRouter, TaskType, ModelResponse

log = logging.getLogger("ks.trading")


# ── Shared state ───────────────────────────────────────────────────────────────

@dataclass
class Position:
    symbol:       str
    side:         str           # "long" | "short" | "none"
    size_usd:     float
    entry_price:  float
    unrealized_pnl: float = 0.0
    open_since:   float = field(default_factory=time.monotonic)


@dataclass
class TradingState:
    """Shared mutable state passed to all agents."""
    positions:    dict[str, Position] = field(default_factory=dict)
    last_trades:  list[dict] = field(default_factory=list)
    price_history: dict[str, list[float]] = field(default_factory=dict)  # symbol → [price, ...]
    total_pnl:    float = 0.0
    trades_today: int = 0


# ── Base agent ─────────────────────────────────────────────────────────────────

class Agent:
    """
    Base class for all agents.

    Every agent has:
      - name: human-readable
      - state: shared TradingState
      - run(): main coroutine — override in subclasses
      - stop(): graceful shutdown
    """

    def __init__(self, name: str, state: TradingState):
        self.name  = name
        self.state = state
        self._task: asyncio.Task | None = None
        self._running = False

    async def run(self) -> None:
        raise NotImplementedError

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._safe_run(), name=self.name)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _safe_run(self) -> None:
        try:
            await self.run()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            log.exception(f"[{self.name}] unhandled error: {e}")


# ── Market Data Agent ──────────────────────────────────────────────────────────

class MarketDataAgent(Agent):
    """
    Subscribes to Pyth/Hermes SSE and distributes price ticks to subscribers.

    ALWAYS running. Reconnects on drop.
    Has the lowest latency in the stack — don't put heavy logic here.

    Pattern: MarketDataAgent → fires callbacks → AnalysisAgent decides

    Usage:
      mda = MarketDataAgent(
          state=state,
          symbols=["SOL/USD", "ETH/USD"],
          ks_token=token,
      )
      mda.subscribe(my_callback)   # called on every tick
      await mda.start()
    """

    def __init__(
        self,
        state: TradingState,
        symbols: list[str],
        ks_token: str,
        ks_base: str = "http://localhost:8000",
    ):
        super().__init__("MarketData", state)
        self._feed = PythFeed(symbols=symbols, ks_token=ks_token, ks_base=ks_base)
        self._callbacks: list[Callable[[Price], None]] = []
        self._signals: dict[str, PriceSignal] = {s: PriceSignal() for s in symbols}

    def subscribe(self, cb: Callable[[Price], None]) -> None:
        """Register a callback — called synchronously on each tick. Keep it fast."""
        self._callbacks.append(cb)

    async def snapshot(self) -> dict[str, Price]:
        """Get current prices without starting the stream."""
        return await self._feed.snapshot()

    async def run(self) -> None:
        def on_price(p: Price) -> None:
            # Update shared history
            hist = self.state.price_history.setdefault(p.symbol, [])
            hist.append(p.price)
            if len(hist) > 500:
                hist.pop(0)

            # Check signal
            sig, dev = self._signals[p.symbol].update(p.price)
            if sig:
                log.info(f"[MarketData] {p.symbol} signal: {dev:.2%} deviation | {p}")

            # Notify subscribers
            for cb in self._callbacks:
                cb(p)

        self._feed.on_price(on_price)
        async with self._feed:
            while self._running:
                await asyncio.sleep(1)


# ── Risk Agent ─────────────────────────────────────────────────────────────────

class RiskAgent(Agent):
    """
    Gate that approves or rejects trade proposals.

    Rules checked BEFORE any API call to 0x or Titan:
      - max_position_usd: single position size cap
      - max_total_usd: total portfolio exposure cap
      - max_trades_per_day: rate limit
      - min_price_confidence: Pyth confidence interval check
        (if Pyth says price ±5%, that's a bad moment to trade)
      - max_price_impact: reject if 0x says price impact > X%

    Running: synchronous checks, called inline (not a background task).
    """

    def __init__(
        self,
        state: TradingState,
        max_position_usd:  float = 1000.0,
        max_total_usd:     float = 5000.0,
        max_trades_per_day: int  = 50,
        max_price_impact:  float = 0.02,     # 2%
        min_conf_ratio:    float = 0.005,    # reject if conf/price > 0.5%
    ):
        super().__init__("Risk", state)
        self.max_position  = max_position_usd
        self.max_total     = max_total_usd
        self.max_trades    = max_trades_per_day
        self.max_impact    = max_price_impact
        self.min_conf      = min_conf_ratio

    def check(
        self,
        symbol: str,
        side: str,
        size_usd: float,
        price: Price | None = None,
        quote: SwapQuote | None = None,
    ) -> tuple[bool, str]:
        """
        Synchronous risk check. Returns (approved, reason).
        Call this before firing the analysis + quote tasks.
        """
        if size_usd > self.max_position:
            return False, f"Position size ${size_usd:.0f} exceeds max ${self.max_position:.0f}"

        total = sum(p.size_usd for p in self.state.positions.values())
        if total + size_usd > self.max_total:
            return False, f"Total exposure ${total+size_usd:.0f} exceeds max ${self.max_total:.0f}"

        if self.state.trades_today >= self.max_trades:
            return False, f"Trade rate limit: {self.state.trades_today} trades today"

        if price and price.conf / price.price > self.min_conf:
            return False, (
                f"Pyth confidence too wide: ±{price.conf/price.price:.2%} "
                f"(max {self.min_conf:.2%}) — market is illiquid"
            )

        if quote and quote.price_impact > self.max_impact:
            return False, f"0x price impact {quote.price_impact:.2%} exceeds max {self.max_impact:.2%}"

        return True, "approved"

    async def run(self) -> None:
        # Risk agent doesn't have a background loop — checks are inline
        while self._running:
            await asyncio.sleep(60)


# ── Analysis Agent ─────────────────────────────────────────────────────────────

class AnalysisAgent(Agent):
    """
    AI-powered signal confirmation and market analysis.

    When: called AFTER MarketDataAgent fires a price signal,
          PARALLEL with ZeroXRouter.quote() to minimize latency.

    Which model:
      - Urgent (time-sensitive): groq/llama-3.1-70b (~100ms)
      - Deep analysis: claude-opus-4-5 (~2.5s)
      - Routine: gpt-4o-mini (~400ms)

    The model never sees your raw API keys — it calls through KeyShield proxy.

    Pattern:
      signal fires → RiskAgent.check() → PARALLEL[AnalysisAgent.confirm(), ZeroXRouter.quote()]
                                        → both agree → ExecutionAgent.execute()

    Prompt design:
      - Keep context window small for urgent decisions (<500 tokens in)
      - Include: price history (last N bars), current price, signal strength
      - Exclude: personal data, wallet addresses, position sizes
      - Output: {"trade": bool, "confidence": 0-1, "reason": str}
    """

    SYSTEM_PROMPT = """You are a quantitative trading signal validator.
Given a price signal and recent price history, output a JSON object:
{"trade": true|false, "confidence": 0.0-1.0, "reason": "brief explanation"}

Rules:
- trade=true only if confidence >= 0.7
- Consider: momentum, mean reversion, signal strength
- Be conservative: when uncertain, output trade=false
- Response MUST be valid JSON only, no explanation outside the JSON
"""

    def __init__(self, state: TradingState, model_router: ModelRouter):
        super().__init__("Analysis", state)
        self._router = model_router

    async def confirm(
        self,
        symbol: str,
        current_price: float,
        deviation_pct: float,
        task: TaskType = TaskType.URGENT,
    ) -> tuple[bool, float, str]:
        """
        Ask the AI: should we trade this signal?
        Returns (should_trade, confidence, reason).

        Called concurrently with quote fetch — do NOT await sequentially.
        """
        history = self.state.price_history.get(symbol, [])[-20:]
        prompt = (
            f"Symbol: {symbol}\n"
            f"Signal: price deviated {deviation_pct:.2%} from 20-bar SMA\n"
            f"Current price: ${current_price:.4f}\n"
            f"Recent prices (last 20): {[round(p, 4) for p in history]}\n\n"
            "Should we trade this signal?"
        )
        try:
            resp = await self._router.chat(
                prompt,
                system=self.SYSTEM_PROMPT,
                task=task,
                json_mode=True,
                max_tokens=128,
                temperature=0.05,
            )
            import json
            d = json.loads(resp.content)
            return bool(d.get("trade")), float(d.get("confidence", 0)), str(d.get("reason", ""))
        except Exception as e:
            log.warning(f"[Analysis] AI call failed: {e}")
            return False, 0.0, f"error: {e}"

    async def research(self, topic: str) -> str:
        """
        Deep research call — use for strategy planning, not real-time decisions.
        Uses claude-opus-4-5 or gpt-4o by default.
        """
        resp = await self._router.chat(topic, task=TaskType.RESEARCH, max_tokens=2048)
        return resp.content

    async def run(self) -> None:
        while self._running:
            await asyncio.sleep(60)


# ── Execution Agent ────────────────────────────────────────────────────────────

class ExecutionAgent(Agent):
    """
    Handles actual trade submission.

    For EVM (ETH, Polygon, Base, Arbitrum):
      1. ZeroXRouter.quote() → get calldata + gas estimate
      2. Sign the TX locally (with web3.py or ethers.js)
      3. TitanExecutor.send_bundle() → MEV-protected submission

    For Solana:
      1. JupiterRouter.quote() → get best route
      2. JupiterRouter.swap_transaction() → get serialized TX
      3. Sign with Solana wallet
      4. Submit via Helius (sendTransaction)

    Latency optimization:
      - Quote runs PARALLEL with AI analysis (see orchestrator)
      - Titan skip: if gas spike detected, delay until next block
      - Bundle simulation: always simulate before submitting

    Note on signing:
      This module does NOT sign transactions — that requires your private key.
      Pass a signer function to the executor. Keep private keys in a hardware wallet
      or AWS KMS, never in environment variables.
    """

    def __init__(
        self,
        state: TradingState,
        router: ZeroXRouter | None = None,
        titan: TitanExecutor | None = None,
        jupiter: JupiterRouter | None = None,
        signer_fn: Callable | None = None,   # async (tx_data: dict) -> str (signed hex)
    ):
        super().__init__("Execution", state)
        self._router  = router
        self._titan   = titan
        self._jupiter = jupiter
        self._signer  = signer_fn

    async def execute_eth_swap(
        self,
        sell_token: str,
        buy_token: str,
        sell_amount: int,
        taker_address: str,
    ) -> dict:
        """
        Full EVM swap: quote → sign → submit via Titan.
        Returns: {quote, bundle_hash, submitted_at}
        """
        if not self._router:
            raise RuntimeError("No ZeroXRouter configured")
        if not self._titan:
            raise RuntimeError("No TitanExecutor configured")

        # Get quote
        quote = await self._router.quote(sell_token, buy_token, sell_amount=sell_amount, taker_address=taker_address)
        log.info(f"[Execution] Quote: sell {sell_amount} {sell_token} → {quote.buy_amount} {buy_token} | impact {quote.price_impact:.3%} | gas {quote.gas}")

        if not self._signer:
            log.warning("[Execution] No signer — returning quote only (dry run)")
            return {"quote": quote, "dry_run": True}

        # Sign the transaction
        tx_data = {
            "to":       quote.to,
            "data":     quote.data,
            "value":    quote.value,
            "gas":      hex(quote.gas),
            "gasPrice": quote.gas_price,
        }
        signed_tx = await self._signer(tx_data)

        # Submit via Titan (private mempool)
        bundle = await self._titan.send_bundle(
            [signed_tx],
            simulate_first=True,
        )
        log.info(f"[Execution] Bundle submitted: {bundle.bundle_hash}")

        # Update state
        self.state.trades_today += 1
        self.state.last_trades.append({
            "time":        time.time(),
            "sell":        sell_token,
            "buy":         buy_token,
            "sell_amount": sell_amount,
            "buy_amount":  quote.buy_amount,
            "bundle_hash": bundle.bundle_hash,
        })

        return {"quote": quote, "bundle": bundle}

    async def execute_sol_swap(
        self,
        input_mint: str,
        output_mint: str,
        amount_lamports: int,
        user_pubkey: str,
    ) -> dict:
        """
        Solana swap: Jupiter quote → get TX → sign → submit via Helius.
        Returns: {quote_response, swap_tx_base64}
        """
        if not self._jupiter:
            raise RuntimeError("No JupiterRouter configured")

        quote_resp = await self._jupiter.quote(input_mint, output_mint, amount_lamports)
        swap_tx    = await self._jupiter.swap_transaction(quote_resp, user_pubkey)

        log.info(f"[Execution] Jupiter swap tx ready: {swap_tx[:32]}…")
        # Caller signs and submits via Helius RPC
        return {"quote": quote_resp, "tx_base64": swap_tx}

    async def run(self) -> None:
        while self._running:
            await asyncio.sleep(60)


# ── Monitor Agent ──────────────────────────────────────────────────────────────

class MonitorAgent(Agent):
    """
    Watches transaction status via Helius RPC.
    Polls confirmations and updates positions on success/failure.

    Helius RPC latency: ~50ms (dedicated node) vs ~200ms (public)
    Polling interval: 2s (Solana slot time ~400ms, finality ~12s)
    """

    def __init__(self, state: TradingState, ks_token: str, ks_base: str = "http://localhost:8000"):
        super().__init__("Monitor", state)
        self._token = ks_token
        self._base  = ks_base
        self._pending: dict[str, dict] = {}   # tx_sig → {trade_info}

    def watch(self, signature: str, trade_info: dict) -> None:
        """Register a transaction for monitoring."""
        self._pending[signature] = {**trade_info, "submitted_at": time.monotonic()}

    async def run(self) -> None:
        import httpx
        client = httpx.AsyncClient(
            base_url=f"{self._base}/proxy/helius",
            timeout=10,
            headers={"Authorization": f"Bearer {self._token}"},
        )
        try:
            while self._running:
                if not self._pending:
                    await asyncio.sleep(2)
                    continue

                sigs = list(self._pending.keys())
                body = {
                    "jsonrpc": "2.0", "id": 1,
                    "method": "getSignatureStatuses",
                    "params": [sigs, {"searchTransactionHistory": True}],
                }
                try:
                    r = await client.post("", json=body)
                    data = r.json()
                    statuses = data.get("result", {}).get("value", [])
                    for sig, status in zip(sigs, statuses):
                        if status is None:
                            continue
                        conf = status.get("confirmationStatus")
                        if conf in ("confirmed", "finalized"):
                            info = self._pending.pop(sig, {})
                            log.info(f"[Monitor] TX confirmed: {sig[:16]}… ({conf}) | {info}")
                        elif status.get("err"):
                            info = self._pending.pop(sig, {})
                            log.error(f"[Monitor] TX failed: {sig[:16]}… | err={status['err']}")
                except Exception as e:
                    log.warning(f"[Monitor] RPC error: {e}")

                await asyncio.sleep(2)
        finally:
            await client.aclose()


# ── Trading Orchestrator ───────────────────────────────────────────────────────

class TradingOrchestrator:
    """
    Coordinates all agents into a single event loop.

    Wiring:
      Pyth price tick
        → RiskAgent.check() (synchronous, ~0ms)
        → if approved:
            PARALLEL:
              AnalysisAgent.confirm() (~100ms with Groq)
              ZeroXRouter.quote()     (~150ms)
            if both: ExecutionAgent.execute() (~50ms to Titan)
            → MonitorAgent.watch() (polls every 2s)

    Full round-trip: ~200ms (parallel) vs ~400ms (serial)

    OpenClaw note:
      To run this as an OpenClaw agent session:
      1. Wrap each agent method as a Tool
      2. Register with OpenClaw's ToolRegistry
      3. The orchestrator becomes the OpenClaw agent loop
      4. Memory (TradingState) persists across OpenClaw steps

    Usage:
      orch = TradingOrchestrator(
          ks_token="your_token",
          symbols=["SOL/USD", "ETH/USD"],
          chain="solana",
      )
      await orch.run()   # runs forever, Ctrl+C to stop
    """

    def __init__(
        self,
        ks_token: str,
        symbols: list[str],
        chain: str = "solana",           # "solana" | "ethereum"
        ks_base: str = "http://localhost:8000",
        dry_run: bool = True,            # True = no real execution
        max_position_usd: float = 500.0,
        ai_task: TaskType = TaskType.URGENT,
    ):
        self._token  = ks_token
        self._chain  = chain
        self._base   = ks_base
        self._dry    = dry_run
        self._task   = ai_task
        self.state   = TradingState()

        # Instantiate agents
        self._router  = ModelRouter(ks_token=ks_token, ks_base=ks_base, cache=True)
        self._mda     = MarketDataAgent(self.state, symbols, ks_token, ks_base)
        self._risk    = RiskAgent(self.state, max_position_usd=max_position_usd)
        self._analyst = AnalysisAgent(self.state, self._router)

        self._zerox:  ZeroXRouter | None = None
        self._titan:  TitanExecutor | None = None
        self._jupiter = JupiterRouter()

        if chain == "ethereum":
            self._zerox = ZeroXRouter(ks_token, ks_base)
            self._titan = TitanExecutor(ks_token, ks_base)

        self._exec = ExecutionAgent(
            self.state,
            router=self._zerox,
            titan=self._titan,
            jupiter=self._jupiter,
        )
        self._monitor = MonitorAgent(self.state, ks_token, ks_base)

        # Subscribe to price events
        self._mda.subscribe(self._on_price)
        self._pending_signals: asyncio.Queue[tuple[Price, float]] = asyncio.Queue()

    def _on_price(self, price: Price) -> None:
        """Called synchronously on each Pyth tick. Must be non-blocking."""
        history = self.state.price_history.get(price.symbol, [])
        if len(history) < 20:
            return   # need 20 bars before we can compute signal

        # Quick signal check
        sig = PriceSignal(window=20, threshold=0.005)
        for p in history[-20:]:
            fired, dev = sig.update(p)
        fired, dev = sig.update(price.price)

        if fired:
            log.info(f"[Orch] Signal on {price.symbol}: {dev:.2%}")
            # Put on queue for the async handler (can't await here)
            try:
                self._pending_signals.put_nowait((price, dev))
            except asyncio.QueueFull:
                pass   # drop if queue full (circuit breaker)

    async def _signal_handler(self) -> None:
        """Processes signals from the price callback queue."""
        while True:
            price, deviation = await self._pending_signals.get()

            # Step 1: quick risk check (synchronous)
            ok, reason = self._risk.check(
                symbol=price.symbol,
                side="long",
                size_usd=100.0,   # TODO: dynamic sizing
                price=price,
            )
            if not ok:
                log.info(f"[Orch] Risk rejected {price.symbol}: {reason}")
                continue

            # Step 2: PARALLEL — AI confirmation + swap quote
            log.info(f"[Orch] Parallel: AI analysis + swap quote for {price.symbol}")

            async def get_analysis():
                return await self._analyst.confirm(
                    price.symbol, price.price, deviation, self._task
                )

            if self._chain == "ethereum" and self._zerox:
                # EVM: get 0x quote in parallel with AI
                trade, quote, reason_str = await parallel_quote_and_analyze(
                    self._zerox, get_analysis,
                    sell_token="USDC", buy_token="ETH",
                    sell_amount=100_000_000,   # 100 USDC (6 decimals)
                )
                should_trade = trade
            else:
                # Solana: just run analysis (Jupiter quote is cheap)
                should_trade, confidence, reason_str = await get_analysis()
                quote = None

            if not should_trade:
                log.info(f"[Orch] AI rejected trade: {reason_str}")
                continue

            # Step 3: second risk check with quote data
            if quote:
                ok, reason = self._risk.check(price.symbol, "long", 100.0, price, quote)
                if not ok:
                    log.info(f"[Orch] Risk rejected post-quote: {reason}")
                    continue

            # Step 4: execute
            if self._dry:
                log.info(f"[Orch] DRY RUN — would execute {price.symbol} trade")
                log.info(f"  Quote: {quote}")
                log.info(f"  AI: {reason_str}")
            else:
                log.info(f"[Orch] Executing trade on {price.symbol}")
                try:
                    if self._chain == "ethereum" and self._zerox:
                        result = await self._exec.execute_eth_swap(
                            "USDC", "ETH", 100_000_000,
                            taker_address="0xYOUR_WALLET_ADDRESS",
                        )
                    else:
                        result = await self._exec.execute_sol_swap(
                            "USDC", "SOL", 100_000_000,
                            user_pubkey="YOUR_SOLANA_PUBKEY",
                        )
                    log.info(f"[Orch] Trade result: {result}")
                except Exception as e:
                    log.error(f"[Orch] Execution failed: {e}")

    async def run(self) -> None:
        """Start all agents and run the event loop."""
        agents = [self._mda, self._risk, self._analyst, self._exec, self._monitor]

        log.info(f"[Orch] Starting {'DRY RUN' if self._dry else 'LIVE'} trading")
        log.info(f"[Orch] Chain: {self._chain} | AI task: {self._task.value}")

        # Start all background agents
        for a in agents:
            await a.start()

        # Start signal handler
        signal_task = asyncio.create_task(self._signal_handler())

        try:
            while True:
                await asyncio.sleep(30)
                # Heartbeat
                positions = len(self.state.positions)
                trades    = self.state.trades_today
                spent     = self._router.spent
                log.info(
                    f"[Orch] Heartbeat | positions={positions} "
                    f"trades_today={trades} | ai_spend=${spent:.4f}"
                )
        except (KeyboardInterrupt, asyncio.CancelledError):
            log.info("[Orch] Shutting down…")
        finally:
            signal_task.cancel()
            for a in reversed(agents):
                await a.stop()
            await self._router.close()
            if self._zerox:
                await self._zerox.close()
            if self._titan:
                await self._titan.close()
            await self._jupiter.close()


# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    """
    Demo: start the orchestrator watching SOL/USD and ETH/USD.
    Set DRY_RUN=false in env to enable real execution.
    """
    import os
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

    token = os.environ.get("KS_TOKEN")
    if not token:
        print("Set KS_TOKEN environment variable to your KeyShield session token")
        print("Get it from: Dashboard → Developer → Session token")
        return

    orch = TradingOrchestrator(
        ks_token=token,
        symbols=["SOL/USD", "ETH/USD"],
        chain=os.environ.get("CHAIN", "solana"),
        dry_run=os.environ.get("DRY_RUN", "true").lower() != "false",
        max_position_usd=float(os.environ.get("MAX_POSITION_USD", "500")),
        ai_task=TaskType.URGENT,
    )
    await orch.run()


if __name__ == "__main__":
    asyncio.run(main())
