"""
End-to-end integration test for the Helius demo flow:

  AI agent builder → store Helius key → get KS_TOKEN →
  agent proxies RPC call → dashboard sees usage →
  balance depleted → proxy returns 402 →
  dashboard one-click revoke → done

Runs against the real FastAPI app in-process via Starlette TestClient.
Upstream Helius calls are intercepted by patching the httpx client to
return a fake getBalance response, so no real API key is needed.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from keyshield import KeyShield


@pytest.fixture
def ks(sync_client):
    with KeyShield(base_url="http://test", client=sync_client) as client:
        yield client


# ── Fake upstream response ──────────────────────────────────────────────


def _fake_helius_response(balance: int = 1_500_000_000):
    """A realistic Helius getBalance JSON-RPC response."""
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {"context": {"slot": 123456}, "value": balance},
    }


# ── The full demo journey ──────────────────────────────────────────────


class TestHeliusDemoFlow:
    """Tests the exact demo script from the hackathon pitch."""

    def test_store_helius_key(self, ks):
        """Step 1: AI agent builder stores their Helius API key."""
        ks.login("agent-builder", "demo-pass")
        ks.store("helius", "test-helius-api-key-abc123")

        keys = ks.list_keys()
        assert "helius" in keys

        decrypted = ks.decrypt_key("helius")
        assert decrypted == "test-helius-api-key-abc123"

    def test_vproxy_resolves_vault_key(self, ks, sync_client):
        """Step 3: Agent uses /vproxy/helius which auto-resolves the key
        from the vault — no X-Upstream-API-Key header needed."""
        ks.login("agent-builder", "demo-pass")
        ks.store("helius", "test-helius-key")

        token = ks._token
        rpc_body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": ["So11111111111111111111111111111112"],
        }

        fake_resp = httpx.Response(
            200,
            json=_fake_helius_response(),
            request=httpx.Request("POST", "https://mainnet.helius-rpc.com/"),
        )

        with patch(
            "src.backend.proxy.api_router._CLIENTS",
            {"helius-rpc": AsyncMock(post=AsyncMock(return_value=fake_resp))},
        ):
            resp = sync_client.post(
                "/vproxy/helius/",
                json=rpc_body,
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["result"]["value"] == 1_500_000_000

    def test_usage_logged_after_proxy_call(self, ks, sync_client):
        """Step 5: Dashboard sees the usage after proxying."""
        ks.login("agent-builder", "demo-pass")
        ks.store("helius", "test-helius-key")
        token = ks._token

        rpc_body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": ["So11111111111111111111111111111112"],
        }

        fake_resp = httpx.Response(
            200,
            json=_fake_helius_response(),
            request=httpx.Request("POST", "https://mainnet.helius-rpc.com/"),
        )

        with patch(
            "src.backend.proxy.api_router._CLIENTS",
            {"helius-rpc": AsyncMock(post=AsyncMock(return_value=fake_resp))},
        ):
            sync_client.post(
                "/vproxy/helius/",
                json=rpc_body,
                headers={"Authorization": f"Bearer {token}"},
            )

        history = ks.usage_history()
        assert len(history) >= 1
        assert history[0]["upstream"] == "helius"

    def test_balance_depleted_returns_402(self, ks, sync_client):
        """Step 6: When balance hits zero, proxy returns 402."""
        ks.login("agent-builder", "demo-pass")
        ks.store("helius", "test-helius-key")
        token = ks._token

        # Drain the free credit to zero
        from src.backend.billing import usage as usage_mod

        balance = usage_mod.get_balance("agent-builder")
        usage_mod.log_call(
            user_id="agent-builder",
            upstream="helius",
            key_type="platform",
            cost_usd=balance + 0.01,
            status_code=200,
        )

        new_balance = usage_mod.get_balance("agent-builder")
        assert new_balance <= 0

        rpc_body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": ["So11111111111111111111111111111112"],
        }
        resp = sync_client.post(
            "/vproxy/helius/",
            json=rpc_body,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 402
        assert resp.json()["error"] == "insufficient_balance"

    def test_topup_restores_access(self, ks, sync_client):
        """After topping up, proxy calls succeed again."""
        ks.login("agent-builder", "demo-pass")
        ks.store("helius", "test-helius-key")
        token = ks._token

        # Drain balance
        from src.backend.billing import usage as usage_mod

        balance = usage_mod.get_balance("agent-builder")
        usage_mod.log_call(
            user_id="agent-builder",
            upstream="helius",
            key_type="platform",
            cost_usd=balance + 0.01,
            status_code=200,
        )
        assert usage_mod.get_balance("agent-builder") <= 0

        # Top up
        ks.topup(amount_usd=1.00)
        assert usage_mod.get_balance("agent-builder") > 0

        # Proxy should work again
        rpc_body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": ["So11111111111111111111111111111112"],
        }
        fake_resp = httpx.Response(
            200,
            json=_fake_helius_response(),
            request=httpx.Request("POST", "https://mainnet.helius-rpc.com/"),
        )
        with patch(
            "src.backend.proxy.api_router._CLIENTS",
            {"helius-rpc": AsyncMock(post=AsyncMock(return_value=fake_resp))},
        ):
            resp = sync_client.post(
                "/vproxy/helius/",
                json=rpc_body,
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    def test_agent_revoke_blocks_access(self, ks, sync_client):
        """Step 7: One-click revoke from dashboard kills the agent's session."""
        ks.login("agent-builder", "demo-pass")

        # Register an agent
        result = ks.agent_register("A" * 32, name="helius-bot")
        assert result["ok"] is True

        agents = ks.agent_list()
        assert len(agents) >= 1
        agent = agents[0]

        # Revoke the agent
        ks.agent_revoke(agent["id"])
        assert ks.agent_list() == []

    def test_full_journey(self, ks, sync_client):
        """The complete demo script, end to end."""
        # 1. Login
        ks.login("agent-builder", "demo-pass")

        # 2. Store Helius key
        ks.store("helius", "test-helius-key-full")
        assert "helius" in ks.list_keys()

        # 3. Check initial balance (should have free credit)
        bal = ks.get_balance()
        assert bal["balance_usd"] > 0

        # 4. Make a proxy call
        token = ks._token
        rpc_body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": ["So11111111111111111111111111111112"],
        }
        fake_resp = httpx.Response(
            200,
            json=_fake_helius_response(2_000_000_000),
            request=httpx.Request("POST", "https://mainnet.helius-rpc.com/"),
        )
        with patch(
            "src.backend.proxy.api_router._CLIENTS",
            {"helius-rpc": AsyncMock(post=AsyncMock(return_value=fake_resp))},
        ):
            resp = sync_client.post(
                "/vproxy/helius/",
                json=rpc_body,
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        assert resp.json()["result"]["value"] == 2_000_000_000

        # 5. Check usage was logged
        history = ks.usage_history()
        assert len(history) >= 1
        assert history[0]["upstream"] == "helius"

        # 6. Drain balance → 402
        from src.backend.billing import usage as usage_mod

        current = usage_mod.get_balance("agent-builder")
        usage_mod.log_call(
            user_id="agent-builder",
            upstream="helius",
            key_type="platform",
            cost_usd=current + 0.01,
            status_code=200,
        )
        resp = sync_client.post(
            "/vproxy/helius/",
            json=rpc_body,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 402

        # 7. Top up → access restored
        ks.topup(amount_usd=0.50)
        with patch(
            "src.backend.proxy.api_router._CLIENTS",
            {"helius-rpc": AsyncMock(post=AsyncMock(return_value=fake_resp))},
        ):
            resp = sync_client.post(
                "/vproxy/helius/",
                json=rpc_body,
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

        # 8. Register agent → revoke
        ks.agent_register("B" * 32, name="rpc-bot")
        agents = ks.agent_list()
        assert any(a["name"] == "rpc-bot" for a in agents)
        agent = next(a for a in agents if a["name"] == "rpc-bot")
        ks.agent_revoke(agent["id"])
        assert not any(a["name"] == "rpc-bot" for a in ks.agent_list())
