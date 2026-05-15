from __future__ import annotations

import os

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod


def _make_auth_headers() -> dict:
    os.environ.setdefault("SERVER_SECRET", "CI-SMOKE-TEST-SECRET-32-BYTES-MIN")
    token = sess_mod.create_token("test-user", "test-password")
    return {"Authorization": f"Bearer {token}"}


def test_manage_store_preserves_cipher_fields():
    client = TestClient(app)
    headers = _make_auth_headers()

    payload = {
        "upstream": "openai",
        "name": "openai key",
        "cipher": "testcipher",
        "iv": "testiv",
        "cipher_v": 1,
    }
    store_resp = client.post("/manage/store", json=payload, headers=headers)
    assert store_resp.status_code == 200, store_resp.text
    assert "id" in store_resp.json()

    list_resp = client.get("/manage/vault", headers=headers)
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
