"""HTTP surface for owner auto-sign — auth and keystore gating."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod


def _client_and_token(tmp_path, monkeypatch):
    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setenv("SERVER_SECRET", "test-owner-autosign-secret")
    token = sess_mod.create_token("alice", "pw")
    return TestClient(app), token


def test_autosign_status_unauthorized():
    client = TestClient(app)
    assert client.get("/mpp/autosign/status").status_code == 401


def test_autosign_status_reports_pubkey(tmp_path, monkeypatch):
    from nacl.signing import SigningKey
    import json

    from src.backend.mpp import owner_keystore

    wrap = tmp_path / "owner.wrap"
    enc = tmp_path / "user.enc"
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(wrap))
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(enc))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
    owner_keystore.ensure_wrap_key(wrap)
    sk = SigningKey(bytes([5]) * 32)
    src = tmp_path / "kp.json"
    src.write_text(json.dumps(list(bytes(sk) + bytes(sk.verify_key))))
    pubkey = owner_keystore.import_solana_keypair_file(src, dest=enc)

    client, token = _client_and_token(tmp_path, monkeypatch)
    res = client.get("/mpp/autosign/status", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    body = res.json()
    assert body["loaded"] is True
    assert body["pubkey"] == pubkey
    assert "seed" not in body
    assert "secret" not in str(body).lower()


def test_autosign_open_requires_keystore(tmp_path, monkeypatch):
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(tmp_path / "missing.enc"))
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(tmp_path / "missing.wrap"))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
    client, token = _client_and_token(tmp_path, monkeypatch)
    res = client.post(
        "/mpp/autosign/open",
        headers={"Authorization": f"Bearer {token}"},
        json={"agentPubkey": "11111111111111111111111111111111", "maxTotalMicroUsdc": 1000},
    )
    assert res.status_code == 503
    assert res.json()["detail"] == "owner keystore unavailable"


def test_usage_stats_is_a_list(tmp_path, monkeypatch):
    from src.backend.billing import usage as usage_mod

    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    client, token = _client_and_token(tmp_path, monkeypatch)
    res = client.get("/usage/stats", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert isinstance(res.json()["stats"], list)


def test_settle_on_chain_autosigns_from_keystore(tmp_path, monkeypatch):
    from nacl.signing import SigningKey
    import json

    from src.backend.mpp import mpp_onchain, mpp_streams, owner_keystore

    wrap = tmp_path / "owner.wrap"
    enc = tmp_path / "user.enc"
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(wrap))
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(enc))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
    owner_keystore.ensure_wrap_key(wrap)
    sk = SigningKey(bytes([7]) * 32)
    src = tmp_path / "kp.json"
    src.write_text(json.dumps(list(bytes(sk) + bytes(sk.verify_key))))
    owner_keystore.import_solana_keypair_file(src, dest=enc)

    stream_key = bytes([0x11]) * 32
    request_hash = bytes(range(32))
    pda = mpp_onchain._b58encode_pure(stream_key)
    ata = mpp_onchain._b58encode_pure(bytes([0x22]) * 32)
    submitted: list = []

    async def fake_submit(config, ix, prefix_ix=None):
        submitted.append(prefix_ix)
        return (1000, "sig")

    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.setattr(
        mpp_onchain,
        "load_mpp_config",
        lambda: mpp_onchain.MppConfig(
            secret_key=bytes(range(64)),
            settler_pubkey=mpp_onchain._b58encode_pure(bytes([0x33]) * 32),
            platform_usdc_ata=ata,
            keyshield_program_id="11111111111111111111111111111111",
            usdc_mint=mpp_onchain.USDC_MINT_MAINNET,
            vault_pda="11111111111111111111111111111111",
            rpc_url="http://127.0.0.1:8899",
        ),
    )
    monkeypatch.setattr(mpp_streams, "_get_stream_pda_ata", lambda sid: (pda, ata))
    monkeypatch.setattr(mpp_onchain, "submit_mpp_settle", fake_submit)

    out = mpp_streams.settle_on_chain(
        1, 1000, bytes(range(32, 64)), 1, bytes(range(32)), request_hash
    )
    assert out.mode == "submitted"
    assert out.debited_micro_usdc == 1000
    assert submitted[0] is not None
    assert submitted[0].data[80:112] == bytes(sk.verify_key)
