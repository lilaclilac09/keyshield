"""Python fallthrough must know the same extra providers as ks-proxy."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from src.backend.proxy import api_router


def test_zerox_titan_pyth_are_registered() -> None:
    for name in ("0x", "titan", "pyth"):
        assert name in api_router.PROVIDERS


def test_spec04_providers_build_auth() -> None:
    url, headers = api_router._build_url_and_headers("0x", "/swap/v1/quote", "zx-key")
    assert url == "/swap/v1/quote"
    assert headers["0x-api-key"] == "zx-key"

    url, headers = api_router._build_url_and_headers("titan", "/", "")
    assert "authorization" not in headers
    url, headers = api_router._build_url_and_headers("titan", "/", "titan-key")
    assert headers["authorization"] == "Bearer titan-key"

    url, _headers = api_router._build_url_and_headers("pyth", "/v2/updates/price/latest", "")
    assert "api_key" not in url
    url, _headers = api_router._build_url_and_headers(
        "pyth", "/v2/updates/price/latest", "pyth-key"
    )
    assert url.endswith("?api_key=pyth-key")


def test_existing_inference_providers_stay() -> None:
    for name in ("openrouter", "ollama", "vllm", "openai", "helius-rpc", "vercel", "github"):
        assert name in api_router.PROVIDERS


def test_unknown_provider_still_raises() -> None:
    with pytest.raises(ValueError, match="unknown provider"):
        asyncio.run(api_router.call_rest("not-a-provider", "GET", "/", b"", "k"))


def test_tinker_is_openai_compatible_bearer_upstream(monkeypatch) -> None:
    assert "tinker" in api_router.PROVIDERS
    seen: list = []

    def upstream(req):
        seen.append(req)
        return httpx.Response(200, json={"choices": []})

    client = httpx.AsyncClient(
        base_url=api_router.PROVIDERS["tinker"]["base"], transport=httpx.MockTransport(upstream)
    )
    monkeypatch.setitem(api_router._CLIENTS, "tinker", client)
    content, status, _ = asyncio.run(
        api_router.call_rest("tinker", "POST", "/chat/completions", b"{}", "tml-key")
    )
    assert status == 200
    assert str(seen[0].url) == (
        "https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1/chat/completions"
    )
    assert seen[0].headers["authorization"] == "Bearer tml-key"
