"""OpenRouter chat interface used by the dashboard demo and vproxy.

The free Nemotron route is OpenAI-compatible. The key never appears in
this module — callers pass it per request (vault row or KS_OPENROUTER_API_KEY).
"""

from __future__ import annotations

import json
import os

DEMO_UPSTREAM = "openrouter"
DEMO_MODEL = os.getenv(
    "KS_OPENROUTER_MODEL",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
)
DEMO_CHAT_PATH = os.getenv(
    "KS_OPENROUTER_CHAT_PATH",
    "/api/v1/chat/completions",
)
DEMO_MODEL_URL = f"https://openrouter.ai/{DEMO_MODEL}"


def looks_like_openrouter_key(raw: str) -> bool:
    text = (raw or "").strip()
    return text.startswith("sk-or-") and len(text) >= 16


def mask_openrouter_key(raw: str) -> str:
    text = (raw or "").strip()
    if len(text) < 12:
        return "sk-or-••••"
    return f"{text[:7]}…{text[-4:]}"


def chat_body(
    prompt: str = "ping",
    *,
    model: str | None = None,
    max_tokens: int = 8,
) -> dict:
    return {
        "model": model or DEMO_MODEL,
        "max_tokens": int(max_tokens),
        "messages": [{"role": "user", "content": prompt}],
    }


def chat_body_bytes(prompt: str = "ping", **kwargs) -> bytes:
    return json.dumps(chat_body(prompt, **kwargs)).encode("utf-8")


def synthetic_fulfillment_body(
    prompt: str = "ping",
    reply: str = "ok",
    *,
    prompt_tokens: int = 4,
    completion_tokens: int = 4,
) -> dict:
    """OpenAI-shaped body that `verify_fulfillment` accepts when no key is set."""
    return {
        "id": "chatcmpl-ks-demo",
        "object": "chat.completion",
        "model": DEMO_MODEL,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": reply},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": int(prompt_tokens),
            "completion_tokens": int(completion_tokens),
            "total_tokens": int(prompt_tokens) + int(completion_tokens),
        },
        "ks_demo": True,
        "echo": prompt,
    }
