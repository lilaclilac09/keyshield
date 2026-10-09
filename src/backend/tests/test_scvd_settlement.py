"""SCVD-4 Hold-Verify-Capture: timeout, replay, and orphan-debit guards."""

from __future__ import annotations

import json

import pytest

from src.backend.mpp import mpp_onchain, mpp_streams
from src.backend.mpp.capture import sign_artifact_hash
from src.backend.mpp.mpp_streams import CaptureRejected, ReplayRejected

SESSION = "ks-session-consumer"
CHAT = json.dumps(
    {
        "choices": [{"message": {"content": "hello"}}],
        "usage": {"total_tokens": 1},
    }
).encode()


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.delenv("KS_MPP_SETTLER_KEY", raising=False)
    monkeypatch.delenv("KS_PLATFORM_USDC_ATA", raising=False)
    monkeypatch.delenv("KS_KEYSHIELD_PROGRAM_ID", raising=False)
    return tmp_path


def _open(cap: int = 50_000):
    return mpp_streams.open_stream(
        user_id="alice",
        agent_pubkey="agent-1",
        agent_name="bot",
        upstream="openai",
        rate_per_token=0,
        rate_per_call=800,
        settlement_interval=3600,
        max_total_micro_usdc=cap,
    )


def _b58(raw: bytes) -> str:
    return mpp_onchain._b58encode_pure(raw)


def _live_cfg():
    ata = _b58(bytes([0x22]) * 32)
    return mpp_onchain.MppConfig(
        secret_key=bytes(range(64)),
        settler_pubkey=_b58(bytes([0x33]) * 32),
        platform_usdc_ata=ata,
        keyshield_program_id="11111111111111111111111111111111",
        usdc_mint=mpp_onchain.USDC_MINT_MAINNET,
        vault_pda="11111111111111111111111111111111",
        rpc_url="http://127.0.0.1:8899",
    )


def test_rpc_timeout_does_not_cache_a_terminal_failure(db, monkeypatch):
    pda = _b58(bytes([0x11]) * 32)
    ata = _b58(bytes([0x22]) * 32)
    calls = {"n": 0}

    async def flaky_submit(config, ix):
        calls["n"] += 1
        if calls["n"] == 1:
            raise TimeoutError("submit_mpp_settle did not finish in 20s")
        return (800, "sig-ok")

    monkeypatch.setattr(mpp_onchain, "load_mpp_config", _live_cfg)
    monkeypatch.setattr(mpp_streams, "_get_stream_pda_ata", lambda sid: (pda, ata))
    monkeypatch.setattr(mpp_onchain, "submit_mpp_settle", flaky_submit)

    first = mpp_streams.settle_on_chain(
        1, 800, bytes(range(32)), 1, bytes(range(32)), bytes(range(32, 64))
    )
    assert first.mode == "indeterminate"
    assert first.debited_micro_usdc == 0

    second = mpp_streams.settle_on_chain(
        1, 800, bytes(range(32)), 1, bytes(range(32)), bytes(range(32, 64))
    )
    assert second.mode == "submitted"
    assert second.debited_micro_usdc == 800
    assert calls["n"] == 2


def test_hard_failure_still_blocks_identical_retry_window(db, monkeypatch):
    pda = _b58(bytes([0x11]) * 32)
    ata = _b58(bytes([0x22]) * 32)
    calls = {"n": 0}

    async def boom(config, ix):
        calls["n"] += 1
        raise RuntimeError("account in use")

    monkeypatch.setattr(mpp_onchain, "load_mpp_config", _live_cfg)
    monkeypatch.setattr(mpp_streams, "_get_stream_pda_ata", lambda sid: (pda, ata))
    monkeypatch.setattr(mpp_onchain, "submit_mpp_settle", boom)

    first = mpp_streams.settle_on_chain(
        1, 800, bytes(range(32)), 1, bytes(range(32)), bytes(range(32, 64))
    )
    assert first.mode == "failed"
    second = mpp_streams.settle_on_chain(
        1, 800, bytes(range(32)), 1, bytes(range(32)), bytes(range(32, 64))
    )
    assert second.mode == "failed"
    assert second.debited_micro_usdc == 0
    assert calls["n"] == 1


def test_hold_verify_capture_does_not_debit_on_timeout_then_captures_once(db, monkeypatch):
    stream = _open()
    recorded = mpp_streams.record_usage("alice", stream["id"], 1, 0, status_code=200, body=CHAT)
    digest = recorded["artifact_hash"]
    assert recorded["pending_micro_usdc"] == 800
    assert recorded["held_micro_usdc"] == 800
    assert recorded["settled_micro_usdc"] == 0

    calls = {"n": 0}

    def flaky_settle(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return mpp_streams.SettleOutcome(0, "indeterminate")
        return mpp_streams.SettleOutcome(800, "stub")

    monkeypatch.setattr(mpp_streams, "settle_on_chain", flaky_settle)
    sig = sign_artifact_hash(SESSION, bytes.fromhex(digest))

    with pytest.raises(CaptureRejected, match="indeterminate"):
        mpp_streams.settle_receipt(
            "alice", stream["id"], digest, session_key=SESSION, signature=sig
        )

    mid = mpp_streams.list_streams("alice")["streams"][0]
    assert mid["settled_micro_usdc"] == 0
    assert mid["pending_micro_usdc"] == 800
    assert mid["held_micro_usdc"] == 800

    captured = mpp_streams.settle_receipt(
        "alice", stream["id"], digest, session_key=SESSION, signature=sig
    )
    assert captured["just_settled_micro_usdc"] == 800
    assert captured["settled_micro_usdc"] == 800
    assert captured["pending_micro_usdc"] == 0

    with pytest.raises(ReplayRejected, match="NonceReused"):
        mpp_streams.settle_receipt(
            "alice", stream["id"], digest, session_key=SESSION, signature=sig
        )
    assert calls["n"] == 2


def test_identical_meter_payload_is_idempotent_not_a_new_purchase(db):
    stream = _open()
    first = mpp_streams.record_usage("alice", stream["id"], 1, 0, status_code=200, body=CHAT)
    replay = mpp_streams.record_usage("alice", stream["id"], 1, 0, status_code=200, body=CHAT)
    assert replay.get("idempotent_replay") is True
    assert replay["pending_micro_usdc"] == first["pending_micro_usdc"]
    assert replay["settled_micro_usdc"] == 0
