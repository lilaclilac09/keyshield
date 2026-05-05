"""
Tests for x402 payment verification + idempotency.

The load-bearing security property is: the same payment_proof can never
credit twice, regardless of which user POSTs it. Tests cover:
  - Stub-fallback path (no env config) — verify returns True, idempotency
    still applies.
  - Real-mode path — env config present, verify_required=1 refuses
    stub-fallback, _verify_transfer_log decode logic.
  - /billing/topup integration — 409 on duplicate, 400 on empty proof
    when verify_required, demo path preserved otherwise.
"""

import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import x402_verify as x402_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(x402_mod, "DB_PATH", Path(tmp_path / "data" / "x402.db"))
    x402_mod._WARNED_ENV_MISSING = False
    yield


@pytest.fixture(autouse=True)
def clean_x402_env(monkeypatch):
    """Strip x402 env vars between tests so config-loading is deterministic."""
    for var in (
        "KS_X402_BASE_RPC_URL",
        "KS_X402_RECEIVER_ADDRESS",
        "KS_X402_USDC_ADDRESS",
        "KS_X402_MIN_CONFIRMATIONS",
        "KS_X402_VERIFY_REQUIRED",
    ):
        monkeypatch.delenv(var, raising=False)
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    server._CACHE.clear()
    return TestClient(server.app)


@pytest.fixture
def login(client):
    r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
    return r.json()["token"]


@pytest.fixture
def login_bob(client):
    r = client.post("/auth/login", json={"userId": "bob", "password": "pw"})
    return r.json()["token"]


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ─── unit tests: x402_verify module ───────────────────────────────────────


class TestLoadConfig:
    def test_returns_none_when_env_missing(self):
        from src import x402_verify

        assert x402_verify.load_x402_config() is None

    def test_loads_when_env_set(self, monkeypatch):
        from src import x402_verify

        monkeypatch.setenv("KS_X402_BASE_RPC_URL", "https://mainnet.base.org")
        monkeypatch.setenv(
            "KS_X402_RECEIVER_ADDRESS",
            "0x1234567890abcdef1234567890abcdef12345678",
        )
        cfg = x402_verify.load_x402_config()
        assert cfg is not None
        assert cfg.rpc_url == "https://mainnet.base.org"
        # Receiver lower-cased.
        assert cfg.receiver_address == "0x1234567890abcdef1234567890abcdef12345678"
        # USDC defaults to Base mainnet contract.
        assert cfg.usdc_address == x402_verify.USDC_BASE_MAINNET.lower()
        assert cfg.min_confirmations == x402_verify.DEFAULT_MIN_CONFIRMATIONS
        assert cfg.verify_required is False

    def test_invalid_receiver_returns_none(self, monkeypatch):
        from src import x402_verify

        monkeypatch.setenv("KS_X402_BASE_RPC_URL", "https://mainnet.base.org")
        monkeypatch.setenv("KS_X402_RECEIVER_ADDRESS", "not-an-address")
        assert x402_verify.load_x402_config() is None

    def test_verify_required_flag(self, monkeypatch):
        from src import x402_verify

        monkeypatch.setenv("KS_X402_BASE_RPC_URL", "https://mainnet.base.org")
        monkeypatch.setenv(
            "KS_X402_RECEIVER_ADDRESS",
            "0x1234567890abcdef1234567890abcdef12345678",
        )
        monkeypatch.setenv("KS_X402_VERIFY_REQUIRED", "1")
        cfg = x402_verify.load_x402_config()
        assert cfg is not None
        assert cfg.verify_required is True


class TestIdempotency:
    def test_first_claim_succeeds_second_raises(self):
        from src import x402_verify

        x402_verify.record_claim(
            payment_proof="0xdeadbeef" * 8,  # 64 hex chars
            user_id="alice",
            amount_usd=3.0,
            verified_mode="stub-fallback",
        )
        # Same proof + ANY user → DuplicateClaim. The proof is the
        # global key; one tx hash funds exactly one credit.
        with pytest.raises(x402_verify.DuplicateClaim):
            x402_verify.record_claim(
                payment_proof="0xdeadbeef" * 8,
                user_id="bob",     # different user, same proof
                amount_usd=3.0,
                verified_mode="real",
            )

    def test_has_claim_predicate(self):
        from src import x402_verify

        proof = "0xfeedface" * 8
        assert x402_verify.has_claim(proof) is False
        x402_verify.record_claim(proof, "alice", 1.0, "stub-fallback")
        assert x402_verify.has_claim(proof) is True


class TestVerifyOnChainStubFallback:
    """Async helper invoked via asyncio.run (no pytest-asyncio dep)."""

    def test_stub_returns_true_with_mode(self):
        import asyncio
        from src import x402_verify

        ok, mode = asyncio.run(
            x402_verify.verify_on_chain(
                config=None, payment_proof="anything",
                expected_amount_usd=1.0,
            )
        )
        assert ok is True
        assert mode == "stub-fallback"

    def test_stub_rejects_empty_proof(self):
        import asyncio
        from src import x402_verify

        with pytest.raises(x402_verify.VerifyError, match="empty"):
            asyncio.run(x402_verify.verify_on_chain(None, "", 1.0))


class TestTransferLogDecode:
    """Pure-data unit tests for _verify_transfer_log — exercises the
    on-chain decode without needing a real RPC."""

    def _config(self):
        from src import x402_verify
        return x402_verify.X402Config(
            rpc_url="x",
            receiver_address="0x1234567890abcdef1234567890abcdef12345678",
            usdc_address="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",  # lower
            min_confirmations=0,
            verify_required=False,
        )

    def _transfer_log(self, *, addr, recipient_padded, amount):
        return {
            "address": addr,
            "topics": [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                "0x" + "00" * 32,           # sender (don't care)
                recipient_padded,
            ],
            "data": hex(amount),
        }

    def test_matching_log_above_amount_succeeds(self):
        from src import x402_verify

        cfg = self._config()
        receiver_padded = "0x" + cfg.receiver_address[2:].rjust(64, "0")
        log = self._transfer_log(
            addr=cfg.usdc_address,
            recipient_padded=receiver_padded,
            amount=3_000_000,   # $3 in USDC micros
        )
        ok, mode = x402_verify._verify_transfer_log([log], cfg, 3.0)
        assert ok is True and mode == "real"

    def test_amount_below_expected_raises(self):
        from src import x402_verify

        cfg = self._config()
        receiver_padded = "0x" + cfg.receiver_address[2:].rjust(64, "0")
        log = self._transfer_log(
            addr=cfg.usdc_address,
            recipient_padded=receiver_padded,
            amount=1_000_000,   # $1, but caller expected $3
        )
        with pytest.raises(x402_verify.VerifyError, match="amount"):
            x402_verify._verify_transfer_log([log], cfg, 3.0)

    def test_wrong_recipient_skipped(self):
        from src import x402_verify

        cfg = self._config()
        wrong_recipient = "0x" + ("ab" * 32)  # 64-hex random
        log = self._transfer_log(
            addr=cfg.usdc_address,
            recipient_padded=wrong_recipient,
            amount=10_000_000,
        )
        with pytest.raises(x402_verify.VerifyError, match="no matching"):
            x402_verify._verify_transfer_log([log], cfg, 3.0)

    def test_wrong_token_contract_skipped(self):
        from src import x402_verify

        cfg = self._config()
        receiver_padded = "0x" + cfg.receiver_address[2:].rjust(64, "0")
        log = self._transfer_log(
            addr="0x" + ("01" * 20),  # not USDC
            recipient_padded=receiver_padded,
            amount=10_000_000,
        )
        with pytest.raises(x402_verify.VerifyError, match="no matching"):
            x402_verify._verify_transfer_log([log], cfg, 3.0)


# ─── integration: /billing/topup with x402 verify ─────────────────────────


class TestBillingTopupIntegration:
    """End-to-end behavior of /billing/topup with the new verify path."""

    def test_demo_path_still_works_when_proof_empty(self, client, login):
        """Empty proof + no env → demo credit (legacy contract preserved)."""
        r = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 2.0, "payment_proof": ""},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["verified_mode"] == "demo"

    def test_proof_in_stub_mode_records_idempotency(self, client, login):
        """With env unset, verify_on_chain falls back to stub but the
        proof still goes into the idempotency table — second submission
        of the same proof returns 409."""
        proof = "0xstub-fallback-test-proof-001"
        r1 = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 1.5, "payment_proof": proof},
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["verified_mode"] == "stub-fallback"

        # Second claim of the same proof → 409 Conflict.
        r2 = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 1.5, "payment_proof": proof},
        )
        assert r2.status_code == 409
        assert "already claimed" in r2.text

    def test_different_users_cant_both_claim_same_proof(
        self, client, login, login_bob,
    ):
        """One tx hash → one credit. Bob can't piggyback on Alice's proof."""
        proof = "0xshared-proof-1234567890abcdef"
        r_alice = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 2.0, "payment_proof": proof},
        )
        assert r_alice.status_code == 200

        r_bob = client.post(
            "/billing/topup",
            headers=_auth(login_bob),
            json={"amount_usd": 2.0, "payment_proof": proof},
        )
        assert r_bob.status_code == 409

    def test_verify_required_rejects_empty_proof(
        self, client, login, monkeypatch,
    ):
        """In prod gate (KS_X402_VERIFY_REQUIRED=1), empty proof is a
        400 — the demo path is gated off."""
        monkeypatch.setenv("KS_X402_BASE_RPC_URL", "https://mainnet.base.org")
        monkeypatch.setenv(
            "KS_X402_RECEIVER_ADDRESS",
            "0x1234567890abcdef1234567890abcdef12345678",
        )
        monkeypatch.setenv("KS_X402_VERIFY_REQUIRED", "1")
        from src import x402_verify
        x402_verify._WARNED_ENV_MISSING = False

        r = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 2.0, "payment_proof": ""},
        )
        assert r.status_code == 400
        assert "payment_proof is required" in r.text

    def test_verify_required_refuses_stub_fallback(
        self, client, login, monkeypatch,
    ):
        """KS_X402_VERIFY_REQUIRED=1 + an unreachable RPC must NOT silently
        fall through to stub. Mock load_x402_config to return verify_required
        cfg, then mock verify_on_chain to return stub-fallback. Result:
        503 because env signals "real verify only" but we couldn't deliver.
        """
        from src import x402_verify

        # Fake config that says "verify required".
        cfg = x402_verify.X402Config(
            rpc_url="x", receiver_address="0x" + "11" * 20,
            usdc_address="0x" + "22" * 20,
            min_confirmations=0, verify_required=True,
        )
        monkeypatch.setattr(x402_verify, "load_x402_config", lambda: cfg)

        async def fake_verify(c, p, a):
            return (True, "stub-fallback")
        monkeypatch.setattr(x402_verify, "verify_on_chain", fake_verify)

        r = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 2.0, "payment_proof": "0xreal-tx-hash-xx"},
        )
        assert r.status_code == 503
        assert "stub-fallback unavailable" in r.text
