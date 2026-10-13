"""Registered userId + password must open a session."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod


def _iso(tmp_path, monkeypatch):
    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setenv("SERVER_SECRET", "test-password-login-secret")


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
