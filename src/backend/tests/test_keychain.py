"""Keychain detect / store / call / home — never echo the raw secret."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.proxy import keychain as kc


def _iso(tmp_path, monkeypatch):
    from src.backend.billing import usage as usage_mod
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setenv("SERVER_SECRET", "test-keychain-secret")
    monkeypatch.delenv("KS_OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("KS_HELIUS_API_KEY", raising=False)
    monkeypatch.delenv("KS_OPENAI_API_KEY", raising=False)


def _token(tmp_path, monkeypatch) -> tuple[TestClient, str]:
    _iso(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    return TestClient(app), token


def test_detect_specific_prefixes_beat_generic_sk():
    or_key = "sk-or-v1-" + ("a" * 24)
    ant_key = "sk-ant-api03-" + ("b" * 48)
    oai_key = "sk-proj-" + ("c" * 24)
    assert kc.detect_upstream(f"here {or_key} thanks")["upstream"] == "openrouter"
    assert kc.detect_upstream(ant_key)["upstream"] == "anthropic"
    assert kc.detect_upstream(oai_key)["upstream"] == "openai"
    assert kc.detect_upstream("gsk_" + "d" * 40)["upstream"] == "groq"
    assert kc.detect_upstream("helius_auth_" + "e" * 20)["upstream"] == "helius"
    dumped = str(kc.detect_upstream(or_key))
    assert or_key not in dumped


def test_parse_balances_from_rpc_shapes():
    assert kc.parse_sol_lamports({"result": {"value": 4_890_000_000}}) == 4_890_000_000
    usdc = kc.parse_usdc_micro(
        {
            "result": {
                "value": [
                    {
                        "account": {
                            "data": {
                                "parsed": {
                                    "info": {"tokenAmount": {"amount": "9999987"}}
                                }
                            }
                        }
                    }
                ]
            }
        }
    )
    assert usdc == 9_999_987
    assert kc.parse_usdc_micro({"result": {"value": []}}) == 0


def test_rpc_cache_catalog_has_getslot_2s():
    catalog = kc.rpc_cache_catalog()
    assert catalog["lowest_ttl_sec"] == 2
    slots = [m for m in catalog["methods"] if m["method"] == "getSlot"]
    assert slots and slots[0]["ttl_sec"] == 2
    assert "sendTransaction" in catalog["writes_bypass"]


def test_rpc_cache_route_is_public():
    client = TestClient(app)
    res = client.get("/keychain/rpc-cache")
    assert res.status_code == 200
    assert res.json()["lowest_ttl_sec"] == 2


def test_detect_requires_auth_and_never_echoes(tmp_path, monkeypatch):
    client, token = _token(tmp_path, monkeypatch)
    secret = "sk-or-v1-" + ("z" * 24)
    assert client.post("/keychain/detect", json={"value": secret}).status_code == 401
    res = client.post(
        "/keychain/detect",
        headers={"Authorization": f"Bearer {token}"},
        json={"value": f"noise {secret} noise"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["upstream"] == "openrouter"
    assert body["matched"] is True
    assert secret not in str(body)


def test_call_401_without_auth_and_409_without_key(tmp_path, monkeypatch):
    client, token = _token(tmp_path, monkeypatch)
    assert client.post("/keychain/call", json={"upstream": "openrouter"}).status_code == 401
    res = client.post(
        "/keychain/call",
        headers={"Authorization": f"Bearer {token}"},
        json={"upstream": "openrouter"},
    )
    assert res.status_code == 409
    assert res.json()["code"] == "key_missing"


def test_store_then_home_lists_prefix_only(tmp_path, monkeypatch):
    client, token = _token(tmp_path, monkeypatch)

    async def _no_rpc(address: str, helius_key: str | None):
        return {
            "address": address or None,
            "sol": None,
            "sol_lamports": None,
            "usdc": None,
            "usdc_micro": None,
            "cache": "skip",
            "rpc": "none",
            "lowest_ttl_sec": 2,
            "error": None,
        }

    monkeypatch.setattr(kc, "fetch_wallet_balances", _no_rpc)
    secret = "sk-or-v1-" + ("q" * 24)
    stored = client.post(
        "/keychain/store",
        headers={"Authorization": f"Bearer {token}"},
        json={"value": secret},
    )
    assert stored.status_code == 200
    body = stored.json()
    assert body["upstream"] == "openrouter"
    assert body["stored"] is True
    assert secret not in str(body)

    home = client.get("/keychain/home", headers={"Authorization": f"Bearer {token}"})
    assert home.status_code == 200
    snap = home.json()
    assert secret not in str(snap)
    assert any(row["upstream"] == "openrouter" for row in snap["apis"])
    assert snap["connection"]["api"] is True
    assert snap["rpc_cache"]["lowest_ttl_sec"] == 2
    assert "ledger" in snap
    assert "wallet" in snap


def test_home_unauthorized():
    client = TestClient(app)
    assert client.get("/keychain/home").status_code == 401
