"""GET /usage/stats must return {stats: [rows]}, not a nested wrap."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.billing import usage as usage_mod
from src.backend.routes import billing as billing_mod


def test_stats_rows_unwraps_nested_and_list():
    assert billing_mod._stats_rows({"stats": [{"upstream": "openai"}]}) == [
        {"upstream": "openai"}
    ]
    assert billing_mod._stats_rows(
        {"stats": {"stats": [{"upstream": "groq"}]}}
    ) == [{"upstream": "groq"}]
    assert billing_mod._stats_rows([{"upstream": "x"}]) == [{"upstream": "x"}]
    assert billing_mod._stats_rows(None) == []
    assert billing_mod._stats_rows({"stats": "nope"}) == []


def test_query_limit_clamps_and_defaults():
    class _Req:
        def __init__(self, limit):
            self.query_params = {} if limit is None else {"limit": limit}

    assert billing_mod._query_limit(_Req(None)) == 50
    assert billing_mod._query_limit(_Req("3")) == 3
    assert billing_mod._query_limit(_Req("0")) == 1
    assert billing_mod._query_limit(_Req("9999")) == 500
    assert billing_mod._query_limit(_Req("nope")) == 50


def test_usage_stats_returns_list_not_nested_object(tmp_path, monkeypatch):
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path) / "usage.db")
    usage_mod.log_call(
        "default",
        "openai",
        "self_custodian",
        method="POST",
        path="/v1/chat/completions",
        tokens_in=120,
        tokens_out=80,
        cost_usd=0.0012,
        latency_ms=42,
        status_code=200,
    )
    usage_mod.log_call(
        "default",
        "groq",
        "platform",
        method="POST",
        path="/openai/v1/chat/completions",
        tokens_in=40,
        tokens_out=10,
        cost_usd=0.0001,
        latency_ms=18,
        status_code=200,
    )

    client = TestClient(app)
    r = client.get("/usage/stats")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["stats"], list), body
    assert not isinstance(body["stats"], dict)
    by_up = {row["upstream"]: row for row in body["stats"]}
    assert by_up["openai"]["tokens_in"] == 120
    assert by_up["openai"]["tokens_out"] == 80
    assert by_up["groq"]["calls"] == 1

    hist = client.get("/usage/history?limit=1")
    assert hist.status_code == 200
    rows = hist.json()["history"]
    assert len(rows) == 1
    assert rows[0]["tokens_in"] in (120, 40)

    billed = client.get("/billing/usage?limit=1")
    assert billed.status_code == 200
    assert len(billed.json()["history"]) == 1
