"""x402 payment_proof on /billing/topup is optional and idempotent."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.proxy import x402_verify


def test_topup_without_proof_still_credits(monkeypatch, tmp_path):
    monkeypatch.setattr(x402_verify, "DB_PATH", tmp_path / "x402.db")
    client = TestClient(app)
    r = client.post("/billing/topup", json={"amount_usd": 0.01})
    assert r.status_code == 200
    body = r.json()
    assert body["credited_usd"] == 0.01
    assert "verified_mode" not in body


def test_topup_proof_replays_are_409(monkeypatch, tmp_path):
    monkeypatch.setattr(x402_verify, "DB_PATH", tmp_path / "x402.db")
    monkeypatch.delenv("KS_X402_VERIFY_REQUIRED", raising=False)
    monkeypatch.delenv("KS_X402_BASE_RPC_URL", raising=False)
    client = TestClient(app)
    proof = "0xstub-devnet-buy-proof"
    first = client.post(
        "/billing/topup",
        json={"amount_usd": 0.02, "payment_proof": proof},
    )
    assert first.status_code == 200
    assert first.json()["verified_mode"] == "stub-fallback"
    replay = client.post(
        "/billing/topup",
        json={"amount_usd": 0.02, "payment_proof": proof},
    )
    assert replay.status_code == 409
    assert replay.json()["code"] == "duplicate_claim"
