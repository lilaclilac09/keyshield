"""
HTTP route tests for /manage/* — the user-facing vault management
endpoints. They sit on top of vault.py (already covered by
test_modules.py) but also do auth, error mapping, and metadata
shaping that's worth pinning at the route layer.

  POST   /manage/store           {upstream, apiKey} → {ok}
  GET    /manage/list                                → {keys, items}
  GET    /manage/decrypt/{u}                         → {upstream, key}
  DELETE /manage/secret/{u}                          → {ok}

Run:
  cd v2-mvp && pytest tests/test_manage_routes.py -v
"""

import pytest


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from pathlib import Path
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
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


# ─── /manage/store ────────────────────────────────────────────────────────


class TestStore:
    def test_requires_bearer_token(self, client):
        r = client.post(
            "/manage/store",
            json={"upstream": "openai", "apiKey": "sk-x"},
        )
        assert r.status_code == 401

    def test_rejects_unknown_upstream(self, client, login):
        r = client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "notarealthing", "apiKey": "sk-x"},
        )
        assert r.status_code == 400
        # Server lists allowed upstreams in the error message — assert
        # at least one known one shows up so we know it's the right
        # branch firing.
        assert "openai" in r.json()["detail"]

    def test_accepts_user_namespaced_upstreams(self, client, login):
        """Server accepts upstreams starting with `pw__`, `note__`,
        `env__`, `ssh__` as user-arbitrary slots."""
        for prefix in ("pw__github", "note__diary", "env__myapp", "ssh__work"):
            r = client.post(
                "/manage/store",
                headers=_auth(login),
                json={"upstream": prefix, "apiKey": "secret"},
            )
            assert r.status_code == 200, f"{prefix} → {r.text}"

    def test_happy_path(self, client, login):
        r = client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-real"},
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_overwrites_existing_key(self, client, login):
        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "old"},
        )
        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "new"},
        )
        # Verify by reading back.
        got = client.get("/manage/decrypt/openai", headers=_auth(login))
        assert got.json()["key"] == "new"

    def test_rejects_malformed_body(self, client, login):
        r = client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai"},  # missing apiKey
        )
        assert r.status_code == 422  # FastAPI validation


# ─── /manage/list ─────────────────────────────────────────────────────────


class TestList:
    def test_requires_bearer_token(self, client):
        r = client.get("/manage/list")
        assert r.status_code == 401

    def test_empty_when_user_has_no_keys(self, client, login):
        r = client.get("/manage/list", headers=_auth(login))
        assert r.status_code == 200
        body = r.json()
        assert body["keys"] == []
        assert body["items"] == []

    def test_lists_all_stored_upstreams_with_metadata(self, client, login):
        # Use upstreams the server actually supports.
        for upstream in ["openai", "anthropic", "groq"]:
            r = client.post(
                "/manage/store",
                headers=_auth(login),
                json={"upstream": upstream, "apiKey": f"sk-{upstream}"},
            )
            assert r.status_code == 200, f"{upstream}: {r.text}"

        r = client.get("/manage/list", headers=_auth(login))
        body = r.json()
        # `keys` is a flat list of upstream slugs.
        assert set(body["keys"]) == {"openai", "anthropic", "groq"}
        # `items` carries timestamps for the popup's "last used" UI.
        for item in body["items"]:
            assert "upstream" in item
            assert isinstance(item["createdAt"], int)
            assert isinstance(item["updatedAt"], int)

    def test_doesnt_leak_other_users_keys(self, client):
        # Two separate users.
        a = client.post("/auth/login", json={"userId": "alice", "password": "pa"}).json()["token"]
        b = client.post("/auth/login", json={"userId": "bob", "password": "pb"}).json()["token"]

        client.post("/manage/store", headers=_auth(a), json={"upstream": "openai", "apiKey": "alice-key"})
        client.post("/manage/store", headers=_auth(b), json={"upstream": "anthropic", "apiKey": "bob-key"})

        a_list = client.get("/manage/list", headers=_auth(a)).json()
        b_list = client.get("/manage/list", headers=_auth(b)).json()
        assert a_list["keys"] == ["openai"]
        assert b_list["keys"] == ["anthropic"]


# ─── /manage/decrypt/{upstream} ───────────────────────────────────────────


class TestDecrypt:
    def test_requires_bearer_token(self, client):
        r = client.get("/manage/decrypt/openai")
        assert r.status_code == 401

    def test_returns_plaintext_for_owner(self, client, login):
        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-secret"},
        )
        r = client.get("/manage/decrypt/openai", headers=_auth(login))
        assert r.status_code == 200
        assert r.json() == {"upstream": "openai", "key": "sk-secret"}

    def test_returns_404_for_missing_upstream(self, client, login):
        r = client.get("/manage/decrypt/never-stored", headers=_auth(login))
        assert r.status_code == 404
        assert "not found" in r.json()["detail"].lower() or "wrong" in r.json()["detail"].lower()

    def test_isolated_per_user(self, client):
        a = client.post("/auth/login", json={"userId": "alice", "password": "pa"}).json()["token"]
        b = client.post("/auth/login", json={"userId": "bob", "password": "pb"}).json()["token"]

        client.post(
            "/manage/store",
            headers=_auth(a),
            json={"upstream": "openai", "apiKey": "alice-private"},
        )
        # Bob asks for Alice's key — must 404 (or be wrong-pass which the
        # route flattens to 404 for security).
        r = client.get("/manage/decrypt/openai", headers=_auth(b))
        assert r.status_code == 404


# ─── /manage/secret/{upstream} (DELETE) ───────────────────────────────────


class TestDelete:
    def test_requires_bearer_token(self, client):
        r = client.delete("/manage/secret/openai")
        assert r.status_code == 401

    def test_removes_a_stored_key(self, client, login):
        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-x"},
        )
        r = client.delete("/manage/secret/openai", headers=_auth(login))
        assert r.status_code == 200

        # And it's actually gone.
        r2 = client.get("/manage/decrypt/openai", headers=_auth(login))
        assert r2.status_code == 404

    def test_silent_when_key_never_existed(self, client, login):
        r = client.delete("/manage/secret/never-stored", headers=_auth(login))
        # vault.delete uses missing_ok=True; route returns 200.
        assert r.status_code == 200

    def test_doesnt_cross_user_boundaries(self, client):
        a = client.post("/auth/login", json={"userId": "alice", "password": "pa"}).json()["token"]
        b = client.post("/auth/login", json={"userId": "bob", "password": "pb"}).json()["token"]
        client.post(
            "/manage/store",
            headers=_auth(a),
            json={"upstream": "openai", "apiKey": "alice-only"},
        )

        # Bob tries to delete Alice's key. Route returns 200 (silent),
        # but Alice's key must still exist.
        r = client.delete("/manage/secret/openai", headers=_auth(b))
        assert r.status_code == 200
        still = client.get("/manage/decrypt/openai", headers=_auth(a))
        assert still.status_code == 200
        assert still.json()["key"] == "alice-only"
