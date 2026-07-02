"""Python-only-mode MPP hot-path metering (spec 15, routes/proxy.py).

Verifies the `X-Mpp-Stream-Id` header on /proxy/* debits the stream —
the same semantics ks-proxy's handlers.rs §9.5 applies in Rust mode."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

USER = "mpp-meter-user"

# Fake OpenAI-ish response: 100 in + 50 out = 150 tokens.
_FAKE_BODY = json.dumps(
    {
        "id": "cmpl-1",
        "usage": {"prompt_tokens": 100, "completion_tokens": 50},
    }
).encode()


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path: Path) -> None:
    from src.backend.billing import usage as usage_mod
    from src.backend.mpp import mpp_streams

    usage_mod.DB_PATH = tmp_path / "usage.db"
    mpp_streams.DB_PATH = tmp_path / "mpp.db"


@pytest.fixture(autouse=True)
def fake_upstream(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.backend.proxy import api_router

    async def _fake_call_rest(*args, **kwargs):
        return _FAKE_BODY, 200, "MISS"

    monkeypatch.setattr(api_router, "call_rest", _fake_call_rest)


@pytest.fixture()
def client() -> TestClient:
    from src.backend.app import app

    return TestClient(app)


@pytest.fixture()
def token() -> str:
    from src.backend.auth import session as sess_mod

    return sess_mod.create_token(USER, "pw")


def _open_stream(rate_per_token: int = 2) -> int:
    from src.backend.mpp import mpp_streams

    stream = mpp_streams.open_stream(
        user_id=USER,
        agent_pubkey="WAUjjarihxNossg9REdRYVh5aM5HbmeUWJfxcW8crVZ",
        agent_name="meter-test",
        upstream="openai",
        rate_per_token=rate_per_token,
        rate_per_call=0,
        settlement_interval=3600,
    )
    return int(stream["id"])


def _get_stream(stream_id: int) -> dict:
    from src.backend.mpp import mpp_streams

    conn = mpp_streams._db()
    try:
        return mpp_streams._get_owned_stream(conn, USER, stream_id)
    finally:
        conn.close()


def _proxy_call(client: TestClient, token: str, extra_headers: dict) -> None:
    r = client.post(
        "/proxy/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Upstream-API-Key": "sk-fake",
            **extra_headers,
        },
        json={"model": "gpt-4o-mini", "messages": []},
    )
    assert r.status_code == 200


def test_header_records_usage(client: TestClient, token: str) -> None:
    sid = _open_stream(rate_per_token=2)
    _proxy_call(client, token, {"X-Mpp-Stream-Id": str(sid)})
    stream = _get_stream(sid)
    # 150 tokens × 2 µUSDC/token = 300 pending
    assert stream["total_tokens"] == 150
    assert stream["total_calls"] == 1
    assert stream["pending_micro_usdc"] == 300


def test_no_header_no_record(client: TestClient, token: str) -> None:
    sid = _open_stream()
    _proxy_call(client, token, {})
    stream = _get_stream(sid)
    assert stream["total_tokens"] == 0
    assert stream["pending_micro_usdc"] == 0


def test_bad_stream_id_does_not_break_proxy(client: TestClient, token: str) -> None:
    _proxy_call(client, token, {"X-Mpp-Stream-Id": "not-a-number"})
    _proxy_call(client, token, {"X-Mpp-Stream-Id": "999999"})  # nonexistent


def test_closed_stream_does_not_break_proxy(client: TestClient, token: str) -> None:
    from src.backend.mpp import mpp_streams

    sid = _open_stream()
    mpp_streams.close_stream(USER, sid)
    _proxy_call(client, token, {"X-Mpp-Stream-Id": str(sid)})
    stream = _get_stream(sid)
    assert stream["total_tokens"] == 0  # closed → not debited


def test_foreign_stream_not_debited(client: TestClient, token: str) -> None:
    from src.backend.mpp import mpp_streams

    other = mpp_streams.open_stream(
        user_id="someone-else",
        agent_pubkey="WAUjjarihxNossg9REdRYVh5aM5HbmeUWJfxcW8crVZ",
        agent_name="other",
        upstream="openai",
        rate_per_token=1,
        rate_per_call=0,
        settlement_interval=3600,
    )
    sid = int(other["id"])
    _proxy_call(client, token, {"X-Mpp-Stream-Id": str(sid)})

    conn = mpp_streams._db()
    try:
        row = mpp_streams._get_owned_stream(conn, "someone-else", sid)
    finally:
        conn.close()
    assert row["total_tokens"] == 0
