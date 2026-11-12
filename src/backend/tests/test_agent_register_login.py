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
    from src.backend.auth import ratelimit as rl_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(agents_mod, "DB_PATH", tmp_path / "agents.db")
    monkeypatch.setenv("SERVER_SECRET", "test-agent-register-secret")
    rl_mod.agent_register_limiter.reset()


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


def test_agent_self_register_then_login(tmp_path, monkeypatch):
    """An agent can register without a human wallet, then sign in."""
    _iso_dbs(tmp_path, monkeypatch)
    client = TestClient(app)
    sk, pub = _keypair()
    reg = client.post("/auth/agent-register", json={"pubkeyB58": pub, "name": "self-bot"})
    assert reg.status_code == 200, reg.text
    body = reg.json()
    assert body["ok"] is True
    assert body["owner"] == pub
    assert body["pubkeyB58"] == pub
    assert "agent-login" in body["next"]

    chal = client.post("/auth/agent-challenge")
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
    assert login.json()["scope"] == "proxy"
    token = login.json()["token"]
    vault = client.get("/manage/vault", headers={"Authorization": f"Bearer {token}"})
    assert vault.status_code == 403
    assert vault.json()["error"] == "insufficient_scope"


def test_agent_self_register_requires_ed25519_pubkey(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    client = TestClient(app)
    missing = client.post("/auth/agent-register", json={"name": "no-key"})
    assert missing.status_code == 400
    assert "pubkeyB58" in missing.json()["error"]
    bad = client.post("/auth/agent-register", json={"name": "bad", "pubkeyB58": "not-a-key"})
    assert bad.status_code == 400
    assert "ed25519" in bad.json()["error"]


def test_register_returns_id_and_plan_shows_account(tmp_path, monkeypatch):
    from src.backend.billing import plans as plans_mod
    from src.backend.billing import usage as usage_mod

    _iso_dbs(tmp_path, monkeypatch)
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(plans_mod, "DB_PATH", tmp_path / "usage.db")
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    hdr = {"Authorization": f"Bearer {token}"}
    _, pub = _keypair()

    plan = client.get("/billing/plan", headers=hdr)
    assert plan.status_code == 200
    assert plan.json()["user_id"] == "alice"

    reg = client.post("/agents/register", headers=hdr, json={"pubkeyB58": pub, "name": "bot"})
    assert reg.status_code == 200, reg.text
    body = reg.json()
    assert body["ok"] is True and body["name"] == "bot" and body["owner"] == "alice"
    assert isinstance(body["id"], int)
