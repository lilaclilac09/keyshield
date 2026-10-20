"""Per-agent usage: proxy calls are attributed to the agent / token that made
them, and /usage/agents + /usage/calls expose that to the owner only."""

from __future__ import annotations

import base64
import sqlite3

import pytest
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.mpp import mpp_onchain

FAKE_KEY = "sk-demo-not-a-real-key-0000000000000000"


@pytest.fixture()
def env(tmp_path, monkeypatch):
    from src.backend.agents import agents as agents_mod
    from src.backend.billing import usage as usage_mod
    from src.backend.routes import proxy as proxy_routes
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(agents_mod, "DB_PATH", tmp_path / "agents.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setenv("SERVER_SECRET", "test-usage-attribution-secret")

    async def fake_upstream(api_router, upstream, path, body, api_key, request, interceptor):
        status = 500 if path.endswith("boom") else 200
        return b'{"ok": true, "model": "resp-model"}', status, "MISS", None

    monkeypatch.setattr(proxy_routes, "_call_upstream", fake_upstream)
    client = TestClient(app)
    owner = sess_mod.create_token("alice", "")
    hdr = {"Authorization": f"Bearer {owner}"}
    r = client.post("/manage/store", headers=hdr, json={"upstream": "openai", "apiKey": FAKE_KEY})
    assert r.status_code == 200, r.text
    return client, owner, tmp_path


def _agent(client: TestClient, owner: str, name: str) -> tuple[int, str]:
    sk = SigningKey.generate()
    pub = mpp_onchain._b58encode_pure(bytes(sk.verify_key))
    reg = client.post(
        "/agents/register",
        headers={"Authorization": f"Bearer {owner}"},
        json={"pubkeyB58": pub, "name": name},
    )
    assert reg.status_code == 200, reg.text
    chal = client.post("/auth/agent-challenge").json()
    sig = base64.b64encode(sk.sign(chal["challenge"].encode()).signature).decode()
    r = client.post(
        "/auth/agent-login",
        json={
            "pubkeyB58": pub,
            "challenge": chal["challenge"],
            "nonce": chal["nonce"],
            "signature": sig,
        },
    )
    assert r.status_code == 200, r.text
    return reg.json()["id"], r.json()["token"]


def _call(client, token, path="/vproxy/openai/v1/chat/completions", model="gpt-test"):
    return client.post(
        path, headers={"Authorization": f"Bearer {token}"}, json={"model": model, "messages": []}
    )


def test_calls_are_attributed_and_listed(env):
    client, owner, _ = env
    oh = {"Authorization": f"Bearer {owner}"}
    agent_id, agent_tok = _agent(client, owner, "research-bot")
    dev = client.post("/sessions/proxy-token", headers=oh, json={"ttl_seconds": 600}).json()[
        "token"
    ]

    assert _call(client, agent_tok).status_code == 200
    assert _call(client, agent_tok, path="/vproxy/openai/v1/boom").status_code == 500
    assert _call(client, dev, model="gpt-dev").status_code == 200
    assert _call(client, owner).status_code == 200

    data = client.get("/usage/agents?days=7", headers=oh).json()
    by_key = {c["key"]: c for c in data["callers"]}
    a = by_key[f"agent:{agent_id}"]
    assert a["name"] == "research-bot" and a["calls"] == 2 and a["errors"] == 1
    assert a["last_ts"] and len(a["daily"]) == 7 and a["daily"][-1]["calls"] == 2
    assert by_key[f"token:{dev[-8:]}"]["calls"] == 1
    assert by_key["owner"]["calls"] == 1
    assert "unattributed" not in by_key

    page = client.get(f"/usage/calls?caller=agent:{agent_id}", headers=oh).json()
    assert page["total"] == 2 and page["upstreams"] == ["openai"]
    assert {c["model"] for c in page["calls"]} == {"gpt-test"}
    assert {c["status_code"] for c in page["calls"]} == {200, 500}
    errs = client.get(f"/usage/calls?caller=agent:{agent_id}&status=error", headers=oh).json()
    assert errs["total"] == 1 and errs["calls"][0]["path"] == "/v1/boom"

    # the token itself is never returned, only its 8-char reference
    body = client.get("/usage/calls", headers=oh).text
    for tok in (agent_tok, dev, owner):
        assert tok not in body


def test_pagination(env):
    client, owner, _ = env
    oh = {"Authorization": f"Bearer {owner}"}
    for _ in range(5):
        _call(client, owner)
    p1 = client.get("/usage/calls?limit=2", headers=oh).json()
    assert p1["total"] == 5 and len(p1["calls"]) == 2 and p1["next_before_id"]
    p2 = client.get(f"/usage/calls?limit=2&before_id={p1['next_before_id']}", headers=oh).json()
    assert [c["id"] for c in p2["calls"]] == [p1["calls"][-1]["id"] - 1, p1["calls"][-1]["id"] - 2]
    p3 = client.get(f"/usage/calls?limit=2&before_id={p2['next_before_id']}", headers=oh).json()
    assert len(p3["calls"]) == 1 and p3["next_before_id"] is None


def test_agent_and_proxy_tokens_cannot_read_usage(env):
    client, owner, _ = env
    _, agent_tok = _agent(client, owner, "bot")
    for path in ("/usage/agents", "/usage/calls"):
        r = client.get(path, headers={"Authorization": f"Bearer {agent_tok}"})
        assert r.status_code == 403 and r.json()["error"] == "insufficient_scope"
        assert client.get(path).status_code == 401


def test_old_rows_are_unattributed(env, tmp_path):
    client, owner, path = env
    from src.backend.billing import usage as usage_mod

    usage_mod._db().close()  # creates + migrates
    with sqlite3.connect(str(path / "usage.db")) as conn:
        conn.execute(
            "INSERT INTO usage_log (user_id, upstream, key_type, ts) VALUES ('alice', 'groq', 'vault', 1)"
        )
    data = client.get("/usage/agents", headers={"Authorization": f"Bearer {owner}"}).json()
    old = [c for c in data["callers"] if c["key"] == "unattributed"]
    assert old and old[0]["calls"] == 1


def test_migration_adds_columns_to_old_table(tmp_path, monkeypatch):
    from src.backend.billing import usage as usage_mod

    db = tmp_path / "old.db"
    with sqlite3.connect(str(db)) as conn:
        conn.execute(
            "CREATE TABLE usage_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,"
            " upstream TEXT NOT NULL, key_type TEXT NOT NULL DEFAULT 'platform', method TEXT NOT NULL DEFAULT '',"
            " path TEXT NOT NULL DEFAULT '', tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,"
            " cost_usd REAL NOT NULL DEFAULT 0.0, latency_ms REAL NOT NULL DEFAULT 0.0,"
            " status_code INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL)"
        )
        conn.execute("INSERT INTO usage_log (user_id, upstream, ts) VALUES ('bob', 'openai', 5)")
    monkeypatch.setattr(usage_mod, "DB_PATH", db)
    usage_mod.log_call("bob", "openai", "vault", actor="owner", model="m")
    hist = usage_mod.get_history("bob")
    assert len(hist) == 2
    calls = usage_mod.list_calls("bob")["calls"]
    assert calls[0]["actor"] == "owner" and calls[1]["actor"] is None


def test_extract_model():
    from src.backend.billing.usage import extract_model

    assert extract_model(b'{"model": "gpt-4o"}') == "gpt-4o"
    assert extract_model(b"", b'{"model": "from-resp"}') == "from-resp"
    assert extract_model(b"not json", None) == ""
