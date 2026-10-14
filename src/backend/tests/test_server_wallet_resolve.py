"""Server wallet create resolves id/pubkey to one owned agent."""

from __future__ import annotations

from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.mpp import mpp_onchain


def _setup(tmp_path, monkeypatch):
    from src.backend.agents import agents as agents_mod
    from src.backend.agents import server_wallet

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(agents_mod, "DB_PATH", tmp_path / "agents.db")
    monkeypatch.setattr(server_wallet, "DB_PATH", tmp_path / "server_wallets.db")
    monkeypatch.setenv("SERVER_SECRET", "test-server-wallet-secret")
    return TestClient(app)


def _register(client, user):
    token = sess_mod.create_token(user, "pw")
    h = {"Authorization": f"Bearer {token}"}
    pub = mpp_onchain._b58encode_pure(bytes(SigningKey.generate().verify_key))
    r = client.post("/agents/register", headers=h, json={"pubkeyB58": pub, "name": "a"})
    assert r.status_code == 200, r.text
    return h, r.json()["id"], pub


def test_id_and_pubkey_share_one_wallet(tmp_path, monkeypatch):
    client = _setup(tmp_path, monkeypatch)
    h, aid, pub = _register(client, "alice")
    by_id = client.post(f"/agents/{aid}/wallet/create", headers=h)
    by_pub = client.post(f"/agents/{pub}/wallet/create", headers=h)
    assert by_id.status_code == 200 and by_pub.status_code == 200
    assert by_id.json()["pubkey"] == by_pub.json()["pubkey"]
    assert by_id.json()["agent_id"] == pub
    wallets = client.get("/agents/wallets", headers=h).json()["wallets"]
    assert len(wallets) == 1


def test_unknown_agent_404(tmp_path, monkeypatch):
    client = _setup(tmp_path, monkeypatch)
    h, _, _ = _register(client, "alice")
    r = client.post("/agents/9999/wallet/create", headers=h)
    assert r.status_code == 404
    assert client.get("/agents/wallets", headers=h).json()["wallets"] == []


def test_other_users_agent_404(tmp_path, monkeypatch):
    client = _setup(tmp_path, monkeypatch)
    _, aid, pub = _register(client, "alice")
    h_bob, _, _ = _register(client, "bob")
    assert client.post(f"/agents/{aid}/wallet/create", headers=h_bob).status_code == 404
    assert client.post(f"/agents/{pub}/wallet/create", headers=h_bob).status_code == 404
