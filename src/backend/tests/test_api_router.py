"""Core API router: provider catalog, vault key injection, Helius RPC."""

from __future__ import annotations

import json

import httpx
from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.proxy import api_router


def _install_mock(handler) -> None:
    api_router._CACHE.clear()
    transport = httpx.MockTransport(handler)
    for name, cfg in api_router.PROVIDERS.items():
        api_router._CLIENTS[name] = httpx.AsyncClient(
            transport=transport,
            base_url=cfg["base"],
        )


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
    url, _headers = api_router._build_url_and_headers("pyth", "/v2/updates/price/latest", "pyth-key")
    assert url.endswith("?api_key=pyth-key")


def test_vault_save_then_helius_rpc_injects_key() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content.decode())
        if "api-key=" in str(request.url):
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": 1, "result": {"value": 1_500_000_000}},
            )
        return httpx.Response(200, json={"error": {"code": -32600, "message": "no key"}})

    _install_mock(handler)
    client = TestClient(app)
    headers = {"X-Dev-Mode": "1"}

    stored = client.post(
        "/manage/store",
        headers=headers,
        json={"upstream": "helius", "name": "helius key", "value": "demo-helius-key"},
    )
    assert stored.status_code == 200, stored.text

    rpc = client.post(
        "/vproxy/helius/",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": ["DemoWallet"]},
    )
    assert rpc.status_code == 200, rpc.text
    assert rpc.json()["result"]["value"] == 1_500_000_000
    assert rpc.headers["x-ks-cache"] == "MISS"
    assert rpc.headers["x-ks-key-type"] == "vault"
    assert "api-key=demo-helius-key" in seen["url"]
    assert seen["body"]["method"] == "getBalance"


def test_jsonrpc_error_keeps_upstream_status() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "nope"}},
        )

    _install_mock(handler)
    client = TestClient(app)
    rpc = client.post(
        "/proxy/helius/",
        headers={"X-Upstream-API-Key": "demo-helius-key"},
        json={"jsonrpc": "2.0", "id": 1, "method": "sendTransaction", "params": ["raw"]},
    )
    assert rpc.status_code == 200
    assert rpc.json()["error"]["code"] == -32601


def test_zerox_vault_proxy_sends_header() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["header"] = request.headers.get("0x-api-key")
        seen["path"] = request.url.path
        return httpx.Response(200, json={"price": "3200.50", "buyAmount": "1000000"})

    _install_mock(handler)
    client = TestClient(app)
    headers = {"X-Dev-Mode": "1"}
    stored = client.post(
        "/manage/store",
        headers=headers,
        json={"upstream": "0x", "name": "0x key", "value": "zx-demo"},
    )
    assert stored.status_code == 200, stored.text
    quote = client.get("/vproxy/0x/swap/v1/quote", headers=headers)
    assert quote.status_code == 200, quote.text
    assert quote.json()["price"] == "3200.50"
    assert seen["header"] == "zx-demo"
    assert seen["path"].endswith("/swap/v1/quote")
