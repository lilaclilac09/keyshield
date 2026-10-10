"""Honest settle_mode + 402 details-then-pay cap."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.billing import usage as usage_mod
from src.backend.billing import x402_preview
from src.backend.mpp import mpp_streams
from src.backend.mpp.capture import sign_artifact_hash


CHAT = json.dumps(
    {
        "id": "chatcmpl-1",
        "choices": [{"message": {"role": "assistant", "content": "hello"}}],
        "usage": {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10},
    }
).encode()


def test_normalize_never_paints_cost_as_submitted():
    assert usage_mod.normalize_settle_mode(cost_usd=0.02) == "stub"
    assert usage_mod.normalize_settle_mode(status_code=500, cost_usd=1) == "failed"
    assert usage_mod.normalize_settle_mode(settle_mode="submitted", cost_usd=0) == "submitted"
    assert usage_mod.normalize_settle_mode(settle_mode="PAID", cost_usd=1) == "stub"


def test_history_emits_settle_mode(tmp_path, monkeypatch):
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    usage_mod.log_call("alice", "openai", "platform", cost_usd=0.01, status_code=200)
    usage_mod.log_call(
        "alice", "openai", "mpp", cost_usd=0.000001, status_code=200, settle_mode="submitted"
    )
    rows = usage_mod.get_history("alice")
    modes = {r["settle_mode"] for r in rows}
    assert "stub" in modes
    assert "submitted" in modes
    assert "paid" not in modes


def test_402_preview_and_over_cap():
    body = x402_preview.parse_preview_query("1", "1000", "/demo")
    assert body["accepts"][0]["maxAmountRequired"] == "1"
    assert body["over_cap"] is False
    over = x402_preview.parse_preview_query("2000", "1000", "/demo")
    assert over["over_cap"] is True
    try:
        x402_preview.parse_preview_query("1e20", "1")
        assert False, "scientific notation must fail"
    except ValueError:
        pass


def test_402_routes_details_then_pay(tmp_path, monkeypatch):
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setenv("SERVER_SECRET", "test-402-secret")
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    auth = {"Authorization": f"Bearer {token}"}
    preview = client.get("/billing/402-preview?amount=1&max_amount=1000", headers=auth)
    assert preview.status_code == 200
    assert preview.json()["over_cap"] is False
    refused = client.post(
        "/billing/402-pay",
        headers=auth,
        json={"amount_micro_usdc": 2000, "max_amount_micro_usdc": 1000},
    )
    assert refused.status_code == 400
    assert refused.json()["code"] == "over_cap"
    paid = client.post(
        "/billing/402-pay",
        headers=auth,
        json={"amount_micro_usdc": 1, "max_amount_micro_usdc": 1000},
    )
    assert paid.status_code == 200
    assert paid.json()["settle_mode"] == "stub"
    hist = usage_mod.get_history("alice")
    assert hist[0]["settle_mode"] == "stub"


def test_status_strip_and_capture_mode(tmp_path, monkeypatch):
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.delenv("KS_MPP_SETTLER_KEY", raising=False)
    monkeypatch.delenv("KS_PLATFORM_USDC_ATA", raising=False)
    monkeypatch.delenv("KS_KEYSHIELD_PROGRAM_ID", raising=False)
    stream = mpp_streams.open_stream(
        user_id="alice",
        agent_pubkey="agent-1",
        agent_name="bot",
        upstream="openai",
        rate_per_token=1,
        rate_per_call=0,
        settlement_interval=60,
        max_total_micro_usdc=1000,
    )
    recorded = mpp_streams.record_usage(
        user_id="alice",
        stream_id=stream["id"],
        calls=1,
        tokens=1,
        status_code=200,
        body=CHAT,
    )
    strip = mpp_streams.status_strip("alice")
    assert strip["last_receipt"]["mode"] == "held"
    captured = mpp_streams.settle_receipt(
        "alice",
        stream["id"],
        recorded["artifact_hash"],
        session_key="tok",
        signature=sign_artifact_hash("tok", recorded["artifact_hash"]),
    )
    assert captured["settle_mode"] == "stub"
    strip = mpp_streams.status_strip("alice")
    assert strip["last_receipt"]["mode"] == "stub"
    assert strip["last_receipt"]["hash8"] == recorded["artifact_hash"][:8]


def test_mpp_status_route(tmp_path, monkeypatch):
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setenv("SERVER_SECRET", "test-status-secret")
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    assert client.get("/mpp/status").status_code == 401
    res = client.get("/mpp/status", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    body = res.json()
    assert "last_receipt" in body
    assert "stream_remaining_micro_usdc" in body
    assert "sol_lamports" in body
    assert "usdc_micro" in body
    assert body["sol_lamports"] is None
    assert body["usdc_micro"] is None


def test_status_strip_uses_server_balances(monkeypatch):
    from src.backend.billing import wallet_balances

    def fake_fetch(owner):
        return {
            "wallet": owner,
            "sol_lamports": 2_500_000_000,
            "usdc_micro": 1_250_000,
            "rpc_ms": 12.4,
            "cached": False,
        }

    owner = "GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq"
    strip = mpp_streams.status_strip(owner, fetch_balances=fake_fetch)
    assert strip["sol_lamports"] == 2_500_000_000
    assert strip["usdc_micro"] == 1_250_000
    assert strip["rpc_ms"] == 12.4
    assert strip["wallet"] == owner
    assert wallet_balances.looks_like_pubkey(owner)
    assert not wallet_balances.looks_like_pubkey("alice")


def test_wallet_balances_parses_get_multiple_accounts():
    from src.backend.billing import wallet_balances

    wallet_balances.clear_balance_cache()
    owner = "GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq"
    mint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    ata = __import__(
        "src.backend.mpp.mpp_onchain", fromlist=["derive_associated_token_address"]
    ).derive_associated_token_address(owner, mint)
    token_data = bytearray(165)
    token_data[64:72] = (1_000_000).to_bytes(8, "little")
    import base64

    def fake_rpc(_url, payload):
        assert payload["method"] == "getMultipleAccounts"
        assert payload["params"][0] == [owner, ata]
        return {
            "result": {
                "value": [
                    {"lamports": 3_100_000_000},
                    {
                        "lamports": 2_039_280,
                        "data": [base64.b64encode(token_data).decode(), "base64"],
                    },
                ]
            }
        }

    first = wallet_balances.fetch_wallet_balances(owner, fetch_impl=fake_rpc)
    assert first["sol_lamports"] == 3_100_000_000
    assert first["usdc_micro"] == 1_000_000
    assert first["cached"] is False
    second = wallet_balances.fetch_wallet_balances(
        owner, fetch_impl=lambda *_: (_ for _ in ()).throw(RuntimeError("no rpc"))
    )
    assert second["cached"] is True
    assert second["sol_lamports"] == 3_100_000_000
    assert second["rpc_ms"] is not None
    assert second["rpc_ms"] < 5
