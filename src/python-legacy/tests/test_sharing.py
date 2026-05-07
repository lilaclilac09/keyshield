"""
Tests for the /share/* endpoints + sharing.py persistence module.

Covers:
  - 501 contract on /share/grant (DEK re-wrap not yet implemented)
  - List/revoke round trip via sharing.grant() at the module layer
  - Per-tenant isolation: alice cannot see/revoke bob's shares
  - Account-deletion cascade purges share rows the user is part of

Run with:
  cd v2-mvp && .venv/bin/python -m pytest tests/test_sharing.py -v
"""

from __future__ import annotations

import pytest


# ─── fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from pathlib import Path
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import sharing as sharing_mod

    monkeypatch.setattr(vault_mod,   "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH",   Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod,  "DB_PATH",   Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod,   "DB_PATH",   Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(sharing_mod, "DB_PATH",   Path(tmp_path / "data" / "sharing.db"))
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    return TestClient(server.app)


def _login(client, user_id: str = "alice") -> str:
    resp = client.post("/auth/login", json={"userId": user_id, "password": "p"})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


# ─── /share/grant — 501 stub contract ────────────────────────────────────


class TestGrant501:
    def test_grant_returns_501_with_explanation(self, client):
        from src import vault

        token = _login(client, "alice")
        vault.store("alice", "openai", "sk-secret", "p")

        resp = client.post(
            "/share/grant",
            headers={"Authorization": f"Bearer {token}"},
            json={"key_name": "openai", "recipient_user_id": "bob"},
        )
        assert resp.status_code == 501
        detail = resp.json()["detail"]
        assert "passkey" in detail.lower()
        assert "v2" in detail.lower()

    def test_grant_404_when_key_not_in_vault(self, client):
        """Non-existent keys return 404 even before the 501 gate so the
        UI's error surface is precise. Order matters: 404 before 501 because
        a missing key is a real precondition failure on any branch."""
        token = _login(client, "alice")
        resp = client.post(
            "/share/grant",
            headers={"Authorization": f"Bearer {token}"},
            json={"key_name": "openai", "recipient_user_id": "bob"},
        )
        assert resp.status_code == 404

    def test_self_share_rejected(self, client):
        from src import vault

        token = _login(client, "alice")
        vault.store("alice", "openai", "sk-secret", "p")
        resp = client.post(
            "/share/grant",
            headers={"Authorization": f"Bearer {token}"},
            json={"key_name": "openai", "recipient_user_id": "alice"},
        )
        assert resp.status_code == 400
        assert "yourself" in resp.json()["detail"]

    def test_unauthenticated_grant_is_401(self, client):
        resp = client.post(
            "/share/grant",
            json={"key_name": "openai", "recipient_user_id": "bob"},
        )
        assert resp.status_code == 401


# ─── List / revoke round trip via the module layer ──────────────────────────
#
# /share/grant is 501 on this branch, so we exercise the table directly via
# sharing.grant() to test that the read endpoints + revoke flow are wired
# correctly. When the 501 lifts, these tests still pass without modification.


class TestListAndRevoke:
    def test_outgoing_lists_owner_grants(self, client):
        from src import sharing

        token = _login(client, "alice")
        sharing.grant("alice", "bob",     "openai",    None, None)
        sharing.grant("alice", "charlie", "anthropic", None, None)

        resp = client.get(
            "/share/outgoing",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        shares = resp.json()["shares"]
        assert len(shares) == 2
        recipients = {s["recipient_id"] for s in shares}
        assert recipients == {"bob", "charlie"}

    def test_incoming_lists_recipient_grants(self, client):
        from src import sharing

        sharing.grant("alice", "bob", "openai",    None, None)
        sharing.grant("dave",  "bob", "anthropic", None, None)

        bob_token = _login(client, "bob")
        resp = client.get(
            "/share/incoming",
            headers={"Authorization": f"Bearer {bob_token}"},
        )
        assert resp.status_code == 200
        shares = resp.json()["shares"]
        assert len(shares) == 2
        owners = {s["owner_id"] for s in shares}
        assert owners == {"alice", "dave"}

    def test_revoke_owner_only(self, client):
        from src import sharing

        sid = sharing.grant("alice", "bob", "openai", None, None)

        # Bob (the recipient) cannot revoke — returns 404 to avoid leaking
        # whether the share exists.
        bob_token = _login(client, "bob")
        bad = client.delete(
            f"/share/{sid}",
            headers={"Authorization": f"Bearer {bob_token}"},
        )
        assert bad.status_code == 404
        # Row still exists.
        assert any(s["id"] == sid for s in sharing.list_outgoing("alice"))

        # Owner can revoke.
        alice_token = _login(client, "alice")
        ok = client.delete(
            f"/share/{sid}",
            headers={"Authorization": f"Bearer {alice_token}"},
        )
        assert ok.status_code == 200
        assert sharing.list_outgoing("alice") == []


# ─── Per-tenant isolation ─────────────────────────────────────────────────


class TestTenantIsolation:
    def test_outgoing_scoped_to_caller(self, client):
        from src import sharing

        sharing.grant("alice", "bob", "openai", None, None)
        sharing.grant("dave",  "bob", "openai", None, None)

        # Alice's outgoing list contains only her grants.
        token = _login(client, "alice")
        resp = client.get(
            "/share/outgoing",
            headers={"Authorization": f"Bearer {token}"},
        )
        shares = resp.json()["shares"]
        assert {s["owner_id"] for s in shares} == {"alice"}

    def test_revoke_other_users_share_returns_404(self, client):
        from src import sharing

        # Alice grants to bob.
        sid = sharing.grant("alice", "bob", "openai", None, None)

        # Mallory tries to revoke alice's share.
        token = _login(client, "mallory")
        resp = client.delete(
            f"/share/{sid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404
        # Row is still there.
        assert any(s["id"] == sid for s in sharing.list_outgoing("alice"))


# ─── purge_user (called from /auth/delete-account cascade) ───────────────


class TestPurgeUser:
    def test_purge_wipes_owner_and_recipient_rows(self):
        from src import sharing

        sharing.grant("alice", "bob",   "openai",    None, None)
        sharing.grant("alice", "carol", "anthropic", None, None)
        sharing.grant("dave",  "alice", "openai",    None, None)

        n = sharing.purge_user("alice")
        assert n == 3
        assert sharing.list_outgoing("alice") == []
        assert sharing.list_incoming("alice") == []
        # Bob's incoming-from-elsewhere is untouched.
        assert sharing.list_incoming("bob") == []  # only had alice's row, now gone

    def test_account_deletion_purges_shares(self, client):
        """End-to-end: /auth/delete-account hits sharing.purge_user."""
        from src import sharing

        token = _login(client, "alice")
        sharing.grant("alice", "bob", "openai", None, None)
        sharing.grant("dave",  "alice", "openai", None, None)

        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation": "DELETE my account"},
        )
        assert resp.status_code == 200
        assert resp.json()["report"]["shares"] == 2
        assert sharing.list_outgoing("alice") == []
        assert sharing.list_incoming("alice") == []


# ─── sharing.py module-level smoke ────────────────────────────────────────


class TestSharingModule:
    def test_duplicate_grant_raises_value_error(self):
        from src import sharing

        sharing.grant("alice", "bob", "openai", None, None)
        with pytest.raises(ValueError):
            sharing.grant("alice", "bob", "openai", None, None)

    def test_revoke_returns_false_when_not_found(self):
        from src import sharing

        assert sharing.revoke("alice", 999_999) is False
