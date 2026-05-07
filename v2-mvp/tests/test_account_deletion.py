"""
Tests for DELETE /auth/account — account deletion endpoint.

Covers:
  - Requires a valid session (401 without auth)
  - Wrong confirm_phrase → 400
  - Correct phrase → 200, vault files erased, sessions gone, usage erased,
    agents erased, passkeys erased
"""

import json
import pytest
from pathlib import Path


def _delete(client, url: str, body: dict | None = None, headers: dict | None = None):
    """client.delete() doesn't accept json= in this TestClient version — use request()."""
    kwargs: dict = {}
    if body is not None:
        kwargs["content"] = json.dumps(body)
        kwargs["headers"] = {**(headers or {}), "Content-Type": "application/json"}
    elif headers:
        kwargs["headers"] = headers
    return client.request("DELETE", url, **kwargs)


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import passkey as passkey_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(passkey_mod, "DB_PATH", Path(tmp_path / "keyshield.db"))
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    server._CACHE.clear()
    return TestClient(server.app)


@pytest.fixture
def login(client):
    r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
    assert r.status_code == 200
    return r.json()["token"]


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


class TestDeleteAccountRequiresAuth:
    def test_no_auth_returns_401(self, client):
        r = _delete(client, "/auth/account", {"confirm_phrase": "DELETE MY ACCOUNT"})
        assert r.status_code == 401

    def test_bad_token_returns_401(self, client):
        r = _delete(
            client, "/auth/account",
            {"confirm_phrase": "DELETE MY ACCOUNT"},
            {"Authorization": "Bearer notarealtoken"},
        )
        assert r.status_code == 401


class TestDeleteAccountRequiresConfirmPhrase:
    def test_wrong_phrase_returns_400(self, client, login):
        r = _delete(client, "/auth/account", {"confirm_phrase": "delete my account"}, _auth(login))
        assert r.status_code == 400
        assert "confirm_phrase" in r.json()["detail"]

    def test_empty_phrase_returns_400(self, client, login):
        r = _delete(client, "/auth/account", {"confirm_phrase": ""}, _auth(login))
        assert r.status_code == 400

    def test_close_but_wrong_phrase_returns_400(self, client, login):
        r = _delete(client, "/auth/account", {"confirm_phrase": "DELETE MY ACCOUNT "}, _auth(login))
        assert r.status_code == 400

    def test_missing_field_returns_422(self, client, login):
        r = _delete(client, "/auth/account", {}, _auth(login))
        assert r.status_code == 422


class TestDeleteAccountFullFlow:
    def test_returns_200_and_deleted_true(self, client, login):
        r = _delete(client, "/auth/account", {"confirm_phrase": "DELETE MY ACCOUNT"}, _auth(login))
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["deleted"] is True

    def test_vault_files_removed(self, client, login, tmp_path):
        from src import vault, session

        tok = login
        sess = session.get(tok)
        vault.store(sess["user_id"], "openai", "sk-test-key", sess["password"])
        vault_dir = vault.VAULT_DIR / sess["user_id"]
        assert vault_dir.exists()

        _delete(client, "/auth/account", {"confirm_phrase": "DELETE MY ACCOUNT"}, _auth(tok))

        assert not vault_dir.exists()

    def test_session_invalidated_after_deletion(self, client, login):
        _delete(client, "/auth/account", {"confirm_phrase": "DELETE MY ACCOUNT"}, _auth(login))
        r = client.get("/usage/stats", headers=_auth(login))
        assert r.status_code == 401

    def test_usage_records_erased(self, client, login):
        from src import usage, session

        tok = login
        sess = session.get(tok)
        usage.log_call(
            sess["user_id"], "openai", "self_custodian", "POST", "/v1",
            100, 200, 0.003, 50.0, 200,
        )
        stats_before = usage.get_stats(sess["user_id"])
        assert stats_before["stats"]

        _delete(client, "/auth/account", {"confirm_phrase": "DELETE MY ACCOUNT"}, _auth(tok))

        stats_after = usage.get_stats(sess["user_id"])
        assert stats_after["stats"] == []

    def test_agents_erased(self, client, login):
        from src import agents, session

        tok = login
        sess = session.get(tok)
        agents.register(sess["user_id"], "FakeAgentPubkey123", "bot")

        before = agents.list_agents(sess["user_id"])
        assert len(before) == 1

        _delete(client, "/auth/account", {"confirm_phrase": "DELETE MY ACCOUNT"}, _auth(tok))

        after = agents.list_agents(sess["user_id"])
        assert after == []

    def test_no_vault_dir_does_not_crash(self, client, login):
        r = _delete(client, "/auth/account", {"confirm_phrase": "DELETE MY ACCOUNT"}, _auth(login))
        assert r.status_code == 200
