"""
Tests for POST /manage/batch — the concurrent-dispatch endpoint that
fires N upstream requests via asyncio.gather.

Pins:
  - bearer-gating
  - batch size cap (>20 → 400)
  - per-item upstream resolution (unknown → {"error": ...})
  - Helius JSON-RPC items routed through api_router.call_helius
  - REST items (openai/anthropic/...) routed through api_router.call_rest
  - per-item failures don't kill the batch — other items still resolve
  - response shape: {"results": [...]} matching input order
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


class TestBatch:
    def test_requires_bearer(self, client):
        assert client.post("/manage/batch", json={"requests": []}).status_code == 401

    def test_empty_request_list_returns_empty_results(self, client, login):
        r = client.post("/manage/batch", headers=_auth(login), json={"requests": []})
        assert r.status_code == 200
        assert r.json() == {"results": []}

    def test_rejects_more_than_20_items(self, client, login):
        items = [{"upstream": "openai", "body": {}} for _ in range(21)]
        r = client.post(
            "/manage/batch",
            headers=_auth(login),
            json={"requests": items},
        )
        assert r.status_code == 400
        assert "20" in r.json()["detail"]

    def test_unknown_upstream_returns_error_in_that_slot(
        self, client, login, monkeypatch
    ):
        # Ensure alice has at least one valid stored key so other items
        # in the batch can succeed.
        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-real"},
        )

        from src import api_router

        async def fake_rest(*a, **k):
            return b'{"ok":true}', 200, "MISS"

        # Patch via monkeypatch so the override is auto-reverted at
        # teardown — direct assignment leaks into other test files.
        monkeypatch.setattr(api_router, "call_rest", fake_rest)

        r = client.post(
            "/manage/batch",
            headers=_auth(login),
            json={"requests": [
                {"upstream": "notarealthing", "body": {}},
                {"upstream": "openai", "body": {"prompt": "hi"}, "path": "v1/x"},
            ]},
        )
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) == 2
        assert "error" in results[0]
        assert "ok" not in results[0]
        # The valid item still ran.
        assert results[1].get("status") == 200 or "data" in results[1]

    def test_helius_jsonrpc_routed_through_helius_helper(self, client, login, monkeypatch):
        from src import api_router

        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "helius", "apiKey": "helius-X"},
        )

        captured = []

        async def fake_helius(method, params, api_key, rpc_id):
            captured.append({"method": method, "params": params, "id": rpc_id})
            return ({"jsonrpc": "2.0", "id": rpc_id, "result": {"slot": rpc_id * 10}}, "HIT")

        monkeypatch.setattr(api_router, "call_helius", fake_helius)

        r = client.post(
            "/manage/batch",
            headers=_auth(login),
            json={"requests": [
                {"upstream": "helius", "body": {"jsonrpc": "2.0", "method": "getSlot", "id": 1, "params": []}},
                {"upstream": "helius", "body": {"jsonrpc": "2.0", "method": "getBalance", "id": 2, "params": ["addr"]}},
            ]},
        )
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) == 2
        assert all(r["status"] == 200 for r in results)
        assert all(r["cache"] == "HIT" for r in results)
        # Order preserved.
        assert results[0]["data"]["result"]["slot"] == 10
        assert results[1]["data"]["result"]["slot"] == 20
        assert {c["method"] for c in captured} == {"getSlot", "getBalance"}

    def test_rest_provider_routed_through_call_rest(self, client, login, monkeypatch):
        from src import api_router

        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "anthropic", "apiKey": "sk-ant-X"},
        )

        captured = []

        async def fake_rest(provider, method, full_path, body, api_key, *args, **kwargs):
            captured.append({"provider": provider, "method": method,
                             "path": full_path, "api_key": api_key})
            return b'{"ok":true,"id":"msg-1"}', 200, "MISS"

        monkeypatch.setattr(api_router, "call_rest", fake_rest)

        r = client.post(
            "/manage/batch",
            headers=_auth(login),
            json={"requests": [{
                "upstream": "anthropic", "method": "POST", "path": "v1/messages",
                "body": {"model": "claude-3"},
            }]},
        )
        assert r.status_code == 200
        results = r.json()["results"]
        assert results[0]["status"] == 200
        assert captured[0]["provider"] == "anthropic"
        assert captured[0]["api_key"] == "sk-ant-X"
        assert "v1/messages" in captured[0]["path"]

    def test_per_item_failure_does_not_break_batch(self, client, login, monkeypatch):
        from src import api_router

        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "helius", "apiKey": "h-X"},
        )

        calls = {"count": 0}

        async def flaky_helius(method, params, api_key, rpc_id):
            calls["count"] += 1
            if calls["count"] == 1:
                raise RuntimeError("upstream timeout")
            return ({"jsonrpc": "2.0", "id": rpc_id, "result": "ok"}, "MISS")

        monkeypatch.setattr(api_router, "call_helius", flaky_helius)

        r = client.post(
            "/manage/batch",
            headers=_auth(login),
            json={"requests": [
                {"upstream": "helius", "body": {"jsonrpc": "2.0", "method": "getSlot", "id": 1, "params": []}},
                {"upstream": "helius", "body": {"jsonrpc": "2.0", "method": "getSlot", "id": 2, "params": []}},
            ]},
        )
        results = r.json()["results"]
        assert len(results) == 2
        # Exactly one error + one success (order may vary because asyncio.gather
        # runs them concurrently; the failing call is the FIRST one called by
        # `calls["count"]==1`, but item ordering in `results` matches input).
        errors = [r for r in results if "error" in r]
        oks = [r for r in results if r.get("status") == 200]
        assert len(errors) == 1
        assert len(oks) == 1
