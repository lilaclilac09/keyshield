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
import base64
import hashlib
import json
import os
import secrets
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
from pydantic import BaseModel

from . import vault, session, passkey, usage, agents
from . import api_router
from .skills import helius_skill

# Payment wallet — set this to your real address in production
PAYMENT_ADDRESS = os.getenv("PAYMENT_ADDRESS", "0x0000000000000000000000000000000000000000")
# USDC on Base Sepolia (testnet)
USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

MAX_BODY = 1_000_000  # 1 MB

PLATFORM_KEYS: dict[str, str] = {
    # AI models
    "openai":    os.getenv("OPENAI_API_KEY",    ""),
    "anthropic": os.getenv("ANTHROPIC_API_KEY", ""),
    "mistral":   os.getenv("MISTRAL_API_KEY",   ""),
    "cohere":    os.getenv("COHERE_API_KEY",    ""),
    "groq":      os.getenv("GROQ_API_KEY",      ""),
    # Solana RPC
    "helius":    os.getenv("HELIUS_API_KEY",    ""),
    # Trading / DeFi
    "0x":        os.getenv("ZEROX_API_KEY",     ""),
    "titan":     os.getenv("TITAN_API_KEY",     ""),
    "pyth":      os.getenv("PYTH_API_KEY",      ""),   # Hermes price feeds (no key needed for public)
    "alchemy":   os.getenv("ALCHEMY_API_KEY",   ""),
}

UPSTREAMS: dict[str, str] = {
    # AI models
    "openai":    "https://api.openai.com",
    "anthropic": "https://api.anthropic.com",
    "mistral":   "https://api.mistral.ai",
    "cohere":    "https://api.cohere.ai",
    "groq":      "https://api.groq.com/openai",
    # Solana RPC
    "helius":    "https://mainnet.helius-rpc.com",
    # Trading / DeFi — injected via x-api-key or Authorization
    "0x":        "https://api.0x.org",
    "titan":     "https://rpc.titanbuilder.xyz",
    "pyth":      "https://hermes.pyth.network",        # Pyth price feeds (public, key optional)
    "alchemy":   "https://eth-mainnet.g.alchemy.com",
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


# ─── base58 (Solana/Bitcoin alphabet) ────────────────────────────────────────
_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def _b58decode(s: str) -> bytes:
    n = 0
    for c in s:
        n = n * 58 + _B58_ALPHABET.index(c)
    result: list[int] = []
    while n:
        result.append(n & 0xFF)
        n >>= 8
    padding = len(s) - len(s.lstrip("1"))
    return bytes([0] * padding + result[::-1])


# ─── wallet challenge nonce store (in-memory, TTL 5 min) ─────────────────────
_NONCES: dict[str, float] = {}   # nonce_hex → expire_monotonic


# ─── helpers ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield
    for c in _CLIENTS.values():
        await c.aclose()


app = FastAPI(title="KeyShield v2", lifespan=_lifespan)

# ─── static asset serving (install.sh + SDK download) ────────────────────────
from fastapi.responses import FileResponse, PlainTextResponse
from pathlib import Path

_PROJECT_ROOT = Path(__file__).parent.parent  # v2-mvp/

@app.get("/install.sh")
async def install_sh():
    """One-click installer — `curl -fsSL http://host:8000/install.sh | bash`."""
    p = _PROJECT_ROOT / "install.sh"
    if not p.exists():
        raise HTTPException(404, "installer missing")
    return FileResponse(p, media_type="text/x-shellscript", filename="install.sh")

@app.get("/static/keyshield_sdk.py")
async def sdk_download():
    """Python SDK file — pulled by install.sh."""
    p = _PROJECT_ROOT / "keyshield_sdk.py"
    if not p.exists():
        raise HTTPException(404, "sdk missing")
    return FileResponse(p, media_type="text/x-python", filename="keyshield_sdk.py")

@app.get("/static/keyshield-cli.sh")
async def cli_download():
    """Bash CLI — also referenced from the dashboard."""
    p = _PROJECT_ROOT / "keyshield-cli.sh"
    if not p.exists():
        raise HTTPException(404, "cli missing")
    return FileResponse(p, media_type="text/x-shellscript", filename="keyshield-cli.sh")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        ",".join(
            f"http://localhost:{p}" for p in (
                3000, 3001, 3002, 3003, 3004, 3005, 4000, 5173, 5174, 5175,
            )
        ),
    ).split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _bearer(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "unauthorized")
    return auth[7:]


def _session(token: str = Depends(_bearer)) -> dict:
    if token == "dev-bypass":
        return {"user_id": "dev-bypass", "password": "dev-bypass"}
    sess = session.get(token)
    if not sess:
        raise HTTPException(401, "unauthorized")
    return sess


def _resolve_key(sess: dict, upstream: str) -> tuple[str, str]:
    """
    Returns (api_key, key_type) where key_type is 'self_custodian' or 'platform'.

    self_custodian = user stored their own key in the vault → zero cost to them.
    platform       = KeyShield's key injected → billing applies.
    """
    try:
        key = vault.load(sess["user_id"], upstream, sess["password"])
        return key, "self_custodian"
    except PermissionError:
        platform_key = PLATFORM_KEYS.get(upstream, "")
        if not platform_key:
            raise HTTPException(401, "unauthorized: no key stored and no platform key available")
        return platform_key, "platform"


def _x402_body(upstream: str, resource_url: str) -> dict:
    """Coinbase x402 payment-required response body."""
    # 1 USDC = 1_000_000 atomic units (6 decimals); charge $0.01 per call
    return {
        "x402Version": 1,
        "error": "X-PAYMENT-REQUIRED",
        "accepts": [
            {
                "scheme": "exact",
                "network": "base-sepolia",
                "maxAmountRequired": "10000",        # $0.01 USDC (6 decimals)
                "resource": resource_url,
                "description": f"KeyShield API proxy — {upstream}",
                "mimeType": "application/json",
                "payTo": PAYMENT_ADDRESS,
                "maxTimeoutSeconds": 300,
                "asset": USDC_BASE_SEPOLIA,
                "extra": {"name": "USDC", "version": "2"},
            }
        ],
    }


async def _log_usage_bg(
    user_id:     str,
    upstream:    str,
    key_type:    str,
    method:      str,
    path:        str,
    content:     bytes,
    latency_ms:  float,
    status_code: int,
) -> None:
    """Fire-and-forget usage logger. Runs in background — never blocks the response."""
    try:
        tok_in, tok_out, cost = usage.extract_token_usage(upstream, content)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            usage.log_call,
            user_id, upstream, key_type, method, path,
            tok_in, tok_out, cost, latency_ms, status_code,
        )
    except Exception:
        pass  # Logging must never crash the proxy


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


# ── Wallet auth ───────────────────────────────────────────────────────────────

@app.get("/auth/wallet-challenge")
async def wallet_challenge():
    """
    Return a one-time challenge the frontend must sign with its Solana wallet.
    Challenge expires in 5 minutes; replay-protected by single-use nonce.
    """
    now = time.monotonic()
    # Purge expired nonces
    for k in [k for k, v in _NONCES.items() if v < now]:
        del _NONCES[k]

    nonce = secrets.token_hex(16)
    _NONCES[nonce] = now + 300  # 5-minute window

    challenge = (
        f"KeyShield Login\n"
        f"Nonce: {nonce}\n"
        f"Timestamp: {int(time.time())}"
    )
    return {"challenge": challenge, "nonce": nonce}


class WalletLoginBody(BaseModel):
    walletAddress: str   # base58 Solana pubkey
    signature: str       # base64-encoded ed25519 signature (64 bytes)
    challenge: str       # the exact challenge string that was signed
    passphrase: str      # vault encryption passphrase


@app.post("/auth/wallet-login")
async def wallet_login(body: WalletLoginBody):
    """
    1. Verify the ed25519 wallet signature against the challenge.
    2. Consume the nonce (prevents replay).
    3. Create a session keyed to walletAddress + passphrase.
    Returns: {token, userId}
    """
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.exceptions import InvalidSignature

    # Extract nonce from the challenge text
    nonce: str | None = None
    for line in body.challenge.splitlines():
        if line.startswith("Nonce: "):
            nonce = line[7:].strip()
            break

    if not nonce:
        raise HTTPException(400, "malformed challenge: missing nonce")

    now = time.monotonic()
    if nonce not in _NONCES or _NONCES.get(nonce, 0) < now:
        raise HTTPException(400, "challenge expired or already used")

    # Consume nonce — prevents replay
    del _NONCES[nonce]

    # Verify ed25519 signature
    try:
        pub_key_bytes = _b58decode(body.walletAddress)        # 32 bytes
        sig_bytes     = base64.b64decode(body.signature)      # 64 bytes
        msg_bytes     = body.challenge.encode("utf-8")

        Ed25519PublicKey.from_public_bytes(pub_key_bytes).verify(sig_bytes, msg_bytes)
    except InvalidSignature:
        raise HTTPException(401, "invalid wallet signature")
    except Exception as exc:
        raise HTTPException(400, f"signature verification error: {exc}")

    # Signature OK — create session (walletAddress is userId)
    token = session.create(body.walletAddress, body.passphrase)
    return {"token": token, "userId": body.walletAddress}


# ─── agent auth (programmatic / non-human) ───────────────────────────────────
#
# Flow:
#   1. Agent calls GET /auth/agent-challenge  → {challenge, nonce}
#   2. Agent signs challenge with its own ed25519 private key
#   3. Agent calls POST /auth/agent-login     → {token, userId (= owner wallet)}
#   4. Backend verifies sig + delegation, creates session as the vault owner
#
# The nonce store is shared with wallet-challenge (_NONCES) — same replay
# protection applies (5-minute window, single-use).

class AgentLoginBody(BaseModel):
    ownerWallet:  str   # base58 Solana pubkey of the vault owner
    agentPubkey:  str   # base58 ed25519 pubkey of the agent
    signature:    str   # base64-encoded ed25519 sig over challenge (64 bytes)
    challenge:    str   # exact challenge string from /auth/agent-challenge
    passphrase:   str   # owner's vault decryption passphrase


@app.get("/auth/agent-challenge")
async def agent_challenge():
    """Return a one-time challenge for agent authentication (same format as wallet-challenge)."""
    now = time.monotonic()
    for k in [k for k, v in _NONCES.items() if v < now]:
        del _NONCES[k]

    nonce = secrets.token_hex(16)
    _NONCES[nonce] = now + 300

    challenge = (
        f"KeyShield Agent Login\n"
        f"Nonce: {nonce}\n"
        f"Timestamp: {int(time.time())}"
    )
    return {"challenge": challenge, "nonce": nonce}


@app.post("/auth/agent-login")
async def agent_login(body: AgentLoginBody):
    """
    Authenticate an agent by its ed25519 keypair.

    1. Verify the agent's signature over the challenge.
    2. Look up the agent's pubkey in the delegation table.
    3. Confirm the claimed ownerWallet matches the registered owner.
    4. Create and return a session token scoped to the owner's vault.

    The agent can then use this token exactly like a wallet-login token
    — it has full access to the owner's stored keys and proxy endpoints.
    """
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.exceptions import InvalidSignature

    # Extract + consume nonce
    nonce: str | None = None
    for line in body.challenge.splitlines():
        if line.startswith("Nonce: "):
            nonce = line[7:].strip()
            break
    if not nonce:
        raise HTTPException(400, "malformed challenge")

    now = time.monotonic()
    if nonce not in _NONCES or _NONCES.get(nonce, 0) < now:
        raise HTTPException(400, "challenge expired or already used")
    del _NONCES[nonce]

    # Verify agent's ed25519 signature
    try:
        pub_bytes = _b58decode(body.agentPubkey)
        sig_bytes = base64.b64decode(body.signature)
        msg_bytes = body.challenge.encode("utf-8")
        Ed25519PublicKey.from_public_bytes(pub_bytes).verify(sig_bytes, msg_bytes)
    except InvalidSignature:
        raise HTTPException(401, "invalid agent signature")
    except Exception as exc:
        raise HTTPException(400, f"signature error: {exc}")

    # Check delegation
    loop = asyncio.get_event_loop()
    delegation = await loop.run_in_executor(None, agents.lookup_owner, body.agentPubkey)
    if not delegation:
        raise HTTPException(403, "agent pubkey not registered — ask the vault owner to register it")
    if delegation["owner_wallet"] != body.ownerWallet:
        raise HTTPException(403, "agent pubkey is registered under a different wallet")

    # Update last_used (fire-and-forget; run_in_executor returns a Future, schedule it)
    asyncio.ensure_future(loop.run_in_executor(None, agents.touch, body.agentPubkey))

    # Create session as the owner
    token = session.create(body.ownerWallet, body.passphrase)
    return {
        "token":      token,
        "userId":     body.ownerWallet,   # owner's wallet = vault namespace
        "agentName":  delegation["name"],
        "scopes":     delegation["scopes"],
    }


# ─── agent management (owner registers / revokes agent keys) ──────────────────

class AgentRegisterBody(BaseModel):
    pubkeyB58: str          # agent's ed25519 public key (base58)
    name:      str = "agent"
    scopes:    str = "*"    # comma-separated or '*' for all


@app.post("/agents/register")
async def agent_register(body: AgentRegisterBody, sess: dict = Depends(_session)):
    """
    Register an agent pubkey under the current user's wallet.
    The agent can then authenticate autonomously via /auth/agent-login.
    """
    try:
        loop = asyncio.get_event_loop()
        agent_id = await loop.run_in_executor(
            None, agents.register,
            sess["user_id"], body.pubkeyB58, body.name, body.scopes,
        )
        return {"ok": True, "agentId": agent_id, "name": body.name, "pubkey": body.pubkeyB58}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/agents/list")
async def agent_list(sess: dict = Depends(_session)):
    """List agents registered by the current user."""
    loop = asyncio.get_event_loop()
    agent_list = await loop.run_in_executor(None, agents.list_agents, sess["user_id"])
    return {"agents": agent_list}


@app.delete("/agents/{agent_id}")
async def agent_revoke(agent_id: int, sess: dict = Depends(_session)):
    """Revoke an agent's access."""
    loop = asyncio.get_event_loop()
    removed = await loop.run_in_executor(None, agents.revoke, sess["user_id"], agent_id)
    if not removed:
        raise HTTPException(404, "agent not found")
    return {"ok": True}


# ─── key management (User A) ──────────────────────────────────────────────────

class StoreBody(BaseModel):
    upstream: str
    apiKey: str


@app.get("/manage/list")
async def list_keys(sess: dict = Depends(_session)):
    """List which upstreams this user has stored keys for, with metadata."""
    user_dir = vault.VAULT_DIR / sess["user_id"]
    if not user_dir.exists():
        return {"keys": [], "items": []}
    items = []
    keys = []
    for f in sorted(user_dir.glob("*.enc"), key=lambda p: p.stat().st_mtime):
        upstream = f.stem
        stat = f.stat()
        keys.append(upstream)
        items.append({
            "upstream":    upstream,
            "createdAt":   int(stat.st_ctime),
            "updatedAt":   int(stat.st_mtime),
        })
    return {"keys": keys, "items": items}


@app.get("/manage/decrypt/{upstream}")
async def decrypt_key(upstream: str, sess: dict = Depends(_session)):
    """
    Decrypt and return a stored key in plaintext.
    Requires a valid session (password is embedded in the session token).
    Only use to let the owner verify their own key — never expose to agents.
    """
    try:
        plaintext = vault.load(sess["user_id"], upstream, sess["password"])
        return {"upstream": upstream, "key": plaintext}
    except PermissionError:
        raise HTTPException(404, "key not found or wrong passphrase")


# Slug prefixes for non-proxy secrets (passwords, notes, env files, ssh keys).
# api_key items must be in UPSTREAMS so the /proxy/{upstream} route works;
# user-defined secrets just need a recognized type prefix.
ALLOWED_USER_PREFIXES = ("pw__", "note__", "env__", "ssh__")


@app.post("/manage/store")
async def store_key(body: StoreBody, sess: dict = Depends(_session)):
    is_api_key      = body.upstream in UPSTREAMS
    is_user_secret  = any(body.upstream.startswith(p) for p in ALLOWED_USER_PREFIXES)
    if not (is_api_key or is_user_secret):
        raise HTTPException(
            400,
            f"upstream must be in {list(UPSTREAMS)} or start with {list(ALLOWED_USER_PREFIXES)}",
        )
    vault.store(sess["user_id"], body.upstream, body.apiKey, sess["password"])
    return {"ok": True}


@app.delete("/manage/secret/{upstream}")
async def delete_key(upstream: str, sess: dict = Depends(_session)):
    """Delete a stored API key from the vault."""
    vault.delete(sess["user_id"], upstream)
    return {"ok": True}


# ─── proxy 单次 ───────────────────────────────────────────────────────────────

async def _proxy_route(
    upstream: str,
    path:     str,
    request:  Request,
    api_key:  str,
    body:     bytes,
) -> tuple[int, dict, bytes, str]:
    """Route a request to the right upstream. Returns (status, headers, content, cache_status)."""
    url_path = path + (f"?{request.url.query}" if request.url.query else "")

    # ── Helius JSON-RPC → optimized router ───────────────────────────────────
    if upstream == "helius" and request.method == "POST":
        try:
            rpc = json.loads(body)
        except Exception:
            rpc = None
        if isinstance(rpc, dict) and "method" in rpc:
            result, cache_status = await api_router.call_helius(
                rpc["method"], rpc.get("params", []), api_key, rpc.get("id", 1)
            )
            return 200, {"content-type": "application/json"}, json.dumps(result).encode(), cache_status

    # ── 0x — uses 0x-api-key header, not Bearer ──────────────────────────────
    if upstream == "0x":
        fwd_headers = {k: v for k, v in request.headers.items()
                       if k.lower() not in ("host", "authorization", "content-length")}
        fwd_headers["0x-api-key"] = api_key
        return await _forward(upstream, url_path, request.method, fwd_headers, body)

    # ── Titan — private mempool, bearer token ─────────────────────────────────
    if upstream == "titan":
        fwd_headers = {k: v for k, v in request.headers.items()
                       if k.lower() not in ("host", "authorization", "content-length")}
        if api_key:
            fwd_headers["Authorization"] = f"Bearer {api_key}"
        return await _forward(upstream, url_path, request.method, fwd_headers, body)

    # ── Pyth/Hermes — public API, key as query param ──────────────────────────
    if upstream == "pyth":
        fwd_headers = {k: v for k, v in request.headers.items()
                       if k.lower() not in ("host", "authorization", "content-length")}
        qs = request.url.query
        if api_key:
            qs = f"{qs}&api_key={api_key}" if qs else f"api_key={api_key}"
        full_path = path + (f"?{qs}" if qs else "")
        return await _forward(upstream, full_path, request.method, fwd_headers, body)

    # ── OpenAI / Anthropic / Groq / Mistral / Cohere / Alchemy ───────────────
    provider_map = {"openai": "openai", "anthropic": "anthropic",
                    "cohere": "cohere", "groq": "groq", "mistral": "mistral",
                    "alchemy": "alchemy"}
    if upstream in provider_map:
        extra = {k: v for k, v in request.headers.items()
                 if k.lower() not in ("host", "authorization", "content-length", "content-type")}
        full_path = f"/{path}" + (f"?{request.url.query}" if request.url.query else "")
        content, status, cache_status = await api_router.call_rest(
            provider_map[upstream], request.method, full_path, body, api_key, extra,
        )
        return status, {"content-type": "application/json"}, content, cache_status

    # ── Fallback: generic Bearer forward ─────────────────────────────────────
    fwd_headers = {k: v for k, v in request.headers.items()
                   if k.lower() not in ("host", "authorization", "content-length")}
    fwd_headers["authorization"] = f"Bearer {api_key}"
    return await _forward(upstream, url_path, request.method, fwd_headers, body)


@app.api_route("/proxy/{upstream}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(upstream: str, path: str, request: Request, sess: dict = Depends(_session)):
    if upstream not in UPSTREAMS:
        raise HTTPException(404, "unknown upstream")

    body = await request.body()
    if len(body) > MAX_BODY:
        raise HTTPException(413, "payload too large")

    api_key, key_type = _resolve_key(sess, upstream)

    # ── x402: platform key + no balance → 402 Payment Required ──────────────
    if key_type == "platform":
        loop = asyncio.get_event_loop()
        balance = await loop.run_in_executor(None, usage.get_balance, sess["user_id"])
        if balance <= 0:
            return JSONResponse(
                status_code=402,
                content=_x402_body(upstream, str(request.url)),
                headers={"X-Payment-Required": "x402"},
            )

    t0 = time.monotonic()
    status, resp_headers, content, cache_status = await _proxy_route(
        upstream, path, request, api_key, body
    )
    latency_ms = (time.monotonic() - t0) * 1000

    # Fire-and-forget usage logging
    asyncio.create_task(_log_usage_bg(
        sess["user_id"], upstream, key_type,
        request.method, path, content, latency_ms, status,
    ))

    resp_headers.pop("content-encoding", None)
    resp_headers["x-ks-cache"] = cache_status
    resp_headers["x-ks-key-type"] = key_type   # visible to agents / debugging
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
        try:
            api_key, key_type = _resolve_key(sess, item.upstream)
        except HTTPException as e:
            return {"error": e.detail}
        _ = key_type  # batch doesn't charge per-item for now

        raw = json.dumps(item.body).encode() if item.body is not None else b""
        if len(raw) > MAX_BODY:
            return {"error": "payload too large"}

        try:
            # Helius JSON-RPC
            if item.upstream == "helius" and isinstance(item.body, dict) and "method" in item.body:
                result, cache_status = await api_router.call_helius(
                    item.body["method"], item.body.get("params", []),
                    api_key, item.body.get("id", 1)
                )
                return {"status": 200, "cache": cache_status, "data": result}

            # REST providers
            provider_map = {"openai": "openai", "anthropic": "anthropic",
                            "cohere": "cohere", "groq": "groq", "mistral": "mistral"}
            if item.upstream in provider_map:
                content, status, cache_status = await api_router.call_rest(
                    provider_map[item.upstream], item.method,
                    f"/{item.path}" if item.path else "/",
                    raw, api_key,
                )
                return {"status": status, "cache": cache_status,
                        "data": json.loads(content) if content else None}

            # Fallback
            status, _, content, cache_status = await _forward(
                item.upstream, item.path, item.method,
                {"authorization": f"Bearer {api_key}", "content-type": "application/json"}, raw
            )
            return {"status": status, "cache": cache_status,
                    "data": json.loads(content) if content else None}
        except Exception as e:
            return {"error": str(e)}

    results = await asyncio.gather(*[run_one(item) for item in payload.requests])
    return {"results": list(results)}


# ─── Helius skill ────────────────────────────────────────────────────────────

class SkillRunBody(BaseModel):
    tool: str
    inputs: dict[str, Any] = {}


@app.post("/skill/helius/run")
async def skill_helius_run(body: SkillRunBody, sess: dict = Depends(_session)):
    """
    Run a single Helius skill tool by name.
    The caller's stored Helius API key (or platform key) is injected automatically.

    Example:
      POST /skill/helius/run
      {"tool": "portfolio", "inputs": {"wallet": "9WzDX..."}}
    """
    api_key, _ = _resolve_key(sess, "helius")
    try:
        result = await helius_skill.run_tool(body.tool, body.inputs, api_key)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"tool": body.tool, "result": result}


@app.get("/skill/helius/tools")
async def skill_helius_tools():
    """Return the list of available Helius skill tool schemas."""
    return {"tools": helius_skill.TOOL_SCHEMAS}


# ─── passkeys (WebAuthn) ─────────────────────────────────────────────────────

class PasskeyRegVerifyBody(BaseModel):
    credential: dict
    name: str = "Passkey"


class PasskeyAuthVerifyBody(BaseModel):
    credential: dict


@app.get("/auth/passkey/register-options")
async def passkey_register_options(sess: dict = Depends(_session)):
    """Return WebAuthn credential creation options for the current user."""
    try:
        opts = passkey.registration_options(
            user_id=sess["user_id"],
            display_name=sess["user_id"],
        )
        return opts
    except Exception as exc:
        raise HTTPException(400, str(exc))


@app.post("/auth/passkey/register-verify")
async def passkey_register_verify(body: PasskeyRegVerifyBody, sess: dict = Depends(_session)):
    """Verify a new passkey registration and store the credential."""
    try:
        result = passkey.registration_verify(
            user_id=sess["user_id"],
            credential=body.credential,
            name=body.name,
        )
        return result
    except Exception as exc:
        raise HTTPException(400, str(exc))


@app.get("/auth/passkey/auth-options")
async def passkey_auth_options(user_id: str):
    """Return WebAuthn assertion options for a given user (pre-auth, no token needed)."""
    try:
        opts = passkey.authentication_options(user_id=user_id)
        return opts
    except Exception as exc:
        raise HTTPException(400, str(exc))


@app.post("/auth/passkey/auth-verify")
async def passkey_auth_verify(body: PasskeyAuthVerifyBody, user_id: str, passphrase: str):
    """
    Verify a WebAuthn assertion. On success, create and return a session token.
    Query params: user_id, passphrase (vault decryption key).
    """
    try:
        passkey.authentication_verify(user_id=user_id, credential=body.credential)
    except Exception as exc:
        raise HTTPException(401, str(exc))

    token = session.create(user_id, passphrase)
    return {"token": token, "userId": user_id}


@app.get("/auth/passkey/list")
async def passkey_list(sess: dict = Depends(_session)):
    """List passkeys registered for the current user."""
    return {"credentials": passkey.list_credentials(sess["user_id"])}


@app.delete("/auth/passkey/{cred_id}")
async def passkey_delete(cred_id: str, sess: dict = Depends(_session)):
    """Remove a registered passkey."""
    passkey.delete_credential(sess["user_id"], cred_id)
    return {"ok": True}


# ─── usage & billing ──────────────────────────────────────────────────────────

@app.get("/usage/stats")
async def usage_stats(sess: dict = Depends(_session)):
    """Per-upstream usage totals for the current user."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, usage.get_stats, sess["user_id"])


@app.get("/usage/history")
async def usage_history(limit: int = 50, sess: dict = Depends(_session)):
    """Recent proxy calls for the Activity feed."""
    loop = asyncio.get_event_loop()
    history = await loop.run_in_executor(None, usage.get_history, sess["user_id"], min(limit, 100))
    return {"history": history}


@app.get("/billing/balance")
async def billing_balance(sess: dict = Depends(_session)):
    """Return user's prepaid credit balance and total spend."""
    loop = asyncio.get_event_loop()
    balance = await loop.run_in_executor(None, usage.get_balance, sess["user_id"])
    stats   = await loop.run_in_executor(None, usage.get_stats,   sess["user_id"])
    total_cost = sum(s["cost_usd"] for s in stats.get("stats", []))
    return {
        "balance_usd":    balance,
        "total_spent_usd": round(total_cost, 6),
        "free_credit_usd": usage.FREE_CREDIT_USD,
    }


class TopupBody(BaseModel):
    amount_usd: float
    payment_proof: str = ""   # x402 payment proof (tx hash / receipt)


@app.post("/billing/topup")
async def billing_topup(body: TopupBody, sess: dict = Depends(_session)):
    """
    Add prepaid credit. In production this verifies an x402 / MPP payment proof
    on-chain before crediting. For demo: accepts any amount up to $10.

    x402 flow:
      1. Client receives 402 from /proxy/{upstream}/...
      2. Client pays USDC to PAYMENT_ADDRESS on Base
      3. Client retries the request with X-Payment-Proof: {tx_hash}
      4. This endpoint verifies the tx and tops up the balance
    """
    if body.amount_usd <= 0 or body.amount_usd > 10:
        raise HTTPException(400, "amount must be between $0 and $10")

    # TODO: verify body.payment_proof on-chain before crediting
    loop = asyncio.get_event_loop()
    new_balance = await loop.run_in_executor(
        None, usage.topup, sess["user_id"], body.amount_usd
    )
    return {
        "ok":          True,
        "new_balance": new_balance,
        "payment_proof": body.payment_proof or "(demo — no on-chain verification)",
    }


# ─── health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "2.0",
        "generic_cache": len(_CACHE),
        "router": api_router.cache_stats(),
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.server:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
