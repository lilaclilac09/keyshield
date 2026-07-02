"""Tests for x402-verified /billing/topup."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def isolate_billing_dbs(tmp_path: Path) -> None:
    """Use per-test sqlite files so x402 claims never leak across runs."""
    from src.backend.billing import usage as usage_mod
    from src.backend.proxy import x402_verify

    usage_mod.DB_PATH = tmp_path / "usage.db"
    x402_verify.DB_PATH = tmp_path / "x402.db"


@pytest.fixture()
def client() -> TestClient:
    from src.backend.app import app

    return TestClient(app)


@pytest.fixture()
def auth_headers(client: TestClient) -> dict[str, str]:
    from src.backend.auth import session as sess_mod

    token = sess_mod.create_token("x402-topup-user", "pw")
    return {"Authorization": f"Bearer {token}"}


def test_topup_with_payment_proof_stub(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.post(
        "/billing/topup",
        headers=auth_headers,
        json={"payment_proof": "stub-proof-unique-001", "amount_usd": 2.5},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["verified"] is True
    assert body["credited_usd"] == pytest.approx(2.5)


def test_topup_duplicate_proof_409(client: TestClient, auth_headers: dict[str, str]) -> None:
    proof = "stub-proof-duplicate-002"
    payload = {"payment_proof": proof, "amount_usd": 1.0}
    r1 = client.post("/billing/topup", headers=auth_headers, json=payload)
    assert r1.status_code == 200
    r2 = client.post("/billing/topup", headers=auth_headers, json=payload)
    assert r2.status_code == 409


def test_topup_manual_dev_without_proof(client: TestClient, auth_headers: dict[str, str]) -> None:
    r = client.post(
        "/billing/topup",
        headers=auth_headers,
        json={"amount_usd": 0.5},
    )
    assert r.status_code == 200
    assert r.json()["verified"] is False


def test_topup_requires_auth(client: TestClient) -> None:
    r = client.post("/billing/topup", json={"amount_usd": 1.0})
    assert r.status_code == 401


def test_topup_proof_required_when_verify_flag_set(
    client: TestClient, auth_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("KS_X402_VERIFY_REQUIRED", "1")
    r = client.post("/billing/topup", headers=auth_headers, json={"amount_usd": 1.0})
    assert r.status_code == 400
