"""Registered userId + password must open a session."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod


def _iso(tmp_path, monkeypatch):
    from src.backend.auth import ratelimit as rl_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setenv("SERVER_SECRET", "test-password-login-secret")
    rl_mod.login_limiter.reset()


def test_first_login_registers_and_opens_session(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.post("/auth/login", json={"userId": "alice", "password": "hunter2"})
    assert res.status_code == 200
    body = res.json()
    assert body["userId"] == "alice"
    assert body["registered"] is True
    assert body["token"]
    me = sess_mod.get(body["token"])
    assert me is not None
    assert me["user_id"] == "alice"


def test_registered_password_opens_app_again(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    first = client.post("/auth/login", json={"userId": "alice", "password": "hunter2"})
    assert first.status_code == 200
    again = client.post("/auth/login", json={"userId": "alice", "password": "hunter2"})
    assert again.status_code == 200
    body = again.json()
    assert body["registered"] is False
    assert body["token"]
    assert sess_mod.get(body["token"])["user_id"] == "alice"


def test_wrong_password_is_401(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    client.post("/auth/login", json={"userId": "alice", "password": "hunter2"})
    bad = client.post("/auth/login", json={"userId": "alice", "password": "wrong"})
    assert bad.status_code == 401
    assert bad.json()["error"] == "invalid credentials"
    assert bad.json()["detail"] == "invalid credentials"


def test_empty_fields_are_400(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    assert client.post("/auth/login", json={"userId": "", "password": "pw"}).status_code == 400
    assert client.post("/auth/login", json={"userId": "alice", "password": ""}).status_code == 400


def test_deleted_account_cannot_login(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    client.post("/auth/login", json={"userId": "alice", "password": "hunter2"})
    sess_mod.mark_deleted("alice")
    res = client.post("/auth/login", json={"userId": "alice", "password": "hunter2"})
    assert res.status_code == 403
    assert res.json()["error"] == "account deleted"


def test_token_can_call_authed_route(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    token = client.post("/auth/login", json={"userId": "alice", "password": "hunter2"}).json()[
        "token"
    ]
    sessions = client.get("/sessions", headers={"Authorization": f"Bearer {token}"})
    assert sessions.status_code == 200
    assert sessions.json()["sessions"]


def test_gmail_signup_then_login(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    email = "aileen@gmail.com"
    created = client.post("/auth/signup", json={"email": email, "password": "keychain1"})
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["userId"] == email
    assert body["registered"] is True
    assert body["token"]
    again = client.post("/auth/login", json={"email": "Aileen@Gmail.com", "password": "keychain1"})
    assert again.status_code == 200
    assert again.json()["registered"] is False
    assert sess_mod.get(again.json()["token"])["user_id"] == email


def test_signup_duplicate_email_is_409(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    first = client.post("/auth/signup", json={"email": "you@gmail.com", "password": "keychain1"})
    assert first.status_code == 200
    dup = client.post("/auth/signup", json={"email": "you@gmail.com", "password": "keychain1"})
    assert dup.status_code == 409
    assert "already exists" in dup.json()["error"]
    assert "Next step" in dup.json()["detail"]


def test_signup_rejects_short_password_and_bad_email(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    short = client.post("/auth/signup", json={"email": "you@gmail.com", "password": "short"})
    assert short.status_code == 400
    bad = client.post("/auth/signup", json={"email": "not-an-email", "password": "keychain1"})
    assert bad.status_code == 400
    missing = client.post("/auth/signup", json={"userId": "alice", "password": "keychain1"})
    assert missing.status_code == 400


def test_login_accepts_email_alias_for_new_account(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.post("/auth/login", json={"email": "bot@gmail.com", "password": "hunter2"})
    assert res.status_code == 200
    assert res.json()["userId"] == "bot@gmail.com"
    assert res.json()["registered"] is True


def test_gmail_signup_can_list_and_store_vault(tmp_path, monkeypatch):
    from src.backend.routes import vault as vault_mod

    _iso(tmp_path, monkeypatch)
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    client = TestClient(app)
    created = client.post(
        "/auth/signup", json={"email": "aileen@gmail.com", "password": "keychain1"}
    )
    assert created.status_code == 200, created.text
    token = created.json()["token"]
    hdr = {"Authorization": f"Bearer {token}"}
    listed = client.get("/manage/vault", headers=hdr)
    assert listed.status_code == 200, listed.text
    assert isinstance(listed.json(), list)
    store = client.post(
        "/manage/store",
        headers=hdr,
        json={"upstream": "openai", "apiKey": "sk-proj-testkey-not-real-0000"},
    )
    assert store.status_code == 200, store.text
    again = client.get("/manage/vault", headers=hdr)
    assert again.status_code == 200, again.text
    rows = again.json()
    assert isinstance(rows, list)
    assert any(row.get("upstream") == "openai" for row in rows)
    home = client.get("/keychain/home", headers=hdr)
    assert home.status_code == 200, home.text
