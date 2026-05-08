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

from . import vault, session, passkey, usage, agents, mpp_streams as mpp
from . import api_router
from . import metrics as ks_metrics
from .skills import helius_skill

# ─── Sentry error tracking (opt-in via SENTRY_DSN env var) ───────────────────
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration

_PII_FIELDS = {"password", "api_key", "passphrase", "token", "secret", "key_value"}


def _sentry_before_send(event: dict, hint: dict) -> dict | None:
    """Strip PII fields from request data and drop non-5xx HTTP exceptions."""
    # Drop client-error HTTPExceptions (4xx) — not actionable server errors
    exc_info = hint.get("exc_info")
    if exc_info is not None:
        exc = exc_info[1]
        if isinstance(exc, HTTPException) and exc.status_code < 500:
            return None

    # Scrub sensitive fields from request body captured by Sentry
    try:
        req_data = event.get("request", {}).get("data")
        if isinstance(req_data, dict):
            for field in _PII_FIELDS:
                if field in req_data:
                    req_data[field] = "[Filtered]"
    except Exception:
        pass  # Never let the filter itself crash

    return event


_SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if _SENTRY_DSN:
    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        integrations=[FastApiIntegration(), HttpxIntegration()],
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        environment=os.getenv("KS_ENV", "development"),
        release=os.getenv("KS_VERSION", "dev"),
        # Never capture PII — vault keys, passwords, API keys
        send_default_pii=False,
        before_send=_sentry_before_send,
    )

print(f"[KeyShield] Sentry {'enabled' if _SENTRY_DSN else 'disabled'}")

# Payment wallet — set this to your real address in production
PAYMENT_ADDRESS = os.getenv("PAYMENT_ADDRESS", "0x0000000000000000000000000000000000000000")
# Solana payment receiver (base58 pubkey). When set, /billing/topup-solana
# accepts on-chain SOL + USDC transfers to this address.
PAYMENT_ADDRESS_SOLANA = os.getenv(
    "PAYMENT_ADDRESS_SOLANA",
    "11111111111111111111111111111111",  # placeholder; configure in prod
)
SOLANA_RPC_URL = os.getenv(
    "SOLANA_RPC_URL",
    "https://api.mainnet-beta.solana.com",
)
# Slippage tolerance for the Pyth-priced SOL → USD conversion check.
# Default: accept ±5% slippage between the user's quoted price and what we
# observe at credit time, since the user's tx confirms after the quote.
SOL_PRICE_SLIPPAGE = float(os.getenv("SOL_PRICE_SLIPPAGE", "0.05"))
# Per-call topup ceiling. Default $10 (demo-safe). Production deployments
# can raise via env without code changes.
MAX_TOPUP_USD = float(os.getenv("MAX_TOPUP_USD", "10"))
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
    "groq":      "https://api.groq.com",
    # Solana RPC
    "helius":    "https://mainnet.helius-rpc.com",
    # Trading / DeFi — injected via x-api-key or Authorization
    "0x":        "https://api.0x.org",
    "titan":     "https://rpc.titanbuilder.xyz",
    "pyth":      "https://hermes.pyth.network",        # Pyth price feeds (public, key optional)
    "alchemy":   "https://eth-mainnet.g.alchemy.com",
}

# Test-only knob used by `proxy-rs/tests/oracle_diff/`. When set, every
# upstream's base URL is rewritten to point at the override, so a single
# mock-upstream stand-in can intercept all egress. Production behavior
# is unchanged when unset. Same env var also rewrites
# `api_router.PROVIDERS[*].base` (read at import in api_router.py).
_UPSTREAM_OVERRIDE_BASE = os.getenv("KS_UPSTREAM_OVERRIDE_BASE", "").strip()
if _UPSTREAM_OVERRIDE_BASE:
    for _name in list(UPSTREAMS):
        UPSTREAMS[_name] = _UPSTREAM_OVERRIDE_BASE

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
#
# Stored as nonce → (expire_monotonic, original_challenge_text). We keep the
# full challenge so the login handler can reject submissions that swapped in
# a different challenge body (replay-with-tampered-text). The nonce alone
# isn't sufficient — the wallet signs the WHOLE challenge string, so the
# server has to compare the supplied bytes against the issued bytes
# verbatim, otherwise an attacker could trick a wallet into signing
# arbitrary text and reuse a stolen nonce.
_NONCES: dict[str, tuple[float, str]] = {}


def _purge_expired_nonces() -> None:
    """Drop expired entries. Cheap to call; runs O(n) on each /challenge."""
    now = time.monotonic()
    for k in [k for k, v in _NONCES.items() if v[0] < now]:
        del _NONCES[k]


def _record_nonce(nonce: str, challenge: str, ttl_secs: float = 300.0) -> None:
    _NONCES[nonce] = (time.monotonic() + ttl_secs, challenge)


def _validate_challenge(supplied: str) -> str:
    """
    Look up the supplied challenge text against the issued nonces. Returns
    the nonce string on success. Raises HTTPException with a precise error
    message otherwise. Does NOT consume the nonce — caller must
    `_consume_nonce(nonce)` only AFTER signature verification succeeds, so
    a typo / wallet glitch / network blip doesn't burn the user's challenge
    and force them to fetch a new one.
    """
    nonce: str | None = None
    for line in supplied.splitlines():
        if line.startswith("Nonce: "):
            nonce = line[7:].strip()
            break
    if not nonce:
        raise HTTPException(400, "malformed challenge: missing 'Nonce:' line")

    entry = _NONCES.get(nonce)
    if entry is None:
        raise HTTPException(400, "challenge expired or already used")

    expiry, stored_challenge = entry
    if expiry < time.monotonic():
        # Garbage-collect on the way out.
        _NONCES.pop(nonce, None)
        raise HTTPException(400, "challenge expired")

    if stored_challenge != supplied:
        # Same nonce but tampered text — reject without consuming so a real
        # client with the right text can still log in.
        raise HTTPException(400, "challenge text does not match issued challenge")

    return nonce


def _consume_nonce(nonce: str) -> None:
    _NONCES.pop(nonce, None)


def _decode_b58_pubkey(s: str, *, label: str) -> bytes:
    """Strict 32-byte base58 decode for ed25519 pubkeys, with a helpful
    400 message instead of an opaque ValueError."""
    try:
        raw = _b58decode(s)
    except ValueError as exc:
        raise HTTPException(400, f"invalid base58 {label}: {exc}")
    if len(raw) != 32:
        raise HTTPException(
            400,
            f"{label} must decode to 32 bytes (got {len(raw)}); "
            f"check it's a valid Solana / ed25519 pubkey",
        )
    return raw


def _decode_b64_signature(s: str) -> bytes:
    """Strict 64-byte base64 decode for ed25519 signatures."""
    try:
        raw = base64.b64decode(s, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise HTTPException(400, f"invalid base64 signature: {exc}")
    if len(raw) != 64:
        raise HTTPException(
            400,
            f"signature must be 64 bytes (got {len(raw)}); "
            f"ed25519 signatures are exactly 64 bytes",
        )
    return raw


# ─── helpers ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield
    for c in _CLIENTS.values():
        await c.aclose()


app = FastAPI(title="KeyShield v2", lifespan=_lifespan)

# ─── firewall: Rust ↔ Python shared secret ──────────────────────────────────
#
# In production, Python `:8001` is internal-only — clients hit the Rust
# proxy on `:8000`, and ks-proxy reverse-proxies to Python with the
# `X-Internal-Secret` header (see `proxy-rs/crates/ks-proxy/src/handlers.rs`
# `fallthrough`). Any direct curl to `:8001` without the header gets 403.
#
# When `KS_INTERNAL_SECRET` is empty (dev mode), this middleware fails open
# but logs a warning at startup so you notice if you forgot to set it.
import sys as _sys

_INTERNAL_SECRET = os.getenv("KS_INTERNAL_SECRET", "").strip()
if not _INTERNAL_SECRET:
    print(
        "⚠️  KS_INTERNAL_SECRET is empty — Python :8001 is OPEN to anyone "
        "who can reach the host. Set this in production.",
        file=_sys.stderr,
    )


@app.middleware("http")
async def _require_internal_secret(request: Request, call_next):
    """Reject any request that didn't come through ks-proxy.

    Two carve-outs so dev experience doesn't suffer:
      * `OPTIONS` (CORS preflight) — must succeed without secret so browsers
        can negotiate before the real (secret-bearing) request fires.
      * `KS_INTERNAL_SECRET` empty — fail open (dev mode).
    """
    if not _INTERNAL_SECRET:
        return await call_next(request)
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.headers.get("x-internal-secret", "") != _INTERNAL_SECRET:
        return JSONResponse(
            {"error": "forbidden — direct access to Python :8001 not allowed; "
                      "use the public ks-proxy on :8000 instead"},
            status_code=403,
        )
    return await call_next(request)


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

@app.get("/passkey")
async def passkey_page():
    """Self-contained passkey register + login page. No frontend needed."""
    p = Path(__file__).parent / "static" / "passkey.html"
    if not p.exists():
        raise HTTPException(404, "passkey page missing")
    return FileResponse(p, media_type="text/html")

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
    """
    Resolve session from token. Tries self-contained verification first,
    falls back to DB lookup. This means tokens survive server restarts.
    """
    if token == "dev-bypass":
        return {"user_id": "dev-bypass", "password": "dev-bypass"}

    # Fast path: verify token without DB (survives restarts)
    valid, err = session.verify_token(token)
    if valid:
        # Extract user_id from the token payload
        import hmac as _hmac
        import json as _json
        from base64 import urlsafe_b64decode

        parts = token.rsplit(".", 1)
        payload_str = parts[0]
        padding = "=" * (4 - len(payload_str) % 4) if len(payload_str) % 4 else ""
        data = _json.loads(urlsafe_b64decode(payload_str + padding))

        # Get password from DB (needed for key management)
        db_sess = session.get(token)
        if db_sess:
            return {"user_id": db_sess["user_id"], "password": db_sess["password"]}
        else:
            return {"user_id": data["uid"], "password": ""}

    # Slow path: DB lookup (for older tokens or when token is invalid)
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
        ks_metrics.record_proxy(upstream, status_code, latency_ms / 1000.0)
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
    # ADR-001 #8: gate RPC method-name caching to Helius only. Python had
    # a latent bug where any upstream POST whose body parsed as JSON-RPC
    # with a known method got cached (e.g. /proxy/0x with body
    # `{"method":"getBalance",...}`). Helius is the only upstream where
    # method-name caching is correct; everywhere else, only the path/body
    # cache (via the broader _cache_key) should engage.
    ttl = (
        _rpc_ttl(body)
        if upstream == "helius" and method.upper() == "POST"
        else None
    )

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
    try:
        # Use create_token (self-contained with HMAC) or fall back to session.create
        if hasattr(session, "create_token"):
            token = session.create_token(body.userId, body.password)
        else:
            token = session.create(body.userId, body.password)
    except session.UserDeleted:
        raise HTTPException(410, "this account was deleted")
    return {"token": token}


@app.post("/auth/logout")
async def logout(token: str = Depends(_bearer)):
    session.delete(token)
    return {"ok": True}


# ── /auth/delete-account: cascade wipe + soft-delete tombstone ───────────────
#
# What gets wiped on success:
#   1. Vault entries (.enc files under VAULT_DIR/<user_id>)
#   2. Agent registrations (agent_keys WHERE owner_wallet = user_id)
#   3. All sessions for the user
#   4. Usage history + balance + topup_tx rows
#   5. x402_claims rows for the user (best-effort — only if module is loaded)
#   6. Sharing rows owned by the user (vault_shares WHERE owner_id = user_id)
#   7. Passkey credentials (passkey_credentials WHERE user_id = ?)
#
# Then the user_id gets a tombstone row in deleted_users so:
#   - any token that survived the session wipe still fails (session.get()
#     cross-checks deleted_users)
#   - the same wallet re-registering can't impersonate the prior identity;
#     session.create() raises UserDeleted → 410 Gone.
#
# For wallet-login users, we require a fresh ed25519 signature over a
# DELETE-specific challenge string. This is the anti-account-takeover
# mitigation: an attacker who steals a session token still can't permanently
# delete the account without also having the wallet's private key.

CONFIRMATION_PHRASE = "DELETE my account"


class DeleteAccountBody(BaseModel):
    confirmation: str
    # Wallet-login users must supply these. Same shape as /auth/wallet-login,
    # except the challenge string starts with "KeyShield Delete Account" so a
    # signature obtained from the login flow can't be replayed against
    # /auth/delete-account.
    walletAddress: str | None = None
    signature:     str | None = None
    challenge:     str | None = None


@app.get("/auth/delete-account-challenge")
async def delete_account_challenge(sess: dict = Depends(_session)):
    """
    Issue a one-time challenge for the destructive /auth/delete-account
    flow. Distinct prefix ('KeyShield Delete Account') so a wallet-login
    signature can't be replayed here, and vice versa.
    """
    _purge_expired_nonces()
    nonce = secrets.token_hex(16)
    challenge = (
        f"KeyShield Delete Account\n"
        f"User: {sess['user_id']}\n"
        f"Nonce: {nonce}\n"
        f"Timestamp: {int(time.time())}"
    )
    _record_nonce(nonce, challenge)
    return {"challenge": challenge, "nonce": nonce}


def _looks_like_solana_wallet(user_id: str) -> bool:
    """
    Heuristic: a Solana wallet address is base58-encoded 32 bytes, which
    in practice means 43-44 chars from the base58 alphabet. Used to decide
    whether to require a fresh signature on /auth/delete-account.

    False positives are fine (we just demand an extra signature the user
    can't produce — they'd hit a clean 400 telling them to skip the
    walletAddress fields). False negatives are the dangerous case: a real
    wallet user who skips the signature requirement. The length + alphabet
    gate together rule that out for any address that successfully logged
    in via /auth/wallet-login.
    """
    if not (32 <= len(user_id) <= 44):
        return False
    return all(c in _B58_ALPHABET for c in user_id)


@app.post("/auth/delete-account")
async def delete_account(
    body: DeleteAccountBody,
    sess: dict = Depends(_session),
):
    """
    Permanently delete the authenticated user's account and all associated
    data. Wallet-login users must additionally sign a DELETE-specific
    challenge from /auth/delete-account-challenge to defeat session-token
    theft.

    Body:
      {
        "confirmation": "DELETE my account",   // must match exactly
        "walletAddress": "<base58>",           // wallet users only
        "signature":     "<base64 ed25519>",   // wallet users only
        "challenge":     "<challenge text>"    // wallet users only
      }

    Idempotent at the cascade level — a partial cascade can be retried
    safely. The tombstone is set last so any concurrent in-flight requests
    on the same user can still complete cleanly before being locked out.
    """
    if body.confirmation != CONFIRMATION_PHRASE:
        raise HTTPException(
            400,
            f"confirmation must be exactly {CONFIRMATION_PHRASE!r}",
        )

    user_id = sess["user_id"]

    # ── Wallet-login defense in depth: require a fresh signed message ─────
    if _looks_like_solana_wallet(user_id):
        if not (body.walletAddress and body.signature and body.challenge):
            raise HTTPException(
                400,
                "wallet-login users must include walletAddress, signature, "
                "and challenge (from /auth/delete-account-challenge)",
            )
        if body.walletAddress != user_id:
            raise HTTPException(
                403,
                "walletAddress does not match the authenticated user",
            )
        if not body.challenge.startswith("KeyShield Delete Account"):
            # Reject a wallet-login challenge being smuggled in as the
            # delete challenge — they have different prefixes for exactly
            # this reason.
            raise HTTPException(
                400,
                "challenge must be issued by /auth/delete-account-challenge",
            )

        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        from cryptography.exceptions import InvalidSignature

        nonce = _validate_challenge(body.challenge)
        pub_key_bytes = _decode_b58_pubkey(body.walletAddress, label="wallet address")
        sig_bytes = _decode_b64_signature(body.signature)
        msg_bytes = body.challenge.encode("utf-8")
        try:
            Ed25519PublicKey.from_public_bytes(pub_key_bytes).verify(sig_bytes, msg_bytes)
        except InvalidSignature:
            raise HTTPException(401, "invalid wallet signature")
        _consume_nonce(nonce)

    loop = asyncio.get_event_loop()

    def _cascade() -> dict:
        report: dict[str, Any] = {}

        # 1. Vault entries
        keys = vault.list_keys(user_id)
        for upstream in keys:
            vault.delete(user_id, upstream)
        report["vault_keys"] = len(keys)

        # 2. Agent registrations — list + revoke loop
        agent_rows = agents.list_agents(user_id)
        for agent in agent_rows:
            agents.revoke(user_id, agent["id"])
        report["agents"] = len(agent_rows)

        # 3. Usage history, balance, topup_tx
        report["usage"] = usage.purge_user(user_id)

        # 4. Passkey credentials — best-effort (lazy import: optional dep)
        try:
            from . import passkey as passkey_mod
            with passkey_mod._db() as pk_conn:
                cur = pk_conn.execute(
                    "DELETE FROM passkey_credentials WHERE user_id = ?",
                    (user_id,),
                )
                report["passkeys"] = cur.rowcount or 0
        except Exception:
            report["passkeys"] = "skipped"

        # 5. x402_claims — only if x402_verify module exists in this build
        try:
            from . import x402_verify  # type: ignore[attr-defined]
            x402_verify._db().execute(
                "DELETE FROM x402_claims WHERE user_id=?", (user_id,),
            )
            report["x402_claims"] = "purged"
        except (ImportError, AttributeError):
            # Module not present in this build — fine; nothing to purge.
            report["x402_claims"] = "skipped"
        except Exception as exc:
            report["x402_claims"] = f"error: {exc}"

        # 6. Sharing rows — best-effort, only if sharing module loaded
        try:
            from . import sharing  # type: ignore[attr-defined]
            report["shares"] = sharing.purge_user(user_id)
        except (ImportError, AttributeError):
            report["shares"] = "skipped"
        except Exception as exc:
            report["shares"] = f"error: {exc}"

        # 7. Sessions (do this LAST so we don't lock ourselves out of the
        #    cleanup mid-cascade by accidentally invalidating our own token
        #    via a side-effect).
        report["sessions"] = session.delete_all_for_user(user_id)

        # 8. Tombstone — ABSOLUTE last step. After this, any surviving
        #    session row would still fail session.get() because of the
        #    deleted_users cross-check.
        session.mark_deleted(user_id)

        return report

    try:
        report = await loop.run_in_executor(None, _cascade)
    except Exception as exc:
        # Best-effort partial cleanup — the tombstone might not have been
        # set, so the user can retry. Surface the error for diagnosis.
        raise HTTPException(500, f"cascade failed: {exc}")

    return {"ok": True, "report": report}


# ── Wallet auth ───────────────────────────────────────────────────────────────

@app.get("/auth/wallet-challenge")
async def wallet_challenge():
    """
    Return a one-time challenge the frontend must sign with its Solana wallet.
    Challenge expires in 5 minutes; replay-protected by single-use nonce.
    """
    _purge_expired_nonces()
    nonce = secrets.token_hex(16)
    challenge = (
        f"KeyShield Login\n"
        f"Nonce: {nonce}\n"
        f"Timestamp: {int(time.time())}"
    )
    _record_nonce(nonce, challenge)
    return {"challenge": challenge, "nonce": nonce}


class WalletLoginBody(BaseModel):
    walletAddress: str   # base58 Solana pubkey
    signature: str       # base64-encoded ed25519 signature (64 bytes)
    challenge: str       # the exact challenge string that was signed
    passphrase: str      # vault encryption passphrase


@app.post("/auth/wallet-login")
async def wallet_login(body: WalletLoginBody):
    """
    1. Validate the supplied challenge text against what the server issued
       (matches stored nonce → original challenge text).
    2. Decode + length-check the wallet pubkey and signature.
    3. Verify the ed25519 signature.
    4. Only on full success: consume the nonce (so a typo / wallet glitch
       can be retried without re-fetching a challenge) and create a session.
    Returns: {token, userId}
    """
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.exceptions import InvalidSignature

    nonce = _validate_challenge(body.challenge)
    pub_key_bytes = _decode_b58_pubkey(body.walletAddress, label="wallet address")
    sig_bytes = _decode_b64_signature(body.signature)
    msg_bytes = body.challenge.encode("utf-8")

    try:
        Ed25519PublicKey.from_public_bytes(pub_key_bytes).verify(sig_bytes, msg_bytes)
    except InvalidSignature:
        # Don't consume the nonce — let the user retry with a corrected
        # signature without having to fetch a new challenge first.
        raise HTTPException(401, "invalid wallet signature")

    _consume_nonce(nonce)
    try:
        token = session.create(body.walletAddress, body.passphrase)
    except session.UserDeleted:
        raise HTTPException(410, "this account was deleted")
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
    _purge_expired_nonces()
    nonce = secrets.token_hex(16)
    challenge = (
        f"KeyShield Agent Login\n"
        f"Nonce: {nonce}\n"
        f"Timestamp: {int(time.time())}"
    )
    _record_nonce(nonce, challenge)
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

    nonce = _validate_challenge(body.challenge)
    pub_bytes = _decode_b58_pubkey(body.agentPubkey, label="agent pubkey")
    sig_bytes = _decode_b64_signature(body.signature)
    msg_bytes = body.challenge.encode("utf-8")

    try:
        Ed25519PublicKey.from_public_bytes(pub_bytes).verify(sig_bytes, msg_bytes)
    except InvalidSignature:
        # Don't consume the nonce — caller can retry on transient sig errors.
        raise HTTPException(401, "invalid agent signature")

    # Check delegation BEFORE consuming the nonce so an unauthorized agent
    # also doesn't burn the user's challenge.
    loop = asyncio.get_event_loop()
    delegation = await loop.run_in_executor(None, agents.lookup_owner, body.agentPubkey)
    if not delegation:
        raise HTTPException(403, "agent pubkey not registered — ask the vault owner to register it")
    if delegation["owner_wallet"] != body.ownerWallet:
        raise HTTPException(403, "agent pubkey is registered under a different wallet")

    # All checks passed — now consume the nonce + finalize.
    _consume_nonce(nonce)

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


# ─── vault sharing (read-only DEK delegation) ───────────────────────────────
#
# A "share" lets a vault owner grant another user read access to a specific
# key without disclosing the underlying API key in plaintext. The recipient
# decrypts the DEK with their own key material; the server never sees
# either side's plaintext.
#
# v1 status (this branch): the table, list/revoke endpoints, and tenant
# isolation are wired up; /share/grant returns 501 because the AES-GCM
# file vault on this branch does not carry the recipient's public key
# needed to re-wrap the DEK. See sharing.CRYPTO_REWRAP_AVAILABLE for the
# single-flag flip when the passkey-vault upgrade lands.

from . import sharing  # noqa: E402


class ShareGrantBody(BaseModel):
    key_name:          str
    recipient_user_id: str
    expires_at:        int | None = None


@app.post("/share/grant")
async def share_grant(body: ShareGrantBody, sess: dict = Depends(_session)):
    """
    Grant another user read access to a key in your vault.

    On builds that do not yet support passkey-derived DEK re-wrapping,
    this returns 501 with a clear explanation. The 501 path is the
    contract for v1 (per spec C3); flipping
    sharing.CRYPTO_REWRAP_AVAILABLE without also implementing the
    re-wrap step would silently store NULL DEKs, which is worse than
    a hard 501.
    """
    owner_id = sess["user_id"]

    # Sanity: you cannot share a key you don't own.
    if body.key_name not in vault.list_keys(owner_id):
        raise HTTPException(404, f"no such key in your vault: {body.key_name}")

    # Self-share is meaningless and a frequent UI mistake.
    if body.recipient_user_id == owner_id:
        raise HTTPException(400, "cannot share a key with yourself")

    if not sharing.CRYPTO_REWRAP_AVAILABLE:
        raise HTTPException(
            501,
            "Sharing requires a passkey-based vault so the DEK can be "
            "re-wrapped to the recipient's public key. The current AES-GCM "
            "file vault doesn't carry that material — coming in v2.",
        )

    # When the upgrade lands, the route layer will:
    #   1. fetch recipient's wrap pubkey from passkey_credentials
    #   2. read the DEK from owner's wrapped-vault entry
    #   3. re-wrap to recipient's pubkey
    #   4. call sharing.grant(..., encrypted_dek=wrapped) below
    # For now, this code path is unreachable.
    try:
        loop = asyncio.get_event_loop()
        share_id = await loop.run_in_executor(
            None, sharing.grant,
            owner_id, body.recipient_user_id, body.key_name, None, body.expires_at,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc))

    return {
        "ok": True,
        "share": {
            "id":           share_id,
            "owner_id":     owner_id,
            "recipient_id": body.recipient_user_id,
            "key_name":     body.key_name,
            "expires_at":   body.expires_at,
        },
    }


@app.get("/share/incoming")
async def share_incoming(sess: dict = Depends(_session)):
    """List shares granted TO the current user."""
    loop = asyncio.get_event_loop()
    shares = await loop.run_in_executor(None, sharing.list_incoming, sess["user_id"])
    return {"shares": shares}


@app.get("/share/outgoing")
async def share_outgoing(sess: dict = Depends(_session)):
    """List shares the current user has granted."""
    loop = asyncio.get_event_loop()
    shares = await loop.run_in_executor(None, sharing.list_outgoing, sess["user_id"])
    return {"shares": shares}


@app.delete("/share/{share_id}")
async def share_revoke(share_id: int, sess: dict = Depends(_session)):
    """
    Revoke a share. Owner-only — recipients cannot delete shares granted
    to them (they can stop using the share, but the canonical row is the
    owner's). Returns 404 when the share is not owned by the caller, to
    avoid leaking the existence of other users' shares.
    """
    loop = asyncio.get_event_loop()
    removed = await loop.run_in_executor(None, sharing.revoke, sess["user_id"], share_id)
    if not removed:
        raise HTTPException(404, "share not found")
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


import logging  # noqa: E402

from . import x402_verify  # noqa: E402

logger = logging.getLogger("keyshield.server")


class TopupBody(BaseModel):
    amount_usd: float
    payment_proof: str = ""   # x402 payment proof (tx hash / receipt)


@app.post("/billing/topup")
async def billing_topup(body: TopupBody, sess: dict = Depends(_session)):
    """
    Add prepaid credit. Verifies an x402 payment proof (Base USDC tx
    hash) on-chain before crediting, and refuses duplicate claims via
    the x402_claims idempotency table — see v2-mvp/src/x402_verify.py
    for the threat model.

    x402 flow:
      1. Client receives 402 from /proxy/{upstream}/...
      2. Client pays USDC to KS_X402_RECEIVER_ADDRESS on Base
      3. Client retries with X-Payment-Proof: {tx_hash} (or POSTs here
         directly with payment_proof in the body)
      4. We verify the tx on-chain via Base RPC + check idempotency
      5. If both pass, credit the balance

    Behavior matrix:
      - payment_proof empty + KS_X402_VERIFY_REQUIRED!=1 → demo credit
        (preserves the legacy dev path; rejected in prod)
      - payment_proof empty + KS_X402_VERIFY_REQUIRED=1   → 400
      - payment_proof set, env unset → stub-fallback verify, idempotency
        still applied (prevents replay even in dev)
      - payment_proof set, env set   → real on-chain verify
      - payment_proof already claimed → 409 Conflict
    """
    if body.amount_usd <= 0 or body.amount_usd > MAX_TOPUP_USD:
        raise HTTPException(
            400, f"amount must be between $0 and ${MAX_TOPUP_USD:g}",
        )

    loop = asyncio.get_event_loop()
    proof = (body.payment_proof or "").strip()
    cfg = x402_verify.load_x402_config()

    # Allow empty payment_proof in dev (preserves legacy demo flow).
    # In prod (KS_X402_VERIFY_REQUIRED=1) refuse it.
    if not proof:
        if cfg is not None and cfg.verify_required:
            raise HTTPException(
                400,
                "payment_proof is required when KS_X402_VERIFY_REQUIRED=1",
            )
        new_balance = await loop.run_in_executor(
            None, usage.topup, sess["user_id"], body.amount_usd,
        )
        return {
            "ok":            True,
            "new_balance":   new_balance,
            "payment_proof": "(demo — no on-chain verification)",
            "verified_mode": "demo",
        }

    # Verify on-chain (or stub-fallback if env unset).
    try:
        verified, mode = await x402_verify.verify_on_chain(
            cfg, proof, body.amount_usd,
        )
    except x402_verify.VerifyError as e:
        raise HTTPException(400, f"x402 verification failed: {e}")
    except Exception as e:  # noqa: BLE001 — network errors → 502
        logger.exception("x402 RPC error")
        raise HTTPException(502, f"x402 RPC error: {e}")

    if not verified:
        raise HTTPException(400, "x402 verification returned negative")

    # Refuse stub-fallback when env requires real verification.
    if mode == "stub-fallback" and cfg is not None and cfg.verify_required:
        raise HTTPException(
            503,
            "stub-fallback unavailable when KS_X402_VERIFY_REQUIRED=1; "
            "fix KS_X402_BASE_RPC_URL / KS_X402_RECEIVER_ADDRESS",
        )

    # Record claim — UNIQUE on payment_proof catches duplicates.
    try:
        await loop.run_in_executor(
            None, x402_verify.record_claim,
            proof, sess["user_id"], body.amount_usd, mode,
        )
    except x402_verify.DuplicateClaim:
        raise HTTPException(409, "payment_proof already claimed")

    new_balance = await loop.run_in_executor(
        None, usage.topup, sess["user_id"], body.amount_usd,
    )
    return {
        "ok":            True,
        "new_balance":   new_balance,
        "payment_proof": proof,
        "verified_mode": mode,
    }


# ─── Solana on-chain topup ──────────────────────────────────────────────────
#
# Real payment path. The user's connected Solana wallet sends SOL or USDC
# to PAYMENT_ADDRESS_SOLANA. The frontend then POSTs the tx signature here
# and we verify on-chain via Helius (or any Solana RPC) + Pyth before
# crediting. Idempotent: each tx_signature can only credit once.

from . import billing_solana as bsol  # noqa: E402


class SolQuoteBody(BaseModel):
    amount_usd: float


@app.get("/billing/sol-quote")
async def billing_sol_quote(
    amount_usd: float,
    request: Request,
):
    """How many lamports for `amount_usd`, at the current SOL/USD oracle
    price. Frontend uses this just before prompting the wallet to sign
    a transfer.

    If a Bearer token is supplied (optional), the response includes a
    fresh `memo` string. The frontend should add a Memo Program
    instruction to the same transaction with that exact memo. The
    /billing/topup-solana handler then verifies the on-chain memo
    matches what was issued, binding the on-chain transfer to a
    specific KeyShield session — anti-replay across users.
    """
    if amount_usd <= 0 or amount_usd > MAX_TOPUP_USD:
        raise HTTPException(
            400, f"amount_usd must be between 0 and {MAX_TOPUP_USD:g}",
        )
    try:
        price = await bsol.fetch_sol_usd_price()
    except bsol.PaymentVerificationError as e:
        raise HTTPException(502, f"price oracle failure: {e}")
    if price.price_usd <= 0:
        raise HTTPException(502, "price oracle returned non-positive price")
    sol_amount = amount_usd / price.price_usd
    lamports = int(sol_amount * 1_000_000_000)

    # Try to derive a memo if the caller is authenticated. We don't
    # use Depends(_session) so unauthenticated quote requests still
    # work for landing-page UX.
    memo: str | None = None
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        sess = session.get(auth[7:])
        if sess:
            memo = bsol.issue_topup_memo(sess["user_id"])

    body = {
        "amount_usd":      amount_usd,
        "amount_sol":      round(sol_amount, 9),
        "amount_lamports": lamports,
        "sol_usd_price":   price.price_usd,
        "price_publish_time": price.publish_time,
        "valid_for_secs":  60,
        "payment_address": PAYMENT_ADDRESS_SOLANA,
    }
    if memo is not None:
        body["memo"] = memo
    return body


class TopupSolanaBody(BaseModel):
    tx_signature: str
    expected_amount_usd: float | None = None
    # Optional: server-issued memo (from /billing/sol-quote). When
    # provided, the on-chain tx MUST include a Memo Program ix with
    # this exact text, AND the memo must have been issued for the
    # current user. Anti-replay across users.
    memo: str | None = None
    # Optional: when True, look up the tx at finalized commitment
    # (32 conf, ~13s+) instead of the default 'confirmed'. Use for
    # high-value topups; ignored for ≤$10 since reorg risk is
    # negligible at small amounts.
    finalized: bool = False


@app.post("/billing/topup-solana")
async def billing_topup_solana(
    body: TopupSolanaBody,
    sess: dict = Depends(_session),
):
    """Verify a Solana SOL transfer to PAYMENT_ADDRESS_SOLANA, credit
    the session user. Idempotent on tx_signature."""
    user_id = sess["user_id"]

    # Optional memo binding (anti-replay across users): verify the
    # supplied memo was issued for THIS user, BEFORE we go fetch the
    # tx. Don't consume yet — keep it usable for retry until the
    # credit lands.
    if body.memo is not None:
        try:
            bsol.verify_topup_memo(body.memo, user_id)
        except bsol.PaymentVerificationError as e:
            raise HTTPException(400, str(e))

    commitment = "finalized" if body.finalized else "confirmed"
    try:
        tx = await bsol.get_transaction(
            SOLANA_RPC_URL, body.tx_signature, commitment=commitment,
        )
    except bsol.PaymentVerificationError as e:
        raise HTTPException(502, f"could not fetch transaction: {e}")
    if tx is None:
        raise HTTPException(
            404,
            f"transaction not found or not yet {commitment}",
        )

    try:
        lamports = bsol.find_sol_transfer(
            tx, expected_sender=user_id,
            expected_recipient=PAYMENT_ADDRESS_SOLANA,
        )
    except bsol.PaymentVerificationError as e:
        raise HTTPException(400, str(e))

    # If a memo was supplied, the on-chain tx must contain it.
    if body.memo is not None:
        on_chain_memo = bsol.find_memo(tx)
        if on_chain_memo != body.memo:
            raise HTTPException(
                400,
                f"on-chain memo {on_chain_memo!r} does not match "
                f"supplied memo",
            )

    try:
        price = await bsol.fetch_sol_usd_price()
    except bsol.PaymentVerificationError as e:
        raise HTTPException(502, f"price oracle failure: {e}")
    if price.price_usd <= 0:
        raise HTTPException(502, "price oracle returned non-positive price")

    sol_amount = lamports / 1_000_000_000
    amount_usd = sol_amount * price.price_usd

    if body.expected_amount_usd is not None:
        # Caller pre-quoted a USD amount; reject if observed value is
        # off by more than slippage.
        delta = abs(amount_usd - body.expected_amount_usd)
        if delta / max(body.expected_amount_usd, 1e-9) > SOL_PRICE_SLIPPAGE:
            raise HTTPException(
                400,
                f"price slippage too large: paid ${amount_usd:.4f}, "
                f"expected ${body.expected_amount_usd:.4f}",
            )

    loop = asyncio.get_event_loop()
    try:
        new_balance = await loop.run_in_executor(
            None, usage.credit_solana_topup,
            user_id, body.tx_signature, "SOL",
            lamports, amount_usd,
        )
    except usage.TopupAlreadyCredited:
        raise HTTPException(409, "this transaction was already credited")

    # Credit succeeded — consume the memo so it can't be reused.
    if body.memo is not None:
        bsol.consume_topup_memo(body.memo)

    return {
        "credited_atoms": lamports,
        "credited_unit":  "lamports",
        "credited_usd":   round(amount_usd, 6),
        "balance_usd":    new_balance,
        "tx_signature":   body.tx_signature,
        "sol_usd_price":  price.price_usd,
        "commitment":     commitment,
    }


class TopupUsdcBody(BaseModel):
    tx_signature: str
    network: str = "mainnet"  # 'mainnet' or 'devnet'
    memo: str | None = None
    finalized: bool = False


@app.post("/billing/topup-solana-usdc")
async def billing_topup_solana_usdc(
    body: TopupUsdcBody,
    sess: dict = Depends(_session),
):
    """Verify a Solana USDC SPL transfer (1 USDC = $1) and credit.
    Idempotent on tx_signature. Same memo + finalized semantics as
    /billing/topup-solana."""
    user_id = sess["user_id"]
    mint = (
        bsol.USDC_MINT_DEVNET if body.network == "devnet"
        else bsol.USDC_MINT_MAINNET
    )

    if body.memo is not None:
        try:
            bsol.verify_topup_memo(body.memo, user_id)
        except bsol.PaymentVerificationError as e:
            raise HTTPException(400, str(e))

    commitment = "finalized" if body.finalized else "confirmed"
    try:
        tx = await bsol.get_transaction(
            SOLANA_RPC_URL, body.tx_signature, commitment=commitment,
        )
    except bsol.PaymentVerificationError as e:
        raise HTTPException(502, f"could not fetch transaction: {e}")
    if tx is None:
        raise HTTPException(
            404, f"transaction not found or not yet {commitment}",
        )

    try:
        atoms = bsol.find_usdc_transfer(
            tx,
            expected_sender_authority=user_id,
            expected_recipient_owner=PAYMENT_ADDRESS_SOLANA,
            usdc_mint=mint,
        )
    except bsol.PaymentVerificationError as e:
        raise HTTPException(400, str(e))

    if body.memo is not None:
        on_chain_memo = bsol.find_memo(tx)
        if on_chain_memo != body.memo:
            raise HTTPException(
                400,
                f"on-chain memo {on_chain_memo!r} does not match supplied memo",
            )

    amount_usd = atoms / 1_000_000  # USDC = 6 decimals, 1 token = $1

    loop = asyncio.get_event_loop()
    try:
        new_balance = await loop.run_in_executor(
            None, usage.credit_solana_topup,
            user_id, body.tx_signature, "USDC",
            atoms, amount_usd,
        )
    except usage.TopupAlreadyCredited:
        raise HTTPException(409, "this transaction was already credited")

    if body.memo is not None:
        bsol.consume_topup_memo(body.memo)

    return {
        "credited_atoms": atoms,
        "credited_unit":  "usdc-6dp",
        "credited_usd":   round(amount_usd, 6),
        "balance_usd":    new_balance,
        "tx_signature":   body.tx_signature,
        "commitment":     commitment,
    }


@app.get("/billing/topup-history")
async def billing_topup_history(
    limit: int = 20,
    sess: dict = Depends(_session),
):
    """List the user's confirmed Solana topups."""
    loop = asyncio.get_event_loop()
    return {
        "topups": await loop.run_in_executor(
            None, usage.list_topups, sess["user_id"], min(max(limit, 1), 100),
        ),
    }


# ─── MPP — Metered Payment Protocol streams ──────────────────────────────────

class MppOpenStreamBody(BaseModel):
    agentPubkey: str
    agentName: str = ""
    upstream: str
    ratePerTokenMicroUsdc: int = 0
    ratePerCallMicroUsdc: int = 0
    settlementIntervalSecs: int = 60


class MppRecordBody(BaseModel):
    tokens: int = 0
    calls: int = 1


@app.post("/mpp/streams")
async def mpp_open_stream(body: MppOpenStreamBody, sess: dict = Depends(_session)):
    if not body.agentPubkey.strip():
        raise HTTPException(400, "agentPubkey required")
    if body.upstream.strip() not in UPSTREAMS:
        raise HTTPException(400, f"unknown upstream: {body.upstream}")
    if body.ratePerTokenMicroUsdc <= 0 and body.ratePerCallMicroUsdc <= 0:
        raise HTTPException(400, "rate must be > 0")
    if body.settlementIntervalSecs < 5 or body.settlementIntervalSecs > 3600:
        raise HTTPException(400, "settlementIntervalSecs must be 5-3600")

    loop = asyncio.get_event_loop()
    stream = await loop.run_in_executor(
        None,
        mpp.open_stream,
        sess["user_id"],
        body.agentPubkey.strip(),
        body.agentName.strip(),
        body.upstream.strip(),
        int(body.ratePerTokenMicroUsdc),
        int(body.ratePerCallMicroUsdc),
        int(body.settlementIntervalSecs),
    )
    return {"stream": stream}


@app.get("/mpp/streams")
async def mpp_list_streams(sess: dict = Depends(_session)):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, mpp.list_streams, sess["user_id"])


@app.get("/mpp/events")
async def mpp_list_events(limit: int = 50, sess: dict = Depends(_session)):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, mpp.list_events, sess["user_id"], min(max(limit, 1), 100),
    )


@app.post("/mpp/streams/{stream_id}/record")
async def mpp_record(
    stream_id: int,
    body: MppRecordBody,
    sess: dict = Depends(_session),
):
    loop = asyncio.get_event_loop()
    try:
        stream = await loop.run_in_executor(
            None,
            mpp.record_usage,
            sess["user_id"],
            int(stream_id),
            int(body.calls),
            int(body.tokens),
        )
    except mpp.StreamNotFound:
        raise HTTPException(404, "stream not found")
    except mpp.StreamClosed:
        raise HTTPException(400, "stream is closed")

    return {"stream": stream}


@app.post("/mpp/streams/{stream_id}/settle")
async def mpp_settle(stream_id: int, sess: dict = Depends(_session)):
    loop = asyncio.get_event_loop()
    try:
        stream = await loop.run_in_executor(
            None, mpp.settle_stream, sess["user_id"], int(stream_id)
        )
    except mpp.StreamNotFound:
        raise HTTPException(404, "stream not found")
    except mpp.StreamClosed:
        raise HTTPException(400, "stream is closed")

    return {"stream": stream}


@app.post("/mpp/streams/{stream_id}/close")
async def mpp_close(stream_id: int, sess: dict = Depends(_session)):
    loop = asyncio.get_event_loop()
    try:
        stream = await loop.run_in_executor(
            None, mpp.close_stream, sess["user_id"], int(stream_id)
        )
    except mpp.StreamNotFound:
        raise HTTPException(404, "stream not found")
    except mpp.StreamClosed:
        raise HTTPException(400, "stream is closed")

    return {"stream": stream}


# ─── MPP Phase 10.5: build-tx endpoints (owner-signed, frontend submits) ────
#
# `open_payment_stream` (#24) and `withdraw_agent_wallet` (#27) both
# require an OWNER signature (see programs/keyshield/src/instructions/
# open_stream.rs:85 + withdraw.rs:72). The server cannot submit them
# directly — instead it returns the byte-perfect ix payload here, the
# frontend wraps it in a Transaction the wallet adapter signs in-browser.
#
# Response shape (`BuildTxResponse`) mirrors what @solana/web3.js
# `TransactionInstruction` constructor wants — `programId` string,
# `keys` array of `{pubkey, isSigner, isWritable}`, and the base64
# `data`. Frontend code looks like:
#
#   const tx = new Transaction().add(new TransactionInstruction({
#     programId: new PublicKey(resp.programId),
#     keys: resp.keys.map(k => ({
#       pubkey: new PublicKey(k.pubkey),
#       isSigner: k.isSigner, isWritable: k.isWritable,
#     })),
#     data: Buffer.from(resp.data, "base64"),
#   }));

from . import mpp_onchain  # noqa: E402


class _AccountMetaJson(BaseModel):
    pubkey:     str
    isSigner:   bool
    isWritable: bool


class BuildTxResponse(BaseModel):
    programId: str
    keys:      list[_AccountMetaJson]
    data:      str  # base64-encoded ix payload (discriminator + body)


def _ix_to_response(ix: "mpp_onchain._SimpleInstruction") -> BuildTxResponse:
    """Serialise a _SimpleInstruction into the JSON shape the frontend
    needs. Kept tiny so unit tests can call it without HTTP."""
    import base64
    return BuildTxResponse(
        programId=ix.program_id,
        keys=[
            _AccountMetaJson(
                pubkey=a.pubkey,
                isSigner=a.is_signer,
                isWritable=a.is_writable,
            )
            for a in ix.accounts
        ],
        data=base64.b64encode(ix.data).decode("ascii"),
    )


class BuildOpenTxBody(BaseModel):
    """Body for /mpp/streams/{id}/build-open-tx.

    The frontend computes the PDA + bump itself via @solana/web3.js
    (`PublicKey.findProgramAddress(["agent_payment_stream", agent,
    owner], programId)`), creates the USDC ATA in the same tx, and
    passes everything here so the server can byte-pack the ix data."""

    ownerPubkey:                str
    streamPda:                  str   # frontend-derived
    bump:                       int   # frontend-derived bump
    usdcAta:                    str   # frontend-created ATA pubkey
    maxTotalMicroUsdc:          int   # cap for the whole stream lifetime
    costPerUnitMicroUsdc:       int = 1
    maxRateUsdPerMinBits:       int = 0   # f64::to_bits portable encoding
    settlementIntervalSecsOverride: int = 0  # 0 → use the stream's stored value


class BuildWithdrawTxBody(BaseModel):
    """Body for /mpp/streams/{id}/build-withdraw-tx.

    Owner must have already revoked the agent grant (see
    withdraw.rs:9-13). The withdraw_amount is what the caller claims
    is currently in the source ATA; SPL transfer will reject if the
    ATA balance is smaller, so a wrong value is safe — it just causes
    the ix to fail."""

    ownerPubkey:                str
    streamPda:                  str
    streamAta:                  str
    ownerAta:                   str
    withdrawAmountMicroUsdc:    int


@app.post(
    "/mpp/streams/{stream_id}/build-open-tx",
    response_model=BuildTxResponse,
)
async def mpp_build_open_tx(
    stream_id: int,
    body: BuildOpenTxBody,
    sess: dict = Depends(_session),
):
    """Build the unsigned `open_payment_stream` ix (#24) for an
    existing off-chain stream row. Returns the ix bytes for the
    frontend wallet adapter to sign in-browser.

    503 if KS_VAULT_PDA / KS_KEYSHIELD_PROGRAM_ID env aren't set
    (server can't pin which on-chain program to target).
    """
    cfg = mpp_onchain.load_mpp_config()
    if cfg is None or cfg.vault_pda is None:
        raise HTTPException(
            503,
            "MPP on-chain config incomplete — set KS_KEYSHIELD_PROGRAM_ID, "
            "KS_PLATFORM_USDC_ATA, KS_MPP_SETTLER_KEY, KS_VAULT_PDA on the server",
        )

    loop = asyncio.get_event_loop()

    def _lookup_and_build():
        # Verify the off-chain stream row exists + belongs to this user.
        # _get_owned_stream raises StreamNotFound otherwise (caught below).
        conn = mpp._db()
        try:
            row = mpp._get_owned_stream(conn, sess["user_id"], stream_id)
        finally:
            conn.close()

        interval = (
            int(body.settlementIntervalSecsOverride)
            if body.settlementIntervalSecsOverride > 0
            else int(row["settlement_interval_secs"])
        )
        return mpp_onchain.build_open_payment_stream_ix(
            config=cfg,
            owner_pubkey=body.ownerPubkey.strip(),
            agent_pubkey=row["agent_pubkey"],
            stream_pda=body.streamPda.strip(),
            usdc_ata=body.usdcAta.strip(),
            bump=int(body.bump),
            max_total_micro_usdc=int(body.maxTotalMicroUsdc),
            cost_per_unit_micro_usdc=int(body.costPerUnitMicroUsdc),
            max_rate_usd_per_min_bits=int(body.maxRateUsdPerMinBits),
            settlement_interval_secs=interval,
        )

    try:
        ix = await loop.run_in_executor(None, _lookup_and_build)
    except mpp.StreamNotFound:
        raise HTTPException(404, "stream not found")
    except ValueError as e:
        raise HTTPException(400, str(e))

    return _ix_to_response(ix)


@app.post(
    "/mpp/streams/{stream_id}/build-withdraw-tx",
    response_model=BuildTxResponse,
)
async def mpp_build_withdraw_tx(
    stream_id: int,
    body: BuildWithdrawTxBody,
    sess: dict = Depends(_session),
):
    """Build the unsigned `withdraw_agent_wallet` ix (#27) for an
    existing off-chain stream row. Frontend wraps + signs in-browser.

    503 if MPP env config incomplete (see build-open-tx)."""
    cfg = mpp_onchain.load_mpp_config()
    if cfg is None or cfg.vault_pda is None:
        raise HTTPException(
            503,
            "MPP on-chain config incomplete — set KS_KEYSHIELD_PROGRAM_ID, "
            "KS_PLATFORM_USDC_ATA, KS_MPP_SETTLER_KEY, KS_VAULT_PDA on the server",
        )

    loop = asyncio.get_event_loop()

    def _lookup_and_build():
        conn = mpp._db()
        try:
            mpp._get_owned_stream(conn, sess["user_id"], stream_id)
        finally:
            conn.close()
        return mpp_onchain.build_withdraw_agent_wallet_ix(
            config=cfg,
            owner_pubkey=body.ownerPubkey.strip(),
            stream_pda=body.streamPda.strip(),
            stream_ata=body.streamAta.strip(),
            owner_ata=body.ownerAta.strip(),
            withdraw_amount_micro_usdc=int(body.withdrawAmountMicroUsdc),
        )

    try:
        ix = await loop.run_in_executor(None, _lookup_and_build)
    except mpp.StreamNotFound:
        raise HTTPException(404, "stream not found")
    except ValueError as e:
        raise HTTPException(400, str(e))

    return _ix_to_response(ix)


# ─── MPP Phase 10.5: record-tx (post-sign callback) ─────────────────────────
#
# After the frontend wallet adapter signs+sends the `open_payment_stream`
# (or `withdraw_agent_wallet`) ix returned by /build-*-tx, the wallet
# returns a base58 tx signature. The frontend POSTs it here so the row
# can flip from "Open on-chain stream" CTA to a green explorer link.
#
# We don't re-verify the signature on Solana RPC — the frontend already
# awaited `confirmTransaction(..., 'confirmed')` before calling this
# endpoint. Same trust model as `/billing/topup-solana` BEFORE its
# verify step (which exists because top-ups debit USD; here the
# signature is purely informational + UI-state).


class MppRecordTxBody(BaseModel):
    tx_signature: str  # base58 Solana tx signature, opaque to the server


@app.post("/mpp/streams/{stream_id}/record-tx")
async def mpp_record_tx(
    stream_id: int,
    body: MppRecordTxBody,
    sess: dict = Depends(_session),
):
    """Persist the on-chain tx signature returned by the frontend wallet
    adapter. Idempotent: re-posting the same signature is a no-op.

    Returns the updated stream row so the UI can re-render in one round
    trip without a follow-up `GET /mpp/streams`.
    """
    sig = (body.tx_signature or "").strip()
    if not sig:
        raise HTTPException(400, "tx_signature is required")
    # Bound the signature length so we don't accept arbitrary blobs —
    # base58-encoded ed25519 sigs are ~88 chars, leave headroom.
    if len(sig) > 128:
        raise HTTPException(400, "tx_signature too long")

    loop = asyncio.get_event_loop()
    try:
        stream = await loop.run_in_executor(
            None, mpp.record_tx_signature,
            sess["user_id"], stream_id, sig,
        )
    except mpp.StreamNotFound:
        raise HTTPException(404, "stream not found")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"stream": stream}


# ─── internal bridge (Rust hot path → Python control plane) ──────────────────
#
# These endpoints exist for the Rust `ks-proxy` sidecar's per-call balance
# read and buffered usage-log ingest. Per BOUNDARY.md, Rust binds :8000
# and falls through here for everything except `/proxy/*`, `/manage/batch`,
# `/health`. See `proxy-rs/specs/07-bridge.md`.

@app.get("/_internal/balance/{user_id}")
async def _internal_balance(user_id: str):
    """Return the user's prepaid credit balance — used by Rust's 402 gate."""
    loop = asyncio.get_event_loop()
    balance = await loop.run_in_executor(None, usage.get_balance, user_id)
    return {"balance_usd": balance}


@app.post("/_internal/log")
async def _internal_log(payload: dict):
    """Ingest a buffered batch of usage entries from the Rust hot path."""
    entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise HTTPException(400, "entries must be a list")

    loop = asyncio.get_event_loop()

    def _flush_batch() -> None:
        for e in entries:
            try:
                usage.log_call(
                    e.get("user_id", ""),
                    e.get("upstream", ""),
                    e.get("key_type", ""),
                    e.get("method", ""),
                    e.get("path", ""),
                    int(e.get("tok_in", 0) or 0),
                    int(e.get("tok_out", 0) or 0),
                    float(e.get("cost", 0.0) or 0.0),
                    float(e.get("latency_ms", 0.0) or 0.0),
                    int(e.get("status", 0) or 0),
                )
            except Exception:
                # Logging is non-critical — drop the entry, keep the batch.
                pass

    await loop.run_in_executor(None, _flush_batch)
    return {"ok": True, "ingested": len(entries)}


# ─── health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "2.0",
        "generic_cache": len(_CACHE),
        "router": api_router.cache_stats(),
    }


# ── Prometheus metrics ────────────────────────────────────────────────────────
_METRICS_TOKEN = os.getenv("KS_METRICS_TOKEN", "")

@app.get("/metrics")
async def prometheus_metrics(request: Request):
    """Expose Prometheus metrics. Guard with KS_METRICS_TOKEN if set."""
    if _METRICS_TOKEN:
        auth = request.headers.get("Authorization", "")
        if auth != f"Bearer {_METRICS_TOKEN}":
            raise HTTPException(401, "metrics endpoint requires Bearer token")
    body, content_type = ks_metrics.metrics_response()
    return PlainTextResponse(content=body, media_type=content_type)



# ─── Ephemeral Signer (Agent Embedded Wallet) build-tx ─────────────────────
#
# Wraps ix #23 CreateEphemeralSigner — the differentiator vs Coinbase
# Agentic. Owner-signed (frontend wallet adapter); server only assembles
# the ix payload. Top-up + balance read are follow-ups.
#
# See v2-mvp/src/agent_wallet.py for the byte-layout contract.

from . import agent_wallet  # noqa: E402


class BuildEphemeralSignerTxBody(BaseModel):
    """Frontend computes the ephemeral signer PDA itself (so it can
    show the address before sign), passes it back. Allowed actions
    default to PAY_AND_PROXY (0x05) — agent can pay + run proxy calls
    but cannot decrypt raw vault keys."""

    ownerPubkey:        str
    agentPubkey:        str
    ephemeralSignerPda: str
    allowedActions:     int = 0x05  # PAY_X402 | PROXY_CALL
    expirySeconds:      int = 0     # 0 = no expiry


@app.post(
    "/agents/{agent_id}/wallet/create-tx",
    response_model=BuildTxResponse,
)
async def agents_build_ephemeral_signer_tx(
    agent_id: str,
    body: BuildEphemeralSignerTxBody,
    sess: dict = Depends(_session),
):
    """Build unsigned `create_ephemeral_signer` ix (#23) for an
    existing agent grant. Frontend wallet adapter signs in-browser.

    503 if KS_VAULT_PDA / KS_KEYSHIELD_PROGRAM_ID env aren't set.
    404 if the agent isn't registered to this user.
    """
    cfg = mpp_onchain.load_mpp_config()
    if cfg is None or cfg.vault_pda is None:
        raise HTTPException(
            503,
            "Ephemeral signer config incomplete — set KS_KEYSHIELD_PROGRAM_ID, "
            "KS_PLATFORM_USDC_ATA, KS_MPP_SETTLER_KEY, KS_VAULT_PDA",
        )

    user_agents = agents.list_for_user(sess["user_id"])
    if not any(a.get("id") == agent_id for a in user_agents):
        raise HTTPException(404, "agent not found")

    try:
        ix = agent_wallet.build_create_ephemeral_signer_ix(
            config=cfg,
            owner_pubkey=body.ownerPubkey.strip(),
            agent_pubkey=body.agentPubkey.strip(),
            ephemeral_signer_pda=body.ephemeralSignerPda.strip(),
            allowed_actions=int(body.allowedActions),
            expiry_seconds=int(body.expirySeconds),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    return _ix_to_response(ix)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.server:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
