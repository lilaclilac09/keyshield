"""Tests for spec 07 — Rust ↔ Python internal bridge."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def internal_client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("KS_INTERNAL_SECRET", "test-internal-bridge-secret-32b")
    from src.backend.app import app

    return TestClient(app)


def _headers(secret: str = "test-internal-bridge-secret-32b") -> dict[str, str]:
    return {"X-Internal-Secret": secret}


def test_internal_balance_requires_secret(internal_client: TestClient) -> None:
    r = internal_client.get("/_internal/balance/alice")
    assert r.status_code == 401


def test_internal_balance_unknown_user_404(internal_client: TestClient) -> None:
    r = internal_client.get("/_internal/balance/no-such-user-xyz", headers=_headers())
    assert r.status_code == 404


def test_internal_balance_returns_existing_balance(internal_client: TestClient) -> None:
    from src.backend.billing import usage as usage_mod

    user_id = "bridge-user-balance-check"
    expected = usage_mod.topup(user_id, 4.25)
    r = internal_client.get(f"/_internal/balance/{user_id}", headers=_headers())
    assert r.status_code == 200
    assert r.json()["balance_usd"] == pytest.approx(expected)


def test_internal_log_ingests_batch(internal_client: TestClient) -> None:
    payload = {
        "entries": [
            {
                "user_id": "log-user",
                "upstream": "openai",
                "key_type": "platform",
                "method": "POST",
                "path": "v1/chat/completions",
                "tok_in": 100,
                "tok_out": 50,
                "cost": 0.001,
                "latency_ms": 42.5,
                "status": 200,
            }
        ]
    }
    r = internal_client.post("/_internal/log", headers=_headers(), json=payload)
    assert r.status_code == 200
    assert r.json()["ingested"] == 1

    from src.backend.billing import usage as usage_mod

    history = usage_mod.get_history("log-user", limit=5)
    assert len(history) >= 1
    row = history[0]
    assert row["upstream"] == "openai"
    assert row["tokens_in"] == 100
    assert row["tokens_out"] == 50


def test_internal_disabled_when_secret_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("KS_INTERNAL_SECRET", raising=False)
    from src.backend.app import app

    client = TestClient(app)
    r = client.get("/_internal/balance/alice", headers={"X-Internal-Secret": "anything"})
    assert r.status_code == 503
