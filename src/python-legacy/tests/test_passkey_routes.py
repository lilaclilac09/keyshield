"""
HTTP route tests for /auth/passkey/* — the WebAuthn registration +
authentication flow.

These routes are thin wrappers around src.passkey, which itself wraps
@simplewebauthn/server. We mock the passkey module so we can test the
HTTP-layer contract (auth gating, error mapping, session creation) in
isolation from the WebAuthn cryptography (which has its own upstream
test suite).

  GET    /auth/passkey/register-options   Bearer    → opts
  POST   /auth/passkey/register-verify    Bearer    → {ok}
  GET    /auth/passkey/auth-options       ?user_id  → opts (pre-auth)
  POST   /auth/passkey/auth-verify        ?user_id&passphrase → {token}
  GET    /auth/passkey/list               Bearer    → {credentials}
  DELETE /auth/passkey/{cred_id}          Bearer    → {ok}

Run:
  cd v2-mvp && pytest tests/test_passkey_routes.py -v
"""

import pytest


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from pathlib import Path
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
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
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── /auth/passkey/register-options ────────────────────────────────────────


class TestRegisterOptions:
    def test_requires_bearer_token(self, client):
        r = client.get("/auth/passkey/register-options")
        assert r.status_code == 401

    def test_returns_options_from_passkey_module(self, client, login, monkeypatch):
        from src import passkey

        canned = {
            "challenge": "abc",
            "rp": {"name": "KeyShield", "id": "localhost"},
            "user": {"id": "alice", "name": "alice", "displayName": "alice"},
            "pubKeyCredParams": [{"alg": -7, "type": "public-key"}],
        }
        monkeypatch.setattr(
            passkey,
            "registration_options",
            lambda user_id, display_name: canned,
        )
        r = client.get("/auth/passkey/register-options", headers=_auth(login))
        assert r.status_code == 200
        assert r.json() == canned

    def test_passes_session_user_id(self, client, login, monkeypatch):
        from src import passkey

        captured = {}

        def fake(user_id, display_name):
            captured["user_id"] = user_id
            captured["display_name"] = display_name
            return {"challenge": "x"}

        monkeypatch.setattr(passkey, "registration_options", fake)
        client.get("/auth/passkey/register-options", headers=_auth(login))
        assert captured["user_id"] == "alice"
        # display_name defaults to user_id per the route.
        assert captured["display_name"] == "alice"

    def test_400_on_passkey_module_error(self, client, login, monkeypatch):
        from src import passkey

        def boom(*a, **k):
            raise RuntimeError("passkey module exploded")

        monkeypatch.setattr(passkey, "registration_options", boom)
        r = client.get("/auth/passkey/register-options", headers=_auth(login))
        assert r.status_code == 400
        assert "exploded" in r.json()["detail"]


# ─── /auth/passkey/register-verify ────────────────────────────────────────


class TestRegisterVerify:
    def test_requires_bearer_token(self, client):
        r = client.post(
            "/auth/passkey/register-verify",
            json={"credential": {}, "name": "x"},
        )
        assert r.status_code == 401

    def test_forwards_credential_and_name_to_passkey_module(
        self, client, login, monkeypatch
    ):
        from src import passkey

        captured = {}

        def fake(user_id, credential, name):
            captured.update({"user_id": user_id, "credential": credential, "name": name})
            return {"ok": True, "credentialId": "cred-x"}

        monkeypatch.setattr(passkey, "registration_verify", fake)
        r = client.post(
            "/auth/passkey/register-verify",
            headers=_auth(login),
            json={"credential": {"id": "abc", "raw": True}, "name": "MacBook Pro"},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert captured["user_id"] == "alice"
        assert captured["credential"]["id"] == "abc"
        assert captured["name"] == "MacBook Pro"

    def test_default_name_when_omitted(self, client, login, monkeypatch):
        from src import passkey

        captured = {}

        def fake(user_id, credential, name):
            captured["name"] = name
            return {"ok": True}

        monkeypatch.setattr(passkey, "registration_verify", fake)
        client.post(
            "/auth/passkey/register-verify",
            headers=_auth(login),
            json={"credential": {}},
        )
        # Body model defaults `name = "Passkey"`.
        assert captured["name"] == "Passkey"

    def test_400_when_verification_throws(self, client, login, monkeypatch):
        from src import passkey

        def boom(*a, **k):
            raise ValueError("bad attestation")

        monkeypatch.setattr(passkey, "registration_verify", boom)
        r = client.post(
            "/auth/passkey/register-verify",
            headers=_auth(login),
            json={"credential": {}},
        )
        assert r.status_code == 400
        assert "bad attestation" in r.json()["detail"]


# ─── /auth/passkey/auth-options (pre-auth, no Bearer) ─────────────────────


class TestAuthOptions:
    def test_works_without_bearer(self, client, monkeypatch):
        from src import passkey

        canned = {"challenge": "yyy", "allowCredentials": []}
        monkeypatch.setattr(
            passkey, "authentication_options", lambda user_id: canned
        )
        r = client.get("/auth/passkey/auth-options?user_id=alice")
        assert r.status_code == 200
        assert r.json() == canned

    def test_passes_user_id_query_param(self, client, monkeypatch):
        from src import passkey

        captured = {}

        def fake(user_id):
            captured["user_id"] = user_id
            return {"challenge": "x"}

        monkeypatch.setattr(passkey, "authentication_options", fake)
        client.get("/auth/passkey/auth-options?user_id=bob")
        assert captured["user_id"] == "bob"

    def test_missing_user_id_returns_422(self, client):
        # FastAPI auto-422 when a required query param is missing.
        r = client.get("/auth/passkey/auth-options")
        assert r.status_code == 422

    def test_400_when_passkey_module_raises(self, client, monkeypatch):
        from src import passkey

        def boom(*a, **k):
            raise RuntimeError("user has no passkeys")

        monkeypatch.setattr(passkey, "authentication_options", boom)
        r = client.get("/auth/passkey/auth-options?user_id=alice")
        assert r.status_code == 400
        assert "no passkeys" in r.json()["detail"]


# ─── /auth/passkey/auth-verify (pre-auth, creates session) ────────────────


class TestAuthVerify:
    def test_creates_session_on_successful_verify(self, client, monkeypatch):
        from src import passkey

        monkeypatch.setattr(
            passkey, "authentication_verify", lambda user_id, credential: True
        )
        r = client.post(
            "/auth/passkey/auth-verify?user_id=alice&passphrase=pw",
            json={"credential": {"id": "abc"}},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["userId"] == "alice"
        assert isinstance(body["token"], str)
        assert len(body["token"]) == 64  # 32-byte hex token from session.create

    def test_token_actually_works_for_subsequent_calls(self, client, monkeypatch):
        from src import passkey

        monkeypatch.setattr(
            passkey, "authentication_verify", lambda user_id, credential: True
        )
        r = client.post(
            "/auth/passkey/auth-verify?user_id=alice&passphrase=pw",
            json={"credential": {}},
        )
        token = r.json()["token"]
        # Use it on a Bearer-gated route.
        r2 = client.get("/manage/list", headers=_auth(token))
        assert r2.status_code == 200

    def test_401_on_failed_verification(self, client, monkeypatch):
        from src import passkey

        def boom(*a, **k):
            raise ValueError("invalid signature")

        monkeypatch.setattr(passkey, "authentication_verify", boom)
        r = client.post(
            "/auth/passkey/auth-verify?user_id=alice&passphrase=pw",
            json={"credential": {}},
        )
        assert r.status_code == 401
        assert "invalid signature" in r.json()["detail"]


# ─── /auth/passkey/list + DELETE /auth/passkey/{cred_id} ──────────────────


class TestListAndDelete:
    def test_list_requires_bearer(self, client):
        r = client.get("/auth/passkey/list")
        assert r.status_code == 401

    def test_list_returns_credentials_array(self, client, login, monkeypatch):
        from src import passkey

        canned = [
            {"credentialId": "c1", "name": "MacBook", "createdAt": 1},
            {"credentialId": "c2", "name": "iPhone", "createdAt": 2},
        ]
        monkeypatch.setattr(passkey, "list_credentials", lambda user_id: canned)
        r = client.get("/auth/passkey/list", headers=_auth(login))
        assert r.status_code == 200
        assert r.json()["credentials"] == canned

    def test_list_passes_session_user_id(self, client, login, monkeypatch):
        from src import passkey

        captured = {}

        def fake(user_id):
            captured["user_id"] = user_id
            return []

        monkeypatch.setattr(passkey, "list_credentials", fake)
        client.get("/auth/passkey/list", headers=_auth(login))
        assert captured["user_id"] == "alice"

    def test_delete_requires_bearer(self, client):
        r = client.delete("/auth/passkey/some-cred")
        assert r.status_code == 401

    def test_delete_passes_user_and_cred_id(self, client, login, monkeypatch):
        from src import passkey

        captured = {}

        def fake(user_id, cred_id):
            captured.update({"user_id": user_id, "cred_id": cred_id})

        monkeypatch.setattr(passkey, "delete_credential", fake)
        r = client.delete("/auth/passkey/abc-123", headers=_auth(login))
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        assert captured == {"user_id": "alice", "cred_id": "abc-123"}
