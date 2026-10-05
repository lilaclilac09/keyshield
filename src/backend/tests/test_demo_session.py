"""KS_DEMO_MODE session, key paste, and synthetic demo-meter."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from src.backend.app import app
from src.backend.auth import session as sess_mod
from src.backend.mpp import owner_keystore


def _seal_owner(tmp_path, monkeypatch, seed: bytes = b"\x09" * 32) -> str:
    wrap = tmp_path / "owner.wrap"
    enc = tmp_path / "user.enc"
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(wrap))
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(enc))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
    owner_keystore.ensure_wrap_key(wrap)
    sk = SigningKey(seed)
    src = tmp_path / "kp.json"
    src.write_text(json.dumps(list(bytes(sk) + bytes(sk.verify_key))))
    return owner_keystore.import_solana_keypair_file(src, dest=enc)


def _iso_dbs(tmp_path, monkeypatch):
    from src.backend.agents import agents as agents_mod
    from src.backend.billing import usage as usage_mod
    from src.backend.mpp import mpp_streams
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(agents_mod, "DB_PATH", tmp_path / "agents.db")
    monkeypatch.setattr(mpp_streams, "DB_PATH", tmp_path / "mpp.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setenv("SERVER_SECRET", "test-demo-session-secret")


def test_demo_session_forbidden_when_flag_off(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    monkeypatch.delenv("KS_DEMO_MODE", raising=False)
    client = TestClient(app)
    res = client.post("/auth/demo-session")
    assert res.status_code == 403


def test_demo_session_requires_keystore(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    monkeypatch.setenv("KS_DEMO_MODE", "1")
    client = TestClient(app)
    res = client.post("/auth/demo-session")
    assert res.status_code == 503
    assert "keystore" in res.json()["error"]


def test_demo_session_issues_owner_token_and_seeds_agent(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    monkeypatch.setenv("KS_DEMO_MODE", "1")
    pubkey = _seal_owner(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.post("/auth/demo-session")
    assert res.status_code == 200
    body = res.json()
    assert body["demo"] is True
    assert body["userId"] == pubkey
    assert body["token"]
    assert body["agent"]["pubkey_b58"]
    dumped = json.dumps(body).lower()
    assert "secret_64" not in dumped
    assert '"seed"' not in dumped
    assert client.get("/auth/demo-status").json()["enabled"] is True
    health = client.get("/health/mpp").json()
    assert health["demo"]["enabled"] is True
    agents = client.get(
        "/agents/list", headers={"Authorization": f"Bearer {body['token']}"}
    ).json()["agents"]
    assert any(a["name"] == "demo-agent" for a in agents)


def test_vault_store_accepts_api_key_alias(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    token = sess_mod.create_token("alice", "pw")
    client = TestClient(app)
    res = client.post(
        "/manage/store",
        headers={"Authorization": f"Bearer {token}"},
        json={"upstream": "openrouter", "apiKey": "sk-or-demo-not-a-real-key"},
    )
    assert res.status_code == 200
    listed = client.get(
        "/manage/vault", headers={"Authorization": f"Bearer {token}"}
    ).json()
    row = next(item for item in listed if item["upstream"] == "openrouter")
    assert row["masked_value"]
    assert "sk-or-demo-not-a-real-key" not in json.dumps(listed)


def test_demo_meter_records_synthetic_artifact(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    monkeypatch.setenv("KS_DEMO_MODE", "1")
    _seal_owner(tmp_path, monkeypatch)
    client = TestClient(app)
    login = client.post("/auth/demo-session").json()
    headers = {"Authorization": f"Bearer {login['token']}"}
    opened = client.post(
        "/mpp/streams",
        headers=headers,
        json={
            "agentPubkey": login["agent"]["pubkey_b58"],
            "agentName": "demo-agent",
            "upstream": "openrouter",
            "maxTotalMicroUsdc": 10_000,
            "ratePerTokenMicroUsdc": 1,
            "ratePerCallMicroUsdc": 1,
        },
    )
    assert opened.status_code == 200
    stream_id = opened.json()["stream"]["id"]
    metered = client.post(f"/mpp/streams/{stream_id}/demo-meter", headers=headers, json={})
    assert metered.status_code == 200
    body = metered.json()
    assert body["artifact_hash"]
    assert body["live"] is False
    assert body["source"] == "none"
    listed = client.get("/mpp/streams", headers=headers).json()["streams"]
    assert listed[0]["pending_artifact_hash"] == body["artifact_hash"]
    usage = client.get(f"/mpp/streams/{stream_id}/usage", headers=headers).json()
    assert usage["usage"]
    prep = client.get(f"/mpp/streams/{stream_id}/capture-prep", headers=headers)
    assert prep.status_code == 200
    assert prep.json()["artifactHash"] == body["artifact_hash"]
    assert prep.json()["nextSeq"] == 1
    closed = client.post(f"/mpp/streams/{stream_id}/close", headers=headers)
    assert closed.status_code == 200
    assert closed.json()["stream"]["status"] == "closed"


def test_demo_meter_falls_back_when_upstream_rejects_key(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    monkeypatch.setenv("KS_DEMO_MODE", "1")
    _seal_owner(tmp_path, monkeypatch)
    client = TestClient(app)
    login = client.post("/auth/demo-session").json()
    headers = {"Authorization": f"Bearer {login['token']}"}
    client.post(
        "/demo/upstream-key",
        headers=headers,
        json={"upstream": "openrouter", "apiKey": "sk-or-bad"},
    )
    opened = client.post(
        "/mpp/streams",
        headers=headers,
        json={
            "agentPubkey": login["agent"]["pubkey_b58"],
            "agentName": "demo-agent",
            "upstream": "openrouter",
            "maxTotalMicroUsdc": 10_000,
            "ratePerTokenMicroUsdc": 1,
            "ratePerCallMicroUsdc": 1,
        },
    )
    stream_id = opened.json()["stream"]["id"]

    async def boom(*_a, **_k):
        return b'{"error":"invalid"}', 401, "MISS"

    monkeypatch.setattr(
        "src.backend.proxy.api_router.call_rest",
        boom,
    )
    metered = client.post(f"/mpp/streams/{stream_id}/demo-meter", headers=headers, json={})
    assert metered.status_code == 200
    body = metered.json()
    assert body["live"] is False
    assert "fallback" in str(body.get("source"))
    assert body["artifact_hash"]


def test_demo_upstream_key_never_echoes_secret(tmp_path, monkeypatch):
    _iso_dbs(tmp_path, monkeypatch)
    monkeypatch.setenv("KS_DEMO_MODE", "1")
    _seal_owner(tmp_path, monkeypatch)
    client = TestClient(app)
    login = client.post("/auth/demo-session").json()
    secret = "sk-or-v1-demo-paste-value"
    res = client.post(
        "/demo/upstream-key",
        headers={"Authorization": f"Bearer {login['token']}"},
        json={"upstream": "openrouter", "apiKey": secret},
    )
    assert res.status_code == 200
    assert secret not in res.text
    assert res.json()["stored"] is True
