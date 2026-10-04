"""Proxy velocity caps, the anomaly freeze, and the settlement binding hash."""

from __future__ import annotations

import hashlib

from src.backend.mpp import mpp_onchain
from src.backend.proxy.velocity import (
    SessionSuspended,
    VelocityLimited,
    VelocityLimiter,
    session_key,
)


def _limiter() -> VelocityLimiter:
    return VelocityLimiter(
        max_requests_per_sec=3,
        max_tokens_per_sec=100,
        max_micro_usdc_per_min=1_000,
        fail_streak=3,
    )


def test_request_cap_does_not_count_the_rejected_attempt():
    gate = _limiter()
    for _ in range(3):
        gate.admit("sess", now=10.0)
    try:
        gate.admit("sess", now=10.2)
        raised = False
    except VelocityLimited as exc:
        raised = True
        assert exc.detail == "max_requests_per_second"
    assert raised
    gate.admit("sess", now=11.2)


def test_spend_and_token_windows():
    gate = _limiter()
    gate.admit("sess", est_micro=600, now=5.0)
    try:
        gate.admit("sess", est_micro=500, now=6.0)
        raised = False
    except VelocityLimited as exc:
        raised = True
        assert exc.detail == "max_spend_per_minute"
    assert raised
    gate.observe("sess", 200, b"ok", tokens=80, now=5.1)
    try:
        gate.admit("sess", est_tokens=30, est_micro=0, now=5.2)
        raised = False
    except VelocityLimited as exc:
        raised = True
        assert exc.detail == "max_tokens_per_second"
    assert raised
    gate.admit("sess", est_tokens=20, est_micro=0, now=5.2)


def test_three_empty_or_5xx_responses_suspend_the_session():
    gate = _limiter()
    gate.admit("sess", now=1.0)
    gate.observe("sess", 200, b"", now=1.0)
    gate.admit("sess", now=2.0)
    gate.observe("sess", 502, b"bad gateway", now=2.0)
    gate.admit("sess", now=3.0)
    gate.observe("sess", 500, b"", now=3.0)
    assert gate.is_suspended("sess")
    try:
        gate.admit("sess", now=4.0)
        raised = False
    except SessionSuspended:
        raised = True
    assert raised


def test_success_resets_the_failure_streak():
    gate = _limiter()
    gate.observe("sess", 500, b"x", now=1.0)
    gate.observe("sess", 500, b"x", now=1.1)
    gate.observe("sess", 200, b"ok", now=1.2)
    gate.observe("sess", 500, b"x", now=1.3)
    gate.observe("sess", 500, b"x", now=1.4)
    assert not gate.is_suspended("sess")
    gate.admit("sess", now=1.5)


def test_session_key_uses_the_bearer_then_the_user():
    assert session_key("ksv2_abc", "user-1") == "ksv2_abc"
    assert session_key("", "user-1") == "anon:user-1"
    assert session_key(None, None) == "anon:anonymous"


def test_settlement_binding_hash_is_sha256_of_the_tuple():
    stream = bytes([0x11]) * 32
    artifact = bytes([0x22]) * 32
    digest = mpp_onchain.settlement_binding_hash(stream, 7, 1000, artifact)
    preimage = stream + (7).to_bytes(8, "little") + (1000).to_bytes(8, "little") + artifact
    assert digest == hashlib.sha256(preimage).digest()
    assert digest.hex() == "2e0360bb3801f4de81f0dccd6b97b19fd7824fe69f606c772d62885bbe201c29"


def test_ed25519_ix_places_the_message_at_the_honest_offset():
    pubkey = bytes([0x33]) * 32
    signature = bytes([0x44]) * 64
    message = bytes([0x55]) * 32
    data = mpp_onchain.build_ed25519_ix_data(pubkey, signature, message)
    assert len(data) == 144
    assert data[0] == 1 and data[1] == 0
    assert int.from_bytes(data[2:4], "little") == 16
    assert int.from_bytes(data[4:6], "little") == 0xFFFF
    assert data[16:80] == signature
    assert data[80:112] == pubkey
    assert data[112:144] == message
    ix = mpp_onchain.build_ed25519_verify_ix(pubkey, signature, message)
    assert ix.program_id == mpp_onchain.ED25519_PROGRAM_ID
    assert ix.accounts == ()
