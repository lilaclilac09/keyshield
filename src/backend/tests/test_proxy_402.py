"""Platform prepaid 402 happens before hold, cache, and upstream."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod


FAKE_VAULT_KEY = "sk-vault-not-a-real-key-000000000000"


def _zero_balance(usage_mod, user_id: str) -> None:
    conn = usage_mod._db()
    try:
        usage_mod._ensure_balance(conn, user_id)
        conn.execute(
            "UPDATE user_balance SET balance_usd = 0 WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()
    finally:
        conn.close()


def test_402_before_upstream_when_balance_exhausted(tmp_path, monkeypatch):
    from src.backend.billing import usage as usage_mod
    from src.backend.mpp import mpp_streams
    from src.backend.proxy import api_router
    from src.backend.routes import proxy as proxy_routes
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.setenv("SERVER_SECRET", "test-402-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-platform-test-key")
    monkeypatch.delenv("PAYMENT_ADDRESS", raising=False)

    calls: list[object] = []

    async def fake_upstream(*_args, **_kwargs):
        calls.append("upstream")
        return b'{"ok": true}', 200, "MISS", None

    async def fake_helius(*_args, **_kwargs):
        calls.append("helius")
        return b'{"ok": true}', 200, "HIT"

    monkeypatch.setattr(proxy_routes, "_call_upstream", fake_upstream)
    monkeypatch.setattr(proxy_routes, "_proxy_helius", fake_helius)

    saved_cache = dict(api_router._CACHE)
    api_router._CACHE.clear()
    try:
        client = TestClient(app)
        token = sess_mod.create_token("broke", "pw")
        headers = {"Authorization": f"Bearer {token}"}

        _zero_balance(usage_mod, "broke")
        assert usage_mod.get_balance("broke") <= 0
        assert usage_mod.prepaid_allows_upstream("broke", "platform") is False
        assert usage_mod.prepaid_allows_upstream("broke", "vault") is True
        assert usage_mod.prepaid_allows_upstream("broke", "user") is True

        ck = api_router._ck("openai", "GET /v1/models", "")
        api_router._CACHE[ck] = (b'{"cached": true}', time.monotonic() + 3600)

        hit = client.get("/proxy/openai/v1/models", headers=headers)
        assert hit.status_code == 402, hit.text
        payload = hit.json()
        assert payload["error"] == "X-PAYMENT-REQUIRED"
        assert payload["x402Version"] == 1
        assert hit.headers.get("X-Payment-Required") == "x402"
        assert "cached" not in hit.text
        assert calls == []

        post = client.post(
            "/proxy/openai/v1/chat/completions",
            headers=headers,
            json={"hi": 1},
        )
        assert post.status_code == 402, post.text
        assert calls == []

        stored = client.post(
            "/manage/store",
            headers=headers,
            json={"upstream": "openai", "apiKey": FAKE_VAULT_KEY},
        )
        assert stored.status_code == 200, stored.text
        vault = client.post(
            "/vproxy/openai/v1/chat/completions",
            headers=headers,
            json={"x": 1},
        )
        assert vault.status_code == 200, vault.text
        assert vault.headers.get("x-ks-key-type") == "vault"
        assert calls == ["upstream"]
    finally:
        api_router._CACHE.clear()
        api_router._CACHE.update(saved_cache)
