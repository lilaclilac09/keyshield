"""
trading/models.py — Latency-aware AI model router (v2 migration)

All model calls route through KeyShield proxy.
One stored key per provider. Zero raw keys in this file.

Latency benchmarks (p50, real-world):
  groq/llama-3.1-70b:     ~100ms   ← use for time-sensitive decisions
  groq/mixtral-8x7b:      ~80ms    ← fastest, less accurate
  gpt-4o-mini:            ~400ms   ← balanced: cost, accuracy, speed
  gpt-4o:                 ~800ms   ← complex reasoning
  claude-haiku-3:         ~200ms   ← fast, good instruction following
  claude-sonnet-3-5:      ~600ms   ← strong analysis
  claude-opus-4-5:        ~2500ms  ← best reasoning, use sparingly
  mistral-small:          ~300ms   ← cheap alternative to GPT-4o-mini

When to use what:
  URGENT (latency < 200ms):  groq/llama-3.1-70b
  ANALYSIS  (latency < 1s):  gpt-4o-mini or claude-haiku
  DEEP RESEARCH (any):       claude-opus-4-5 or gpt-4o
  STRUCTURED OUTPUT:         gpt-4o-mini (best JSON mode)
  LONG CONTEXT (>100k tok):  claude-opus-4-5
  CHEAPEST:                  mistral-small or groq

API aggregator design:
  - Primary: try fastest model for task type
  - Fallback: if primary fails/times out → next model
  - Budget: track token spend across all models per session
  - Cache: identical prompts within 60s return cached response

All calls go through: KS_BASE/proxy/{provider}/...
KeyShield injects the real API key from your encrypted vault.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any

import httpx

KS_BASE = "http://localhost:8000"


# ── Model registry ─────────────────────────────────────────────────────────────

class TaskType(Enum):
    URGENT    = "urgent"      # <200ms — real-time trade decisions
    ANALYSIS  = "analysis"    # <1s — market analysis, signal confirmation
    RESEARCH  = "research"    # any — deep reasoning, strategy planning
    STRUCTURE = "structure"   # JSON output critical
    EMBEDDING = "embedding"   # vector embeddings for RAG


@dataclass
class ModelConfig:
    provider:    str       # keyshield upstream: openai | anthropic | groq | mistral
    model:       str       # model name for the API
    api_path:    str       # endpoint path (after /proxy/{provider}/)
    latency_p50: int       # ms, measured
    cost_per_1k_input:  float   # USD
    cost_per_1k_output: float
    context_window: int    # tokens
    supports_json:  bool   # reliable JSON mode
    tasks:          list[TaskType]


MODEL_REGISTRY: list[ModelConfig] = [
    # Groq — fastest (runs inference on custom LPU chips)
    ModelConfig(
        provider="groq", model="llama-3.1-70b-versatile",
        api_path="openai/v1/chat/completions",
        latency_p50=100, cost_per_1k_input=0.00059, cost_per_1k_output=0.00079,
        context_window=131072, supports_json=True,
        tasks=[TaskType.URGENT, TaskType.ANALYSIS],
    ),
    ModelConfig(
        provider="groq", model="mixtral-8x7b-32768",
        api_path="openai/v1/chat/completions",
        latency_p50=80, cost_per_1k_input=0.00024, cost_per_1k_output=0.00024,
        context_window=32768, supports_json=True,
        tasks=[TaskType.URGENT],
    ),
    # OpenAI
    ModelConfig(
        provider="openai", model="gpt-4o-mini",
        api_path="v1/chat/completions",
        latency_p50=400, cost_per_1k_input=0.00015, cost_per_1k_output=0.00060,
        context_window=128000, supports_json=True,
        tasks=[TaskType.ANALYSIS, TaskType.STRUCTURE],
    ),
    ModelConfig(
        provider="openai", model="gpt-4o",
        api_path="v1/chat/completions",
        latency_p50=800, cost_per_1k_input=0.005, cost_per_1k_output=0.015,
        context_window=128000, supports_json=True,
        tasks=[TaskType.RESEARCH, TaskType.STRUCTURE],
    ),
    # Anthropic
    ModelConfig(
        provider="anthropic", model="claude-haiku-20240307",
        api_path="v1/messages",
        latency_p50=200, cost_per_1k_input=0.00025, cost_per_1k_output=0.00125,
        context_window=200000, supports_json=False,
        tasks=[TaskType.URGENT, TaskType.ANALYSIS],
    ),
    ModelConfig(
        provider="anthropic", model="claude-3-5-sonnet-20241022",
        api_path="v1/messages",
        latency_p50=600, cost_per_1k_input=0.003, cost_per_1k_output=0.015,
        context_window=200000, supports_json=False,
        tasks=[TaskType.ANALYSIS, TaskType.RESEARCH],
    ),
    ModelConfig(
        provider="anthropic", model="claude-opus-4-5",
        api_path="v1/messages",
        latency_p50=2500, cost_per_1k_input=0.015, cost_per_1k_output=0.075,
        context_window=200000, supports_json=False,
        tasks=[TaskType.RESEARCH],
    ),
    # Mistral (cheap fallback)
    ModelConfig(
        provider="mistral", model="mistral-small-latest",
        api_path="v1/chat/completions",
        latency_p50=300, cost_per_1k_input=0.0002, cost_per_1k_output=0.0006,
        context_window=32000, supports_json=True,
        tasks=[TaskType.ANALYSIS, TaskType.STRUCTURE],
    ),
]

# Index by (task_type) → sorted by latency
_TASK_MODELS: dict[TaskType, list[ModelConfig]] = {}
for _m in MODEL_REGISTRY:
    for _t in _m.tasks:
        _TASK_MODELS.setdefault(_t, []).append(_m)
for _t in _TASK_MODELS:
    _TASK_MODELS[_t].sort(key=lambda m: m.latency_p50)


# ── Response cache ─────────────────────────────────────────────────────────────

_CACHE: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 60.0   # seconds


def _cache_key(model: str, messages: list[dict]) -> str:
    blob = json.dumps({"m": model, "msgs": messages}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def _cache_get(key: str) -> str | None:
    entry = _CACHE.get(key)
    if not entry:
        return None
    content, exp = entry
    if time.monotonic() > exp:
        del _CACHE[key]
        return None
    return content


def _cache_set(key: str, content: str) -> None:
    _CACHE[key] = (content, time.monotonic() + _CACHE_TTL)


# ── Model router ───────────────────────────────────────────────────────────────

@dataclass
class ModelResponse:
    content:    str
    model:      str
    provider:   str
    latency_ms: float
    from_cache: bool
    tokens_in:  int
    tokens_out: int
    cost_usd:   float


class ModelRouter:
    """
    Unified AI model client. Routes to the right model for your task,
    falls back on error, and caches repeated calls.

    All API keys pulled from KeyShield vault — never hardcoded.

    Usage:
      router = ModelRouter(ks_token="your_token")

      # Fastest response for urgent decisions
      r = await router.chat("Should I buy? SOL up 3% in 5min", task=TaskType.URGENT)

      # Best analysis
      r = await router.chat(long_prompt, task=TaskType.RESEARCH)

      # Force a specific model
      r = await router.chat(prompt, model="gpt-4o-mini")

      print(r.content, f"[{r.latency_ms:.0f}ms, ${r.cost_usd:.5f}]")
    """

    def __init__(
        self,
        ks_token: str,
        ks_base: str = KS_BASE,
        budget_usd: float | None = None,   # hard cap on total spend
        cache: bool = True,
    ):
        self._token     = ks_token
        self._base      = ks_base.rstrip("/")
        self._budget    = budget_usd
        self._cache     = cache
        self._spent_usd = 0.0
        self._client    = httpx.AsyncClient(timeout=60)

    async def chat(
        self,
        prompt: str,
        system: str = "",
        task: TaskType = TaskType.ANALYSIS,
        model: str | None = None,
        max_tokens: int = 512,
        temperature: float = 0.1,
        json_mode: bool = False,
    ) -> ModelResponse:
        """
        Send a chat message. Automatically picks the right model for the task.
        Falls back through the model list on error.

        Returns ModelResponse with content, latency, and cost.
        """
        if self._budget and self._spent_usd >= self._budget:
            raise RuntimeError(f"Budget exhausted: ${self._spent_usd:.4f} >= ${self._budget:.4f}")

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        # Cache check
        if self._cache:
            ck = _cache_key(model or task.value, messages)
            cached = _cache_get(ck)
            if cached:
                return ModelResponse(
                    content=cached, model="cached", provider="cache",
                    latency_ms=0, from_cache=True, tokens_in=0, tokens_out=0, cost_usd=0,
                )

        # Select model(s) to try
        if model:
            configs = [m for m in MODEL_REGISTRY if m.model == model]
            if not configs:
                raise ValueError(f"Unknown model: {model}")
        else:
            configs = _TASK_MODELS.get(task, MODEL_REGISTRY)

        last_err: Exception | None = None
        for cfg in configs:
            try:
                result = await self._call(cfg, messages, max_tokens, temperature, json_mode)
                self._spent_usd += result.cost_usd
                if self._cache:
                    _cache_set(ck, result.content)  # type: ignore[possibly-undefined]
                return result
            except asyncio.TimeoutError:
                last_err = asyncio.TimeoutError(f"{cfg.model} timed out")
                continue
            except Exception as e:
                last_err = e
                continue

        raise RuntimeError(f"All models failed for task={task.value}. Last error: {last_err}")

    async def parallel(
        self,
        prompts: list[str],
        task: TaskType = TaskType.ANALYSIS,
        system: str = "",
        max_tokens: int = 512,
    ) -> list[ModelResponse]:
        """
        Send multiple prompts concurrently.
        Used for batch analysis: analyze 5 tokens simultaneously.
        """
        tasks = [
            self.chat(p, system=system, task=task, max_tokens=max_tokens)
            for p in prompts
        ]
        return list(await asyncio.gather(*tasks, return_exceptions=False))

    async def race(
        self,
        prompt: str,
        models: list[str],
        system: str = "",
        max_tokens: int = 256,
    ) -> ModelResponse:
        """
        Send to multiple models simultaneously, return the first response.
        Cancels slower models once one responds.
        Use for ultra-low-latency where any model's answer is acceptable.
        """
        cfgs = [m for m in MODEL_REGISTRY if m.model in models]
        if not cfgs:
            raise ValueError(f"No valid models in: {models}")

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        loop = asyncio.get_event_loop()
        tasks_map = {
            loop.create_task(self._call(cfg, messages, max_tokens, 0.1, False)): cfg
            for cfg in cfgs
        }

        done, pending = await asyncio.wait(
            tasks_map.keys(),
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()

        result = done.pop().result()
        self._spent_usd += result.cost_usd
        return result

    @property
    def spent(self) -> float:
        return self._spent_usd

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "ModelRouter":
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _call(
        self,
        cfg: ModelConfig,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
        json_mode: bool,
    ) -> ModelResponse:
        url = f"{self._base}/proxy/{cfg.provider}/{cfg.api_path}"
        hdrs = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type":  "application/json",
        }

        t0 = time.monotonic()

        if cfg.provider == "anthropic":
            result = await self._call_anthropic(cfg, messages, max_tokens, temperature, url, hdrs)
        else:
            result = await self._call_openai_compat(cfg, messages, max_tokens, temperature, json_mode, url, hdrs)

        result.latency_ms = (time.monotonic() - t0) * 1000
        return result

    async def _call_openai_compat(
        self, cfg: ModelConfig, messages: list[dict],
        max_tokens: int, temperature: float, json_mode: bool,
        url: str, hdrs: dict,
    ) -> ModelResponse:
        body: dict[str, Any] = {
            "model":       cfg.model,
            "messages":    messages,
            "max_tokens":  max_tokens,
            "temperature": temperature,
        }
        if json_mode and cfg.supports_json:
            body["response_format"] = {"type": "json_object"}

        r = await self._client.post(url, json=body, headers=hdrs)
        if r.is_error:
            raise RuntimeError(f"{cfg.model} error {r.status_code}: {r.text[:200]}")

        d = r.json()
        usage = d.get("usage", {})
        tok_in  = usage.get("prompt_tokens", 0)
        tok_out = usage.get("completion_tokens", 0)
        content = d["choices"][0]["message"]["content"]

        return ModelResponse(
            content    = content,
            model      = cfg.model,
            provider   = cfg.provider,
            latency_ms = 0,  # filled by caller
            from_cache = False,
            tokens_in  = tok_in,
            tokens_out = tok_out,
            cost_usd   = tok_in / 1000 * cfg.cost_per_1k_input + tok_out / 1000 * cfg.cost_per_1k_output,
        )

    async def _call_anthropic(
        self, cfg: ModelConfig, messages: list[dict],
        max_tokens: int, temperature: float,
        url: str, hdrs: dict,
    ) -> ModelResponse:
        # Anthropic uses a different schema: system is top-level, not in messages[]
        sys_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
        user_msgs = [m for m in messages if m["role"] != "system"]

        body: dict[str, Any] = {
            "model":      cfg.model,
            "messages":   user_msgs,
            "max_tokens": max_tokens,
        }
        if sys_msg:
            body["system"] = sys_msg

        hdrs = {**hdrs, "anthropic-version": "2023-06-01"}

        r = await self._client.post(url, json=body, headers=hdrs)
        if r.is_error:
            raise RuntimeError(f"{cfg.model} error {r.status_code}: {r.text[:200]}")

        d = r.json()
        usage   = d.get("usage", {})
        tok_in  = usage.get("input_tokens", 0)
        tok_out = usage.get("output_tokens", 0)
        content = d["content"][0]["text"]

        return ModelResponse(
            content    = content,
            model      = cfg.model,
            provider   = cfg.provider,
            latency_ms = 0,
            from_cache = False,
            tokens_in  = tok_in,
            tokens_out = tok_out,
            cost_usd   = tok_in / 1000 * cfg.cost_per_1k_input + tok_out / 1000 * cfg.cost_per_1k_output,
        )
