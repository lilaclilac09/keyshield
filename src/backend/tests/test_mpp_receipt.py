"""last_receipt must come from mpp_settle_attempts, not the open tx."""

from __future__ import annotations

import time

from src.backend.mpp import mpp_streams


def test_latest_successful_settle_uses_attempt_sig(tmp_path, monkeypatch):
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.delenv("KS_MPP_SETTLER_KEY", raising=False)
    stream = mpp_streams.open_stream(
        user_id="alice",
        agent_pubkey="agent-1",
        agent_name="bot",
        upstream="openrouter",
        rate_per_token=0,
        rate_per_call=2_000_000,
        settlement_interval=60,
        max_total_micro_usdc=5_000_000,
    )
    mpp_streams.record_tx_signature("alice", stream["id"], "OpenStreamSigOnly")
    assert mpp_streams.latest_successful_settle("alice") is None

    mpp_streams._record_settle_attempt(
        stream["id"],
        2_000_000,
        int(time.time()),
        success=True,
        debited=2_000_000,
        tx_signature="SettleSigFromIx26",
        artifact_root="ab" * 32,
    )
    rec = mpp_streams.latest_successful_settle("alice")
    assert rec is not None
    assert rec["signature"] == "SettleSigFromIx26"
    assert rec["micro_usdc"] == 2_000_000
    assert rec["stream_id"] == stream["id"]
    same = mpp_streams.latest_successful_settle("alice", stream_id=stream["id"])
    assert same is not None and same["signature"] == "SettleSigFromIx26"
    assert mpp_streams.latest_successful_settle("bob") is None
