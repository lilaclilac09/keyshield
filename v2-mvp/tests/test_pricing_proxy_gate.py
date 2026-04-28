"""
Tests for slice 2 of the x402 wiring: the proxy now respects an
owner-set per-upstream price.

What's covered here:
  - `usage.log_call(force_debit=True)` debits even on self-custodian
    rows (so an owner who's set a price gets metered).
  - `_x402_body(price_usd=...)` quotes the owner's number, falling
    back to the legacy $0.01 platform default.
  - Proxy returns 402 when owner has set a price > 0 and balance == 0.
  - Proxy lets a self-custodian call through unchanged when no price
    is set (existing behaviour preserved — opt-in only).
"""

import asyncio
import pytest
from pathlib import Path


# ─── module-level: usage.log_call force_debit ────────────────────────────


@pytest.fixture
def usage_module(tmp_path, monkeypatch):
    from src import usage as usage_mod

    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "usage.db"))
    return usage_mod


class TestForceDebit:
    """
    The user gets `usage.FREE_CREDIT_USD` of starter credit on first
    balance-touch, so these tests measure deltas instead of absolute
    balances — that way a future change to FREE_CREDIT_USD doesn't
    silently break them.
    """

    def test_self_custodian_does_not_debit_by_default(self, usage_module):
        usage_module.topup("alice", 1.0)
        before = usage_module.get_balance("alice")
        usage_module.log_call(
            "alice", "openai", "self_custodian", "POST", "/v1",
            tokens_in=10, tokens_out=20, cost_usd=0.50,
            latency_ms=12.0, status_code=200,
        )
        after = usage_module.get_balance("alice")
        assert after == before  # legacy semantics: self-custodian is free

    def test_force_debit_deducts_on_self_custodian(self, usage_module):
        usage_module.topup("alice", 1.0)
        before = usage_module.get_balance("alice")
        usage_module.log_call(
            "alice", "openai", "self_custodian", "POST", "/v1",
            tokens_in=10, tokens_out=20, cost_usd=0.25,
            latency_ms=12.0, status_code=200,
            force_debit=True,
        )
        after = usage_module.get_balance("alice")
        assert round(before - after, 6) == 0.25

    def test_force_debit_with_zero_cost_is_a_noop_on_balance(self, usage_module):
        usage_module.topup("alice", 1.0)
        before = usage_module.get_balance("alice")
        usage_module.log_call(
            "alice", "openai", "self_custodian", "POST", "/v1",
            tokens_in=0, tokens_out=0, cost_usd=0.0,
            latency_ms=1.0, status_code=200,
            force_debit=True,
        )
        after = usage_module.get_balance("alice")
        assert after == before

    def test_platform_still_debits_without_force_flag(self, usage_module):
        # Legacy path unchanged: platform key always debits.
        usage_module.topup("alice", 1.0)
        before = usage_module.get_balance("alice")
        usage_module.log_call(
            "alice", "openai", "platform", "POST", "/v1",
            tokens_in=10, tokens_out=20, cost_usd=0.30,
            latency_ms=12.0, status_code=200,
        )
        after = usage_module.get_balance("alice")
        assert round(before - after, 6) == 0.30


# ─── module-level: _x402_body price quoting ──────────────────────────────


class TestX402BodyQuote:
    def test_default_price_quotes_one_cent(self):
        from src.server import _x402_body

        body = _x402_body("openai", "http://x/proxy/openai/foo")
        # $0.01 USDC → 10000 atomic (6 decimals).
        assert body["accepts"][0]["maxAmountRequired"] == "10000"

    def test_owner_price_overrides_default(self):
        from src.server import _x402_body

        body = _x402_body("openai", "http://x", price_usd=0.005)
        # $0.005 → 5000 atomic.
        assert body["accepts"][0]["maxAmountRequired"] == "5000"

    def test_owner_zero_price_falls_back_to_default(self):
        # Explicit-$0 means "not actually charging right now" — the
        # 402 quote should still suggest the platform default rather
        # than asking for zero USDC, which a wallet would reject.
        from src.server import _x402_body

        body = _x402_body("openai", "http://x", price_usd=0.0)
        assert body["accepts"][0]["maxAmountRequired"] == "10000"

    def test_sub_atomic_price_rounds_up_to_one_unit(self):
        from src.server import _x402_body

        body = _x402_body("openai", "http://x", price_usd=0.0000001)  # 0.1 atomic
        assert int(body["accepts"][0]["maxAmountRequired"]) >= 1


# ─── HTTP-level: proxy gate respects owner pricing ───────────────────────


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import pricing as pricing_mod

    monkeypatch.setattr(vault_mod,   "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH",   Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod,  "DB_PATH",   Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod,   "DB_PATH",   Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(pricing_mod, "DB_PATH",   Path(tmp_path / "data" / "pricing.db"))
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
    r = client.post("/auth/login", json={"userId": "alice", "password": "secret"})
    return r.json()["token"]


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


class TestProxyPricingGate:
    def test_self_custodian_with_owner_price_and_zero_balance_returns_402(
        self, client, login, monkeypatch
    ):
        """Owner opted in to pricing → balance gates the call even with own key."""
        from src import usage

        # Stash a self-custodian key so _resolve_key returns it.
        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-USERS-OWN"},
        )
        # Owner sets a price.
        client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0.005},
        )
        # Force balance to zero.
        monkeypatch.setattr(usage, "get_balance", lambda user_id: 0.0)

        r = client.post(
            "/proxy/openai/v1/chat",
            headers=_auth(login),
            json={"model": "gpt-4"},
        )
        assert r.status_code == 402
        body = r.json()
        # x402 quote reflects the owner's set price (0.005 → 5000 atomic).
        assert body["accepts"][0]["maxAmountRequired"] == "5000"

    def test_self_custodian_without_price_passes_through_unchanged(
        self, client, login, monkeypatch
    ):
        """Pricing is opt-in — owners who haven't set one keep the legacy free path."""
        from src import api_router, usage

        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-USERS-OWN"},
        )
        # Even at zero balance, the call must succeed (no opt-in == no gate).
        monkeypatch.setattr(usage, "get_balance", lambda user_id: 0.0)

        async def fake_call_rest(provider, method, full_path, body, api_key, extra):
            return b'{"ok":true}', 200, "MISS"

        monkeypatch.setattr(api_router, "call_rest", fake_call_rest)
        r = client.post(
            "/proxy/openai/v1/chat",
            headers=_auth(login),
            json={},
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_self_custodian_with_price_and_balance_passes_through(
        self, client, login, monkeypatch
    ):
        """Owner has price and headroom → call goes through normally."""
        from src import api_router, usage

        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-USERS-OWN"},
        )
        client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0.001},
        )
        usage.topup("alice", 0.10)

        async def fake_call_rest(provider, method, full_path, body, api_key, extra):
            return b'{"ok":true}', 200, "MISS"

        monkeypatch.setattr(api_router, "call_rest", fake_call_rest)
        r = client.post(
            "/proxy/openai/v1/chat",
            headers=_auth(login),
            json={},
        )
        assert r.status_code == 200
        # Owner's stored key (not a platform key) was used.
        assert r.headers["x-ks-key-type"] == "self_custodian"

    def test_owner_zero_price_does_not_gate(self, client, login, monkeypatch):
        """Explicit $0 = 'opted in but free' — must not return 402."""
        from src import api_router, usage

        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-USERS-OWN"},
        )
        client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0},
        )
        monkeypatch.setattr(usage, "get_balance", lambda user_id: 0.0)

        async def fake_call_rest(*args, **kwargs):
            return b'{"ok":true}', 200, "MISS"

        monkeypatch.setattr(api_router, "call_rest", fake_call_rest)
        r = client.post("/proxy/openai/v1/chat", headers=_auth(login), json={})
        # Owner said "0" → not actually charging → no gate.
        assert r.status_code == 200
