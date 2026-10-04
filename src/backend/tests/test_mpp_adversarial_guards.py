"""Partial-stream checkpoints, idempotency keys, and settlement sequence."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from src.backend.mpp import mpp_onchain, mpp_streams
from src.backend.mpp.capture import sign_artifact_hash
from src.backend.mpp.fulfillment import (
    FulfillmentRejected,
    artifact_root,
    received_token_ceiling,
    verify_fulfillment,
)
from src.backend.mpp.mpp_streams import BudgetExceeded, CaptureRejected, HoldExpired, ReplayRejected

SESSION = "ks-session-consumer"
from src.backend.proxy import api_router

CHAT = json.dumps(
    {
        "choices": [{"message": {"content": "hello"}}],
        "usage": {"total_tokens": 10},
    }
).encode()


def _sse(text: str, usage: int) -> bytes:
    payload = json.dumps(
        {
            "choices": [{"delta": {"content": text}}],
            "usage": {"total_tokens": usage},
        }
    )
    return f"data: {payload}\n\n".encode()


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.delenv("KS_MPP_SETTLER_KEY", raising=False)
    monkeypatch.delenv("KS_PLATFORM_USDC_ATA", raising=False)
    monkeypatch.delenv("KS_KEYSHIELD_PROGRAM_ID", raising=False)
    return tmp_path


def _open():
    return mpp_streams.open_stream(
        user_id="alice",
        agent_pubkey="agent-1",
        agent_name="bot",
        upstream="openai",
        rate_per_token=2,
        rate_per_call=1000,
        settlement_interval=3600,
        max_total_micro_usdc=50_000,
    )


def test_truncated_sse_bills_received_text_not_advertised_usage():
    body = _sse("abcd", 1000)
    ceiling = received_token_ceiling(body)
    assert ceiling < 1000
    artifact = verify_fulfillment(
        stream_id=1,
        upstream="openai",
        status_code=200,
        body=body,
        content_type="text/event-stream",
        observed=True,
        truncated=True,
    )
    assert artifact.calls == 1
    assert artifact.tokens == ceiling


def test_complete_sse_bills_usage_from_data_lines():
    body = _sse("abcd", 1000)
    artifact = verify_fulfillment(
        stream_id=1,
        upstream="openai",
        status_code=200,
        body=body,
        content_type="text/event-stream",
        observed=True,
        truncated=False,
    )
    assert artifact.tokens == 1000
    assert artifact.calls == 1


def test_empty_disconnect_is_not_billable():
    with pytest.raises(FulfillmentRejected, match="empty payload"):
        verify_fulfillment(
            stream_id=1,
            upstream="openai",
            status_code=200,
            body=b"",
            observed=True,
            truncated=True,
        )


def test_idempotency_key_does_not_double_debit_and_bills_only_the_delta(db):
    stream = _open()
    short = _sse("abcd", 1000)
    first = mpp_streams.meter_proxy_response(
        "alice",
        stream["id"],
        "openai",
        200,
        short,
        content_type="text/event-stream",
        request_id="req-1",
        truncated=True,
    )
    assert first["idempotent_replay"] is False
    assert first["total_calls"] == 1
    pending = first["pending_micro_usdc"]
    assert pending == 1000 + 2 * first["tokens_billed"]

    replay = mpp_streams.meter_proxy_response(
        "alice",
        stream["id"],
        "openai",
        200,
        short,
        content_type="text/event-stream",
        request_id="req-1",
        truncated=True,
    )
    assert replay["idempotent_replay"] is True
    assert replay["pending_micro_usdc"] == pending
    assert replay["total_calls"] == 1
    assert replay["settled_micro_usdc"] == 0

    longer = short + _sse("z" * 80, 1000)
    delta = mpp_streams.meter_proxy_response(
        "alice",
        stream["id"],
        "openai",
        200,
        longer,
        content_type="text/event-stream",
        request_id="req-1",
        truncated=True,
    )
    assert delta["idempotent_replay"] is False
    assert delta["calls_billed"] == 0
    assert delta["tokens_billed"] == received_token_ceiling(longer) - first["tokens_billed"]
    assert delta["tokens_billed"] > 0
    assert delta["total_calls"] == 1
    assert delta["pending_micro_usdc"] == pending + 2 * delta["tokens_billed"]
    assert delta["settled_micro_usdc"] == 0


def test_replayed_receipt_does_not_advance_sequence_or_balance(db):
    stream = _open()
    recorded = mpp_streams.record_usage(
        "alice",
        stream["id"],
        1,
        10,
        status_code=200,
        body=CHAT,
    )
    signature = sign_artifact_hash(SESSION, recorded["artifact_hash"])
    paid = mpp_streams.settle_receipt(
        "alice",
        stream["id"],
        recorded["artifact_hash"],
        session_key=SESSION,
        signature=signature,
    )
    assert paid["settled_micro_usdc"] == recorded["pending_micro_usdc"]
    assert paid["held_micro_usdc"] == 0
    assert paid["last_settled_seq"] == 1
    assert paid["sequence_number"] == 1
    assert paid["request_hash"] == recorded["artifact_hash"]
    with pytest.raises(ReplayRejected, match="NonceReused"):
        mpp_streams.settle_receipt(
            "alice",
            stream["id"],
            recorded["artifact_hash"],
            session_key=SESSION,
            signature=signature,
        )
    fresh = mpp_streams.list_streams("alice")["streams"][0]
    assert fresh["settled_micro_usdc"] == paid["settled_micro_usdc"]
    assert fresh["pending_micro_usdc"] == 0
    assert fresh["last_settled_seq"] == 1
    with pytest.raises(ReplayRejected, match="SettlementReplay"):
        mpp_streams.settle_on_chain(stream["id"], 1000, bytes([1]) + bytes(31), 0)


def test_receipts_carry_strictly_increasing_sequence_and_request_hash(db):
    stream = _open()
    first = mpp_streams.record_usage(
        "alice",
        stream["id"],
        1,
        10,
        status_code=200,
        body=CHAT,
    )
    second_body = CHAT.replace(b"hello", b"world")
    second = mpp_streams.record_usage(
        "alice",
        stream["id"],
        1,
        10,
        status_code=200,
        body=second_body,
    )
    assert first["artifact_hash"] != second["artifact_hash"]
    paid1 = mpp_streams.settle_receipt(
        "alice",
        stream["id"],
        first["artifact_hash"],
        session_key=SESSION,
        signature=sign_artifact_hash(SESSION, first["artifact_hash"]),
    )
    assert paid1["sequence_number"] == 1
    assert paid1["last_settled_seq"] == 1
    assert paid1["request_hash"] == first["artifact_hash"]
    assert paid1["settled_micro_usdc"] == first["pending_micro_usdc"]
    paid2 = mpp_streams.settle_receipt(
        "alice",
        stream["id"],
        second["artifact_hash"],
        session_key=SESSION,
        signature=sign_artifact_hash(SESSION, second["artifact_hash"]),
    )
    assert paid2["sequence_number"] == 2
    assert paid2["last_settled_seq"] == 2
    assert paid2["request_hash"] == second["artifact_hash"]
    assert paid2["sequence_number"] > paid1["sequence_number"]
    assert paid2["settled_micro_usdc"] == second["pending_micro_usdc"]
    assert paid2["pending_micro_usdc"] == 0
    assert paid2["held_micro_usdc"] == 0


def test_saturated_sequence_aborts_before_the_debit(db, monkeypatch):
    stream = _open()
    recorded = mpp_streams.record_usage(
        "alice",
        stream["id"],
        1,
        10,
        status_code=200,
        body=CHAT,
    )
    real_get = mpp_streams._get_owned_stream
    seen = {"n": 0}

    def saturated(conn, user_id, stream_id):
        row = real_get(conn, user_id, stream_id)
        if seen["n"] == 0:
            seen["n"] += 1
            row = dict(row)
            row["last_settled_seq"] = 2**64 - 1
        return row

    monkeypatch.setattr(mpp_streams, "_get_owned_stream", saturated)
    with pytest.raises(ReplayRejected, match="SettlementReplay"):
        mpp_streams.settle_receipt(
            "alice",
            stream["id"],
            recorded["artifact_hash"],
            session_key=SESSION,
            signature=sign_artifact_hash(SESSION, recorded["artifact_hash"]),
        )
    fresh = mpp_streams.list_streams("alice")["streams"][0]
    assert fresh["settled_micro_usdc"] == 0
    assert fresh["pending_micro_usdc"] == recorded["pending_micro_usdc"]
    assert fresh["held_micro_usdc"] == recorded["held_micro_usdc"]
    assert fresh["last_settled_seq"] == 0


def test_hold_reduces_available_escrow_and_second_hold_stops_at_the_cap(db):
    stream = _open()
    first = mpp_streams.hold_estimate("alice", stream["id"], "openai", 800)
    assert first["held_micro_usdc"] == 800
    assert first["pending_micro_usdc"] == 0
    assert first["settled_micro_usdc"] == 0
    assert first["escrow_micro_usdc"] == 50_000 - 800
    second = mpp_streams.hold_estimate("alice", stream["id"], "openai", 800)
    assert second["held_micro_usdc"] == 1600
    assert second["escrow_micro_usdc"] == 50_000 - 1600
    with pytest.raises(BudgetExceeded, match="BudgetExceeded"):
        mpp_streams.hold_estimate("alice", stream["id"], "openai", 50_000)
    fresh = mpp_streams.list_streams("alice")["streams"][0]
    assert fresh["held_micro_usdc"] == 1600
    assert fresh["settled_micro_usdc"] == 0
    assert fresh["escrow_micro_usdc"] == 50_000 - 1600


def test_bad_signature_releases_hold_and_a_later_valid_signature_captures(db):
    stream = _open()
    recorded = mpp_streams.record_usage(
        "alice",
        stream["id"],
        1,
        10,
        status_code=200,
        body=CHAT,
    )
    assert recorded["held_micro_usdc"] == recorded["pending_micro_usdc"]
    with pytest.raises(CaptureRejected, match="invalid capture signature"):
        mpp_streams.settle_receipt(
            "alice",
            stream["id"],
            recorded["artifact_hash"],
            session_key=SESSION,
            signature=b"\x01" * 32,
        )
    released = mpp_streams.list_streams("alice")["streams"][0]
    assert released["settled_micro_usdc"] == 0
    assert released["pending_micro_usdc"] == 0
    assert released["held_micro_usdc"] == 0
    assert released["escrow_micro_usdc"] == 50_000

    signature = sign_artifact_hash(SESSION, recorded["artifact_hash"])
    paid = mpp_streams.settle_receipt(
        "alice",
        stream["id"],
        recorded["artifact_hash"],
        session_key=SESSION,
        signature=signature,
    )
    assert paid["settled_micro_usdc"] == recorded["pending_micro_usdc"]
    assert paid["pending_micro_usdc"] == 0
    assert paid["held_micro_usdc"] == 0
    assert paid["last_settled_seq"] == 1
    assert paid["sequence_number"] == 1
    assert paid["request_hash"] == recorded["artifact_hash"]
    root = artifact_root([bytes.fromhex(recorded["artifact_hash"])])
    request_hash = bytes.fromhex(recorded["artifact_hash"])
    payload = mpp_onchain.build_mpp_settle_ix_data(
        paid["settled_micro_usdc"],
        root,
        1,
        signature,
        request_hash,
    )
    assert len(payload) == 113
    assert payload[49:81] == signature
    assert payload[81:113] == request_hash


def test_expired_hold_returns_the_lock_to_available_balance(db):
    stream = _open()
    recorded = mpp_streams.record_usage(
        "alice",
        stream["id"],
        1,
        10,
        status_code=200,
        body=CHAT,
    )
    signature = sign_artifact_hash(SESSION, recorded["artifact_hash"])
    conn = mpp_streams._db()
    conn.execute(
        "UPDATE mpp_holds SET expires_at = 0 WHERE stream_id = ?",
        (stream["id"],),
    )
    conn.commit()
    conn.close()
    with pytest.raises(HoldExpired, match="hold expired"):
        mpp_streams.settle_receipt(
            "alice",
            stream["id"],
            recorded["artifact_hash"],
            session_key=SESSION,
            signature=signature,
        )
    fresh = mpp_streams.list_streams("alice")["streams"][0]
    assert fresh["settled_micro_usdc"] == 0
    assert fresh["pending_micro_usdc"] == 0
    assert fresh["held_micro_usdc"] == 0
    assert fresh["escrow_micro_usdc"] == 50_000


def test_stream_cut_checkpoints_bytes_and_empty_cut_returns_502():
    assert api_router.wants_upstream_stream(b'{"stream": true}', None)
    assert api_router.wants_upstream_stream(b"{}", "text/event-stream")
    assert not api_router.wants_upstream_stream(b'{"stream": false}', None)

    class Partial:
        status_code = 200

        async def aiter_bytes(self):
            yield b"data: hello world!!!!"
            raise httpx.ReadError("reset")

        async def aclose(self):
            return None

    class PartialClient:
        def build_request(self, **_kwargs):
            return object()

        async def send(self, _request, stream=True):
            assert stream is True
            return Partial()

    class DownClient(PartialClient):
        async def send(self, _request, stream=True):
            raise httpx.ConnectError("down")

    saved = api_router._CLIENTS["openai"]
    try:
        api_router._CLIENTS["openai"] = PartialClient()
        body, status, _cache, complete = asyncio.run(
            api_router.call_rest_streaming(
                "openai",
                "POST",
                "/v1/chat/completions",
                b'{"stream": true}',
                "sk-test",
            )
        )
        assert complete is False
        assert status == 200
        assert body == b"data: hello world!!!!"

        api_router._CLIENTS["openai"] = DownClient()
        body, status, _cache, complete = asyncio.run(
            api_router.call_rest_streaming(
                "openai",
                "POST",
                "/v1/chat/completions",
                b'{"stream": true}',
                "sk-test",
            )
        )
        assert body == b""
        assert status == 502
        assert complete is False
    finally:
        api_router._CLIENTS["openai"] = saved
