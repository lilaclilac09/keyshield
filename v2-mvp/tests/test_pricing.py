"""
Tests for the owner-set per-upstream pricing module + HTTP routes.

Two layers:
  - module level: set / get / clear / list against a temp SQLite DB
  - HTTP level:   /billing/pricing GET / PUT / DELETE end-to-end with auth

Schema invariants exercised here:
  - absence == not enabled (get_price → None)
  - explicit $0 is distinct from absence (a row with price_usd=0)
  - upsert: setting twice updates the row, doesn't insert a duplicate
  - clear() returns whether a row actually existed
"""

import pytest
from pathlib import Path


# ─── module-level tests ───────────────────────────────────────────────────


@pytest.fixture
def pricing_module(tmp_path, monkeypatch):
    from src import pricing as pricing_mod

    monkeypatch.setattr(pricing_mod, "DB_PATH", Path(tmp_path / "pricing.db"))
    return pricing_mod


class TestPricingModule:
    def test_get_price_is_none_when_unset(self, pricing_module):
        assert pricing_module.get_price("alice", "openai") is None

    def test_set_then_get_round_trips(self, pricing_module):
        pricing_module.set_price("alice", "openai", 0.005)
        assert pricing_module.get_price("alice", "openai") == 0.005

    def test_explicit_zero_is_distinct_from_absence(self, pricing_module):
        # Owner saying "I'm explicitly free" creates a row; the
        # caller can tell that apart from "owner hasn't decided".
        pricing_module.set_price("alice", "openai", 0.0)
        assert pricing_module.get_price("alice", "openai") == 0.0
        assert pricing_module.get_price("alice", "anthropic") is None

    def test_set_twice_updates_in_place(self, pricing_module):
        pricing_module.set_price("alice", "openai", 0.001)
        pricing_module.set_price("alice", "openai", 0.01)
        assert pricing_module.get_price("alice", "openai") == 0.01
        # Only one row, not two.
        assert len(pricing_module.list_prices("alice")) == 1

    def test_negative_price_is_rejected(self, pricing_module):
        with pytest.raises(ValueError):
            pricing_module.set_price("alice", "openai", -0.01)

    def test_clear_returns_true_when_row_existed(self, pricing_module):
        pricing_module.set_price("alice", "openai", 0.001)
        assert pricing_module.clear_price("alice", "openai") is True
        assert pricing_module.get_price("alice", "openai") is None

    def test_clear_returns_false_when_row_did_not_exist(self, pricing_module):
        assert pricing_module.clear_price("alice", "openai") is False

    def test_pricing_is_isolated_per_user(self, pricing_module):
        pricing_module.set_price("alice", "openai", 0.01)
        pricing_module.set_price("bob",   "openai", 0.05)
        assert pricing_module.get_price("alice", "openai") == 0.01
        assert pricing_module.get_price("bob",   "openai") == 0.05

    def test_list_prices_returns_sorted_by_upstream(self, pricing_module):
        pricing_module.set_price("alice", "stripe",   0.002)
        pricing_module.set_price("alice", "anthropic", 0.005)
        pricing_module.set_price("alice", "openai",    0.003)
        upstreams = [p["upstream"] for p in pricing_module.list_prices("alice")]
        assert upstreams == ["anthropic", "openai", "stripe"]

    def test_list_prices_empty_when_owner_has_none(self, pricing_module):
        assert pricing_module.list_prices("alice") == []


# ─── HTTP-level tests ─────────────────────────────────────────────────────


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
    r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
    return r.json()["token"]


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


class TestListPricingRoute:
    def test_requires_bearer(self, client):
        assert client.get("/billing/pricing").status_code == 401

    def test_returns_empty_list_when_owner_has_none(self, client, login):
        r = client.get("/billing/pricing", headers=_auth(login))
        assert r.status_code == 200
        assert r.json() == {"pricing": []}

    def test_returns_what_was_set(self, client, login):
        client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0.001},
        )
        r = client.get("/billing/pricing", headers=_auth(login))
        body = r.json()
        assert len(body["pricing"]) == 1
        row = body["pricing"][0]
        assert row["upstream"] == "openai"
        assert row["price_usd"] == 0.001
        assert "updated_at" in row


class TestSetPricingRoute:
    def test_requires_bearer(self, client):
        assert client.put(
            "/billing/pricing/openai", json={"price_usd": 0.001}
        ).status_code == 401

    def test_round_trip_set_then_list(self, client, login):
        r = client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0.005},
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True, "upstream": "openai", "price_usd": 0.005}

    def test_unknown_upstream_is_404(self, client, login):
        r = client.put(
            "/billing/pricing/not-a-real-upstream",
            headers=_auth(login),
            json={"price_usd": 0.001},
        )
        assert r.status_code == 404

    def test_negative_price_is_400(self, client, login):
        r = client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": -1},
        )
        assert r.status_code == 400

    def test_price_above_dollar_cap_is_400(self, client, login):
        r = client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 1.01},
        )
        assert r.status_code == 400

    def test_zero_price_is_accepted(self, client, login):
        # Owner explicitly opting in at $0 is meaningful — distinct
        # from "no row at all" — so the API has to accept it.
        r = client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0},
        )
        assert r.status_code == 200

    def test_set_twice_keeps_only_latest(self, client, login):
        client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0.001},
        )
        client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0.01},
        )
        body = client.get("/billing/pricing", headers=_auth(login)).json()
        assert len(body["pricing"]) == 1
        assert body["pricing"][0]["price_usd"] == 0.01


class TestClearPricingRoute:
    def test_requires_bearer(self, client):
        assert client.delete(
            "/billing/pricing/openai"
        ).status_code == 401

    def test_clears_an_existing_row(self, client, login):
        client.put(
            "/billing/pricing/openai",
            headers=_auth(login),
            json={"price_usd": 0.001},
        )
        r = client.delete("/billing/pricing/openai", headers=_auth(login))
        assert r.status_code == 200
        assert r.json() == {"ok": True, "removed": True}
        # And the GET reflects it.
        body = client.get("/billing/pricing", headers=_auth(login)).json()
        assert body == {"pricing": []}

    def test_no_op_when_nothing_to_clear(self, client, login):
        r = client.delete("/billing/pricing/openai", headers=_auth(login))
        assert r.status_code == 200
        assert r.json() == {"ok": True, "removed": False}


class TestPricingIsolatedPerOwner:
    def test_two_users_do_not_see_each_others_prices(self, client):
        ta = client.post(
            "/auth/login", json={"userId": "alice", "password": "pw"}
        ).json()["token"]
        tb = client.post(
            "/auth/login", json={"userId": "bob", "password": "pw"}
        ).json()["token"]

        client.put(
            "/billing/pricing/openai",
            headers=_auth(ta),
            json={"price_usd": 0.01},
        )
        # Bob hasn't set anything → empty list.
        assert client.get("/billing/pricing", headers=_auth(tb)).json() == {
            "pricing": []
        }
        # Alice still sees her own.
        body = client.get("/billing/pricing", headers=_auth(ta)).json()
        assert body["pricing"][0]["upstream"] == "openai"
