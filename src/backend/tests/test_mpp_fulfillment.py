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
    assert_settlement_artifact,
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


def test_settlement_artifact_must_be_32_nonzero_bytes():
    digest = bytes(range(32))
    assert assert_settlement_artifact(digest) == digest
    assert assert_settlement_artifact(digest.hex()) == digest
    with pytest.raises(FulfillmentRejected, match="must be 32 bytes"):
        assert_settlement_artifact(b"short")
    with pytest.raises(FulfillmentRejected, match="must be 32 bytes"):
        assert_settlement_artifact("abcd")
    with pytest.raises(FulfillmentRejected, match="non-zero"):
        assert_settlement_artifact(bytes(32))
    with pytest.raises(FulfillmentRejected, match="must be 32 bytes"):
        mpp_streams.settle_on_chain(1, 10, b"short", 1, bytes(range(32)), bytes(range(32)))


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
    payload = mpp_onchain.build_mpp_settle_ix_data(1020, root, 1, signature, request_hash)
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


def test_settle_on_chain_refuses_live_submit_without_owner_ed25519(db, monkeypatch):
    pda = _b58(bytes([0x11]) * 32)
    ata = _b58(bytes([0x22]) * 32)
    submitted: list = []

    async def fake_submit(config, ix, prefix_ix=None):
        submitted.append(prefix_ix)
        return (1000, "sig")

    monkeypatch.setattr(mpp_onchain, "load_mpp_config", _live_cfg)
    monkeypatch.setattr(mpp_streams, "_get_stream_pda_ata", lambda sid: (pda, ata))
    monkeypatch.setattr(mpp_onchain, "submit_mpp_settle", fake_submit)

    out = mpp_streams.settle_on_chain(
        1, 1000, bytes(range(32)), 1, bytes(range(32)), bytes(range(32))
    )
    assert out.mode == "failed"
    assert out.debited_micro_usdc == 0
    assert submitted == []


def test_settle_on_chain_prefixes_owner_ed25519_on_live_submit(db, monkeypatch):
    from nacl.signing import SigningKey

    stream_key = bytes([0x11]) * 32
    request_hash = bytes(range(32))
    pda = _b58(stream_key)
    ata = _b58(bytes([0x22]) * 32)
    sk = SigningKey(bytes([7]) * 32)
    owner = bytes(sk.verify_key)
    message = mpp_onchain.settlement_binding_hash(stream_key, 1, 1000, request_hash)
    owner_sig = bytes(sk.sign(message).signature)
    submitted: list = []

    async def fake_submit(config, ix, prefix_ix=None):
        submitted.append(prefix_ix)
        return (1000, "sig")

    monkeypatch.setattr(mpp_onchain, "load_mpp_config", _live_cfg)
    monkeypatch.setattr(mpp_streams, "_get_stream_pda_ata", lambda sid: (pda, ata))
    monkeypatch.setattr(mpp_onchain, "submit_mpp_settle", fake_submit)

    out = mpp_streams.settle_on_chain(
        1,
        1000,
        bytes(range(32, 64)),
        1,
        bytes(range(32)),
        request_hash,
        owner_pubkey=owner,
        owner_signature=owner_sig,
    )
    assert out.mode == "submitted"
    assert out.debited_micro_usdc == 1000
    assert len(submitted) == 1
    prefix = submitted[0]
    assert prefix is not None
    assert prefix.program_id == mpp_onchain.ED25519_PROGRAM_ID
    assert prefix.data[80:112] == owner
    assert prefix.data[112:144] == message


def test_create_universal_vault_ix_layout():
    data = mpp_onchain.build_create_universal_vault_ix_data(255)
    assert data == bytes([10, 255])
    with pytest.raises(ValueError, match="bump"):
        mpp_onchain.build_create_universal_vault_ix_data(256)
    ix = mpp_onchain.build_create_universal_vault_ix(
        program_id="11111111111111111111111111111111",
        owner_pubkey=_b58(bytes([0x11]) * 32),
        vault_pda=_b58(bytes([0x22]) * 32),
        bump=254,
    )
    assert ix.data == bytes([10, 254])
    assert [a.is_signer for a in ix.accounts] == [True, False, False]
    assert [a.is_writable for a in ix.accounts] == [True, True, False]
    assert ix.accounts[2].pubkey == mpp_onchain.SYSTEM_PROGRAM_ID


def test_update_universal_policy_flags_layout():
    data = mpp_onchain.build_update_universal_policy_flags_ix_data(0x08)
    assert data[0] == 11
    assert int.from_bytes(data[1:5], "little") == 0x08
    assert data[5] == 0
    assert len(data) == 6


def test_grant_agent_access_ix_layout():
    agent = bytes(range(32))
    data = mpp_onchain.build_grant_agent_access_ix_data(
        agent,
        key_group=255,
        rate_limit_calls=10,
        rate_limit_tokens=20,
        session_timeout=7200,
        max_spend_micro_usdc=5_000_000,
        payment_stream_enabled=True,
    )
    assert len(data) == 61
    assert data[0] == 20
    assert data[1:33] == agent
    assert data[33] == 255
    assert int.from_bytes(data[34:38], "little") == 10
    assert int.from_bytes(data[38:42], "little") == 20
    assert int.from_bytes(data[42:50], "little") == 7200
    assert int.from_bytes(data[50:58], "little") == 5_000_000
    assert data[58] == 1
    assert int.from_bytes(data[59:61], "little") == 0
    ix = mpp_onchain.build_grant_agent_access_ix(
        program_id="11111111111111111111111111111111",
        owner_pubkey=_b58(bytes([0x11]) * 32),
        vault_pda=_b58(bytes([0x22]) * 32),
        agent_pubkey=_b58(agent),
        payment_stream_enabled=True,
        max_spend_micro_usdc=5_000_000,
    )
    assert ix.data[0] == 20
    assert len(ix.accounts) == 2
    assert ix.accounts[0].is_signer and ix.accounts[0].is_writable
    assert ix.accounts[1].is_writable and not ix.accounts[1].is_signer
