"""
Parity tests for the sync `KeyShield` client. Each test drives the SDK
against the real FastAPI app via Starlette TestClient — no mocking, no
running server, no port binding.

Coverage: wallet auth, vault CRUD aliases, billing balance + topup,
agents (register/list/revoke + agent_create), usage_history.
"""

import pytest
from keyshield import KeyShield, KeyShieldError
from conftest import wallet_login_sync


@pytest.fixture
def ks(sync_client):
    with KeyShield(base_url="http://test", client=sync_client) as client:
        yield client


# ─── auth ────────────────────────────────────────────────────────────────


class TestAuth:
    def test_wallet_login_returns_and_stores_token(self, ks):
        wallet = wallet_login_sync(ks)
        assert ks._token and ks._token.startswith("ksv2_")
        assert wallet
        assert ks.list_keys() == []

    def test_password_login_disabled(self, ks):
        with pytest.raises(KeyShieldError) as exc:
            ks.login("alice", "secret")
        assert exc.value.status == 403

    def test_authed_call_without_login_raises(self, sync_client):
        ks = KeyShield(base_url="http://test", client=sync_client)
        with pytest.raises(KeyShieldError) as exc:
            ks.list_keys()
        assert exc.value.status == 401

    def test_logout_clears_local_token(self, ks):
        wallet_login_sync(ks)
        ks.logout()
        with pytest.raises(KeyShieldError) as exc:
            ks.list_keys()
        assert exc.value.status == 401


# ─── vault ──────────────────────────────────────────────────────────────


class TestVault:
    def test_store_then_list_then_decrypt(self, ks):
        wallet_login_sync(ks)
        ks.store("openai", "sk-USERS-OWN")
        assert ks.list_keys() == ["openai"]
        assert ks.decrypt_key("openai") == "sk-USERS-OWN"

    def test_delete_removes_a_stored_key(self, ks):
        wallet_login_sync(ks)
        ks.store("openai", "sk-X")
        ks.store("anthropic", "sk-Y")
        ks.delete_key("openai")
        assert ks.list_keys() == ["anthropic"]


# ─── billing ────────────────────────────────────────────────────────────


class TestBilling:
    def test_balance_returns_shape_for_a_new_user(self, ks):
        wallet_login_sync(ks)
        bal = ks.get_balance()
        assert "balance_usd" in bal
        assert "free_credit_usd" in bal

    def test_topup_increments_balance(self, ks):
        wallet_login_sync(ks)
        before = ks.get_balance()["balance_usd"]
        ks.topup(amount_usd=0.50)
        after = ks.get_balance()["balance_usd"]
        assert round(after - before, 6) == 0.50


# ─── agents ─────────────────────────────────────────────────────────────


class TestAgents:
    def test_agent_register_then_list(self, ks):
        wallet_login_sync(ks)
        pk = "1" * 32
        result = ks.agent_register(pk, name="bot")
        assert result["ok"] is True
        agents = ks.agent_list()
        assert any(a["pubkey_b58"] == pk and a["name"] == "bot" for a in agents)

    def test_agent_revoke(self, ks):
        wallet_login_sync(ks)
        pk = "1" * 32
        result = ks.agent_register(pk, name="bot")
        ks.agent_revoke(result["agentId"])
        assert ks.agent_list() == []

    def test_agent_create_generates_keypair_and_registers(self, ks):
        pytest.importorskip("nacl.signing")
        wallet_login_sync(ks)
        creds = ks.agent_create(name="trading-bot")
        assert "private_key_hex" in creds
        assert "pubkey_b58" in creds
        assert creds["name"] == "trading-bot"
        assert isinstance(creds["agent_id"], int)
        names = [a["name"] for a in ks.agent_list()]
        assert "trading-bot" in names


# ─── usage stats ────────────────────────────────────────────────────────


class TestUsage:
    def test_history_is_empty_for_a_brand_new_user(self, ks):
        wallet_login_sync(ks)
        assert ks.usage_history() == []

    def test_stats_shape(self, ks):
        wallet_login_sync(ks)
        stats = ks.usage_stats()
        assert "stats" in stats
        assert isinstance(stats["stats"], list)


# ─── lifecycle ──────────────────────────────────────────────────────────


class TestLifecycle:
    def test_proxy_url_helper(self, ks):
        assert ks.proxy_url("openai") == "http://test/proxy/openai/"

    def test_proxy_sends_upstream_api_key_header(self, ks, monkeypatch):
        wallet_login_sync(ks)

        captured = {}

        def fake_request(method, url, json=None, headers=None):
            captured["headers"] = headers
            captured["url"] = url

            class _R:
                status_code = 200

                def json(self):
                    return {}

            return _R()

        monkeypatch.setattr(ks._client, "request", fake_request)
        ks.proxy("openai", "v1/models", method="GET", api_key="sk-live")
        assert captured["headers"]["X-Upstream-API-Key"] == "sk-live"
        assert captured["headers"]["Authorization"].startswith("Bearer ksv2_")
