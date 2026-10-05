"""Owner registers an agent pubkey; the agent signs a challenge and logs in."""

from __future__ import annotations

import base64

from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.mpp import mpp_onchain


def _iso_dbs(tmp_path, monkeypatch):
    from src.backend.agents import agents as agents_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(agents_mod, "DB_PATH", tmp_path / "agents.db")
    monkeypatch.setenv("SERVER_SECRET", "test-agent-register-secret")


def _keypair():
    sk = SigningKey.generate()
    pub = mpp_onchain._b58encode_pure(bytes(sk.verify_key))
    return sk, pub


def test_register_then_login_pubkeyB58(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    sk, pub = _keypair()

    reg = client.post(
        "/agents/register",
        headers={"Authorization": f"Bearer {token}"},
        json={"pubkeyB58": pub, "name": "trading-bot-v1", "scopes": "*"},
    )
    assert reg.status_code == 200, reg.text
    listed = client.get("/agents/list", headers={"Authorization": f"Bearer {token}"})
    assert listed.status_code == 200
    assert any(a["pubkey_b58"] == pub for a in listed.json()["agents"])

    chal = client.post("/auth/agent-challenge")
    assert chal.status_code == 200
    challenge = chal.json()["challenge"]
    sig = base64.b64encode(sk.sign(challenge.encode()).signature).decode()
    login = client.post(
        "/auth/agent-login",
        json={
            "pubkeyB58": pub,
            "challenge": challenge,
            "nonce": chal.json()["nonce"],
            "signature": sig,
        },
    )
    assert login.status_code == 200, login.text
    assert login.json()["token"]


def test_sdk_aliases_get_challenge_and_agentPubkey(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    sk, pub = _keypair()
    assert (
        client.post(
            "/agents/register",
            headers={"Authorization": f"Bearer {token}"},
            json={"pubkeyB58": pub, "name": "sdk-bot"},
        ).status_code
        == 200
    )

    chal = client.get("/auth/agent-challenge")
    assert chal.status_code == 200
    challenge = chal.json()["challenge"]
    sig = base64.b64encode(sk.sign(challenge.encode()).signature).decode()
    login = client.post(
        "/auth/agent-login",
        json={
            "ownerWallet": "alice",
            "agentPubkey": pub,
            "challenge": challenge,
            "signature": sig,
        },
    )
    assert login.status_code == 200, login.text
    assert login.json()["token"]


def test_unregistered_agent_login_is_401(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    client = TestClient(app)
    sk, pub = _keypair()
    chal = client.post("/auth/agent-challenge")
    challenge = chal.json()["challenge"]
    sig = base64.b64encode(sk.sign(challenge.encode()).signature).decode()
    login = client.post(
        "/auth/agent-login",
        json={"pubkeyB58": pub, "challenge": challenge, "signature": sig},
    )
    assert login.status_code == 401
    assert login.json()["error"] == "agent not registered"
