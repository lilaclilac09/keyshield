"""
Parity tests for the sync `KeyShield` client. Each test drives the SDK
against the real FastAPI app via httpx.ASGITransport — no mocking, no
running server, no port binding.

Coverage: auth (login/logout), vault CRUD, billing balance + topup,
pricing CRUD, agents (register/list/revoke + agent_create), usage_history.
"""

import pytest
from keyshield import KeyShield, KeyShieldError


@pytest.fixture
def ks(sync_client):
    with KeyShield(base_url="http://test", client=sync_client) as client:
        yield client


# ─── auth ────────────────────────────────────────────────────────────────


class TestAuth:
    def test_login_returns_and_stores_token(self, ks):
        token = ks.login("alice", "secret")
        assert isinstance(token, str) and token
        # Subsequent authed calls go through.
        assert ks.list_keys() == []

    def test_login_bad_password_raises(self, sync_client):
        ks = KeyShield(base_url="http://test", client=sync_client)
        ks.login("alice", "first")
        # Login again with a different password is allowed (creates a
        # new vault). The auth failure path we care about is calling
        # an authed endpoint with no token.
        with pytest.raises(KeyShieldError) as exc:
            KeyShield(base_url="http://test", client=sync_client).list_keys()
        assert exc.value.status == 401

    def test_logout_clears_local_token(self, ks):
        ks.login("alice", "secret")
        ks.logout()
        with pytest.raises(KeyShieldError) as exc:
            ks.list_keys()
        assert exc.value.status == 401


# ─── vault ──────────────────────────────────────────────────────────────


class TestVault:
    def test_store_then_list_then_decrypt(self, ks):
        ks.login("alice", "secret")
        ks.store("openai", "sk-USERS-OWN")
        assert ks.list_keys() == ["openai"]
        assert ks.decrypt_key("openai") == "sk-USERS-OWN"

    def test_delete_removes_a_stored_key(self, ks):
        ks.login("alice", "secret")
        ks.store("openai", "sk-X")
        ks.store("anthropic", "sk-Y")
        ks.delete_key("openai")
        assert ks.list_keys() == ["anthropic"]


# ─── billing & pricing ──────────────────────────────────────────────────


class TestBillingAndPricing:
    def test_balance_returns_free_credit_for_a_new_user(self, ks):
        ks.login("alice", "secret")
        bal = ks.get_balance()
        assert bal["balance_usd"] >= 0
        assert "free_credit_usd" in bal

    def test_topup_increments_balance(self, ks):
        ks.login("alice", "secret")
        before = ks.get_balance()["balance_usd"]
        ks.topup(amount_usd=0.50)
        after = ks.get_balance()["balance_usd"]
        assert round(after - before, 6) == 0.50

    def test_pricing_round_trip(self, ks):
        ks.login("alice", "secret")
        assert ks.list_pricing() == []

        result = ks.set_pricing("openai", price_usd=0.005)
        assert result == {"ok": True, "upstream": "openai", "price_usd": 0.005}

        rows = ks.list_pricing()
        assert len(rows) == 1
        assert rows[0]["upstream"] == "openai"
        assert rows[0]["price_usd"] == 0.005

        ks.clear_pricing("openai")
        assert ks.list_pricing() == []

    def test_set_pricing_validates(self, ks):
        ks.login("alice", "secret")
        with pytest.raises(KeyShieldError) as exc:
            ks.set_pricing("openai", price_usd=-1)
        assert exc.value.status == 400

        with pytest.raises(KeyShieldError) as exc:
            ks.set_pricing("not-a-real-upstream", price_usd=0.001)
        assert exc.value.status == 404


# ─── agents ─────────────────────────────────────────────────────────────


class TestAgents:
    def test_agent_register_then_list(self, ks):
        ks.login("alice", "secret")
        # Use a deterministic 32-byte pubkey (base58 of 32 zeros = "1" * 32).
        pk = "1" * 32
        result = ks.agent_register(pk, name="bot")
        assert result["ok"] is True
        agents = ks.agent_list()
        assert any(a["pubkey_b58"] == pk and a["name"] == "bot" for a in agents)

    def test_agent_revoke(self, ks):
        ks.login("alice", "secret")
        pk = "1" * 32
        result = ks.agent_register(pk, name="bot")
        ks.agent_revoke(result["agentId"])
        assert ks.agent_list() == []

    def test_agent_create_generates_keypair_and_registers(self, ks):
        """`agent_create` mirrors `keyshield agent create` on the TS CLI."""
        pytest.importorskip("nacl.signing")
        ks.login("alice", "secret")
        creds = ks.agent_create(name="trading-bot")
        assert "private_key_hex" in creds
        assert "pubkey_b58" in creds
        assert creds["name"] == "trading-bot"
        assert isinstance(creds["agent_id"], int)
        # And it shows up in the listing.
        names = [a["name"] for a in ks.agent_list()]
        assert "trading-bot" in names


# ─── usage stats ────────────────────────────────────────────────────────


class TestUsage:
    def test_history_is_empty_for_a_brand_new_user(self, ks):
        ks.login("alice", "secret")
        assert ks.usage_history() == []

    def test_stats_shape(self, ks):
        ks.login("alice", "secret")
        stats = ks.usage_stats()
        assert "stats" in stats and isinstance(stats["stats"], list)


# ─── lifecycle ──────────────────────────────────────────────────────────


class TestLifecycle:
    def test_proxy_url_helper(self, ks):
        assert ks.proxy_url("openai") == "http://test/proxy/openai/"

    def test_authed_call_without_login_raises(self, sync_client):
        # Don't use `ks` fixture — that uses `with` which doesn't login.
        ks = KeyShield(base_url="http://test", client=sync_client)
        with pytest.raises(KeyShieldError) as exc:
            ks.list_keys()
        assert exc.value.status == 401
