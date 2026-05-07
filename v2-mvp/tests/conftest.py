"""


Conftest — shared fixtures for KeyShield v2-MVP tests.
"""

import os
import sys
import pytest
from pathlib import Path

# Ensure v2-mvp is on the path
_HERE = Path(__file__).parent.parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

if str(str(_HERE / "src")) not in sys.path:
    sys.path.insert(0, str(_HERE / "src"))


@pytest.fixture(autouse=True)
def clean_dbs(monkeypatch):
    """Ensure all module-level caches are fresh."""
    import src.server
    import src.api_router
    import src.x402_verify
    src.server._NONCES.clear()
    src.server._CACHE.clear()
    src.api_router._CACHE.clear()
    src.x402_verify._WARNED_ENV_MISSING = False
    yield
    src.server._NONCES.clear()
    src.server._CACHE.clear()
    src.api_router._CACHE.clear()


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    """Isolate DB paths for each test."""
    from src.vault import VAULT_DIR as _vd
    from src.session import DB_PATH as _sdb
    from src.agents import DB_PATH as _adb
    from src.usage import DB_PATH as _udb
    from src.x402_verify import DB_PATH as _xdb

    monkeypatch.setattr("src.vault.VAULT_DIR", tmp_path / "vault")
    monkeypatch.setattr("src.session.DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr("src.agents.DB_PATH", tmp_path / "data" / "agents.db")
    monkeypatch.setattr("src.usage.DB_PATH", tmp_path / "data" / "usage.db")
    monkeypatch.setattr("src.x402_verify.DB_PATH", tmp_path / "data" / "x402.db")
    yield



@pytest.fixture(scope="session")
def client():


    from fastapi.testclient import TestClient
    from src import server
    server._NONCES.clear()
    return TestClient(server.app)


@pytest.fixture
def login(client):

    r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]




def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

