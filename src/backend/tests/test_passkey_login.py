"""Passkey login must fail loudly before Face ID when the server has no cred."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import passkey as pk_mod


def _iso_passkey_db(tmp_path, monkeypatch):
    monkeypatch.setattr(pk_mod, "DB_PATH", tmp_path / "keyshield.db")
    pk_mod._PENDING_AUTHS.clear()
    pk_mod._PENDING_REGS.clear()
    pk_mod._init_db()


def test_auth_options_without_passkey_does_not_start_face_id(tmp_path, monkeypatch):
    _iso_passkey_db(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.get(
        "/auth/passkey/auth-options",
        params={"user_id": "F6AHWalletJ52R"},
        headers={"Origin": "https://app.ks.aileena.xyz"},
    )
    assert res.status_code == 404, res.text
    body = res.json()
    assert body["code"] == "no_passkey"
    assert body["error"]
    assert "wallet" in body["detail"].lower()
    assert "enroll passkey again" in body["detail"]
    assert not any("\u4e00" <= ch <= "\u9fff" for ch in body["detail"])


def test_verify_without_options_keeps_detail_not_generic(tmp_path, monkeypatch):
    _iso_passkey_db(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.post(
        "/auth/passkey/auth-verify",
        params={"user_id": "F6AHWalletJ52R"},
        headers={"Origin": "https://app.ks.aileena.xyz"},
        json={"credential": {"id": "abc", "rawId": "abc"}, "passphrase": ""},
    )
    assert res.status_code == 400, res.text
    body = res.json()
    assert body["code"] == "challenge_expired"
    assert body["error"]
    assert "Sign In" in body["detail"]
    assert not any("\u4e00" <= ch <= "\u9fff" for ch in body["detail"] + body["error"])


def test_challenge_survives_in_memory_clear(tmp_path, monkeypatch):
    _iso_passkey_db(tmp_path, monkeypatch)
    pk_mod._stash_challenge(
        "alice",
        "auth",
        "challenge-token",
        "app.ks.aileena.xyz",
        ["https://app.ks.aileena.xyz"],
    )
    pk_mod._PENDING_AUTHS.clear()
    rec = pk_mod._pop_challenge("alice", "auth")
    assert rec is not None
    assert rec["challenge"] == "challenge-token"
    assert rec["rp_id"] == "app.ks.aileena.xyz"
    assert "https://app.ks.aileena.xyz" in rec["origins"]


def test_unknown_credential_after_challenge(tmp_path, monkeypatch):
    _iso_passkey_db(tmp_path, monkeypatch)
    pk_mod._stash_challenge("alice", "auth", "challenge-token", "localhost", None)
    client = TestClient(app)
    res = client.post(
        "/auth/passkey/auth-verify",
        params={"user_id": "alice"},
        json={"credential": {"id": "not-a-real-cred"}},
    )
    assert res.status_code == 401, res.text
    body = res.json()
    assert body["code"] == "unknown_credential"
    assert "Forget this device" in body["detail"]
    assert not any("\u4e00" <= ch <= "\u9fff" for ch in body["detail"] + body["error"])


def test_cred_id_candidates_include_padding():
    ids = pk_mod._cred_id_candidates({"id": "abcd+/ef", "rawId": "abcd+/ef=="})
    assert "abcd+/ef" in ids
    assert "abcd-_ef" in ids
    assert any(x.rstrip("=") == "abcd-_ef" or x.rstrip("=") == "abcd+/ef" for x in ids)


def test_json_error_has_both_error_and_detail():
    from src.backend.routes.auth import _passkey_json_error

    resp = _passkey_json_error(
        pk_mod.PasskeyError(pk_mod._NO_PASSKEY, "no passkey enrolled on the server")
    )
    assert resp.status_code == 404
    payload = resp.body
    assert b'"error"' in payload
    assert b'"detail"' in payload
    assert b'"code"' in payload
    assert not any("\u4e00" <= ch <= "\u9fff" for ch in payload.decode("utf-8"))
