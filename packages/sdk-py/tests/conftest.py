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


# Make `from src.backend.app import app` work without installing as a package.
REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))
# Also add repo root for `from src.backend` imports
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src.backend.auth import session as session_mod
    from src.backend.routes import vault as vault_mod
    from src.backend.routes import billing as billing_mod
    from src.backend.agents import agents as agents_mod
    from src.backend.billing import usage as usage_mod

    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(vault_mod, "_DB_PATH", Path(tmp_path / "vault_shim.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(billing_mod, "_PRICING_DB", Path(tmp_path / "data" / "pricing.db"))
    monkeypatch.setenv("SERVER_SECRET", "test-secret-for-sdk-tests-32bytes!")
    yield


@pytest.fixture
def asgi_app():
    """Fresh FastAPI app per test (cache + nonce store wiped)."""
    from src.backend.app import app
    from src.backend.proxy import api_router

    api_router._CACHE.clear()
    return app


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
