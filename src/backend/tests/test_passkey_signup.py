"""Passkey-first signup: a brand-new user creates an account with no wallet."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import passkey as pk_mod
from src.backend.auth import session as sess_mod
from src.backend.billing import plans as plans_mod
from src.backend.tests.test_passkey_register_then_login import ORIGIN, SoftAuthenticator

H = {"Origin": ORIGIN}


def _client(tmp_path, monkeypatch):
    monkeypatch.setattr(pk_mod, "DB_PATH", tmp_path / "keyshield.db")
    pk_mod._PENDING_AUTHS.clear()
    pk_mod._PENDING_REGS.clear()
    pk_mod._init_db()
    monkeypatch.setattr(plans_mod, "DB_PATH", tmp_path / "usage.db")
    return TestClient(app)


def test_signup_then_passkey_login(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()
    r = c.get("/auth/passkey/signup-options", headers=H)
    assert r.status_code == 200, r.text
    uid = r.json()["ksUserId"]
    assert uid.startswith("pk_")
    r = c.post(
        "/auth/passkey/signup-verify",
        headers=H,
        json={"userId": uid, "credential": auth.create(r.json()), "name": "Mac"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["userId"] == uid and sess_mod.get(r.json()["token"])
    r = c.get("/auth/passkey/auth-options", params={"user_id": uid}, headers=H)
    r = c.post(
        "/auth/passkey/auth-verify",
        params={"user_id": uid},
        headers=H,
        json={"credential": auth.get(r.json())},
    )
    assert r.status_code == 200 and r.json()["userId"] == uid


def test_signup_cannot_target_existing_or_unminted_ids(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()
    # Existing wallet user with a normal "reg" challenge pending.
    victim = "F6AHWalletJ52R"
    tok = sess_mod.create_token(victim, "")
    opts = c.get(
        "/auth/passkey/register-options", headers={**H, "Authorization": f"Bearer {tok}"}
    ).json()
    cred = auth.create(opts)
    for uid in (victim, "pk_never_minted"):
        r = c.post(
            "/auth/passkey/signup-verify", headers=H, json={"userId": uid, "credential": cred}
        )
        assert r.status_code == 400, (uid, r.text)
    assert pk_mod.list_credentials(victim) == []


def test_signup_cannot_steal_existing_credential_id(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()
    victim = "F6AHWalletJ52R"
    hdr = {**H, "Authorization": f"Bearer {sess_mod.create_token(victim, '')}"}
    opts = c.get("/auth/passkey/register-options", headers=hdr).json()
    assert (
        c.post(
            "/auth/passkey/register-verify", headers=hdr, json={"credential": auth.create(opts)}
        ).status_code
        == 200
    )
    r = c.get("/auth/passkey/signup-options", headers=H)
    r = c.post(
        "/auth/passkey/signup-verify",
        headers=H,
        json={"userId": r.json()["ksUserId"], "credential": auth.create(r.json())},
    )
    assert r.status_code == 400
    assert len(pk_mod.list_credentials(victim)) == 1
