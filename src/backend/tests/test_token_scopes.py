"""Proxy-only tokens (agents, developer tokens) can't read the vault.

Regression for the hole where /auth/agent-login returned a full owner
session, so an agent could list and decrypt every stored provider key.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.mpp import mpp_onchain

FAKE_KEY = "sk-demo-not-a-real-key-0000000000000000"


@pytest.fixture()
def env(tmp_path, monkeypatch):
    from src.backend.agents import agents as agents_mod
    from src.backend.billing import usage as usage_mod
    from src.backend.routes import proxy as proxy_routes
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(agents_mod, "DB_PATH", tmp_path / "agents.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setenv("SERVER_SECRET", "test-token-scope-secret")

    calls: list[str] = []

    async def fake_upstream(api_router, upstream, path, body, api_key, request, interceptor):
        calls.append(api_key)
        return b'{"ok": true}', 200, "MISS", None

    monkeypatch.setattr(proxy_routes, "_call_upstream", fake_upstream)
    client = TestClient(app)
    owner = sess_mod.create_token("alice", "")
    hdr = {"Authorization": f"Bearer {owner}"}
    r = client.post("/manage/store", headers=hdr, json={"upstream": "openai", "apiKey": FAKE_KEY})
    assert r.status_code == 200, r.text
    return client, owner, r.json()["id"], calls


def _agent_token(client: TestClient, owner: str) -> str:
    sk = SigningKey.generate()
    pub = mpp_onchain._b58encode_pure(bytes(sk.verify_key))
    reg = client.post(
        "/agents/register",
        headers={"Authorization": f"Bearer {owner}"},
        json={"pubkeyB58": pub, "name": "scope-bot"},
    )
    assert reg.status_code == 200, reg.text
    chal = client.post("/auth/agent-challenge").json()
    sig = base64.b64encode(sk.sign(chal["challenge"].encode()).signature).decode()
    login = client.post(
        "/auth/agent-login",
        json={
            "pubkeyB58": pub,
            "challenge": chal["challenge"],
            "nonce": chal["nonce"],
            "signature": sig,
        },
    )
    assert login.status_code == 200, login.text
    assert login.json()["scope"] == "proxy"
    return login.json()["token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_agent_token_cannot_read_vault(env):
    client, owner, item_id, _ = env
    agent = _agent_token(client, owner)

    for method, path in [
        ("GET", "/manage/vault"),
        ("GET", f"/manage/decrypt/{item_id}"),
        ("POST", "/manage/store"),
        ("DELETE", f"/manage/vault/{item_id}"),
        ("GET", "/sessions"),
        ("POST", "/sessions/proxy-token"),
        ("GET", "/agents/list"),
        ("POST", "/agents/register"),
        ("GET", "/keychain/home"),
    ]:
        r = client.request(method, path, headers=_h(agent), json={})
        assert r.status_code == 403, (method, path, r.status_code, r.text)
        assert r.json()["error"] == "insufficient_scope"
        assert FAKE_KEY not in r.text

    # Owner still can.
    assert client.get("/manage/vault", headers=_h(owner)).status_code == 200
    dec = client.get(f"/manage/decrypt/{item_id}", headers=_h(owner))
    assert dec.status_code == 200 and dec.json()["value"] == FAKE_KEY


def test_agent_token_still_proxies(env):
    client, owner, _, calls = env
    agent = _agent_token(client, owner)
    r = client.post("/vproxy/openai/v1/chat/completions", headers=_h(agent), json={"x": 1})
    assert r.status_code == 200, r.text
    assert r.headers["x-ks-key-type"] == "vault"
    assert calls == [FAKE_KEY]  # injected server-side, never returned


def test_developer_proxy_token_mint_and_revoke(env):
    client, owner, item_id, _ = env
    minted = client.post("/sessions/proxy-token", headers=_h(owner), json={})
    assert minted.status_code == 200, minted.text
    tok = minted.json()["token"]
    assert minted.json()["scope"] == "proxy"

    assert client.get(f"/manage/decrypt/{item_id}", headers=_h(tok)).status_code == 403
    assert client.post("/vproxy/openai/v1/models", headers=_h(tok), json={}).status_code == 200

    listed = client.get("/sessions", headers=_h(owner)).json()["sessions"]
    assert any(s["id"] == tok[-8:] and s["scope"] == "proxy" for s in listed)

    rv = client.post(f"/sessions/{tok[-8:]}/revoke", headers=_h(owner))
    assert rv.status_code == 200 and rv.json() == {"ok": True}
    after = client.post("/vproxy/openai/v1/models", headers=_h(tok), json={})
    assert after.status_code == 401 and after.json() == {"error": "invalid token"}


def test_legacy_agent_token_without_scope_is_proxy_only(env):
    """Agent tokens minted before scopes (no `scp`) are downgraded on read."""
    client, owner, item_id, _ = env
    import json
    import time

    exp = int(time.time()) + 3600
    payload = (
        base64.urlsafe_b64encode(
            json.dumps({"uid": "alice", "exp": exp, "iat": 0, "nbf": 0}).encode()
        )
        .decode()
        .rstrip("=")
    )
    legacy = f"{payload}.{sess_mod._sign_token(payload)}"
    with sess_mod._db() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, enc_pass, expires_at) VALUES (?, ?, ?, ?)",
            (legacy, "alice", sess_mod._encrypt("default"), exp),
        )
    assert sess_mod.get(legacy)["scope"] == "proxy"
    assert client.get(f"/manage/decrypt/{item_id}", headers=_h(legacy)).status_code == 403


def test_owner_tokens_without_scope_keep_working(env):
    """Signed-in users from before the deploy are not logged out."""
    client, owner, item_id, _ = env
    import json
    import time

    exp = int(time.time()) + 3600
    payload = (
        base64.urlsafe_b64encode(
            json.dumps({"uid": "alice", "exp": exp, "iat": 0, "nbf": 0}).encode()
        )
        .decode()
        .rstrip("=")
    )
    legacy = f"{payload}.{sess_mod._sign_token(payload)}"
    with sess_mod._db() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, enc_pass, expires_at) VALUES (?, ?, ?, ?)",
            (legacy, "alice", sess_mod._encrypt(""), exp),
        )
    assert client.get(f"/manage/decrypt/{item_id}", headers=_h(legacy)).status_code == 200


def test_invalid_token_still_401_not_403(env):
    client, _, item_id, _ = env
    r = client.get(f"/manage/decrypt/{item_id}", headers=_h("nope.nope"))
    assert r.status_code == 401
