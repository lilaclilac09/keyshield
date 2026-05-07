"""
End-to-end tests for the /proxy/{upstream}/{path} route — the core
revenue path of v2-mvp. Validates:

  - self-custodian path: user stored their own key; we inject it
    on the right header and pass through the upstream response.
  - platform-key path with $0 balance: returns x402 402 with the
    Coinbase-shaped payment-required body.
  - platform-key path with positive balance: PLATFORM_KEYS[upstream]
    is injected; upstream call goes through.
  - response headers `x-ks-cache` and `x-ks-key-type` always set.
  - status code + body bytes are forwarded verbatim from upstream.
  - unknown upstream → 404.
  - body > MAX_BODY → 413.
  - auth-scheme variants: 0x uses 0x-api-key header, OpenAI uses
    Authorization Bearer, Helius JSON-RPC uses the api_router.

Run:
  cd v2-mvp && pytest tests/test_proxy.py -v
"""

import json
import pytest


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    """Fresh per-test sqlite + vault dir."""
    from pathlib import Path
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    server._CACHE.clear()
    return TestClient(server.app)


@pytest.fixture
def login(client):
    """Log in once + return (token, user_id) for use in proxy calls."""
    user_id = "alice"
    pw = "secret"
    r = client.post("/auth/login", json={"userId": user_id, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["token"], user_id


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── 1. self-custodian key path ───────────────────────────────────────────


def test_proxy_unknown_upstream_404(client, login):
    token, _ = login
    r = client.post("/proxy/notarealthing/anything", headers=_auth(token), json={})
    assert r.status_code == 404


def test_proxy_payload_too_large_413(client, login, monkeypatch):
    """Body > MAX_BODY rejected before any upstream call."""
    from src import server

    monkeypatch.setattr(server, "MAX_BODY", 100)
    token, _ = login
    big = {"data": "x" * 200}
    r = client.post("/proxy/openai/v1/chat", headers=_auth(token), json=big)
    assert r.status_code == 413


def test_proxy_no_session_returns_401(client):
    r = client.post("/proxy/openai/v1/chat", json={})
    assert r.status_code == 401


# ─── 2. self-custodian: stored key gets injected ──────────────────────────


def test_proxy_self_custodian_openai_uses_stored_key(client, login, monkeypatch):
    """User stored their OPENAI key. Proxy MUST use that key (not the
    platform key) and report key-type='self_custodian'."""
    from src import server, api_router

    token, _ = login
    # Store a self-custodian key.
    r = client.post(
        "/manage/store",
        headers=_auth(token),
        json={"upstream": "openai", "apiKey": "sk-USERS-OWN"},
    )
    assert r.status_code == 200, r.text

    # Capture what api_router.call_rest receives.
    captured = {}

    async def fake_call_rest(provider, method, full_path, body, api_key, extra):
        captured["provider"] = provider
        captured["method"] = method
        captured["full_path"] = full_path
        captured["api_key"] = api_key
        return b'{"id":"chat","choices":[]}', 200, "MISS"

    monkeypatch.setattr(api_router, "call_rest", fake_call_rest)

    r = client.post(
        "/proxy/openai/v1/chat/completions",
        headers={**_auth(token), "Content-Type": "application/json"},
        json={"model": "gpt-4", "messages": []},
    )
    assert r.status_code == 200
    assert r.json()["id"] == "chat"
    # The stored user key, NOT a platform key, was forwarded.
    assert captured["api_key"] == "sk-USERS-OWN"
    assert captured["provider"] == "openai"
    assert captured["method"] == "POST"
    assert "v1/chat/completions" in captured["full_path"]
    # Response advertises which key type was used + cache status.
    assert r.headers["x-ks-key-type"] == "self_custodian"
    assert r.headers["x-ks-cache"] == "MISS"


def test_proxy_response_status_and_body_forwarded_verbatim(client, login, monkeypatch):
    """Upstream 4xx must reach the agent unchanged."""
    from src import api_router

    token, _ = login
    client.post(
        "/manage/store",
        headers=_auth(token),
        json={"upstream": "openai", "apiKey": "sk-x"},
    )

    async def fake_call_rest(*args, **kwargs):
        return b'{"error":{"message":"rate limited"}}', 429, "MISS"

    monkeypatch.setattr(api_router, "call_rest", fake_call_rest)

    r = client.post(
        "/proxy/openai/v1/chat/completions",
        headers=_auth(token),
        json={},
    )
    assert r.status_code == 429
    assert r.json() == {"error": {"message": "rate limited"}}


def test_proxy_cache_status_header_propagates(client, login, monkeypatch):
    from src import api_router

    token, _ = login
    client.post(
        "/manage/store",
        headers=_auth(token),
        json={"upstream": "openai", "apiKey": "sk-x"},
    )

    async def fake_call_rest(*args, **kwargs):
        return b'{"ok":true}', 200, "HIT"

    monkeypatch.setattr(api_router, "call_rest", fake_call_rest)

    r = client.post("/proxy/openai/anything", headers=_auth(token), json={})
    assert r.headers["x-ks-cache"] == "HIT"


# ─── 3. platform-key path ─────────────────────────────────────────────────


def test_proxy_platform_key_with_zero_balance_returns_x402(client, login, monkeypatch):
    """No stored key + zero balance = 402 with Coinbase x402 body."""
    from src import server, usage

    token, _ = login
    # Make sure there's a platform key configured (the proxy 401s if
    # NEITHER a stored key nor a platform key is available).
    monkeypatch.setitem(server.PLATFORM_KEYS, "openai", "PLATFORM-KEY-XYZ")
    monkeypatch.setattr(usage, "get_balance", lambda user_id: 0)

    r = client.post(
        "/proxy/openai/v1/chat",
        headers=_auth(token),
        json={"model": "gpt-4"},
    )
    assert r.status_code == 402
    body = r.json()
    assert body["x402Version"] == 1
    assert body["error"] == "X-PAYMENT-REQUIRED"
    assert isinstance(body["accepts"], list)
    assert body["accepts"][0]["scheme"] == "exact"
    assert r.headers.get("X-Payment-Required") == "x402"


def test_proxy_platform_key_with_balance_uses_platform_key(client, login, monkeypatch):
    """Positive balance lets the call through with the platform key
    injected (NOT a self-custodian key)."""
    from src import server, usage, api_router

    token, _ = login
    monkeypatch.setitem(server.PLATFORM_KEYS, "openai", "PLATFORM-KEY-XYZ")
    monkeypatch.setattr(usage, "get_balance", lambda user_id: 1000)  # plenty

    captured = {}

    async def fake_call_rest(provider, method, full_path, body, api_key, extra):
        captured["api_key"] = api_key
        return b'{"ok":true}', 200, "MISS"

    monkeypatch.setattr(api_router, "call_rest", fake_call_rest)

    r = client.post("/proxy/openai/v1/foo", headers=_auth(token), json={})
    assert r.status_code == 200
    assert captured["api_key"] == "PLATFORM-KEY-XYZ"
    assert r.headers["x-ks-key-type"] == "platform"


def test_proxy_no_stored_key_no_platform_key_returns_401(client, login, monkeypatch):
    from src import server

    token, _ = login
    # Force-clear any platform key for this upstream.
    monkeypatch.setitem(server.PLATFORM_KEYS, "openai", "")

    r = client.post("/proxy/openai/v1/foo", headers=_auth(token), json={})
    assert r.status_code == 401


# ─── 4. auth-scheme variants ──────────────────────────────────────────────


def test_proxy_zerox_uses_zerox_api_key_header(client, login, monkeypatch):
    """0x uses a custom `0x-api-key` header instead of Authorization."""
    from src import server

    token, _ = login
    client.post(
        "/manage/store",
        headers=_auth(token),
        json={"upstream": "0x", "apiKey": "ZX-USERS-KEY"},
    )

    captured = {}

    async def fake_request(method, url, headers, content):
        captured["method"] = method
        captured["url"] = url
        captured["headers"] = headers
        # httpx.Response stub
        class R:
            status_code = 200
            content = b'{"ok":true}'

            @property
            def headers(self):
                return {"content-type": "application/json"}

        return R()

    # Patch the persistent AsyncClient for 0x.
    class FakeClient:
        async def request(self, method, url, headers, content):
            return await fake_request(method, url, headers, content)

    monkeypatch.setitem(server._CLIENTS, "0x", FakeClient())

    r = client.get("/proxy/0x/swap/v1/quote?sellToken=ETH", headers=_auth(token))
    assert r.status_code == 200
    assert captured["headers"].get("0x-api-key") == "ZX-USERS-KEY"
    # The stored Authorization header should NOT be propagated for 0x.
    assert "Authorization" not in {k for k in captured["headers"]}


def test_proxy_helius_jsonrpc_routed_through_api_router(client, login, monkeypatch):
    """A Helius JSON-RPC POST goes through api_router.call_helius (which
    has its own per-method caching layer), not the generic forwarder."""
    from src import api_router

    token, _ = login
    client.post(
        "/manage/store",
        headers=_auth(token),
        json={"upstream": "helius", "apiKey": "helius-XYZ"},
    )

    captured = {}

    async def fake_call_helius(method, params, api_key, rpc_id):
        captured["method"] = method
        captured["params"] = params
        captured["api_key"] = api_key
        captured["rpc_id"] = rpc_id
        return ({"jsonrpc": "2.0", "id": rpc_id, "result": {"slot": 42}}, "HIT")

    monkeypatch.setattr(api_router, "call_helius", fake_call_helius)

    r = client.post(
        "/proxy/helius/",
        headers=_auth(token),
        json={"jsonrpc": "2.0", "method": "getSlot", "params": [], "id": 7},
    )
    assert r.status_code == 200
    assert r.json()["result"]["slot"] == 42
    assert captured["method"] == "getSlot"
    assert captured["api_key"] == "helius-XYZ"
    assert captured["rpc_id"] == 7
    assert r.headers["x-ks-cache"] == "HIT"
