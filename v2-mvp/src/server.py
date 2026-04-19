"""
KeyShield v2 — 统一入口

路由：
  POST /auth/login           {userId, password} → {token}
  POST /auth/logout          Bearer → 注销
  POST /manage/store         Bearer + {upstream, apiKey} → 存密钥 (User A)
  POST /proxy/{upstream}/*   Bearer → 单次代理
  POST /manage/batch         Bearer + {requests:[...]} → 并发批量代理

性能优化：
  1. 连接复用  — 每个 upstream 一个持久连接池，TCP+TLS 握手只做一次
  2. 并发批量  — /manage/batch 用 asyncio.gather 并行打所有子请求
  3. 方法级缓存 — 只读 RPC 方法自动缓存，响应头 x-ks-cache: HIT/MISS
"""

import asyncio
import hashlib
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel

from . import vault, session

MAX_BODY = 1_000_000  # 1 MB

PLATFORM_KEYS: dict[str, str] = {
    "helius": os.getenv("HELIUS_API_KEY", ""),
    "openai": os.getenv("OPENAI_API_KEY", ""),
}

UPSTREAMS: dict[str, str] = {
    "helius": "https://mainnet.helius-rpc.com",
    "openai": "https://api.openai.com",
}

# ─── 1. 连接复用：每个 upstream 一个持久 AsyncClient ──────────────────────────
_CLIENTS: dict[str, httpx.AsyncClient] = {
    name: httpx.AsyncClient(
        base_url=url,
        timeout=30,
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        http2=True,
    )
    for name, url in UPSTREAMS.items()
}

# ─── 3. 方法级缓存 ────────────────────────────────────────────────────────────
_CACHE: dict[str, tuple[bytes, float]] = {}  # key → (data, expire_monotonic)

_METHOD_TTL: dict[str, float] = {
    "getBalance": 5,
    "getAccountInfo": 5,
    "getTokenAccountBalance": 5,
    "getAsset": 300,               # NFT 元数据 5 分钟
    "getAssetsByOwner": 30,
    "getSignaturesForAddress": 30,
    "getTransaction": 60,
}


def _cache_key(upstream: str, path: str, body: bytes) -> str:
    return f"{upstream}:{path}:{hashlib.sha1(body).hexdigest()}"


def _cache_get(key: str) -> bytes | None:
    entry = _CACHE.get(key)
    if not entry:
        return None
    if time.monotonic() > entry[1]:
        del _CACHE[key]
        return None
    return entry[0]


def _cache_set(key: str, data: bytes, ttl: float) -> None:
    _CACHE[key] = (data, time.monotonic() + ttl)


def _rpc_ttl(body: bytes) -> float | None:
    """从 JSON-RPC body 提取 method，返回 TTL；不可缓存则返回 None。"""
    try:
        parsed = json.loads(body)
        method = (
            parsed.get("method")
            if isinstance(parsed, dict)
            else parsed[0].get("method")
        )
        return _METHOD_TTL.get(method)
    except Exception:
        return None


# ─── helpers ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield
    for c in _CLIENTS.values():
        await c.aclose()


app = FastAPI(title="KeyShield v2", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _bearer(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "unauthorized")
    return auth[7:]


def _session(token: str = Depends(_bearer)) -> dict:
    sess = session.get(token)
    if not sess:
        raise HTTPException(401, "unauthorized")
    return sess


def _resolve_key(sess: dict, upstream: str) -> str:
    try:
        return vault.load(sess["user_id"], upstream, sess["password"])
    except PermissionError:
        platform_key = PLATFORM_KEYS.get(upstream, "")
        if not platform_key:
            raise HTTPException(401, "unauthorized")
        # TODO: record_usage(sess["user_id"], upstream)
        return platform_key


async def _forward(
    upstream: str,
    path: str,
    method: str,
    headers: dict[str, str],
    body: bytes,
) -> tuple[int, dict, bytes, str]:
    """转发一个请求，返回 (status, headers, content, cache_status)。"""
    ck = _cache_key(upstream, path, body)
    ttl = _rpc_ttl(body) if method.upper() == "POST" else None

    if ttl is not None:
        cached = _cache_get(ck)
        if cached is not None:
            return 200, {"content-type": "application/json"}, cached, "HIT"

    resp = await _CLIENTS[upstream].request(
        method=method, url=f"/{path}", headers=headers, content=body
    )

    if ttl is not None and resp.status_code == 200:
        _cache_set(ck, resp.content, ttl)

    return resp.status_code, dict(resp.headers), resp.content, "MISS"


# ─── auth ─────────────────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    userId: str
    password: str


@app.post("/auth/login")
async def login(body: LoginBody):
    token = session.create(body.userId, body.password)
    return {"token": token}


@app.post("/auth/logout")
async def logout(token: str = Depends(_bearer)):
    session.delete(token)
    return {"ok": True}


# ─── key management (User A) ──────────────────────────────────────────────────

class StoreBody(BaseModel):
    upstream: str
    apiKey: str


@app.get("/manage/list")
async def list_keys(sess: dict = Depends(_session)):
    """List which upstreams this user has stored keys for."""
    user_dir = vault.VAULT_DIR / sess["user_id"]
    if not user_dir.exists():
        return {"keys": []}
    keys = [f.stem for f in user_dir.glob("*.enc")]
    return {"keys": keys}


@app.post("/manage/store")
async def store_key(body: StoreBody, sess: dict = Depends(_session)):
    if body.upstream not in UPSTREAMS:
        raise HTTPException(400, "unknown upstream")
    vault.store(sess["user_id"], body.upstream, body.apiKey, sess["password"])
    return {"ok": True}


# ─── proxy 单次 ───────────────────────────────────────────────────────────────

@app.api_route("/proxy/{upstream}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(upstream: str, path: str, request: Request, sess: dict = Depends(_session)):
    if upstream not in UPSTREAMS:
        raise HTTPException(404, "unknown upstream")

    body = await request.body()
    if len(body) > MAX_BODY:
        raise HTTPException(413, "payload too large")

    api_key = _resolve_key(sess, upstream)

    fwd_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "authorization", "content-length")
    }
    fwd_headers["authorization"] = f"Bearer {api_key}"

    url_path = path + (f"?{request.url.query}" if request.url.query else "")

    status, resp_headers, content, cache_status = await _forward(
        upstream, url_path, request.method, fwd_headers, body
    )
    resp_headers.pop("content-encoding", None)  # httpx 已解压，移除避免客户端误判
    resp_headers["x-ks-cache"] = cache_status
    return Response(content=content, status_code=status, headers=resp_headers)


# ─── 2. 批量并发端点 ──────────────────────────────────────────────────────────

class BatchItem(BaseModel):
    upstream: str
    path: str = ""
    method: str = "POST"
    body: Any = None


class BatchBody(BaseModel):
    requests: list[BatchItem]


@app.post("/manage/batch")
async def batch(payload: BatchBody, sess: dict = Depends(_session)):
    """
    一次 HTTP 调用，asyncio.gather 并行打出所有子请求。

    示例：
    {
      "requests": [
        {"upstream":"helius","body":{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["<addr>"]}},
        {"upstream":"helius","body":{"jsonrpc":"2.0","id":2,"method":"getAssetsByOwner","params":["<addr>"]}},
        {"upstream":"helius","body":{"jsonrpc":"2.0","id":3,"method":"getSignaturesForAddress","params":["<addr>"]}}
      ]
    }
    5个串行 ~300ms → 5个并行 ~60ms
    """
    if len(payload.requests) > 20:
        raise HTTPException(400, "batch limit is 20")

    async def run_one(item: BatchItem) -> dict:
        if item.upstream not in UPSTREAMS:
            return {"error": "unknown upstream"}

        raw = json.dumps(item.body).encode() if item.body is not None else b""
        if len(raw) > MAX_BODY:
            return {"error": "payload too large"}

        try:
            api_key = _resolve_key(sess, item.upstream)
        except HTTPException as e:
            return {"error": e.detail}

        headers = {
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        }
        try:
            status, _, content, cache_status = await _forward(
                item.upstream, item.path, item.method, headers, raw
            )
            return {
                "status": status,
                "cache": cache_status,
                "data": json.loads(content) if content else None,
            }
        except Exception as e:
            return {"error": str(e)}

    results = await asyncio.gather(*[run_one(item) for item in payload.requests])
    return {"results": list(results)}


# ─── health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0", "cache_entries": len(_CACHE)}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.server:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
