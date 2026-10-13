"""Keychain detect / store / call / home — never echo the raw secret."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.proxy import keychain as kc


def _iso(tmp_path, monkeypatch):
    from src.backend.billing import usage as usage_mod
    from src.backend.billing import plans as plans_mod
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(plans_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setenv("SERVER_SECRET", "test-keychain-secret")
    monkeypatch.delenv("KS_OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("KS_HELIUS_API_KEY", raising=False)
    monkeypatch.delenv("KS_OPENAI_API_KEY", raising=False)


def _token(tmp_path, monkeypatch) -> tuple[TestClient, str]:
    _iso(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    return TestClient(app), token


def test_tag_value_reads_host_and_page():
    tags = ["AI", "host:dashboard.helius.dev", "page:API Keys"]
    assert kc.tag_value(tags, "host") == "dashboard.helius.dev"
    assert kc.tag_value(tags, "page") == "API Keys"
    assert kc.tag_value(tags, "missing") == ""


def test_store_two_helius_keys_keep_distinct_names(tmp_path, monkeypatch):
    client, token = _token(tmp_path, monkeypatch)
    headers = {"Authorization": f"Bearer {token}"}
    a = "10470584-67a9-4abc-8def-123456787761"
    b = "210e4c2a-91b0-4c3d-a111-aaaaaaaaaaa1"
    first = client.post(
        "/manage/store",
        headers=headers,
        json={
            "upstream": "helius",
            "value": a,
            "domain": "dashboard.helius.dev",
            "pageTitle": "API Keys",
        },
    )
    second = client.post(
        "/manage/store",
        headers=headers,
        json={
            "upstream": "helius",
            "value": b,
            "domain": "dashboard.helius.dev",
            "pageTitle": "API Keys",
        },
    )
    assert first.status_code == 200
    assert second.status_code == 200
    listed = client.get("/manage/vault", headers=headers).json()
    rows = [row for row in listed if row.get("upstream") == "helius"]
    assert len(rows) == 2
    names = {row["name"] for row in rows}
    assert names == {"helius1", "helius2"}
    assert all(row.get("family") == "RPC" for row in rows)
    assert all(row.get("expires_at") for row in rows)
    dumped = str(listed)
    assert a not in dumped and b not in dumped


def test_vault_item_name_keeps_page_label_and_numbers_dupes():
    assert kc.looks_like_page_key_name("Panthermaze") is True
    assert kc.looks_like_page_key_name("helius key") is False
    first = kc.vault_item_name(
        upstream="helius", raw="10470584-67a9-4abc-8def-123456787761", name="Panthermaze"
    )
    second = kc.vault_item_name(
        upstream="helius",
        raw="210e4c2a-91b0-4c3d-a111-aaaaaaaaaaa1",
        name="Panthermaze",
        taken=[first],
    )
    third = kc.vault_item_name(
        upstream="helius", raw="310e4c2a-91b0-4c3d-a222-bbbbbbbbbbb2", name="helius key"
    )
    fourth = kc.vault_item_name(
        upstream="helius",
        raw="410e4c2a-91b0-4c3d-a333-ccccccccccc3",
        name="helius key",
        taken=[third],
    )
    assert first == "Panthermaze"
    assert second == "Panthermaze 2"
    assert third == "helius1"
    assert fourth == "helius2"


def test_distinguish_name_separates_helius_uuids():
    a = kc.distinguish_name(
        upstream="helius", raw="10470584-67a9-4abc-8def-123456787761", host="dashboard.helius.dev"
    )
    b = kc.distinguish_name(
        upstream="helius", raw="210e4c2a-91b0-4c3d-a111-aaaaaaaaaaa1", host="dashboard.helius.dev"
    )
    assert a != b
    assert "Helius" in a and "Helius" in b
    assert "104705" in a or "7761" in a
    assert kc.is_generic_vault_name("helius key", "helius") is True


def test_detect_specific_prefixes_beat_generic_sk():
    or_key = "sk-or-v1-" + ("a" * 24)
    ant_key = "sk-ant-api03-" + ("b" * 48)
    oai_key = "sk-proj-" + ("c" * 24)
    assert kc.detect_upstream(f"here {or_key} thanks")["upstream"] == "openrouter"
    assert kc.detect_upstream(ant_key)["upstream"] == "anthropic"
    assert kc.detect_upstream(oai_key)["upstream"] == "openai"
    assert kc.detect_upstream("gsk_" + "d" * 40)["upstream"] == "groq"
    assert kc.detect_upstream("helius_auth_" + "e" * 20)["upstream"] == "helius"
    assert kc.detect_upstream("10470584-67a9-4abc-8def-123456787761")["upstream"] == "helius"
    assert kc.detect_upstream("vercel_DEMOKEYSHIELDLOCALONLY99xx")["upstream"] == "vercel"
    assert kc.detect_upstream("github_pat_DEMOKEYSHIELDLOCALONLY99")["upstream"] == "github"
    assert kc.detect_upstream("nvapi-LOCALONLYFILLTEST1234")["upstream"] == "nvidia"
    assert kc.infer_product("nvidia", "nvapi-LOCALONLYFILLTEST1234") == "NVIDIA NIM"
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
                            "data": {"parsed": {"info": {"tokenAmount": {"amount": "9999987"}}}}
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
    assert snap["plan"]["id"] == "starter"
    assert snap["plan"]["accelerated"] is False
    assert "passkey_collect" in snap["plan"]["features"]
    assert "ledger" in snap
    assert "wallet" in snap
    assert "wallet_ms" in snap.get("latency", {})


def test_store_helius_dashboard_uuid_without_passkey(tmp_path, monkeypatch):
    client, token = _token(tmp_path, monkeypatch)
    secret = "10470584-67a9-4abc-8def-123456787761"
    stored = client.post(
        "/keychain/store",
        headers={"Authorization": f"Bearer {token}"},
        json={"value": secret},
    )
    assert stored.status_code == 200
    body = stored.json()
    assert body["upstream"] == "helius"
    assert body["stored"] is True
    assert secret not in str(body)


def test_five_helius_keys_store_then_manage_vault_lists_all(tmp_path, monkeypatch):
    """Detect used to overwrite one helius row — Vault then looked empty/wrong."""
    client, token = _token(tmp_path, monkeypatch)
    headers = {"Authorization": f"Bearer {token}"}

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
    secrets = [
        "10470584-67a9-4abc-8def-123456787761",
        "210e4c2a-91b0-4c3d-a111-aaaaaaaaaaa1",
        "310e4c2a-91b0-4c3d-a222-bbbbbbbbbbb2",
        "410e4c2a-91b0-4c3d-a333-ccccccccccc3",
        "510e4c2a-91b0-4c3d-a444-ddddddddddd4",
    ]
    for secret in secrets:
        stored = client.post("/keychain/store", headers=headers, json={"value": secret})
        assert stored.status_code == 200
        assert stored.json()["upstream"] == "helius"
        assert secret not in str(stored.json())

    listed = client.get("/manage/vault", headers=headers).json()
    helius = [row for row in listed if row.get("upstream") == "helius"]
    assert len(helius) == 5
    dumped = str(listed)
    for secret in secrets:
        assert secret not in dumped
        assert secret[:6] in dumped or secret[-4:] in dumped

    home = client.get("/keychain/home", headers=headers)
    assert home.status_code == 200
    apis = [row for row in home.json()["apis"] if row["upstream"] == "helius"]
    assert len(apis) == 5
    assert secrets[0] not in str(home.json())
    names = [str(row.get("name") or "") for row in apis]
    assert set(names) == {"helius1", "helius2", "helius3", "helius4", "helius5"}
    assert all(row.get("family") == "RPC" for row in apis)
    assert all(row.get("product") for row in apis)
    assert all(row.get("expires_at") for row in apis)


def test_home_unauthorized():
    client = TestClient(app)
    assert client.get("/keychain/home").status_code == 401


def test_home_does_not_use_openrouter_as_helius_key(tmp_path, monkeypatch):
    """OpenRouter fallback must not be sent to Helius getBalance."""
    client, token = _token(tmp_path, monkeypatch)
    from src.backend import demo as demo_mod

    demo_mod.store_upstream_key("alice", "openrouter", "sk-or-v1-" + ("x" * 24))
    seen: list[str] = []

    async def _capture(address: str, helius_key: str | None):
        seen.append(helius_key or "")
        return {
            "address": address or None,
            "sol": 1.0,
            "sol_lamports": 1_000_000_000,
            "usdc": 2.0,
            "usdc_micro": 2_000_000,
            "cache": "MISS",
            "rpc": "public",
            "lowest_ttl_sec": 2,
            "error": None,
        }

    monkeypatch.setattr(kc, "fetch_wallet_balances", _capture)
    res = client.get("/keychain/home", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert seen == [""]
    assert res.json()["wallet"]["sol"] == 1.0


def test_store_then_call_returns_timed_latency(tmp_path, monkeypatch):
    """Home Save → Call must print milliseconds timed on that request."""
    from src.backend.proxy import api_router

    client, token = _token(tmp_path, monkeypatch)
    secret = "sk-or-v1-" + ("n" * 24)
    stored = client.post(
        "/keychain/store",
        headers={"Authorization": f"Bearer {token}"},
        json={"value": secret},
    )
    assert stored.status_code == 200
    assert stored.json()["upstream"] == "openrouter"
    assert secret not in str(stored.json())

    async def _fake_rest(provider, method, path, body, api_key, extra_headers=None, **kwargs):
        assert provider == "openrouter"
        assert api_key == secret
        assert b"nemotron" in body
        return b'{"id":"chatcmpl-ks","choices":[{"message":{"content":"ok"}}]}', 200, "MISS"

    monkeypatch.setattr(api_router, "call_rest", _fake_rest)
    res = client.post(
        "/keychain/call",
        headers={"Authorization": f"Bearer {token}"},
        json={"upstream": "openrouter", "prompt": "Nemotron ping"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["live"] is True
    assert body["status"] == 200
    assert body["upstream"] == "openrouter"
    assert "latency_ms" in body
    assert isinstance(body["latency_ms"], (int, float))
    assert body["latency_ms"] >= 0
    assert "nemotron" in (body.get("model") or "")
    assert secret not in str(body)
    assert body["key_prefix"]
    assert "n" * 24 not in str(body)
