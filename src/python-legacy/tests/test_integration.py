"""
集成测试：直接对本地 HTTP server 发请求，验证完整链路。

运行方式：
  1. 先启动服务：python -m uvicorn src.server:app --port 8000
  2. 再跑测试：pytest tests/test_integration.py -v

或者用 httpx.AsyncClient(app=app) 做 in-process 测试（不需要启动服务）。
"""

import os
import pytest
import httpx
from fastapi.testclient import TestClient

# 切换到 v2-mvp 目录再导入，避免路径问题
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.server import app

client = TestClient(app)


# ─── 认证测试 ──────────────────────────────────────────────────────────────────

def test_unauthenticated_proxy_rejected():
    """没带 token 的请求必须返回 401"""
    r = client.post("/proxy/helius/", json={"jsonrpc": "2.0", "id": 1, "method": "getSlot"})
    assert r.status_code == 401


def test_invalid_token_rejected():
    """伪造 token 必须返回 401"""
    r = client.post(
        "/proxy/helius/",
        json={"jsonrpc": "2.0", "id": 1, "method": "getSlot"},
        headers={"Authorization": "Bearer fakefakefakefake"},
    )
    assert r.status_code == 401


def test_login_returns_token():
    """登录成功，返回 token"""
    r = client.post("/auth/login", json={"userId": "test-user", "password": "hunter2"})
    assert r.status_code == 200
    data = r.json()
    assert "token" in data
    assert len(data["token"]) > 10


def test_logout_invalidates_token():
    """登出后，token 失效"""
    r = client.post("/auth/login", json={"userId": "logout-test", "password": "pw"})
    token = r.json()["token"]

    client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})

    r2 = client.post(
        "/proxy/helius/",
        json={},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 401


# ─── 密钥管理测试 ────────────────────────────────────────────────────────────────

def test_store_and_retrieve_flow():
    """User A 完整链路：login → store → proxy（需要真实 HELIUS_API_KEY）"""
    helius_key = os.getenv("TEST_HELIUS_KEY", "")
    if not helius_key:
        pytest.skip("设置 TEST_HELIUS_KEY 才能跑真实代理测试")

    # 登录
    r = client.post("/auth/login", json={"userId": "user-a-test", "password": "s3cr3t!"})
    token = r.json()["token"]
    auth = {"Authorization": f"Bearer {token}"}

    # 存 key
    r2 = client.post("/manage/store", json={"upstream": "helius", "apiKey": helius_key}, headers=auth)
    assert r2.status_code == 200

    # 代理真实请求
    r3 = client.post(
        "/proxy/helius/",
        json={"jsonrpc": "2.0", "id": 1, "method": "getSlot", "params": []},
        headers=auth,
    )
    assert r3.status_code == 200
    assert "result" in r3.json()


def test_wrong_password_cannot_use_stored_key():
    """密码不对，取不出 vault 里的 key"""
    # 用 password-A 登录并存 key
    r = client.post("/auth/login", json={"userId": "pw-test-user", "password": "correct-pw"})
    token_a = r.json()["token"]
    client.post(
        "/manage/store",
        json={"upstream": "helius", "apiKey": "fake-key-for-test"},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    # 用 password-B 登录同一个 userId
    r2 = client.post("/auth/login", json={"userId": "pw-test-user", "password": "wrong-pw"})
    token_b = r2.json()["token"]

    # 没有平台 key 时，错误密码导致 401
    if not os.getenv("HELIUS_API_KEY"):
        r3 = client.post(
            "/proxy/helius/",
            json={},
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert r3.status_code == 401


# ─── 安全边界测试 ────────────────────────────────────────────────────────────────

def test_body_size_limit():
    """超过 1MB 的请求体返回 413"""
    r = client.post("/auth/login", json={"userId": "size-test", "password": "pw"})
    token = r.json()["token"]

    big_body = b"x" * 1_100_000
    r2 = client.post(
        "/proxy/helius/",
        content=big_body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream",
        },
    )
    assert r2.status_code == 413


def test_unknown_upstream_returns_404():
    """未知的 upstream 返回 404，不泄露信息"""
    r = client.post("/auth/login", json={"userId": "u", "password": "p"})
    token = r.json()["token"]

    r2 = client.post("/proxy/unknown-service/", json={}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 404


# ─── 批量并发测试 ─────────────────────────────────────────────────────────────

def test_batch_unauthenticated_rejected():
    r = client.post("/manage/batch", json={"requests": []})
    assert r.status_code == 401


def test_batch_limit_enforced():
    r = client.post("/auth/login", json={"userId": "batch-limit", "password": "pw"})
    token = r.json()["token"]

    items = [{"upstream": "helius", "body": {}} for _ in range(21)]
    r2 = client.post("/manage/batch", json={"requests": items}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 400


def test_batch_unknown_upstream_returns_error_in_result():
    r = client.post("/auth/login", json={"userId": "batch-unk", "password": "pw"})
    token = r.json()["token"]

    r2 = client.post(
        "/manage/batch",
        json={"requests": [{"upstream": "no-such-service", "body": {}}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200
    result = r2.json()["results"][0]
    assert "error" in result


def test_batch_empty_returns_empty_results():
    r = client.post("/auth/login", json={"userId": "batch-empty", "password": "pw"})
    token = r.json()["token"]

    r2 = client.post("/manage/batch", json={"requests": []}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["results"] == []


# ─── 缓存测试 ─────────────────────────────────────────────────────────────────

def _login_token(user_id: str, password: str = "pw") -> str:
    r = client.post("/auth/login", json={"userId": user_id, "password": password})
    return r.json()["token"]


def test_cache_header_present_on_proxy(monkeypatch):
    """
    mock helius_router.route — Helius requests now go through the optimized router.
    """
    import src.server as srv
    import src.api_router as router

    async def fake_helius(method, params, api_key, rpc_id=1):
        return {"jsonrpc": "2.0", "id": rpc_id, "result": 42}, "MISS"

    monkeypatch.setattr(router, "call_helius", fake_helius)
    monkeypatch.setitem(srv.PLATFORM_KEYS, "helius", "fake-platform-key")

    token = _login_token("cache-test-user")
    r = client.post(
        "/proxy/helius/",
        json={"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": []},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.headers.get("x-ks-cache") in ("HIT", "MISS", "STALE", "DEDUP")
