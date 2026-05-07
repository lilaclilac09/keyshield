"""
Helius router — Oliver's method.

Three moves, nothing else:
  1. One persistent HTTP/2 client per endpoint  (connection reuse, no handshake per call)
  2. asyncio.gather for every batch             (parallel upstream calls, not serial)
  3. TTL dict cache per method                  (hot reads never hit the network twice)

Helius has three base URLs; each method routes to the right one automatically.
"""

import asyncio
import hashlib
import json
import os
import time
from typing import Any

import httpx

HELIUS_KEY = os.getenv("HELIUS_API_KEY", "")

# ─── Three Helius endpoints, one persistent client each ──────────────────────
_CLIENTS = {
    "rpc":      httpx.AsyncClient(base_url="https://mainnet.helius-rpc.com",  http2=True, timeout=30,
                    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20)),
    "enhanced": httpx.AsyncClient(base_url="https://api.helius.xyz",          http2=True, timeout=30,
                    limits=httpx.Limits(max_connections=50,  max_keepalive_connections=10)),
    "das":      httpx.AsyncClient(base_url="https://mainnet.helius-rpc.com",  http2=True, timeout=30,
                    limits=httpx.Limits(max_connections=50,  max_keepalive_connections=10)),
}

# ─── Method → endpoint ────────────────────────────────────────────────────────
_DAS = {
    "getAsset", "getAssetBatch", "getAssetProof", "getAssetProofBatch",
    "getAssetsByOwner", "getAssetsByGroup", "getAssetsByCreator",
    "getAssetsByAuthority", "searchAssets", "getTokenAccounts", "getNftEditions",
}
_ENHANCED = {"getTransactions", "getTokenBalances"}
_WRITES   = {"sendTransaction", "sendRawTransaction", "simulateTransaction"}

def _endpoint(method: str) -> str:
    if method in _DAS:      return "das"
    if method in _ENHANCED: return "enhanced"
    return "rpc"

# ─── TTL cache ────────────────────────────────────────────────────────────────
_TTL: dict[str, float] = {
    "getBalance": 5, "getAccountInfo": 5, "getTokenAccountBalance": 5,
    "getAsset": 300, "getAssetBatch": 300,
    "getAssetsByOwner": 30, "getAssetsByGroup": 60, "searchAssets": 30,
    "getSignaturesForAddress": 30, "getTransactions": 30,
    "getTransaction": 60, "getTokenBalances": 10,
    "getSlot": 2, "getBlockTime": 600, "getEpochInfo": 10,
}
_CACHE: dict[str, tuple[Any, float]] = {}  # key → (data, expires_at)

def _ck(method: str, params: Any) -> str:
    return hashlib.sha1(json.dumps({"m": method, "p": params}, sort_keys=True).encode()).hexdigest()

def _cache_get(method: str, params: Any) -> Any | None:
    ttl = _TTL.get(method, 0)
    if not ttl:
        return None
    entry = _CACHE.get(_ck(method, params))
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    return None

def _cache_set(method: str, params: Any, data: Any) -> None:
    ttl = _TTL.get(method, 0)
    if ttl:
        _CACHE[_ck(method, params)] = (data, time.monotonic() + ttl)

# ─── Single call ──────────────────────────────────────────────────────────────
async def _call(method: str, params: Any, api_key: str, rpc_id: Any = 1) -> tuple[Any, str]:
    """One RPC call. Returns (result_dict, cache_status)."""
    cached = _cache_get(method, params)
    if cached is not None:
        return cached, "HIT"

    ep = _endpoint(method)
    client = _CLIENTS[ep]
    url = f"/?api-key={api_key}" if ep in ("rpc", "das") else f"/v0/transactions?api-key={api_key}"

    resp = await client.post(url, json={"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params})
    result = resp.json()

    if "result" in result and method not in _WRITES:
        _cache_set(method, params, result)

    return result, "MISS"

# ─── Public: single route ─────────────────────────────────────────────────────
async def route(method: str, params: Any, api_key: str, rpc_id: Any = 1) -> tuple[Any, str]:
    return await _call(method, params, api_key, rpc_id)

# ─── Public: batch — Oliver's Promise.all ─────────────────────────────────────
async def batch(requests: list[dict], api_key: str) -> list[dict]:
    """
    Fire all requests in parallel (asyncio.gather), return in order.
    Each item: {"method": str, "params": list, "id": any}
    """
    async def one(req: dict) -> dict:
        result, cache_status = await _call(
            req["method"], req.get("params", []), api_key, req.get("id", 1)
        )
        return {**result, "x-ks-cache": cache_status}

    return list(await asyncio.gather(*[one(r) for r in requests]))

# ─── Stats ────────────────────────────────────────────────────────────────────
def cache_stats() -> dict:
    now = time.monotonic()
    alive = sum(1 for _, exp in _CACHE.values() if now < exp)
    return {"entries": alive, "total": len(_CACHE)}
