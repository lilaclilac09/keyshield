"""KeyShield-wired OpenAI client for O-Mem / lightweight extraction."""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Any

from .config import OMemConfig, REPO_ROOT


def get_sync_openai_client(config: OMemConfig | None = None) -> Any | None:
    """Return OpenAI client routed through KeyShield proxy."""
    token = os.environ.get("KS_TOKEN")
    if not token:
        return None
    cfg = config or OMemConfig()
    sys.path.insert(0, str(REPO_ROOT / "packages" / "sdk-py"))
    from keyshield import KeyShield  # type: ignore

    ks = KeyShield(token=token, base_url=cfg.ks_base)
    return ks.openai_client()


def chat_completion(
    system: str,
    user: str,
    *,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 600,
) -> str | None:
    client = get_sync_openai_client()
    if client is None:
        return None
    cfg = OMemConfig()
    resp = client.chat.completions.create(
        model=model or cfg.llm_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (resp.choices[0].message.content or "").strip()


def get_async_openai_client(config: OMemConfig | None = None) -> Any | None:
    """Async-compatible client for O-Mem MemoryManager (wraps sync KeyShield client)."""
    sync = get_sync_openai_client(config)
    if sync is None:
        return None

    class _AsyncCompletions:
        @staticmethod
        async def create(**kwargs: Any) -> Any:
            return await asyncio.to_thread(sync.chat.completions.create, **kwargs)

    class _AsyncChat:
        completions = _AsyncCompletions()

    class _AsyncClient:
        chat = _AsyncChat()

    return _AsyncClient()
