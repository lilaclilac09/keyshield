"""
Tests for vault secret sharing via one-time links.

Covers:
  - test_create_share_bad_passphrase  → 401
  - test_create_and_access_share      → full roundtrip
  - test_share_expires                → 410 after expiry
  - test_revoke_share                 → 404 after revoke

Run:
  cd v2-mvp && pytest tests/test_sharing.py -v --tb=short
"""

import time
import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    """Wire all DBs and vault to tmp_path so tests don't share state."""
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import shares as shares_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(shares_mod, "DB_PATH", Path(tmp_path / "data" / "shares.db"))
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    server._CACHE.clear()
    return TestClient(server.app)


@pytest.fixture
def auth(client):
    """Log in as alice with a vault containing an 'openai' key, return token."""
    from src import vault as vault_mod
    from src import session as session_mod
    from pathlib import Path

    # Store an openai key in alice's vault
    vault_mod.store("alice", "openai", "sk-test-secret", "hunter2")

    r = client.post("/auth/login", json={"userId": "alice", "password": "hunter2"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _hdrs(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── create share ──────────────────────────────────────────────────────────────

class TestCreateShare:
    def test_requires_auth(self, client):
        r = client.post(
            "/manage/shares",
            json={"upstream": "openai", "passphrase": "hunter2"},
        )
        assert r.status_code == 401

    def test_create_share_bad_passphrase(self, client, auth):
        """Wrong passphrase → 401."""
        r = client.post(
            "/manage/shares",
            headers=_hdrs(auth),
            json={"upstream": "openai", "passphrase": "wrongpassword"},
        )
        assert r.status_code == 401

    def test_create_share_unknown_upstream(self, client, auth):
        """Vault item that doesn't exist → 401 (same as wrong passphrase)."""
        r = client.post(
            "/manage/shares",
            headers=_hdrs(auth),
            json={"upstream": "anthropic", "passphrase": "hunter2"},
        )
        assert r.status_code == 401

    def test_create_share_returns_token_and_id(self, client, auth):
        r = client.post(
            "/manage/shares",
            headers=_hdrs(auth),
            json={"upstream": "openai", "passphrase": "hunter2"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert "token" in data
        assert "expires_at" in data
        # Token should be a 64-char hex string (32 bytes)
        assert len(data["token"]) == 64

    def test_ttl_capped_at_7_days(self, client, auth):
        r = client.post(
            "/manage/shares",
            headers=_hdrs(auth),
            json={"upstream": "openai", "passphrase": "hunter2", "ttl_hours": 9999},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        now = int(time.time())
        max_expires = now + 168 * 3600 + 5  # 7 days + 5s grace
        assert data["expires_at"] <= max_expires


# ─── access share ─────────────────────────────────────────────────────────────

class TestAccessShare:
    def _create(self, client, token, **extra):
        body = {"upstream": "openai", "passphrase": "hunter2", **extra}
        r = client.post("/manage/shares", headers=_hdrs(token), json=body)
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_and_access_share(self, client, auth):
        """Full roundtrip: create → access → see plaintext."""
        share = self._create(client, auth)
        r = client.get(f"/share/{share['token']}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["upstream"] == "openai"
        assert data["value"] == "sk-test-secret"
        assert "expires_at" in data
        assert data["views_remaining"] == 0  # 1 max_view consumed

    def test_second_access_fails_after_max_views(self, client, auth):
        """After max_views reached the link returns 410."""
        share = self._create(client, auth, max_views=1)
        # first access
        r1 = client.get(f"/share/{share['token']}")
        assert r1.status_code == 200
        # second access should 410
        r2 = client.get(f"/share/{share['token']}")
        assert r2.status_code == 410

    def test_unlimited_views(self, client, auth):
        """max_views=-1 allows many accesses."""
        share = self._create(client, auth, max_views=-1)
        for _ in range(5):
            r = client.get(f"/share/{share['token']}")
            assert r.status_code == 200
            assert r.json()["views_remaining"] == -1

    def test_bad_token_returns_404(self, client):
        r = client.get("/share/" + "aa" * 32)  # valid hex but unknown
        assert r.status_code == 404

    def test_share_expires(self, client, auth, monkeypatch):
        """
        Simulate share expiry by monkeypatching time.time in shares module
        to be past expires_at after creation.
        """
        from src import shares as shares_mod

        share = self._create(client, auth, ttl_hours=1)
        expires_at = share["expires_at"]

        # Patch time.time to return a timestamp after expiry
        monkeypatch.setattr(shares_mod.time, "time", lambda: expires_at + 1)

        r = client.get(f"/share/{share['token']}")
        assert r.status_code == 410


# ─── list shares ──────────────────────────────────────────────────────────────

class TestListShares:
    def test_list_returns_created_shares(self, client, auth):
        client.post(
            "/manage/shares",
            headers=_hdrs(auth),
            json={"upstream": "openai", "passphrase": "hunter2"},
        )
        r = client.get("/manage/shares", headers=_hdrs(auth))
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) == 1
        assert items[0]["upstream"] == "openai"
        assert items[0]["expired"] is False

    def test_list_requires_auth(self, client):
        r = client.get("/manage/shares")
        assert r.status_code == 401


# ─── revoke share ─────────────────────────────────────────────────────────────

class TestRevokeShare:
    def test_revoke_share(self, client, auth):
        """After revoke, accessing the token returns 404."""
        r = client.post(
            "/manage/shares",
            headers=_hdrs(auth),
            json={"upstream": "openai", "passphrase": "hunter2"},
        )
        share = r.json()

        del_r = client.delete(f"/manage/shares/{share['id']}", headers=_hdrs(auth))
        assert del_r.status_code == 200, del_r.text

        # Token should now be gone
        get_r = client.get(f"/share/{share['token']}")
        assert get_r.status_code == 404

    def test_revoke_nonexistent_returns_404(self, client, auth):
        r = client.delete("/manage/shares/does-not-exist", headers=_hdrs(auth))
        assert r.status_code == 404

    def test_revoke_requires_auth(self, client):
        r = client.delete("/manage/shares/some-id")
        assert r.status_code == 401
