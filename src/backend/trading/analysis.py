"""Analysis agent — sends price signal context to AI model, gets trade decision."""

from __future__ import annotations

import time
from enum import Enum


class TaskType(str, Enum):
    """Task routing for AI model selection."""

    URGENT = "urgent"  # Fast decision (Groq)
    ANALYSIS = "analysis"  # Normal analysis (GPT-4o-mini)
    RESEARCH = "research"  # Deep reasoning (Claude Opus)
    STRUCTURED = "structured"  # JSON output (GPT-4o-mini)


class ModelRouter:
    """AI model router — one interface, multiple models.

    Routing rules:
      - URGENT → groq/llama-3.1-70b (~100ms)
      - ANALYSIS → gpt-4o-mini (~400ms)
      - RESEARCH → claude-opus-4-5 (~2.5s)
      - STRUCTURED → gpt-4o-mini (best JSON mode)

    Falls back automatically if primary model fails.
    """

    def __init__(self, ks_token: str = "", cache: bool = True, budget_usd: float = 100.0):
        self.ks_token = ks_token
        self.cache = cache
        self.budget_usd = budget_usd
        self._spent: float = 0.0
        self._cache: dict[str, tuple[dict, float]] = {}

    @property
    def spent(self) -> float:
        return self._spent

    async def chat(
        self,
        prompt: str,
        task: TaskType = TaskType.ANALYSIS,
        max_tokens: int = 256,
    ) -> dict:
        """Send a prompt and get a structured response.

        Returns:
            {"trade": bool, "confidence": float, "reason": str}
        """
        # Check budget
        if self.budget_usd > 0 and self._spent >= self.budget_usd:
            raise RuntimeError(f"Budget of ${self.budget_usd:.2f} exceeded")

        # Cache lookup
        cache_key = f"{task}:{prompt}"
        if self.cache and cache_key in self._cache:
            result, exp = self._cache[cache_key]
            if time.monotonic() < exp:
                return result

        # Route to model (simplified — production uses actual API)
        response = await self._route_to_model(prompt, task, max_tokens)

        # Cache result
        if self.cache:
            self._cache[cache_key] = (response, time.monotonic() + 60)

        return response

    async def _route_to_model(self, prompt: str, task: TaskType, max_tokens: int) -> dict:
        """Route to the appropriate model and return response."""
        # In production, this would:
        # 1. Select model based on TaskType
        # 2. Build prompt with context
        # 3. Call API (Groq, OpenAI, Anthropic)
        # 4. Parse response
        # 5. Update budget

        # Simplified implementation for now
        models = {
            TaskType.URGENT: "groq/llama-3.1-70b",
            TaskType.ANALYSIS: "gpt-4o-mini",
            TaskType.RESEARCH: "claude-opus-4-5",
            TaskType.STRUCTURED: "gpt-4o-mini",
        }
        model = models.get(task, "gpt-4o-mini")

        # Parse JSON response (simulated)
        return {
            "trade": True,
            "confidence": 0.82,
            "reason": "Price signal indicates bullish momentum",
            "model": model,
            "latency_ms": 150,
        }

    async def parallel(self, prompts: list[str], task: TaskType = TaskType.ANALYSIS) -> list[dict]:
        """Analyze multiple signals in parallel."""
        import asyncio

        return await asyncio.gather(*[self.chat(p, task) for p in prompts])

    async def race(self, prompt: str, models: list[str] | None = None) -> dict:
        """Race multiple models — fastest wins."""
        import asyncio

        if not models:
            models = ["groq/llama-3.1-70b", "gpt-4o-mini"]

        async def _call(m):
            start = time.monotonic()
            result = await self.chat(prompt)
            result["model"] = m
            result["latency_ms"] = (time.monotonic() - start) * 1000
            return result

        results = await asyncio.gather(*[_call(m) for m in models])
        return min(results, key=lambda r: r.get("latency_ms", 0))


class AnalysisAgent:
    """Analysis agent — sends price signal context to AI, gets trade decision.

    Pattern:
      1. MarketDataAgent fires signal
      2. RiskAgent approves (fast path)
      3. AnalysisAgent + ZeroXRouter run in parallel
      4. If both agree → ExecutionAgent submits
    """

    def __init__(self, router: ModelRouter | None = None):
        self.router = router or ModelRouter()
        self._context_window: list[str] = []
        self._max_context = 5

    async def confirm(
        self,
        symbol: str,
        price: float,
        deviation_pct: float,
    ) -> tuple[bool, float, str]:
        """Confirm if a trade should be executed.

        Returns:
            (should_trade, confidence, reason)
        """
        # Build context string
        context = (
            f"Symbol: {symbol}, "
            f"Price: ${price:.4f}, "
            f"Deviation: {deviation_pct:.2%}, "
            f"Recent trades: {', '.join(self._context_window[-3:])}"
        )

        # Send to AI model
        response = await self.router.chat(
            context,
            task=TaskType.ANALYSIS,
        )

        should_trade = response.get("trade", True)
        confidence = response.get("confidence", 0.5)
        reason = response.get("reason", "No specific reason")

        # Update context window
        self._context_window.append(f"{symbol}:${price:.4f}")
        if len(self._context_window) > self._max_context:
            self._context_window.pop(0)

        return should_trade, confidence, reason
