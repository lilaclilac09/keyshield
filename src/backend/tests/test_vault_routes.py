from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod

# Dev-mode header used by _require_user_id when no real auth is present.
# This mirrors the X-Dev-Mode opt-in added by the security hardening PR
# so tests can hit the vault routes without a full session.
_DEV_HEADERS = {"X-Dev-Mode": "1"}


def _iso(tmp_path, monkeypatch):
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setenv("SERVER_SECRET", "test-vault-routes-secret")


def test_manage_store_preserves_cipher_fields(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)

    payload = {
        "upstream": "openai",
        "name": "openai key",
        "cipher": "testcipher",
        "iv": "testiv",
        "cipher_v": 1,
    }
    store_resp = client.post("/manage/store", json=payload, headers=_DEV_HEADERS)
    assert store_resp.status_code == 200
    assert "id" in store_resp.json()

    list_resp = client.get("/manage/vault", headers=_DEV_HEADERS)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert isinstance(items, list)
    assert any(
        item.get("upstream") == "openai"
        and item.get("cipher") == "testcipher"
        and item.get("iv") == "testiv"
        and item.get("cipher_v") == 1
        for item in items
    )


def test_manage_store_requires_auth_without_dev_header():
    """Without X-Dev-Mode or a real Bearer token, /manage/* returns 401."""
    client = TestClient(app)
    resp = client.post(
        "/manage/store",
        json={"upstream": "openai", "name": "x", "cipher": "c", "iv": "i"},
    )
    assert resp.status_code == 401


def test_stale_bearer_plus_dev_mode_does_not_write_default(tmp_path, monkeypatch):
    """Extension always sent X-Dev-Mode. A stale token used to land in
    user_id=default, so the signed-in Vault list was empty."""
    _iso(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    stale = {
        "Authorization": "Bearer not-a-session",
        "X-Dev-Mode": "1",
    }
    denied = client.post(
        "/manage/store",
        headers=stale,
        json={"upstream": "openai", "apiKey": "sk-proj-stale-must-not-save"},
    )
    assert denied.status_code == 401

    ok = client.post(
        "/manage/store",
        headers={"Authorization": f"Bearer {token}", "X-Dev-Mode": "1"},
        json={"upstream": "openai", "apiKey": "sk-proj-alice-key"},
    )
    assert ok.status_code == 200
    alice = client.get("/manage/vault", headers={"Authorization": f"Bearer {token}"}).json()
    assert any(item.get("upstream") == "openai" for item in alice)
    default_list = client.get("/manage/vault", headers=_DEV_HEADERS).json()
    assert not any(item.get("upstream") == "openai" for item in default_list)


def test_empty_session_claims_local_default_rows(tmp_path, monkeypatch):
    """Loopback / KS_CLAIM_DEFAULT_VAULT moves orphaned default keys onto
    the signed-in user so Vault is not empty after extension saves."""
    _iso(tmp_path, monkeypatch)
    monkeypatch.setenv("KS_CLAIM_DEFAULT_VAULT", "1")
    client = TestClient(app)
    stored = client.post(
        "/manage/store",
        headers=_DEV_HEADERS,
        json={"upstream": "openai", "apiKey": "sk-proj-orphan-one"},
    )
    assert stored.status_code == 200
    token = sess_mod.create_token("alice", "pw")
    listed = client.get("/manage/vault", headers={"Authorization": f"Bearer {token}"}).json()
    assert any(item.get("upstream") == "openai" for item in listed)
    leftover = client.get("/manage/vault", headers=_DEV_HEADERS).json()
    assert leftover == []


def test_five_helius_manage_store_lists_five_rows(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}
    secrets = [
        "10470584-67a9-4abc-8def-123456787761",
        "210e4c2a-91b0-4c3d-a111-aaaaaaaaaaa1",
        "310e4c2a-91b0-4c3d-a222-bbbbbbbbbbb2",
        "410e4c2a-91b0-4c3d-a333-ccccccccccc3",
        "510e4c2a-91b0-4c3d-a444-ddddddddddd4",
    ]
    ids = []
    for secret in secrets:
        stored = client.post(
            "/manage/store",
            headers=headers,
            json={"upstream": "helius", "apiKey": secret, "name": "helius key"},
        )
        assert stored.status_code == 200
        ids.append(stored.json()["id"])
    again = client.post(
        "/manage/store",
        headers=headers,
        json={"upstream": "helius", "apiKey": secrets[0], "name": "helius key"},
    )
    assert again.status_code == 200
    assert again.json()["id"] == ids[0]
    listed = client.get("/manage/vault", headers=headers).json()
    helius = [row for row in listed if row.get("upstream") == "helius"]
    assert len(helius) == 5
    dumped = str(listed)
    for secret in secrets:
        assert secret not in dumped


def test_hosted_empty_session_does_not_claim_default(tmp_path, monkeypatch):
    """Shared Railway must not give every signed-in user the default bucket."""
    _iso(tmp_path, monkeypatch)
    monkeypatch.delenv("KS_CLAIM_DEFAULT_VAULT", raising=False)
    client = TestClient(app)
    stored = client.post(
        "/manage/store",
        headers=_DEV_HEADERS,
        json={"upstream": "groq", "apiKey": "gsk_shared-must-stay"},
    )
    assert stored.status_code == 200
    token = sess_mod.create_token("bob", "pw")
    listed = client.get("/manage/vault", headers={"Authorization": f"Bearer {token}"}).json()
    assert listed == []
    default_list = client.get("/manage/vault", headers=_DEV_HEADERS).json()
    assert any(item.get("upstream") == "groq" for item in default_list)
