"""
Tests for /auth/delete-account — destructive cascade + soft-delete tombstone.

Pins the contract:
  - Confirmation phrase is required and must match exactly.
  - Wallet-login users must supply a fresh signed challenge.
  - Cascade: vault keys, agents, usage history, sessions, and any tombstone
    cross-checks all run before the user is locked out.
  - A second user is unaffected (per-tenant isolation).
  - Same wallet cannot re-register after deletion (410 Gone).

Run with:
  cd v2-mvp && .venv/bin/python -m pytest tests/test_account_deletion.py -v
"""

from __future__ import annotations

import base64
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


# ─── base58 encode (mirror of test_wallet_login.py) ────────────────────────
_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _B58_ALPHABET[r] + out
    leading = len(data) - len(data.lstrip(b"\x00"))
    return ("1" * leading) + out


# ─── fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    """Each test gets fresh sqlite DBs and an empty vault dir, so tests
    don't share state with the developer's local v2-mvp data."""
    from pathlib import Path
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod

    monkeypatch.setattr(vault_mod,   "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH",   Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod,  "DB_PATH",   Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod,   "DB_PATH",   Path(tmp_path / "data" / "usage.db"))
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    return TestClient(server.app)


def _new_wallet():
    """Generate ed25519 keypair → (b58_pubkey, sign_callable)."""
    sk = Ed25519PrivateKey.generate()
    pk_bytes = sk.public_key().public_bytes_raw()

    def sign(msg: bytes) -> str:
        return base64.b64encode(sk.sign(msg)).decode()

    return _b58encode(pk_bytes), sign


def _login_with_wallet(client, addr: str, sign) -> str:
    """Helper: full wallet-login round trip, returns session token."""
    ch = client.get("/auth/wallet-challenge").json()
    sig = sign(ch["challenge"].encode("utf-8"))
    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": sig,
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def _login_with_password(client, user_id: str, password: str = "p") -> str:
    """Helper: legacy /auth/login (non-wallet user)."""
    resp = client.post("/auth/login", json={"userId": user_id, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


# ─── Confirmation phrase enforcement ──────────────────────────────────────


class TestConfirmationPhrase:
    def test_missing_phrase_returns_400(self, client):
        token = _login_with_password(client, "alice")
        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation": ""},
        )
        assert resp.status_code == 400
        assert "confirmation" in resp.json()["detail"].lower()

    def test_wrong_phrase_returns_400(self, client):
        token = _login_with_password(client, "alice")
        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation": "delete my account"},  # lowercase
        )
        assert resp.status_code == 400
        assert "DELETE my account" in resp.json()["detail"]

    def test_no_token_returns_401(self, client):
        resp = client.post(
            "/auth/delete-account",
            json={"confirmation": "DELETE my account"},
        )
        assert resp.status_code == 401


# ─── Wallet-login flow (anti-account-takeover) ────────────────────────────


class TestWalletDeletion:
    def test_wallet_user_must_sign_destructive_challenge(self, client):
        addr, sign = _new_wallet()
        token = _login_with_wallet(client, addr, sign)

        # Attempt without wallet fields → 400
        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation": "DELETE my account"},
        )
        assert resp.status_code == 400
        assert "wallet" in resp.json()["detail"].lower()

    def test_wallet_user_happy_path(self, client):
        addr, sign = _new_wallet()
        token = _login_with_wallet(client, addr, sign)

        # Get destructive challenge.
        ch_resp = client.get(
            "/auth/delete-account-challenge",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert ch_resp.status_code == 200
        challenge = ch_resp.json()["challenge"]
        assert challenge.startswith("KeyShield Delete Account")
        assert addr in challenge   # the user_id is bound into the message

        # Sign + submit.
        sig = sign(challenge.encode("utf-8"))
        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "confirmation": "DELETE my account",
                "walletAddress": addr,
                "signature": sig,
                "challenge": challenge,
            },
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["ok"] is True

    def test_replay_login_challenge_is_rejected(self, client):
        """A wallet-login challenge cannot be replayed against /auth/delete-account."""
        addr, sign = _new_wallet()
        token = _login_with_wallet(client, addr, sign)

        # Issue a *login* challenge (wrong prefix).
        login_ch = client.get("/auth/wallet-challenge").json()
        sig = sign(login_ch["challenge"].encode("utf-8"))

        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "confirmation": "DELETE my account",
                "walletAddress": addr,
                "signature": sig,
                "challenge": login_ch["challenge"],
            },
        )
        assert resp.status_code == 400
        assert "/auth/delete-account-challenge" in resp.json()["detail"]

    def test_invalid_signature_is_rejected(self, client):
        addr, sign = _new_wallet()
        token = _login_with_wallet(client, addr, sign)
        ch = client.get(
            "/auth/delete-account-challenge",
            headers={"Authorization": f"Bearer {token}"},
        ).json()
        # Sign something else.
        bad_sig = sign(b"not the challenge")
        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "confirmation": "DELETE my account",
                "walletAddress": addr,
                "signature": bad_sig,
                "challenge": ch["challenge"],
            },
        )
        assert resp.status_code == 401
        assert "invalid wallet signature" in resp.json()["detail"]

    def test_walletAddress_must_match_session_user(self, client):
        addr, sign = _new_wallet()
        other_addr, _ = _new_wallet()
        token = _login_with_wallet(client, addr, sign)
        ch = client.get(
            "/auth/delete-account-challenge",
            headers={"Authorization": f"Bearer {token}"},
        ).json()
        sig = sign(ch["challenge"].encode("utf-8"))

        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "confirmation": "DELETE my account",
                "walletAddress": other_addr,   # mismatch
                "signature": sig,
                "challenge": ch["challenge"],
            },
        )
        assert resp.status_code == 403
        assert "does not match" in resp.json()["detail"]


# ─── Cascade behavior ──────────────────────────────────────────────────────


class TestCascadeDelete:
    def test_password_user_cascade(self, client):
        """Verify cascade for a non-wallet user (where signature isn't required)."""
        from src import vault, agents, usage

        token = _login_with_password(client, "alice")

        # Seed: vault entry, agent, usage row.
        vault.store("alice", "openai", "sk-secret", "p")
        agents.register("alice", _b58encode(b"\x01" * 32), "agent-1", "*")
        usage.log_call("alice", "openai", "platform", "POST", "/chat", 100, 50, 0.001, 1.0, 200)

        # Delete.
        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation": "DELETE my account"},
        )
        assert resp.status_code == 200, resp.text
        report = resp.json()["report"]
        assert report["vault_keys"] == 1
        assert report["agents"]    == 1
        assert report["usage"]["usage_log"] == 1
        assert report["sessions"]  >= 1

    def test_session_token_dies_after_delete(self, client):
        """After cascade, the previous Bearer token must 401 against any
        authenticated route."""
        token = _login_with_password(client, "alice")

        client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation": "DELETE my account"},
        )

        # /manage/list — was reachable before, must 401 now.
        r = client.get(
            "/manage/list",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 401

        # /agents/list — same story.
        r = client.get(
            "/agents/list",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 401

        # /usage/stats — same.
        r = client.get(
            "/usage/stats",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 401

    def test_second_user_unaffected(self, client):
        """Per-tenant isolation: deleting alice does not touch bob."""
        from src import vault, agents

        alice_token = _login_with_password(client, "alice")
        bob_token   = _login_with_password(client, "bob")

        vault.store("alice", "openai", "alice-key", "p")
        vault.store("bob",   "openai", "bob-key",   "p")
        agents.register("alice", _b58encode(b"\x01" * 32), "alice-agent", "*")
        agents.register("bob",   _b58encode(b"\x02" * 32), "bob-agent",   "*")

        # Delete alice.
        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {alice_token}"},
            json={"confirmation": "DELETE my account"},
        )
        assert resp.status_code == 200

        # Bob's token still works.
        r = client.get(
            "/manage/list",
            headers={"Authorization": f"Bearer {bob_token}"},
        )
        assert r.status_code == 200
        # Bob's vault entry still exists.
        assert vault.load("bob", "openai", "p") == "bob-key"
        # Bob's agent still registered.
        assert len(agents.list_agents("bob")) == 1

    def test_wallet_re_registration_returns_410(self, client):
        """Same wallet cannot re-register after deletion (anti-replay tombstone)."""
        addr, sign = _new_wallet()
        token = _login_with_wallet(client, addr, sign)

        ch = client.get(
            "/auth/delete-account-challenge",
            headers={"Authorization": f"Bearer {token}"},
        ).json()
        sig = sign(ch["challenge"].encode("utf-8"))
        resp = client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "confirmation": "DELETE my account",
                "walletAddress": addr,
                "signature": sig,
                "challenge": ch["challenge"],
            },
        )
        assert resp.status_code == 200

        # Now try to wallet-login again with the same wallet → 410 Gone.
        ch2 = client.get("/auth/wallet-challenge").json()
        sig2 = sign(ch2["challenge"].encode("utf-8"))
        retry = client.post(
            "/auth/wallet-login",
            json={
                "walletAddress": addr,
                "signature": sig2,
                "challenge": ch2["challenge"],
                "passphrase": "p",
            },
        )
        assert retry.status_code == 410
        assert "deleted" in retry.json()["detail"].lower()

    def test_password_user_re_login_returns_410(self, client):
        """/auth/login also tombstones — same userId can't re-register."""
        token = _login_with_password(client, "alice")
        client.post(
            "/auth/delete-account",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmation": "DELETE my account"},
        )
        resp = client.post("/auth/login", json={"userId": "alice", "password": "p"})
        assert resp.status_code == 410
