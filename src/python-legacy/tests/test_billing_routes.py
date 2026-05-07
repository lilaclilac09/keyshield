"""
HTTP route tests for /usage/{stats,history} and /billing/{balance,topup}.
The thin SQL wrappers are tested in test_usage_module.py; this file
pins the HTTP-layer contract (auth, validation, JSON shape).
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
    # x402_verify caches a "warned about missing env" flag; reset
    # so each test starts fresh.
    x402_mod._WARNED_ENV_MISSING = False
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


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ─── /usage/stats ──────────────────────────────────────────────────────────


class TestUsageStats:
    def test_requires_bearer(self, client):
        assert client.get("/usage/stats").status_code == 401

    def test_empty_when_no_calls_logged(self, client, login):
        r = client.get("/usage/stats", headers=_auth(login))
        assert r.status_code == 200
        assert r.json() == {"stats": []}

    def test_returns_aggregates_after_log_call(self, client, login):
        from src import usage

        usage.log_call("alice", "openai", "self_custodian", "POST", "/v1",
                       100, 50, 0.0, 100.0, 200)
        r = client.get("/usage/stats", headers=_auth(login))
        body = r.json()
        assert len(body["stats"]) == 1
        s = body["stats"][0]
        assert s["upstream"] == "openai"
        assert s["calls"] == 1
        assert s["tokens_in"] == 100

    def test_isolated_per_user(self, client):
        from src import usage

        a = client.post("/auth/login", json={"userId": "alice", "password": "p"}).json()["token"]
        b = client.post("/auth/login", json={"userId": "bob", "password": "p"}).json()["token"]

        usage.log_call("alice", "openai", "self_custodian", "POST", "/x",
                       1, 1, 0, 100, 200)
        usage.log_call("bob", "anthropic", "platform", "POST", "/y",
                       1, 1, 0, 100, 200)

        a_stats = client.get("/usage/stats", headers=_auth(a)).json()["stats"]
        b_stats = client.get("/usage/stats", headers=_auth(b)).json()["stats"]
        assert {s["upstream"] for s in a_stats} == {"openai"}
        assert {s["upstream"] for s in b_stats} == {"anthropic"}


# ─── /usage/history ────────────────────────────────────────────────────────


class TestUsageHistory:
    def test_requires_bearer(self, client):
        assert client.get("/usage/history").status_code == 401

    def test_default_limit_50(self, client, login):
        from src import usage

        for i in range(80):
            usage.log_call("alice", "openai", "self_custodian", "POST", f"/{i}",
                           0, 0, 0, 100, 200)
        r = client.get("/usage/history", headers=_auth(login))
        # The default per the route is 50.
        assert len(r.json()["history"]) == 50

    def test_custom_limit_clamped_to_100(self, client, login):
        from src import usage

        for i in range(150):
            usage.log_call("alice", "openai", "self_custodian", "POST", f"/{i}",
                           0, 0, 0, 100, 200)
        r = client.get("/usage/history?limit=500", headers=_auth(login))
        assert len(r.json()["history"]) == 100  # min(limit, 100)

    def test_each_entry_has_expected_fields(self, client, login):
        from src import usage

        usage.log_call("alice", "openai", "self_custodian", "POST", "/v1",
                       100, 50, 0.001, 320.5, 200)
        r = client.get("/usage/history", headers=_auth(login))
        h = r.json()["history"][0]
        for field in ("id", "upstream", "key_type", "method", "path",
                      "tokens_in", "tokens_out", "cost_usd",
                      "latency_ms", "status_code", "ts"):
            assert field in h


# ─── /billing/balance ──────────────────────────────────────────────────────


class TestBillingBalance:
    def test_requires_bearer(self, client):
        assert client.get("/billing/balance").status_code == 401

    def test_new_user_sees_free_credit_and_zero_spend(self, client, login):
        from src import usage

        r = client.get("/billing/balance", headers=_auth(login))
        body = r.json()
        assert body["balance_usd"] == usage.FREE_CREDIT_USD
        assert body["total_spent_usd"] == 0
        assert body["free_credit_usd"] == usage.FREE_CREDIT_USD

    def test_after_topup_balance_reflects_it(self, client, login):
        from src import usage

        usage.topup("alice", 5.0)
        r = client.get("/billing/balance", headers=_auth(login))
        assert pytest.approx(r.json()["balance_usd"], rel=1e-6) == (
            usage.FREE_CREDIT_USD + 5.0
        )

    def test_after_platform_call_total_spent_increases(self, client, login):
        from src import usage

        usage.log_call("alice", "openai", "platform", "POST", "/v1",
                       100, 50, 0.05, 100, 200)
        body = client.get("/billing/balance", headers=_auth(login)).json()
        assert body["total_spent_usd"] >= 0.05


# ─── /billing/topup ────────────────────────────────────────────────────────


class TestBillingTopup:
    def test_requires_bearer(self, client):
        r = client.post("/billing/topup", json={"amount_usd": 1.0})
        assert r.status_code == 401

    def test_happy_path_credits_account(self, client, login):
        from src import usage

        before = usage.get_balance("alice")
        r = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 3.0, "payment_proof": "0xabcd"},
        )
        assert r.status_code == 200
        body = r.json()
        # Response contract: returns the new balance.
        assert "balance_usd" in body or "new_balance" in body
        after = usage.get_balance("alice")
        assert pytest.approx(after - before, rel=1e-6) == 3.0

    def test_rejects_zero_or_negative(self, client, login):
        for bad in (0, -1.0):
            r = client.post(
                "/billing/topup",
                headers=_auth(login),
                json={"amount_usd": bad},
            )
            assert r.status_code == 400

    def test_rejects_amounts_over_demo_cap(self, client, login):
        # The demo route caps at $10.
        r = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 11.0},
        )
        assert r.status_code == 400

    def test_payment_proof_optional(self, client, login):
        # The schema defaults payment_proof="" — a body without the
        # field should still be accepted.
        r = client.post(
            "/billing/topup",
            headers=_auth(login),
            json={"amount_usd": 1.5},
        )
        assert r.status_code == 200
