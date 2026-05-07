"""
HTTP route tests for /skill/helius/{run,tools}.

  GET  /skill/helius/tools  → returns the tool-schema array (no auth)
  POST /skill/helius/run    → Bearer-gated; injects user's helius key,
                              dispatches to skills.helius_skill.run_tool
"""

import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
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
    return client.post("/auth/login", json={"userId": "alice", "password": "p"}).json()["token"]


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ─── /skill/helius/tools ───────────────────────────────────────────────────


class TestSkillTools:
    def test_no_auth_required(self, client):
        # Per the route signature it's not gated.
        r = client.get("/skill/helius/tools")
        assert r.status_code == 200

    def test_returns_tools_array_with_required_fields(self, client):
        r = client.get("/skill/helius/tools")
        body = r.json()
        assert "tools" in body
        assert isinstance(body["tools"], list)
        assert len(body["tools"]) > 0
        for tool in body["tools"]:
            # Each schema entry should at minimum have a name.
            assert "name" in tool

    def test_tools_match_module_export(self, client):
        from src.skills import helius_skill

        r = client.get("/skill/helius/tools")
        assert r.json()["tools"] == helius_skill.TOOL_SCHEMAS


# ─── /skill/helius/run ─────────────────────────────────────────────────────


class TestSkillRun:
    def test_requires_bearer(self, client):
        r = client.post("/skill/helius/run", json={"tool": "portfolio", "inputs": {}})
        assert r.status_code == 401

    def test_dispatches_to_run_tool_and_returns_result(self, client, login, monkeypatch):
        from src.skills import helius_skill
        from src import server

        # Make sure alice has a helius key stored so _resolve_key
        # picks self-custodian instead of asking for platform key.
        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "helius", "apiKey": "h-USERS-OWN"},
        )

        captured = {}

        async def fake_run(name, inputs, api_key):
            captured["name"] = name
            captured["inputs"] = inputs
            captured["api_key"] = api_key
            return {"wallet": inputs.get("wallet"), "balance": 1234}

        monkeypatch.setattr(helius_skill, "run_tool", fake_run)

        r = client.post(
            "/skill/helius/run",
            headers=_auth(login),
            json={"tool": "portfolio", "inputs": {"wallet": "9WzD..."}},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["tool"] == "portfolio"
        assert body["result"]["balance"] == 1234

        # The user's stored helius key was injected, NOT a platform key.
        assert captured["api_key"] == "h-USERS-OWN"
        assert captured["name"] == "portfolio"
        assert captured["inputs"] == {"wallet": "9WzD..."}

    def test_400_on_unknown_tool_name(self, client, login, monkeypatch):
        from src.skills import helius_skill
        from src import server

        # Need a key (any) so we get past _resolve_key.
        monkeypatch.setitem(server.PLATFORM_KEYS, "helius", "platform-h")

        async def fake_run(name, inputs, api_key):
            raise ValueError(f"unknown tool: {name}")

        monkeypatch.setattr(helius_skill, "run_tool", fake_run)
        # Avoid the x402 path by giving alice some balance.
        from src import usage
        usage.topup("alice", 1.0)

        r = client.post(
            "/skill/helius/run",
            headers=_auth(login),
            json={"tool": "made-up-tool", "inputs": {}},
        )
        assert r.status_code == 400
        assert "unknown tool" in r.json()["detail"]

    def test_default_empty_inputs_works(self, client, login, monkeypatch):
        from src.skills import helius_skill

        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "helius", "apiKey": "h-X"},
        )

        async def fake_run(name, inputs, api_key):
            return {"name": name, "inputs": inputs}

        monkeypatch.setattr(helius_skill, "run_tool", fake_run)

        r = client.post(
            "/skill/helius/run",
            headers=_auth(login),
            json={"tool": "portfolio"},  # no inputs
        )
        assert r.status_code == 200
        # Body model defaults inputs={}
        assert r.json()["result"]["inputs"] == {}

    def test_no_helius_key_anywhere_returns_401(self, client, login, monkeypatch):
        """If alice has no stored helius key AND no platform key is
        configured, the route returns 401 from _resolve_key."""
        from src import server

        # Force-clear platform key.
        monkeypatch.setitem(server.PLATFORM_KEYS, "helius", "")

        r = client.post(
            "/skill/helius/run",
            headers=_auth(login),
            json={"tool": "portfolio", "inputs": {}},
        )
        assert r.status_code == 401
