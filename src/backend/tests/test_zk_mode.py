"""ZK mode (zk-v1): the server stores and releases data it can't read."""

from __future__ import annotations

import json
import os
import secrets
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod

from . import zk_ref as ref

FAKE_KEY = "sk-demo-zk-not-a-real-key-" + "7" * 24
VECTORS = Path(__file__).resolve().parents[3] / "docs" / "zk" / "vectors.json"


@pytest.fixture()
def env(tmp_path, monkeypatch):
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setenv("SERVER_SECRET", "test-zk-secret")
    monkeypatch.delenv("KS_ZK_DISABLED", raising=False)
    client = TestClient(app)
    owner = sess_mod.create_token("zoe", "")
    return client, owner, tmp_path / "vault.db"


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _zk_body(root: bytes, upstream: str = "openai", key: str = FAKE_KEY) -> tuple[dict, bytes]:
    item_id = "ks_" + secrets.token_hex(6)
    share, iv = os.urandom(32), os.urandom(12)
    body = {
        "id": item_id,
        "upstream": upstream,
        "name": f"{upstream} zk",
        "cipher": ref.seal(root, share, iv, item_id, upstream, key),
        "iv": ref.b64u(iv),
        "share": ref.b64u(share),
        "cipher_v": 2,
        "hint": "sk-demo-",
    }
    return body, share


def test_vectors_match_reference():
    v = json.loads(VECTORS.read_text())
    root = ref.root_from_prf(ref.unb64u(v["prf_output"]))
    assert ref.b64u(root) == v["root"]
    assert ref.root_id(root) == v["root_id"]
    share, iv = ref.unb64u(v["share"]), ref.unb64u(v["iv"])
    assert ref.b64u(ref.item_key(root, share, v["item_id"], v["upstream"])) == v["item_key"]
    assert ref.seal(root, share, iv, v["item_id"], v["upstream"], v["plaintext"]) == v["cipher"]


def test_zk_round_trip_server_never_sees_plaintext(env):
    client, owner, db = env
    root = ref.root_from_prf(os.urandom(32))
    assert client.get("/zk/status", headers=_h(owner)).json()["enabled"] is False
    r = client.post("/zk/enable", headers=_h(owner), json={"root_id": ref.root_id(root)})
    assert r.status_code == 200, r.text

    body, _ = _zk_body(root)
    r = client.post("/manage/store", headers=_h(owner), json=body)
    assert r.status_code == 200, r.text
    item_id = r.json()["id"]

    # Listed, masked, flagged zk; plaintext nowhere in the response.
    listed = client.get("/manage/vault", headers=_h(owner))
    assert listed.status_code == 200
    row = next(i for i in listed.json() if i["id"] == item_id)
    assert row["zk"] is True and row["has_plaintext"] is False
    assert "zero-knowledge" in row["masked_value"]
    assert FAKE_KEY not in listed.text

    # The server refuses to decrypt or inject it.
    dec = client.get(f"/manage/decrypt/{item_id}", headers=_h(owner))
    assert dec.status_code == 409 and dec.json()["error"] == "zk_item"
    vp = client.post("/vproxy/openai/v1/models", headers=_h(owner), json={})
    assert vp.status_code == 409 and vp.json()["error"] == "zk_item"

    # A proxy token gets ciphertext + share and decrypts locally.
    proxy = client.post("/sessions/proxy-token", headers=_h(owner), json={}).json()["token"]
    items = client.get("/zk/items", headers=_h(proxy)).json()["items"]
    it = next(i for i in items if i["id"] == item_id)
    share = client.get(f"/zk/share/{item_id}", headers=_h(proxy))
    assert share.status_code == 200 and share.headers["cache-control"] == "no-store"
    plain = ref.open_(
        root,
        ref.unb64u(share.json()["share"]),
        ref.unb64u(it["iv"]),
        item_id,
        "openai",
        it["cipher"],
    )
    assert plain == FAKE_KEY

    # Without the root, the server's data is not enough.
    with pytest.raises(Exception):
        ref.open_(
            os.urandom(32),
            ref.unb64u(share.json()["share"]),
            ref.unb64u(it["iv"]),
            item_id,
            "openai",
            it["cipher"],
        )

    # Revoke the proxy token: the share is no longer released.
    rv = client.post(f"/sessions/{proxy[-8:]}/revoke", headers=_h(owner))
    assert rv.status_code == 200
    gone = client.get(f"/zk/share/{item_id}", headers=_h(proxy))
    assert gone.status_code == 401 and gone.json() == {"error": "invalid token"}

    # The raw DB file holds no plaintext.
    for f in db.parent.glob("vault.db*"):
        assert FAKE_KEY.encode() not in f.read_bytes()


def test_plaintext_refused_in_zk_mode(env):
    client, owner, _ = env
    root = ref.root_from_prf(os.urandom(32))
    client.post("/zk/enable", headers=_h(owner), json={"root_id": ref.root_id(root)})
    r = client.post(
        "/manage/store", headers=_h(owner), json={"upstream": "openai", "apiKey": "x" * 30}
    )
    assert r.status_code == 409 and r.json()["error"] == "zk_mode"
    # A zk body may not smuggle a plaintext value either.
    body, _ = _zk_body(root)
    body["value"] = FAKE_KEY
    assert client.post("/manage/store", headers=_h(owner), json=body).status_code == 400


def test_zk_store_requires_enable_and_valid_fields(env):
    client, owner, _ = env
    root = ref.root_from_prf(os.urandom(32))
    body, _ = _zk_body(root)
    r = client.post("/manage/store", headers=_h(owner), json=body)
    assert r.status_code == 409 and r.json()["error"] == "zk_not_enabled"
    client.post("/zk/enable", headers=_h(owner), json={"root_id": ref.root_id(root)})
    bad = dict(body, share="short")
    assert client.post("/manage/store", headers=_h(owner), json=bad).status_code == 400
    bad = dict(body, iv=ref.b64u(b"123"))
    assert client.post("/manage/store", headers=_h(owner), json=bad).status_code == 400
    bad = dict(body, id="whatever")
    assert client.post("/manage/store", headers=_h(owner), json=bad).status_code == 400


def test_migration_resave_then_purge(env):
    """Existing plaintext rows keep working until the user re-saves and purges."""
    client, owner, db = env
    old = client.post(
        "/manage/store", headers=_h(owner), json={"upstream": "groq", "apiKey": FAKE_KEY}
    )
    old_id = old.json()["id"]
    root = ref.root_from_prf(os.urandom(32))
    client.post("/zk/enable", headers=_h(owner), json={"root_id": ref.root_id(root)})

    # Still readable by the owner so the client can re-encrypt it.
    plain = client.get(f"/manage/decrypt/{old_id}", headers=_h(owner)).json()["value"]
    body, _ = _zk_body(root, "groq", plain)
    assert client.post("/manage/store", headers=_h(owner), json=body).status_code == 200
    st = client.get("/zk/status", headers=_h(owner)).json()
    assert st["plaintext_items"] == 1 and st["zk_items"] == 1

    purged = client.post("/zk/purge-plaintext", headers=_h(owner))
    assert purged.status_code == 200 and purged.json()["deleted"] == 1
    st = client.get("/zk/status", headers=_h(owner)).json()
    assert st["plaintext_items"] == 0 and st["zk_items"] == 1
    for f in db.parent.glob("vault.db*"):
        assert FAKE_KEY.encode() not in f.read_bytes()


def test_proxy_token_cannot_change_zk_settings(env):
    client, owner, _ = env
    proxy = client.post("/sessions/proxy-token", headers=_h(owner), json={}).json()["token"]
    for path in ("/zk/enable", "/zk/disable", "/zk/purge-plaintext"):
        r = client.post(path, headers=_h(proxy), json={"root_id": "a" * 24})
        assert r.status_code == 403, path


def test_root_mismatch_and_kill_switch(env, monkeypatch):
    client, owner, _ = env
    a = ref.root_id(ref.root_from_prf(os.urandom(32)))
    b = ref.root_id(ref.root_from_prf(os.urandom(32)))
    assert client.post("/zk/enable", headers=_h(owner), json={"root_id": a}).status_code == 200
    r = client.post("/zk/enable", headers=_h(owner), json={"root_id": b})
    assert r.status_code == 409 and r.json()["error"] == "root_mismatch"
    monkeypatch.setenv("KS_ZK_DISABLED", "1")
    assert client.get("/zk/status", headers=_h(owner)).status_code == 404


def test_users_without_zk_unchanged(env):
    client, owner, _ = env
    r = client.post(
        "/manage/store", headers=_h(owner), json={"upstream": "openai", "apiKey": FAKE_KEY}
    )
    assert r.status_code == 200
    dec = client.get(f"/manage/decrypt/{r.json()['id']}", headers=_h(owner))
    assert dec.json()["value"] == FAKE_KEY
