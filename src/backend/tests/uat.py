"""UAT suite — runs against a live server (KS_API_URL env var).

These tests require a running KeyShield API server.  In CI the server is
started by the UAT workflow before this suite is invoked.  Locally:

    uvicorn src.backend.app:app --port 8001 &
    KS_API_URL=http://localhost:8001 pytest src/backend/tests/uat.py -v
"""

from __future__ import annotations

import os

import httpx
import pytest

BASE = os.getenv("KS_API_URL", "http://localhost:8001")


@pytest.fixture(scope="session")
def client() -> httpx.Client:
    with httpx.Client(base_url=BASE, timeout=10) as c:
        yield c


def test_health(client: httpx.Client) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"


def test_docs_reachable(client: httpx.Client) -> None:
    r = client.get("/docs")
    assert r.status_code == 200


def test_unauthenticated_vault_returns_401(client: httpx.Client) -> None:
    r = client.get("/manage/vault")
    assert r.status_code == 401


def test_unauthenticated_agents_list_returns_401(client: httpx.Client) -> None:
    r = client.get("/agents/list")
    assert r.status_code == 401
