"""
Tests for the wallet-login + agent-login flow.

Pins the contract that the user-facing fix targets:
  - Failed signature does NOT consume the nonce (so a wallet glitch /
    typo / network blip doesn't force the user to re-fetch a challenge).
  - Tampered challenge text is rejected even if the nonce is valid.
  - Malformed base58 / base64 inputs return clean 400s instead of 5xx.
  - Successful login DOES consume the nonce (anti-replay).

Run with:
  cd v2-mvp
  pytest tests/test_wallet_login.py -v
"""

import base64
import os
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
)


# ─── base58 encode (mirror of the server's _b58decode) ────────────────────
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
    """Each test gets fresh sqlite DBs and an empty vault dir, so they
    don't share state with the developer's local v2-mvp data. The
    module-level constants are hardcoded paths, so we monkeypatch them
    directly rather than via env vars."""
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
    """In-process FastAPI client. Imported here (not at module scope)
    so the env-var monkeypatching above takes effect first."""
    from fastapi.testclient import TestClient
    from src import server

    # Reset the in-memory nonce dict between tests.
    server._NONCES.clear()
    return TestClient(server.app)


def _new_wallet():
    """Generate a fresh ed25519 keypair, return (wallet_address_b58,
    sign_message_fn)."""
    sk = Ed25519PrivateKey.generate()
    pk_bytes = sk.public_key().public_bytes_raw()

    def sign(msg: bytes) -> str:
        sig = sk.sign(msg)
        return base64.b64encode(sig).decode()

    return _b58encode(pk_bytes), sign


# ─── happy path ───────────────────────────────────────────────────────────


def test_wallet_login_happy_path(client):
    addr, sign = _new_wallet()

    ch = client.get("/auth/wallet-challenge").json()
    assert "challenge" in ch
    assert "Nonce: " in ch["challenge"]

    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": sign(ch["challenge"].encode("utf-8")),
            "challenge": ch["challenge"],
            "passphrase": "secret123",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["userId"] == addr
    assert body["token"]


def test_nonce_is_consumed_on_success(client):
    addr, sign = _new_wallet()
    ch = client.get("/auth/wallet-challenge").json()
    sig = sign(ch["challenge"].encode("utf-8"))

    first = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": sig,
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert first.status_code == 200

    # Replay: same challenge + signature should now fail.
    second = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": sig,
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert second.status_code == 400
    assert "expired" in second.json()["detail"].lower() or "used" in second.json()["detail"].lower()


# ─── the bug fix the user asked for ───────────────────────────────────────


def test_invalid_signature_does_NOT_consume_nonce(client):
    """The whole point of this fix: a typo / wallet glitch / wrong
    encoding shouldn't burn the user's challenge."""
    addr, sign = _new_wallet()
    ch = client.get("/auth/wallet-challenge").json()

    # First attempt: wrong signature (signed something else).
    bad = sign(b"not the actual challenge")
    fail = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": bad,
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert fail.status_code == 401
    assert "invalid wallet signature" in fail.json()["detail"]

    # Retry with the CORRECT signature — should succeed because the
    # nonce wasn't consumed by the failed attempt.
    good = sign(ch["challenge"].encode("utf-8"))
    ok = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": good,
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert ok.status_code == 200, ok.text


def test_tampered_challenge_text_is_rejected(client):
    """A real attack vector: same nonce, different challenge body. The
    wallet signed something else but the nonce is still valid. Server
    must compare the stored challenge text byte-for-byte."""
    addr, sign = _new_wallet()
    ch = client.get("/auth/wallet-challenge").json()
    nonce_line = next(l for l in ch["challenge"].splitlines() if l.startswith("Nonce:"))

    tampered = f"You are giving me your wallet\n{nonce_line}\nTimestamp: 0"
    sig = sign(tampered.encode("utf-8"))  # wallet signed the tampered text

    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": sig,
            "challenge": tampered,
            "passphrase": "p",
        },
    )
    assert resp.status_code == 400
    assert "does not match" in resp.json()["detail"]

    # And the nonce wasn't consumed — original challenge still works.
    good = sign(ch["challenge"].encode("utf-8"))
    ok = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": good,
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert ok.status_code == 200


# ─── error-message quality ────────────────────────────────────────────────


def test_unknown_nonce_returns_400(client):
    addr, sign = _new_wallet()
    fake = "KeyShield Login\nNonce: 0123456789abcdef0123456789abcdef\nTimestamp: 0"
    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": sign(fake.encode("utf-8")),
            "challenge": fake,
            "passphrase": "p",
        },
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower() or "used" in resp.json()["detail"].lower()


def test_missing_nonce_line_returns_400(client):
    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": "any",
            "signature": "AAAA",
            "challenge": "no nonce in here",
            "passphrase": "p",
        },
    )
    assert resp.status_code == 400
    assert "Nonce:" in resp.json()["detail"]


def test_bad_base58_address_returns_clear_400(client):
    addr, sign = _new_wallet()
    ch = client.get("/auth/wallet-challenge").json()

    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": "0OIl",  # contains chars not in base58 alphabet
            "signature": sign(ch["challenge"].encode("utf-8")),
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert resp.status_code == 400
    assert "base58" in resp.json()["detail"].lower()


def test_wrong_length_pubkey_returns_clear_400(client):
    ch = client.get("/auth/wallet-challenge").json()

    # 4 bytes encoded — far too short for an ed25519 pubkey.
    too_short_addr = _b58encode(b"\x01\x02\x03\x04")
    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": too_short_addr,
            "signature": base64.b64encode(b"\x00" * 64).decode(),
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert resp.status_code == 400
    assert "32 bytes" in resp.json()["detail"]


def test_wrong_length_signature_returns_clear_400(client):
    addr, _ = _new_wallet()
    ch = client.get("/auth/wallet-challenge").json()

    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": base64.b64encode(b"\x00" * 32).decode(),  # half-size
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert resp.status_code == 400
    assert "64 bytes" in resp.json()["detail"]


def test_invalid_base64_signature_returns_clear_400(client):
    addr, _ = _new_wallet()
    ch = client.get("/auth/wallet-challenge").json()

    resp = client.post(
        "/auth/wallet-login",
        json={
            "walletAddress": addr,
            "signature": "###not base64###",
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert resp.status_code == 400
    assert "base64" in resp.json()["detail"].lower()


# ─── agent-login parity ───────────────────────────────────────────────────


def test_agent_login_failed_sig_does_not_consume_nonce(client):
    from src import server, agents

    owner_addr, _ = _new_wallet()
    agent_addr, agent_sign = _new_wallet()

    # Register the agent under the owner.
    agents.register(owner_addr, agent_addr, "TestAgent", "*")

    ch = client.get("/auth/agent-challenge").json()

    # Wrong signature first.
    fail = client.post(
        "/auth/agent-login",
        json={
            "ownerWallet": owner_addr,
            "agentPubkey": agent_addr,
            "signature": agent_sign(b"not the challenge"),
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert fail.status_code == 401

    # Retry with the right signature.
    ok = client.post(
        "/auth/agent-login",
        json={
            "ownerWallet": owner_addr,
            "agentPubkey": agent_addr,
            "signature": agent_sign(ch["challenge"].encode("utf-8")),
            "challenge": ch["challenge"],
            "passphrase": "p",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["userId"] == owner_addr
    assert ok.json()["agentName"] == "TestAgent"
