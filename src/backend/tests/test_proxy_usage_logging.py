"""Verify that every /proxy/<upstream>/<path> call records a row in usage_log."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


def _count_rows(db_path: Path, user_id: str) -> int:
    conn = sqlite3.connect(str(db_path))
    try:
        return conn.execute(
            "SELECT COUNT(*) FROM usage_log WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
    finally:
        conn.close()


def test_successful_proxy_call_is_logged(tmp_path, monkeypatch) -> None:
    """A 200-status upstream call writes one row to usage_log with token counts."""
    monkeypatch.setenv("KS_USAGE_DB_DIR_OVERRIDE", "")  # no-op; left for clarity

    # Redirect the usage DB into tmp_path BEFORE importing the app.
    from src.backend import billing

    db_file = tmp_path / "usage.db"
    monkeypatch.setattr(billing.usage, "DB_PATH", db_file)

    from src.backend.app import app

    fake_body = b'{"id":"chatcmpl-x","usage":{"prompt_tokens":11,"completion_tokens":7}}'

    async def fake_call_rest(*_args, **_kwargs):
        return fake_body, 200, "MISS"

    with patch(
        "src.backend.proxy.api_router.call_rest", side_effect=fake_call_rest
    ):
        with TestClient(app) as client:
            r = client.post(
                "/proxy/openai/v1/chat/completions",
                headers={"X-Upstream-API-Key": "sk-fake"},
                json={"model": "gpt-4o-mini", "messages": []},
            )

    assert r.status_code == 200
    assert _count_rows(db_file, "anonymous") == 1

    conn = sqlite3.connect(str(db_file))
    try:
        row = conn.execute(
            "SELECT upstream, key_type, method, path, tokens_in, tokens_out, "
            "       status_code, cost_usd "
            "FROM usage_log WHERE user_id = 'anonymous'"
        ).fetchone()
    finally:
        conn.close()

    upstream, key_type, method, path, tin, tout, status, cost = row
    assert upstream == "openai"
    assert key_type == "self_custodian"
    assert method == "POST"
    assert path == "/v1/chat/completions"
    assert tin == 11
    assert tout == 7
    assert status == 200
    assert cost > 0  # 11 input + 7 output tokens at openai rates → non-zero


def test_unknown_upstream_is_logged_as_404(tmp_path, monkeypatch) -> None:
    """ValueError from api_router (unknown provider) still produces a usage row."""
    from src.backend import billing

    db_file = tmp_path / "usage.db"
    monkeypatch.setattr(billing.usage, "DB_PATH", db_file)

    from src.backend.app import app

    async def boom(*_args, **_kwargs):
        raise ValueError("unknown provider: bogus")

    with patch("src.backend.proxy.api_router.call_rest", side_effect=boom):
        with TestClient(app) as client:
            r = client.post(
                "/proxy/bogus/anything",
                headers={"X-Upstream-API-Key": "sk-fake"},
                json={},
            )

    assert r.status_code == 404
    assert _count_rows(db_file, "anonymous") == 1

    conn = sqlite3.connect(str(db_file))
    try:
        status_code, upstream = conn.execute(
            "SELECT status_code, upstream FROM usage_log "
            "WHERE user_id = 'anonymous'"
        ).fetchone()
    finally:
        conn.close()

    assert status_code == 404
    assert upstream == "bogus"


def test_missing_api_key_is_not_logged(tmp_path, monkeypatch) -> None:
    """Pre-auth 401 (no upstream key header) doesn't write a usage row."""
    from src.backend import billing

    db_file = tmp_path / "usage.db"
    monkeypatch.setattr(billing.usage, "DB_PATH", db_file)

    from src.backend.app import app

    with TestClient(app) as client:
        r = client.post("/proxy/openai/v1/models", json={})

    assert r.status_code == 401
    # DB may not even exist yet — treat that as 0
    if db_file.exists():
        assert _count_rows(db_file, "anonymous") == 0
