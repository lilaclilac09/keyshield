"""MPP settlement only moves USDC after a verified fulfillment artifact."""

from __future__ import annotations

import json
import time

import pytest

from src.backend.mpp import mpp_onchain, mpp_streams
from src.backend.mpp.capture import sign_artifact_hash
from src.backend.mpp.fulfillment import (
    FulfillmentRejected,
    artifact_root,
    verify_fulfillment,
)

SESSION = "ks-session-consumer"

CHAT = json.dumps(
    {
        "id": "chatcmpl-1",
        "choices": [{"message": {"role": "assistant", "content": "hello"}}],
        "usage": {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10},
    }
).encode()


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.delenv("KS_MPP_SETTLER_KEY", raising=False)
    monkeypatch.delenv("KS_PLATFORM_USDC_ATA", raising=False)
    monkeypatch.delenv("KS_KEYSHIELD_PROGRAM_ID", raising=False)
    return tmp_path


def _open(upstream: str = "openai"):
    return mpp_streams.open_stream(
        user_id="alice",
        agent_pubkey="agent-1",
        agent_name="bot",
        upstream=upstream,
        rate_per_token=2,
        rate_per_call=1000,
        settlement_interval=5,
    )


def test_empty_error_and_garbage_are_not_billable():
    with pytest.raises(FulfillmentRejected, match="empty payload"):
        verify_fulfillment(
            stream_id=1,
            upstream="openai",
            status_code=200,
            body=b"   ",
            claimed_calls=1,
        )
    with pytest.raises(FulfillmentRejected, match="upstream error status"):
        verify_fulfillment(
            stream_id=1,
            upstream="openai",
            status_code=500,
            body=CHAT,
            claimed_calls=1,
        )
    with pytest.raises(FulfillmentRejected, match="error payload"):
        verify_fulfillment(
            stream_id=1,
            upstream="openai",
            status_code=200,
            body=b'{"error":{"message":"overloaded"}}',
            claimed_calls=1,
        )
    with pytest.raises(FulfillmentRejected, match="garbage payload"):
        verify_fulfillment(
            stream_id=1,
            upstream="openai",
            status_code=200,
            body=b"????",
            claimed_calls=1,
        )
    with pytest.raises(FulfillmentRejected, match="garbage payload"):
        verify_fulfillment(
            stream_id=1,
            upstream="openai",
            status_code=200,
            body=b"garbage",
            claimed_calls=1,
        )


def test_claimed_tokens_cannot_exceed_usage_in_the_body():
    artifact = verify_fulfillment(
        stream_id=7,
        upstream="openai",
        status_code=200,
        body=CHAT,
        claimed_calls=9,
        claimed_tokens=10_000,
    )
    assert artifact.calls == 1
    assert artifact.tokens == 10
    again = verify_fulfillment(
        stream_id=7,
        upstream="openai",
        status_code=200,
        body=CHAT,
        claimed_calls=9,
        claimed_tokens=10_000,
    )
    assert again.artifact_hash == artifact.artifact_hash
    assert artifact.artifact_hash == __import__("hashlib").sha256(artifact.preimage).digest()


def test_token_claim_without_usage_is_rejected():
    body = b'{"choices":[{"message":{"content":"hi"}}]}'
    with pytest.raises(FulfillmentRejected, match="no token proof"):
        verify_fulfillment(
            stream_id=1,
            upstream="openai",
            status_code=200,
            body=body,
            claimed_calls=0,
            claimed_tokens=5,
        )


def test_record_rejects_bad_responses_and_replays(db):
    stream = _open()
    with pytest.raises(FulfillmentRejected):
        mpp_streams.record_usage(
            "alice",
            stream["id"],
            1,
            100,
            status_code=200,
            body=b"",
        )
    untouched = mpp_streams.list_streams("alice")["streams"][0]
    assert untouched["pending_micro_usdc"] == 0
    assert untouched["total_tokens"] == 0

    recorded = mpp_streams.record_usage(
        "alice",
        stream["id"],
        4,
        999,
        status_code=200,
        body=CHAT,
    )
    # 1 call * 1000 + 10 proven tokens * 2. The claim of 999 tokens is capped.
    assert recorded["pending_micro_usdc"] == 1020
    assert recorded["total_calls"] == 1
    assert recorded["total_tokens"] == 10

    replay = mpp_streams.record_usage(
        "alice",
        stream["id"],
        1,
        10,
        status_code=200,
        body=CHAT,
    )
    assert replay["idempotent_replay"] is True
    assert replay["artifact_hash"] == recorded["artifact_hash"]
    still = mpp_streams.list_streams("alice")["streams"][0]
    assert still["pending_micro_usdc"] == 1020
    assert still["total_calls"] == 1
    assert still["total_tokens"] == 10


def test_proxy_observation_ignores_failed_and_foreign_providers(db):
    stream = _open("openai")
    with pytest.raises(FulfillmentRejected, match="upstream error"):
        mpp_streams.meter_proxy_response(
            "alice",
            stream["id"],
            "openai",
            502,
            b'{"error":"down"}',
        )
    with pytest.raises(FulfillmentRejected, match="provider outside stream scope"):
        mpp_streams.meter_proxy_response(
            "alice",
            stream["id"],
            "groq",
            200,
            CHAT,
        )
    billed = mpp_streams.meter_proxy_response(
        "alice",
        stream["id"],
        "openai",
        200,
        CHAT,
    )
    assert billed["pending_micro_usdc"] == 1020
    assert billed["total_tokens"] == 10
    assert mpp_streams.list_streams("alice")["streams"][0]["total_calls"] == 1


def test_unverified_pending_is_not_settled(db):
    stream = _open()
    conn = mpp_streams._db()
    conn.execute(
        "UPDATE mpp_streams SET pending_micro_usdc = 50000 WHERE id = ?",
        (stream["id"],),
    )
    conn.commit()
    conn.close()

    settled = mpp_streams.settle_stream("alice", stream["id"])
    assert settled["just_settled_micro_usdc"] == 0
    assert settled["settled_micro_usdc"] == 0
    assert settled["pending_micro_usdc"] == 0


def test_verified_usage_holds_until_signed_capture(db):
    stream = _open()
    conn = mpp_streams._db()
    conn.execute(
        "UPDATE mpp_streams SET last_settled_at = ? WHERE id = ?",
        (int(time.time()) - 30, stream["id"]),
    )
    conn.commit()
    conn.close()

    recorded = mpp_streams.record_usage(
        "alice",
        stream["id"],
        1,
        10,
        status_code=200,
        body=CHAT,
    )
    assert recorded["just_settled_micro_usdc"] == 0
    assert recorded["pending_micro_usdc"] == 1020
    assert recorded["held_micro_usdc"] == 1020
    assert recorded["settled_micro_usdc"] == 0

    signature = sign_artifact_hash(SESSION, recorded["artifact_hash"])
    paid = mpp_streams.settle_receipt(
        "alice",
        stream["id"],
        recorded["artifact_hash"],
        session_key=SESSION,
        signature=signature,
    )
    assert paid["just_settled_micro_usdc"] == 1020
    assert paid["pending_micro_usdc"] == 0
    assert paid["held_micro_usdc"] == 0
    assert paid["settled_micro_usdc"] == 1020
    assert paid["last_settled_seq"] == 1
    assert paid["sequence_number"] == 1
    assert paid["request_hash"] == recorded["artifact_hash"]

    conn = mpp_streams._db()
    row = conn.execute(
        "SELECT settled, artifact_hash FROM mpp_artifacts WHERE stream_id = ?",
        (stream["id"],),
    ).fetchone()
    conn.close()
    assert row[0] == 1
    root = artifact_root([bytes.fromhex(row[1])])
    request_hash = bytes.fromhex(row[1])
    assert root != bytes(32)
    payload = mpp_onchain.build_mpp_settle_ix_data(
        1020, root, 1, signature, request_hash
    )
    assert len(payload) == 113
    assert payload[0] == 26
    assert int.from_bytes(payload[1:9], "little") == 1020
    assert payload[9:41] == root
    assert int.from_bytes(payload[41:49], "little") == 1
    assert payload[49:81] == signature
    assert payload[81:113] == request_hash
    with pytest.raises(ValueError, match="non-zero"):
        mpp_onchain.build_mpp_settle_ix_data(1020, bytes(32))
    with pytest.raises(ValueError, match="settlement_seq"):
        mpp_onchain.build_mpp_settle_ix_data(1020, root, 0)
    with pytest.raises(ValueError, match="capture signature"):
        mpp_onchain.build_mpp_settle_ix_data(1020, root, 1, bytes(32))
    with pytest.raises(ValueError, match="request_hash"):
        mpp_onchain.build_mpp_settle_ix_data(1020, root, 1, signature)


def test_settle_on_chain_refuses_a_zero_root(db):
    stream = _open()
    with pytest.raises(FulfillmentRejected, match="non-zero"):
        mpp_streams.settle_on_chain(stream["id"], 1000, bytes(32))
