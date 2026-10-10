"""Owner autosign routes — auth gating and instruction layouts."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.mpp import mpp_onchain, owner_keystore


def _token(tmp_path, monkeypatch, user_id: str = "alice") -> str:
    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setenv("SERVER_SECRET", "test-owner-autosign-secret")
    return sess_mod.create_token(user_id, "pw")


def test_autosign_status_unauthorized():
    client = TestClient(app)
    assert client.get("/mpp/autosign/status").status_code == 401


def _isolate_owner(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(tmp_path / "missing.enc"))
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(tmp_path / "missing.wrap"))
    monkeypatch.setenv("KS_USER_WALLET", str(tmp_path / "missing.json"))
    monkeypatch.delenv("KS_MPP_OWNER_JSON", raising=False)
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)


def test_autosign_status_reports_keystore_empty(tmp_path, monkeypatch):
    _isolate_owner(tmp_path, monkeypatch)
    monkeypatch.setattr(mpp_onchain, "load_mpp_config", lambda: None)
    token = _token(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.get("/mpp/autosign/status", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    body = res.json()
    assert body["loaded"] is False
    assert body["mode"] == "owner-keystore"
    assert "secret" not in str(body).lower()
    assert "seed" not in body


def test_submit_open_unauthorized():
    client = TestClient(app)
    assert (
        client.post("/mpp/streams/1/submit-open-tx", json={"maxTotalMicroUsdc": 1}).status_code
        == 401
    )


def test_autosign_open_requires_config(tmp_path, monkeypatch):
    _isolate_owner(tmp_path, monkeypatch)
    monkeypatch.setattr(mpp_onchain, "load_mpp_config", lambda: None)
    token = _token(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.post(
        "/mpp/autosign/open",
        headers={"Authorization": f"Bearer {token}"},
        json={"agentPubkey": "11111111111111111111111111111111", "maxTotalMicroUsdc": 1000},
    )
    assert res.status_code == 503
    assert res.json()["detail"] == "owner autosign unavailable"


def test_autosign_open_rejects_session_mismatch(tmp_path, monkeypatch):
    from nacl.signing import SigningKey

    wrap = tmp_path / "owner.wrap"
    enc = tmp_path / "user.enc"
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(wrap))
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(enc))
    monkeypatch.setenv("KS_USER_WALLET", str(tmp_path / "missing.json"))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
    owner_keystore.ensure_wrap_key(wrap)
    sk = SigningKey(bytes([5]) * 32)
    src = tmp_path / "user.json"
    src.write_text(__import__("json").dumps(list(bytes(sk) + bytes(sk.verify_key))))
    owner_keystore.import_solana_keypair_file(src, dest=enc)
    monkeypatch.setattr(mpp_onchain, "load_mpp_config", lambda: None)
    token = _token(tmp_path, monkeypatch, user_id="not-the-owner")
    client = TestClient(app)
    res = client.post(
        "/mpp/autosign/open",
        headers={"Authorization": f"Bearer {token}"},
        json={"agentPubkey": "11111111111111111111111111111111", "maxTotalMicroUsdc": 1},
    )
    assert res.status_code == 400
    assert "session wallet" in res.json()["detail"]


def test_vault_and_grant_ix_layouts():
    bump = 254
    vault = mpp_onchain.build_create_universal_vault_ix_data(bump)
    assert vault == bytes([10, bump])

    flags = mpp_onchain.build_update_universal_policy_flags_ix_data(0x08)
    assert flags[0] == 11
    assert int.from_bytes(flags[1:5], "little") == 0x08
    assert flags[5] == 0

    agent = bytes(range(32))
    grant = mpp_onchain.build_grant_agent_access_ix_data(
        agent,
        payment_stream_enabled=True,
        max_spend_micro_usdc=1_000_000,
    )
    assert len(grant) == 61
    assert grant[0] == 20
    assert grant[1:33] == agent
    assert grant[33] == 255
    assert grant[58] == 1
    assert int.from_bytes(grant[50:58], "little") == 1_000_000
    assert int.from_bytes(grant[59:61], "little") == 0
