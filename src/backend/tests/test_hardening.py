"""S1–S5, apiKey alias, and delegated-token policy."""

from __future__ import annotations

import base64
import os

import base58
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.agents import agents as agents_mod


def _client() -> TestClient:
    return TestClient(app)


def _signed_wallet(client: TestClient) -> tuple[str, str]:
    sk = SigningKey.generate()
    wallet = base58.b58encode(bytes(sk.verify_key)).decode()
    ch = client.get("/auth/wallet-challenge").json()
    sig = base64.b64encode(sk.sign(ch["challenge"].encode()).signature).decode()
    r = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": wallet,
            "challenge": ch["challenge"],
            "nonce": ch["nonce"],
            "signature": sig,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["token"], wallet


def test_s1_wallet_login_requires_signature():
    client = _client()
    ch = client.get("/auth/wallet-challenge").json()
    r = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "challenge": ch["challenge"],
            "nonce": ch["nonce"],
        },
    )
    assert r.status_code == 401
    assert "signature" in r.json()["error"]


def test_s2_x_dev_mode_ignored_without_flag(monkeypatch):
    monkeypatch.delenv("KS_DEV_MODE", raising=False)
    client = _client()
    r = client.get("/manage/vault", headers={"X-Dev-Mode": "1"})
    assert r.status_code == 401


def test_s2_x_dev_mode_honoured_when_flag_set(monkeypatch):
    monkeypatch.setenv("KS_DEV_MODE", "1")
    client = _client()
    r = client.get("/manage/vault", headers={"X-Dev-Mode": "1"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_s3_health_mpp_does_not_leak_secret_prefix(monkeypatch):
    monkeypatch.setenv("SERVER_SECRET", "abcdef-super-secret-value-32bytes!!")
    client = _client()
    r = client.get("/health/mpp")
    assert r.status_code == 200
    body = r.text
    assert "abcdef" not in body
    env = r.json()["env_vars"]
    assert env["SERVER_SECRET"] is True
    assert all(isinstance(v, bool) for v in env.values())


def test_s4_sessions_omit_full_token():
    client = _client()
    token, _ = _signed_wallet(client)
    r = client.get("/sessions", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    rows = r.json()
    assert rows
    for row in rows:
        assert "token" not in row or row.get("token") in (None, "")
        assert row.get("token_prefix")
        assert token not in str(row)


def test_s5_decrypt_forbidden_without_dev_mode(monkeypatch):
    monkeypatch.delenv("KS_DEV_MODE", raising=False)
    client = _client()
    token, _ = _signed_wallet(client)
    h = {"Authorization": f"Bearer {token}"}
    store = client.post(
        "/manage/store",
        headers=h,
        json={"upstream": "openai", "value": "sk-secret-plain"},
    )
    assert store.status_code == 200
    item_id = store.json()["id"]
    dec = client.get(f"/manage/decrypt/{item_id}", headers=h)
    assert dec.status_code == 403


def test_s5_decrypt_allowed_in_dev_mode(monkeypatch):
    monkeypatch.setenv("KS_DEV_MODE", "1")
    client = _client()
    token, _ = _signed_wallet(client)
    h = {"Authorization": f"Bearer {token}"}
    store = client.post(
        "/manage/store",
        headers=h,
        json={"upstream": "openai", "value": "sk-secret-plain"},
    )
    item_id = store.json()["id"]
    dec = client.get(f"/manage/decrypt/{item_id}", headers=h)
    assert dec.status_code == 200
    assert dec.json()["value"] == "sk-secret-plain"


def test_store_accepts_apiKey_alias():
    client = _client()
    token, _ = _signed_wallet(client)
    h = {"Authorization": f"Bearer {token}"}
    r = client.post(
        "/manage/store",
        headers=h,
        json={"upstream": "openai", "apiKey": "sk-from-alias"},
    )
    assert r.status_code == 200
    item_id = r.json()["id"]
    os.environ["KS_DEV_MODE"] = "1"
    try:
        dec = client.get(f"/manage/decrypt/{item_id}", headers=h)
        assert dec.status_code == 200
        assert dec.json()["value"] == "sk-from-alias"
    finally:
        os.environ.pop("KS_DEV_MODE", None)


def test_delegated_token_provider_enforced():
    client = _client()
    token = sess_mod.create_token("owner-alice", "pw", provider="anthropic")
    r = client.get(
        "/proxy/openai/v1/models",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Upstream-API-Key": "sk-x",
        },
    )
    assert r.status_code == 403
    assert "provider" in r.json()["error"]


def test_delegated_token_spend_cap_zero_blocks():
    client = _client()
    token = sess_mod.create_token("owner-bob", "pw", spend_cap_usd=0)
    r = client.get(
        "/proxy/openai/v1/models",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Upstream-API-Key": "sk-x",
        },
    )
    assert r.status_code == 429
    assert "spend cap" in r.json()["error"]


def test_agent_token_revoked_independently():
    owner = "owner-carol"
    pubkey = "agent_test_" + os.urandom(4).hex()
    aid = agents_mod.register(owner, pubkey, name="bot", scopes="openai")
    token = sess_mod.create_token(owner, "pw", aid=aid, provider="openai")
    assert sess_mod.get(token) is not None
    assert agents_mod.revoke(owner, aid) is True
    assert sess_mod.get(token) is None
    client = _client()
    r = client.get(
        "/vproxy/openai/v1/models",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 401
