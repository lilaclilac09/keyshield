"""UI contract tests: sessions wrap, sharing ShareRow, sol-quote, usage."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod


def _iso(tmp_path, monkeypatch):
    from src.backend.billing import usage as usage_mod
    from src.backend.sharing import sharing as sharing_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(sharing_mod, "DB_PATH", tmp_path / "sharing.db")
    monkeypatch.setenv("SERVER_SECRET", "test-ui-api-contracts-secret")
    monkeypatch.setenv("KS_SOL_USD_PRICE", "100")
    monkeypatch.setenv("PAYMENT_ADDRESS_SOLANA", "So11111111111111111111111111111111111111112")
    monkeypatch.setenv("MAX_TOPUP_USD", "10")


def _auth_headers(user_id: str = "alice") -> dict[str, str]:
    token = sess_mod.create_token(user_id, "pw")
    return {"Authorization": f"Bearer {token}"}


def test_sessions_list_matches_activity_ui(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    headers = _auth_headers()
    res = client.get("/sessions", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body.get("sessions"), list)
    assert body["sessions"]
    row = body["sessions"][0]
    assert row["token_id"]
    assert "is_current" in row
    assert "token" not in row
    assert sum(1 for s in body["sessions"] if s["is_current"]) == 1


def test_session_revoke_post_alias(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    a = _auth_headers("alice")
    other = sess_mod.create_token("alice", "pw", ttl=3600)
    prefix = other[-8:]
    res = client.post(f"/sessions/{prefix}/revoke", headers=a)
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_share_grant_returns_share_row(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    owner = _auth_headers("owner-wallet")
    grant = client.post(
        "/share/grant",
        headers=owner,
        json={"key_name": "openrouter", "recipient_id": "bob-wallet"},
    )
    assert grant.status_code == 200
    share = grant.json()["share"]
    assert share["key_name"] == "openrouter"
    assert share["recipient_id"] == "bob-wallet"
    assert share["owner_id"] == "owner-wallet"
    incoming = client.get(
        "/share/incoming",
        headers=_auth_headers("bob-wallet"),
    ).json()["shares"]
    assert incoming[0]["key_name"] == "openrouter"
    outgoing = client.get("/share/outgoing", headers=owner).json()["shares"]
    assert outgoing[0]["recipient_id"] == "bob-wallet"


def test_sol_quote_uses_override_price(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.get("/billing/sol-quote?amount_usd=2")
    assert res.status_code == 200
    body = res.json()
    assert body["amount_usd"] == 2.0
    assert body["sol_usd_price"] == 100.0
    assert body["amount_lamports"] == 20_000_000
    assert body["payment_address"].startswith("So1111")


def test_topup_solana_credits_once(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    from src.backend.billing import billing_solana, usage as usage_mod

    async def fake_tx(*_a, **_k):
        return {"meta": {"err": None}}

    monkeypatch.setattr(billing_solana, "get_transaction", fake_tx)
    monkeypatch.setattr(billing_solana, "find_sol_transfer", lambda *_a, **_k: 10_000_000)

    client = TestClient(app)
    headers = _auth_headers("payer")
    first = client.post(
        "/billing/topup-solana",
        headers=headers,
        json={
            "tx_signature": "fakeSig111",
            "expected_amount_usd": 1.0,
            "wallet": "payer",
        },
    )
    assert first.status_code == 200, first.text
    assert first.json()["credited_usd"] == 1.0
    replay = client.post(
        "/billing/topup-solana",
        headers=headers,
        json={"tx_signature": "fakeSig111", "wallet": "payer"},
    )
    assert replay.status_code == 409
    hist = client.get("/billing/topup-history", headers=headers)
    assert hist.status_code == 200
    assert hist.json()["topups"][0]["tx_signature"] == "fakeSig111"
    assert usage_mod.get_balance("payer") >= 1.0
