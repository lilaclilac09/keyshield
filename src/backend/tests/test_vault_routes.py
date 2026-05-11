from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app


def test_manage_store_preserves_cipher_fields():
    client = TestClient(app)

    payload = {
        "upstream": "openai",
        "name": "openai key",
        "cipher": "testcipher",
        "iv": "testiv",
        "cipher_v": 1,
    }
    store_resp = client.post("/manage/store", json=payload)
    assert store_resp.status_code == 200
    assert "id" in store_resp.json()

    list_resp = client.get("/manage/vault")
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert isinstance(items, list)
    assert any(
        item.get("upstream") == "openai" and
        item.get("cipher") == "testcipher" and
        item.get("iv") == "testiv" and
        item.get("cipher_v") == 1
        for item in items
    )
