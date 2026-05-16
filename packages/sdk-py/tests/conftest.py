"""
Shared fixtures for the python-sdk tests.

Strategy:
  - sync clients use Starlette's TestClient (which is a sync `httpx.Client`
    that drives the ASGI app in-process).
  - async clients use `httpx.AsyncClient(transport=httpx.ASGITransport(...))`
    — the modern ASGITransport is async-only, which is fine here.

Both paths hit the real FastAPI app — no mocking. DBs and the vault
dir are isolated per test under tmp_path.
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx
import pytest


# Make `import src.server` work without installing v2-mvp as a package.
REPO_ROOT = Path(__file__).resolve().parents[2]
V2_MVP = REPO_ROOT / "v2-mvp"
if str(V2_MVP) not in sys.path:
    sys.path.insert(0, str(V2_MVP))


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import pricing as pricing_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(pricing_mod, "DB_PATH", Path(tmp_path / "data" / "pricing.db"))
    yield


@pytest.fixture
def asgi_app():
    """Fresh FastAPI app per test (cache + nonce store wiped)."""
    from src import server

    server._NONCES.clear()
    server._CACHE.clear()
    return server.app


@pytest.fixture
def sync_client(asgi_app):
    """An httpx.Client that talks to the in-process FastAPI app."""
    from starlette.testclient import TestClient

    with TestClient(asgi_app, base_url="http://test") as c:
        yield c


@pytest.fixture
def async_transport(asgi_app):
    """ASGI transport for AsyncKeyShield tests."""
    return httpx.ASGITransport(app=asgi_app)
