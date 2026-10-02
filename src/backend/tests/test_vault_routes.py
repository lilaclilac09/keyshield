from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app

# Opt-in local-dev header. Must be paired with KS_DEV_MODE=1.
_DEV_HEADERS = {"X-Dev-Mode": "1"}


def test_manage_store_preserves_cipher_fields(monkeypatch):
    monkeypatch.setenv("KS_DEV_MODE", "1")
    client = TestClient(app)

    payload = {
        "upstream": "openai",
        "name": "openai key",
        "cipher": "testcipher",
        "iv": "testiv",
        "cipher_v": 1,
    }
    store_resp = client.post("/manage/store", json=payload, headers=_DEV_HEADERS)
    assert store_resp.status_code == 200
    assert "id" in store_resp.json()

    list_resp = client.get("/manage/vault", headers=_DEV_HEADERS)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert isinstance(items, list)
    assert any(
        item.get("upstream") == "openai"
        and item.get("cipher") == "testcipher"
        and item.get("iv") == "testiv"
        and item.get("cipher_v") == 1
        for item in items
    )


def test_manage_store_requires_auth_without_dev_header():
    """Without X-Dev-Mode or a real Bearer token, /manage/* returns 401."""
    client = TestClient(app)
    resp = client.post(
        "/manage/store",
        json={"upstream": "openai", "name": "x", "cipher": "c", "iv": "i"},
    )
    assert resp.status_code == 401
