"""HTTP 402 before the upstream call when prepaid platform balance is exhausted."""

from __future__ import annotations

import sqlite3
import time

import pytest
from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.proxy import api_router

FAKE_KEY = "sk-demo-not-a-real-key-0000000000000000"
PLATFORM_KEY = "sk-platform-env-key-not-a-real-key"


@pytest.fixture()
def env(tmp_path, monkeypatch):
    from src.backend.billing import usage as usage_mod
    from src.backend.mpp import mpp_streams
    from src.backend.routes import proxy as proxy_routes
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.setenv("SERVER_SECRET", "test-proxy-402-secret")
    monkeypatch.setenv("OPENAI_API_KEY", PLATFORM_KEY)
    monkeypatch.delenv("KS_MPP_HOLD_TTL_SECS", raising=False)

    api_router._CACHE.clear()
    calls: list[dict] = []

    async def fake_upstream(api_router_, upstream, path, body, api_key, request, interceptor):
        calls.append({"upstream": upstream, "path": path, "api_key": api_key})
        return (
            b'{"ok": true, "choices": [{"message": {"content": "hi"}}]}',
            200,
            "HIT",
            None,
        )

    monkeypatch.setattr(proxy_routes, "_call_upstream", fake_upstream)
    client = TestClient(app)
    token = sess_mod.create_token("alice", "")
    usage_mod.get_balance("alice")
    conn = sqlite3.connect(str(usage_mod.DB_PATH))
    try:
        conn.execute(
            "UPDATE user_balance SET balance_usd = 0 WHERE user_id = ?",
            ("alice",),
        )
        conn.commit()
    finally:
        conn.close()
    assert usage_mod.get_balance("alice") == 0.0
    assert usage_mod.prepaid_allows_upstream("alice", key_type="platform") is False
    assert usage_mod.prepaid_allows_upstream("alice", key_type="vault") is True
    assert usage_mod.prepaid_allows_upstream("alice", key_type="user") is True
    assert (
        usage_mod.prepaid_allows_upstream("alice", key_type="platform", mpp_stream_open=True)
        is True
    )
    return client, token, calls, tmp_path


def _h(token: str, extra: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    if extra:
        headers.update(extra)
    return headers


def _assert_402(resp, calls) -> None:
    assert resp.status_code == 402, resp.text
    body = resp.json()
    assert body["x402Version"] == 1
    assert body["error"] == "X-PAYMENT-REQUIRED"
    assert resp.headers.get("X-Payment-Required") == "x402"
    accept = body["accepts"][0]
    assert accept["scheme"] == "exact"
    assert accept["network"] == "base-sepolia"
    assert accept["maxAmountRequired"] == "10000"
    assert calls == []


def test_402_before_upstream_when_balance_exhausted(env):
    from src.backend.billing import usage as usage_mod

    client, token, calls, _ = env
    path = "/proxy/openai/v1/chat/completions"
    payload = {"model": "gpt-test", "messages": []}

    r = client.post(path, headers=_h(token), json=payload)
    _assert_402(r, calls)

    # Cache HIT is not a skip of 402. Seed the in-process cache; 402 still
    # fires before `_call_upstream`, which is where HIT/MISS is decided.
    api_router._CACHE["seed-hit"] = ({"ok": True}, time.monotonic() + 3600)
    r = client.post(path, headers=_h(token), json=payload)
    _assert_402(r, calls)

    r = client.post(
        path,
        headers=_h(token, {"X-Upstream-API-Key": FAKE_KEY}),
        json=payload,
    )
    assert r.status_code == 200, r.text
    assert calls and calls[-1]["api_key"] == FAKE_KEY
    n = len(calls)

    store = client.post(
        "/manage/store",
        headers=_h(token),
        json={"upstream": "openai", "apiKey": FAKE_KEY},
    )
    assert store.status_code == 200, store.text
    r = client.post(
        "/vproxy/openai/v1/chat/completions",
        headers=_h(token),
        json=payload,
    )
    assert r.status_code == 200, r.text
    assert len(calls) == n + 1
    assert calls[-1]["api_key"] == FAKE_KEY
    assert usage_mod.get_balance("alice") == 0.0
