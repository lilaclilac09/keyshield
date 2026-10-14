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


def test_manage_store_roundtrip_plaintext(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    secret = "sk-proj-LOCALONLYFILLTEST123456"

    payload = {
        "upstream": "openai",
        "name": "openai key",
        "apiKey": secret,
        "cipher": "testcipher",
        "iv": "testiv",
        "cipher_v": 1,
    }
    store_resp = client.post("/manage/store", json=payload, headers=_DEV_HEADERS)
    assert store_resp.status_code == 200
    item_id = store_resp.json()["id"]

    list_resp = client.get("/manage/vault", headers=_DEV_HEADERS)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert isinstance(items, list)
    dumped = str(items)
    assert secret not in dumped
    row = next(item for item in items if item.get("id") == item_id)
    assert row.get("upstream") == "openai"
    assert row.get("has_plaintext") is True
    assert row.get("masked_value")
    assert secret not in row.get("masked_value")

    dec = client.get(f"/manage/decrypt/{item_id}", headers=_DEV_HEADERS)
    assert dec.status_code == 200
    assert dec.json()["value"] == secret
    assert dec.json()["key"] == secret


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
    names = {row["name"] for row in helius}
    assert names == {"helius1", "helius2", "helius3", "helius4", "helius5"}


def test_manage_store_keeps_helius_dashboard_names(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}
    first = client.post(
        "/manage/store",
        headers=headers,
        json={
            "upstream": "helius",
            "apiKey": "10470584-67a9-4abc-8def-123456787761",
            "name": "Panthermaze",
            "expires_at": "2027-04-01",
            "domain": "dashboard.helius.dev",
        },
    )
    second = client.post(
        "/manage/store",
        headers=headers,
        json={
            "upstream": "helius",
            "apiKey": "210e4c2a-91b0-4c3d-a111-aaaaaaaaaaa1",
            "name": "Heronplanet",
            "domain": "dashboard.helius.dev",
        },
    )
    assert first.status_code == 200
    assert second.status_code == 200
    listed = client.get("/manage/vault", headers=headers).json()
    names = {row["name"] for row in listed if row.get("upstream") == "helius"}
    assert names == {"Panthermaze", "Heronplanet"}
    panther = next(row for row in listed if row["name"] == "Panthermaze")
    assert str(panther.get("expires_at") or "").startswith("2027-04-01")
    assert "10470584-67a9-4abc-8def-123456787761" not in str(listed)


def test_manage_store_rejects_empty_plaintext(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    empty = client.post(
        "/manage/store",
        headers=_DEV_HEADERS,
        json={"upstream": "openrouter", "name": "OpenRouter (Nemotron free)"},
    )
    assert empty.status_code == 400
    assert "Paste" in empty.json().get("detail", "")
    cipher_only = client.post(
        "/manage/store",
        headers=_DEV_HEADERS,
        json={"upstream": "helius", "cipher": "c", "iv": "i", "cipher_v": 1},
    )
    assert cipher_only.status_code == 400
    assert "Paste" in cipher_only.json().get("detail", "")


def _insert_empty_row(item_id: str = "ks_empty") -> None:
    from src.backend.routes import vault as vault_mod

    with vault_mod._db() as conn:
        conn.execute(
            "INSERT INTO vault_items (id, user_id, name, type, upstream, value, tags, "
            "created_at, updated_at, cipher, iv, cipher_v) "
            "VALUES (?, 'default', 'helius key', 'api_key', 'helius', '', '[]', "
            "1, 1, 'c', 'i', 1)",
            (item_id,),
        )


def test_decrypt_empty_plaintext_404(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    _insert_empty_row()
    client = TestClient(app)
    r = client.get("/manage/decrypt/ks_empty", headers=_DEV_HEADERS)
    assert r.status_code == 404
    assert r.json().get("code") == "empty_plaintext"


def test_list_drops_empty_value_rows(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    _insert_empty_row("ks_ghost")
    client = TestClient(app)
    listed = client.get("/manage/vault", headers=_DEV_HEADERS).json()
    assert listed == []


def test_store_backfills_blank_row(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    _insert_empty_row("ks_blank")
    client = TestClient(app)
    secret = "10470584-67a9-4abc-8def-123456787761"
    stored = client.post(
        "/manage/store",
        headers=_DEV_HEADERS,
        json={"upstream": "helius", "apiKey": secret, "name": "helius key"},
    )
    assert stored.status_code == 200
    assert stored.json()["id"] == "ks_blank"
    dec = client.get("/manage/decrypt/ks_blank", headers=_DEV_HEADERS)
    assert dec.status_code == 200
    assert dec.json()["value"] == secret


def test_store_does_not_wipe_existing_value(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    secret = "sk-proj-keep-me"
    stored = client.post(
        "/manage/store",
        headers=_DEV_HEADERS,
        json={"upstream": "openai", "apiKey": secret, "name": "openai key"},
    )
    item_id = stored.json()["id"]
    wiped = client.put(
        f"/manage/vault/{item_id}",
        headers=_DEV_HEADERS,
        json={"value": ""},
    )
    assert wiped.status_code == 200
    dec = client.get(f"/manage/decrypt/{item_id}", headers=_DEV_HEADERS)
    assert dec.status_code == 200
    assert dec.json()["value"] == secret


def test_vault_db_path_honors_ks_vault_db_path(monkeypatch, tmp_path):
    from src.backend.routes import vault as vault_mod

    custom = tmp_path / "from-env.db"
    monkeypatch.setenv("KS_VAULT_DB_PATH", str(custom))
    assert vault_mod._vault_db_path() == custom


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


def test_manage_store_extension_helius_bulk_save_payload(tmp_path, monkeypatch):
    """Exact body background.js directStore sends for a Helius dashboard UUID."""
    _iso(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}
    for key in (
        "f1c08a72-3ec1-4abc-8def-fe9ae2b47ae8",
        "10470584-67a9-4abc-8def-1dee5f777761",
    ):
        r = client.post(
            "/manage/store",
            headers=headers,
            json={
                "upstream": "helius",
                "apiKey": key,
                "value": key,
                "name": "Helius RPC (dashboard.helius.dev)",
                "domain": "dashboard.helius.dev",
                "origin": "dashboard.helius.dev",
                "pageTitle": "Helius Dashboard",
                "expires_at": "",
            },
        )
        assert r.status_code == 200, r.text
    listed = client.get("/manage/vault", headers=headers).json()
    assert len([row for row in listed if row["upstream"] == "helius"]) == 2


def test_manage_store_legacy_cipher_only_extension_body_is_400(tmp_path, monkeypatch):
    """Pre-6e57fad extensions sent {upstream,name,cipher,iv,cipher_v} only.
    That is the 'http-400' the dashboard toast shows; the fix is reloading
    the extension, which now sends plaintext."""
    _iso(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    r = client.post(
        "/manage/store",
        headers={"Authorization": f"Bearer {token}"},
        json={"upstream": "helius", "name": "helius key", "cipher": "c", "iv": "i", "cipher_v": 1},
    )
    assert r.status_code == 400
