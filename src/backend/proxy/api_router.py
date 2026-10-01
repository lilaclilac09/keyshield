"""
Universal API router — Oliver's method applied to every provider.

One persistent client per provider. asyncio.gather for parallel calls.
TTL cache for idempotent endpoints. Writes always bypass everything.

Supports: Helius RPC, Helius DAS, Helius Enhanced, OpenAI, Anthropic
"""

import asyncio
import hashlib
import json
import os
import time
from typing import Any

import httpx

from .x402_interceptor import PaymentInterceptor, with_x402_retry

# ─── Provider config ──────────────────────────────────────────────────────────

PROVIDERS: dict[str, dict] = {
    # Helius: three surfaces, one provider entry each
    "helius-rpc": {
        "base": "https://mainnet.helius-rpc.com",
        "auth": "query",  # api-key goes in query string
        "auth_param": "api-key",
        "inject_content_type": False,
    },
    # DAS methods are JSON-RPC on the same host as getBalance. A separate
    # /das origin was an extra DNS + TLS pool and Helius does not serve it.
    "helius-das": {
        "base": "https://mainnet.helius-rpc.com",
        "auth": "query",
        "auth_param": "api-key",
        "inject_content_type": False,
    },
    # Enhanced history and balances are REST on api.helius.xyz, not JSON-RPC.
    "helius-enhanced": {
        "base": "https://api.helius.xyz",
        "auth": "query",
        "auth_param": "api-key",
        "inject_content_type": False,
    },
    "openai": {
        "base": "https://api.openai.com",
        "auth": "bearer",
    },
    "anthropic": {
        "base": "https://api.anthropic.com",
        "auth": "header",
        "auth_header": "x-api-key",
        "extra_headers": {"anthropic-version": "2023-06-01"},
    },
    "cohere": {
        "base": "https://api.cohere.ai",
        "auth": "bearer",
    },
    "groq": {
        "base": "https://api.groq.com",
        "auth": "bearer",
    },
    "mistral": {
        "base": "https://api.mistral.ai",
        "auth": "bearer",
    },
    # ADR-001 #4: Alchemy was registered in server.py provider_map but
    # missing here, so /proxy/alchemy/* always 500'd. Bearer auth.
    "alchemy": {
        "base": "https://eth-mainnet.g.alchemy.com",
        "auth": "bearer",
    },
    # Spec 04. These were on the Rust proxy and missing here, so
    # /proxy/0x, /proxy/titan, and /proxy/pyth returned "unknown provider".
    "0x": {
        "base": "https://api.0x.org",
        "auth": "header",
        "auth_header": "0x-api-key",
        "inject_content_type": False,
    },
    "titan": {
        "base": "https://rpc.titanbuilder.xyz",
        "auth": "bearer",
        "auth_optional": True,
        "inject_content_type": False,
    },
    "pyth": {
        "base": "https://hermes.pyth.network",
        "auth": "query",
        "auth_param": "api_key",
        "auth_optional": True,
        "inject_content_type": False,
    },
}

# Test-only knob used by `proxy-rs/tests/oracle_diff/`. When set,
# every provider's `base` is rewritten to point at the override URL,
# so a single mock-upstream stand-in can intercept all egress.
# Production behavior is unchanged when unset.
_UPSTREAM_OVERRIDE_BASE = os.getenv("KS_UPSTREAM_OVERRIDE_BASE", "").strip()
if _UPSTREAM_OVERRIDE_BASE:
    for _p in PROVIDERS.values():
        _p["base"] = _UPSTREAM_OVERRIDE_BASE

# ─── One persistent HTTP/2 client per provider (Oliver move #1) ───────────────
_CLIENTS: dict[str, httpx.AsyncClient] = {
    name: httpx.AsyncClient(
        base_url=cfg["base"],
        http2=True,
        timeout=30,
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    )
    for name, cfg in PROVIDERS.items()
}

# ─── Cache rules: (method_or_path_prefix, ttl_seconds) ────────────────────────
# Helius RPC method names
_HELIUS_TTL: dict[str, float] = {
    "getBalance": 5,
    "getAccountInfo": 5,
    "getMultipleAccounts": 5,
    "getTokenAccountBalance": 5,
    "getTokenAccountsByOwner": 10,
    "getTokenAccounts": 10,
    "getAsset": 300,
    "getAssetBatch": 300,
    "getAssetsByOwner": 30,
    "getAssetsByGroup": 60,
    "searchAssets": 30,
    "getSignaturesForAddress": 30,
    "getTransactions": 30,
    "getTransaction": 60,
    "getTokenBalances": 10,
    "getSlot": 2,
    "getBlockTime": 600,
    "getEpochInfo": 10,
    "getRecentBlockhash": 2,
    "getLatestBlockhash": 2,
    "getPriorityFeeEstimate": 5,
    "getRecentPrioritizationFees": 5,
}

# Never cache these Helius methods (writes / simulatation)
_HELIUS_WRITES = {"sendTransaction", "sendRawTransaction", "simulateTransaction"}

# OpenAI: cache GET /v1/models and /v1/embeddings (deterministic)
_OPENAI_TTL: dict[str, float] = {
    "GET /v1/models": 3600,
    "GET /v1/models/": 3600,
    "POST /v1/embeddings": 86400,  # same text = same vector
}

# Anthropic: cache GET /v1/models
_ANTHROPIC_TTL: dict[str, float] = {
    "GET /v1/models": 3600,
}

# ─── Cache store ──────────────────────────────────────────────────────────────
_CACHE: dict[str, tuple[Any, float]] = {}


def _ck(provider: str, key: str, payload: Any) -> str:
    raw = f"{provider}:{key}:{json.dumps(payload, sort_keys=True)}"
    return hashlib.blake2b(raw.encode(), digest_size=32).hexdigest()


def _cache_get(ck: str) -> Any | None:
    entry = _CACHE.get(ck)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    if entry:
        del _CACHE[ck]
    return None


def _cache_set(ck: str, data: Any, ttl: float) -> None:
    if ttl > 0:
        _CACHE[ck] = (data, time.monotonic() + ttl)


def _rpc_cacheable(result: Any) -> bool:
    """Cache a JSON-RPC body only when it has a real result.

    `{"result": null}` is what Helius returns before a payment transaction
    is visible. Caching that makes the wallet look unpaid for the whole TTL.
    """
    return isinstance(result, dict) and "result" in result and result.get("result") is not None


# ─── Auth header builder ──────────────────────────────────────────────────────
def _build_url_and_headers(provider_name: str, path: str, api_key: str) -> tuple[str, dict]:
    cfg = PROVIDERS[provider_name]
    headers: dict[str, str] = dict(cfg.get("extra_headers", {}))

    optional = bool(cfg.get("auth_optional")) and not api_key
    if cfg["auth"] == "query":
        url = path
        if not optional:
            sep = "&" if "?" in path else "?"
            url = f"{path}{sep}{cfg['auth_param']}={api_key}"
    elif cfg["auth"] == "bearer":
        url = path
        if not optional:
            headers["authorization"] = f"Bearer {api_key}"
    elif cfg["auth"] == "header":
        url = path
        if not optional:
            headers[cfg["auth_header"]] = api_key
    else:
        url = path

    return url, headers


# ─── Route Helius JSON-RPC ────────────────────────────────────────────────────
# JSON-RPC, including DAS (getAsset and friends), all go to one host.
# History and balances are REST and are handled in `_call_enhanced`.
_ENHANCED_REST = {"getTransactions", "getTokenBalances"}


def _helius_provider(method: str) -> str:
    return "helius-rpc"


def _enhanced_request(method: str, params: Any) -> tuple[str, str, dict | None]:
    """Map the old JSON-RPC names onto the REST routes Helius actually serves."""
    args = params if isinstance(params, list) else []
    head = args[0] if args else ""
    if method == "getTokenBalances":
        return "GET", f"/v0/addresses/{head}/balances", None
    opts = args[1] if len(args) > 1 and isinstance(args[1], dict) else None
    if method == "getTransactions" and opts is not None:
        limit = int(opts.get("limit") or 100)
        return "GET", f"/v0/addresses/{head}/transactions?limit={limit}", None
    # A bare signature is the parse-transactions endpoint.
    return "POST", "/v0/transactions", {"transactions": [head]}


async def _call_enhanced(
    method: str,
    params: Any,
    api_key: str,
    rpc_id: Any,
) -> tuple[Any, int]:
    http_method, path, payload = _enhanced_request(method, params)
    sep = "&" if "?" in path else "?"
    url = f"{path}{sep}api-key={api_key}" if api_key else path
    client = _CLIENTS["helius-enhanced"]
    if http_method == "GET":
        resp = await client.get(url)
    else:
        resp = await client.post(url, json=payload)
    try:
        parsed = json.loads(resp.content)
    except Exception:
        parsed = {"raw": resp.content.decode(errors="replace")}
    if resp.status_code == 200:
        return {"jsonrpc": "2.0", "id": rpc_id, "result": parsed}, resp.status_code
    if isinstance(parsed, dict):
        return parsed, resp.status_code
    return {"error": parsed}, resp.status_code


async def call_helius(
    method: str,
    params: Any,
    api_key: str,
    rpc_id: Any = 1,
    *,
    interceptor: PaymentInterceptor | None = None,
) -> tuple[Any, str, int]:
    if method in _ENHANCED_REST:
        ttl = _HELIUS_TTL.get(method, 0)
        ck = _ck("helius", method, params)
        cached = _cache_get(ck) if ttl else None
        if cached is not None:
            return cached, "HIT", 200
        result, status = await _call_enhanced(method, params, api_key, rpc_id)
        if ttl and status == 200 and _rpc_cacheable(result):
            _cache_set(ck, result, ttl)
        return result, "MISS", status

    provider = _helius_provider(method)
    body = {"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params}
    url, headers = _build_url_and_headers(provider, "/", api_key)

    async def _fire(extra_headers: dict[str, str]) -> tuple[int, bytes, dict]:
        resp = await _CLIENTS[provider].post(url, json=body, headers={**headers, **extra_headers})
        return resp.status_code, resp.content, dict(resp.headers)

    if method in _HELIUS_WRITES:
        status, content, _ = await with_x402_retry(_fire, interceptor=interceptor)
        return json.loads(content), "MISS", status

    ttl = _HELIUS_TTL.get(method, 0)
    ck = _ck("helius", method, params)
    cached = _cache_get(ck) if ttl else None
    if cached is not None:
        return cached, "HIT", 200

    status, content, _ = await with_x402_retry(_fire, interceptor=interceptor)
    result = json.loads(content)
    if ttl and _rpc_cacheable(result):
        _cache_set(ck, result, ttl)
    return result, "MISS", status


# ─── Route generic REST (OpenAI, Anthropic, etc.) ────────────────────────────
async def call_rest(
    provider_name: str,
    method: str,
    path: str,
    body: bytes,
    api_key: str,
    extra_headers: dict | None = None,
    *,
    interceptor: PaymentInterceptor | None = None,
) -> tuple[bytes, int, str]:
    if provider_name not in PROVIDERS:
        raise ValueError(f"unknown provider: {provider_name}")

    ttl_map = (
        _OPENAI_TTL
        if provider_name == "openai"
        else _ANTHROPIC_TTL
        if provider_name == "anthropic"
        else {}
    )
    route_key = f"{method} {path}"
    ttl = next((v for k, v in ttl_map.items() if route_key.startswith(k)), 0)

    ck = _ck(provider_name, route_key, body.decode(errors="replace")) if ttl else ""
    if ttl and ck:
        cached = _cache_get(ck)
        if cached is not None:
            return cached, 200, "HIT"

    url, headers = _build_url_and_headers(provider_name, path, api_key)
    if extra_headers:
        headers.update(extra_headers)
    # Spec 04: AI providers re-inject JSON content-type. 0x, Titan, Pyth,
    # and the Helius REST fallback forward the caller content-type instead.
    if PROVIDERS[provider_name].get("inject_content_type", True):
        headers["content-type"] = "application/json"

    async def _fire(extra: dict[str, str]) -> tuple[int, bytes, dict]:
        resp = await _CLIENTS[provider_name].request(
            method=method, url=url, headers={**headers, **extra}, content=body
        )
        return resp.status_code, resp.content, dict(resp.headers)

    status, content, _ = await with_x402_retry(_fire, interceptor=interceptor)
    if ttl and ck and status == 200:
        _cache_set(ck, content, ttl)
    return content, status, "MISS"


# ─── Oliver move #2: parallel batch ──────────────────────────────────────────
async def batch_helius(requests: list[dict], api_key: str) -> list[dict]:
    """Fire all Helius RPC calls in parallel, return in order."""

    async def one(req: dict) -> dict:
        result, cache_status, _status = await call_helius(
            req["method"], req.get("params", []), api_key, req.get("id", 1)
        )
        return {**result, "x-ks-cache": cache_status}

    return list(await asyncio.gather(*[one(r) for r in requests]))


async def batch_rest(
    provider_name: str,
    requests: list[dict],  # [{method, path, body}]
    api_key: str,
) -> list[dict]:
    """Fire all REST calls to a provider in parallel."""

    async def one(req: dict) -> dict:
        content, status, cache_status = await call_rest(
            provider_name,
            req.get("method", "POST"),
            req["path"],
            json.dumps(req.get("body", {})).encode(),
            api_key,
        )
        try:
            data = json.loads(content)
        except Exception:
            data = {"raw": content.decode(errors="replace")}
        return {"status": status, "data": data, "x-ks-cache": cache_status}

    return list(await asyncio.gather(*[one(r) for r in requests]))


# ─── Stats ────────────────────────────────────────────────────────────────────
def cache_stats() -> dict:
    now = time.monotonic()
    alive = [(k, exp) for k, (_, exp) in _CACHE.items() if now < exp]
    return {"alive": len(alive), "total": len(_CACHE)}
