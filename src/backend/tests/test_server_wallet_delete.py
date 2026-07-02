"""DELETE /agents/{id}/wallet — server-held wallet revocation."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

USER = "wallet-delete-user"
AGENT_ID = "revocable-bot"


@pytest.fixture(autouse=True)
def isolate_db(tmp_path: Path) -> None:
    from src.backend.agents import server_wallet

    server_wallet.DB_PATH = tmp_path / "server_wallets.db"


@pytest.fixture()
def client() -> TestClient:
    from src.backend.app import app

    return TestClient(app)


@pytest.fixture()
def headers() -> dict[str, str]:
    from src.backend.auth import session as sess_mod

    return {"Authorization": f"Bearer {sess_mod.create_token(USER, 'pw')}"}


def test_delete_requires_auth(client: TestClient) -> None:
    r = client.delete(f"/agents/{AGENT_ID}/wallet")
    assert r.status_code == 401


def test_delete_roundtrip(client: TestClient, headers: dict[str, str]) -> None:
    r = client.post(f"/agents/{AGENT_ID}/wallet/create", headers=headers)
    assert r.status_code == 200

    r = client.get("/agents/wallets", headers=headers)
    assert any(w["agent_id"] == AGENT_ID for w in r.json()["wallets"])

    r = client.delete(f"/agents/{AGENT_ID}/wallet", headers=headers)
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    r = client.get("/agents/wallets", headers=headers)
    assert not any(w["agent_id"] == AGENT_ID for w in r.json()["wallets"])

    # Idempotent — second delete reports deleted=false, still 200.
    r = client.delete(f"/agents/{AGENT_ID}/wallet", headers=headers)
    assert r.status_code == 200
    assert r.json()["deleted"] is False


def test_delete_scoped_to_owner(client: TestClient, headers: dict[str, str]) -> None:
    from src.backend.auth import session as sess_mod

    client.post(f"/agents/{AGENT_ID}/wallet/create", headers=headers)

    other = {"Authorization": f"Bearer {sess_mod.create_token('other-user', 'pw')}"}
    r = client.delete(f"/agents/{AGENT_ID}/wallet", headers=other)
    assert r.status_code == 200
    assert r.json()["deleted"] is False  # not theirs — nothing deleted

    r = client.get("/agents/wallets", headers=headers)
    assert any(w["agent_id"] == AGENT_ID for w in r.json()["wallets"])
