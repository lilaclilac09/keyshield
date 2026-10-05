"""Subscription plan catalog + three device-level seats."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import session as sess_mod


def _iso(tmp_path, monkeypatch):
    from src.backend.agents import agents as agents_mod
    from src.backend.billing import plans as plans_mod
    from src.backend.billing import usage as usage_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(usage_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(plans_mod, "DB_PATH", tmp_path / "usage.db")
    monkeypatch.setattr(agents_mod, "DB_PATH", tmp_path / "agents.db")
    monkeypatch.setenv("SERVER_SECRET", "test-plans-secret")


def _auth(user_id: str = "alice") -> dict[str, str]:
    token = sess_mod.create_token(user_id, "pw")
    return {"Authorization": f"Bearer {token}"}


def test_plans_catalog_has_three_layers_and_three_device_levels(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.get("/billing/plans")
    assert res.status_code == 200
    body = res.json()
    ids = [p["id"] for p in body["plans"]]
    assert ids == ["starter", "pro", "accelerate"]
    names = [p["name"] for p in body["plans"]]
    assert names == ["Free", "Plugin", "Accelerate"]
    levels = [d["id"] for d in body["device_levels"]]
    assert levels == ["personal", "companion", "runtime"]
    assert "subscription" in body["why"]
    assert "payg" in body["why"]
    assert "scope" in body["why"]
    assert body["plans"][0]["features"] == ["passkey_collect", "vault_save"]
    assert "auto_plugin" in body["plans"][1]["features"]
    assert "biometric_zk" in body["plans"][1]["features"]
    assert "low_latency" in body["plans"][2]["features"]
    assert body["plans"][1]["billing"] == "subscription+payg"
    assert body["plans"][1]["devices"] == {
        "personal": 1,
        "companion": 1,
        "runtime": 1,
    }


def test_default_plan_is_starter_payg(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.get("/billing/plan", headers=_auth())
    assert res.status_code == 200
    snap = res.json()
    assert snap["plan"]["id"] == "starter"
    assert snap["plan"]["billing"] == "payg"
    assert snap["plan"]["name"] == "Free"
    assert snap["used"]["personal"] == 0
    assert snap["remaining"]["personal"] == 1
    assert snap["remaining"]["companion"] == 0
    assert snap["allows"]["passkey_collect"] is True
    assert snap["allows"]["auto_plugin"] is False
    assert snap["allows"]["low_latency"] is False


def test_starter_blocks_second_personal_and_any_companion(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    headers = _auth("bob")
    first = client.post(
        "/billing/devices",
        headers=headers,
        json={"level": "personal", "name": "MacBook", "ref_id": "pk-1"},
    )
    assert first.status_code == 200, first.text
    second = client.post(
        "/billing/devices",
        headers=headers,
        json={"level": "personal", "name": "Another laptop", "ref_id": "pk-2"},
    )
    assert second.status_code == 402
    assert second.json()["code"] == "plan_limit"
    companion = client.post(
        "/billing/devices",
        headers=headers,
        json={"level": "companion", "name": "iPhone", "ref_id": "pk-phone"},
    )
    assert companion.status_code == 402
    assert companion.json()["level"] == "companion"


def test_upgrade_to_pro_unlocks_all_three_levels_and_credits_included(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    from src.backend.billing import usage as usage_mod

    client = TestClient(app)
    headers = _auth("cara")
    before = usage_mod.get_balance("cara")
    up = client.post("/billing/plan", headers=headers, json={"plan_id": "pro"})
    assert up.status_code == 200, up.text
    body = up.json()
    assert body["plan"]["id"] == "pro"
    assert body["plan"]["name"] == "Plugin"
    assert body["credited_usd"] == 20.0
    assert usage_mod.get_balance("cara") >= before + 20.0
    assert body["remaining"]["companion"] == 1
    assert body["remaining"]["runtime"] == 1
    assert body["allows"]["auto_plugin"] is True
    assert body["allows"]["biometric_zk"] is True
    phone = client.post(
        "/billing/devices",
        headers=headers,
        json={"level": "companion", "name": "iPhone", "kind": "passkey", "ref_id": "phone-1"},
    )
    assert phone.status_code == 200, phone.text
    replay = client.post("/billing/plan", headers=headers, json={"plan_id": "pro"})
    assert replay.status_code == 200
    assert replay.json()["credited_usd"] == 0.0


def test_downgrade_blocked_when_companion_in_use(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    headers = _auth("dana")
    assert client.post("/billing/plan", headers=headers, json={"plan_id": "pro"}).status_code == 200
    assert (
        client.post(
            "/billing/devices",
            headers=headers,
            json={"level": "companion", "name": "Pixel", "ref_id": "px-1"},
        ).status_code
        == 200
    )
    down = client.post("/billing/plan", headers=headers, json={"plan_id": "starter"})
    assert down.status_code == 409
    assert down.json()["code"] == "plan_downgrade_blocked"


def test_runtime_agent_respects_plan_cap(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    headers = _auth("erin")
    first = client.post(
        "/agents/register",
        headers=headers,
        json={"pubkeyB58": "RuntimeAgent1111111111111111111111111111111", "name": "bot-1"},
    )
    assert first.status_code == 200, first.text
    second = client.post(
        "/agents/register",
        headers=headers,
        json={"pubkeyB58": "RuntimeAgent2222222222222222222222222222222", "name": "bot-2"},
    )
    assert second.status_code == 402
    assert second.json()["level"] == "runtime"
    team = client.post("/billing/plan", headers=headers, json={"plan_id": "accelerate"})
    assert team.status_code == 200
    assert team.json()["plan"]["name"] == "Accelerate"
    assert team.json()["allows"]["low_latency"] is True
    again = client.post(
        "/agents/register",
        headers=headers,
        json={"pubkeyB58": "RuntimeAgent2222222222222222222222222222222", "name": "bot-2"},
    )
    assert again.status_code == 200, again.text


def test_plan_select_unauthorized(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.post("/billing/plan", json={"plan_id": "pro"})
    assert res.status_code == 401
