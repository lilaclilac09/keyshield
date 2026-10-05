"""API keychain: detect provider shapes, RPC cache catalog, cheap probes.

The key never goes into logs. Detect returns a prefix only. Call uses a
vault/env key already stored for the session user.
"""

from __future__ import annotations

import os
import re
from typing import Any

import httpx

from . import api_router
from .openrouter_interface import DEMO_CHAT_PATH, DEMO_MODEL, chat_body_bytes

# Specific prefixes first — generic `sk-` must be last so it cannot steal
# OpenRouter (`sk-or-`) or Anthropic (`sk-ant-`) keys.
_DETECTORS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("openrouter", re.compile(r"sk-or-[A-Za-z0-9_-]{12,}")),
    ("anthropic", re.compile(r"sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}")),
    ("groq", re.compile(r"gsk_[A-Za-z0-9]{32,}")),
    ("helius", re.compile(r"helius_auth_[A-Za-z0-9]{16,}")),
    ("openai", re.compile(r"sk-(?:proj-|svcacct-|admin-)?(?!or-|ant-)[A-Za-z0-9_-]{20,}")),
)

_PUBKEY_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
_USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"


def mask_key(raw: str) -> str:
    text = (raw or "").strip()
    if len(text) < 10:
        return "••••"
    return f"{text[:6]}…{text[-4:]}"


def extract_key(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    for _upstream, pattern in _DETECTORS:
        found = pattern.search(text)
        if found:
            return found.group(0)
    return text


def detect_upstream(raw: str) -> dict[str, Any]:
    """Classify a pasted blob. Does not store or log the secret."""
    text = (raw or "").strip()
    if not text:
        return {"upstream": None, "matched": False, "prefix": None}
    for upstream, pattern in _DETECTORS:
        found = pattern.search(text)
        if found:
            return {
                "upstream": upstream,
                "matched": True,
                "prefix": mask_key(found.group(0)),
            }
    return {"upstream": None, "matched": False, "prefix": mask_key(text)}


def rpc_cache_catalog() -> dict[str, Any]:
    """Read-only RPC TTL table. Writes always bypass."""
    methods = [
        {"method": name, "ttl_sec": ttl, "cached": True}
        for name, ttl in sorted(api_router._HELIUS_TTL.items(), key=lambda kv: kv[0])
    ]
    return {
        "provider": "helius",
        "methods": methods,
        "writes_bypass": sorted(api_router._HELIUS_WRITES),
        "lowest_ttl_sec": min(api_router._HELIUS_TTL.values()) if api_router._HELIUS_TTL else None,
        "note": "Cache hits skip the provider RTT. Writes and quotes never cache.",
    }


def probe_for(upstream: str, prompt: str = "KeyShield keychain ping") -> tuple[str, str, bytes | None]:
    """Return (call_upstream, path, body_or_none)."""
    name = (upstream or "").strip().lower() or "openrouter"
    if name in {"helius", "helius-rpc"}:
        body = b'{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}'
        return "helius-rpc", "", body
    if name == "openai":
        return "openai", "v1/models", None
    if name == "anthropic":
        return "anthropic", "v1/models", None
    if name == "groq":
        return "groq", "openai/v1/models", None
    if name == "mistral":
        return "mistral", "v1/models", None
    path = DEMO_CHAT_PATH.lstrip("/")
    return "openrouter", path, chat_body_bytes(prompt, model=DEMO_MODEL)


def looks_like_pubkey(value: str) -> bool:
    return bool(_PUBKEY_RE.match((value or "").strip()))


def usdc_mint() -> str:
    override = os.environ.get("KS_USDC_MINT", "").strip()
    if override:
        return override
    rpc = (os.environ.get("KS_SOLANA_RPC_URL") or os.environ.get("KS_RPC_URL") or "").lower()
    if "mainnet" in rpc:
        return _USDC_MAINNET
    return _USDC_DEVNET


def public_rpc_url() -> str:
    return (
        os.environ.get("KS_SOLANA_RPC_URL", "").strip()
        or os.environ.get("KS_RPC_URL", "").strip()
        or "https://api.devnet.solana.com"
    )


def parse_sol_lamports(rpc_result: Any) -> int | None:
    if not isinstance(rpc_result, dict):
        return None
    val = rpc_result.get("result", rpc_result)
    if isinstance(val, dict) and "value" in val:
        try:
            return int(val["value"])
        except (TypeError, ValueError):
            return None
    if isinstance(val, int):
        return val
    return None


def parse_usdc_micro(rpc_result: Any) -> int | None:
    if not isinstance(rpc_result, dict):
        return None
    val = rpc_result.get("result", rpc_result)
    accounts = val.get("value") if isinstance(val, dict) else None
    if not isinstance(accounts, list) or not accounts:
        return 0
    total = 0
    found = False
    for row in accounts:
        info = (
            ((row or {}).get("account") or {}).get("data") or {}
        )
        parsed = info.get("parsed") if isinstance(info, dict) else None
        token = ((parsed or {}).get("info") or {}).get("tokenAmount") or {}
        raw = token.get("amount")
        if raw is None:
            continue
        try:
            total += int(raw)
            found = True
        except (TypeError, ValueError):
            continue
    return total if found else 0


def list_stored_upstreams(user_id: str) -> list[dict[str, str]]:
    """Names + prefixes only. Never returns the raw key."""
    from ..routes import vault as vault_mod

    out: list[dict[str, str]] = []
    with vault_mod._db() as conn:
        rows = conn.execute(
            "SELECT id, name, upstream, value FROM vault_items "
            "WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    seen: set[str] = set()
    for row in rows:
        upstream = str(row["upstream"] or row["id"] or "").strip()
        if not upstream or upstream in seen:
            continue
        seen.add(upstream)
        out.append(
            {
                "id": str(row["id"]),
                "name": str(row["name"] or upstream),
                "upstream": upstream,
                "prefix": mask_key(str(row["value"] or "")),
            }
        )
    return out


async def _jsonrpc(url: str, method: str, params: list[Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=4.0) as client:
        resp = await client.post(
            url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {}


async def fetch_wallet_balances(address: str, helius_key: str | None) -> dict[str, Any]:
    """SOL + USDC via cached Helius when a key exists, else public RPC."""
    catalog = rpc_cache_catalog()
    empty = {
        "address": address or None,
        "sol": None,
        "sol_lamports": None,
        "usdc": None,
        "usdc_micro": None,
        "cache": "skip",
        "rpc": "none",
        "lowest_ttl_sec": catalog["lowest_ttl_sec"],
        "error": None,
    }
    if not looks_like_pubkey(address):
        return empty

    mint = usdc_mint()
    token_params: list[Any] = [address, {"mint": mint}, {"encoding": "jsonParsed"}]
    try:
        if helius_key:
            bal, c1 = await api_router.call_helius("getBalance", [address], helius_key)
            tok, c2 = await api_router.call_helius(
                "getTokenAccountsByOwner", token_params, helius_key
            )
            cache = "HIT" if c1 == "HIT" and c2 == "HIT" else c1
            rpc = "helius-cache"
        else:
            url = public_rpc_url()
            bal = await _jsonrpc(url, "getBalance", [address])
            tok = await _jsonrpc(url, "getTokenAccountsByOwner", token_params)
            cache = "MISS"
            rpc = "public"
    except Exception as exc:  # noqa: BLE001
        empty["error"] = type(exc).__name__
        return empty

    lamports = parse_sol_lamports(bal)
    micro = parse_usdc_micro(tok)
    return {
        "address": address,
        "sol": None if lamports is None else round(lamports / 1_000_000_000, 6),
        "sol_lamports": lamports,
        "usdc": None if micro is None else round(micro / 1_000_000, 6),
        "usdc_micro": micro,
        "cache": cache,
        "rpc": rpc,
        "lowest_ttl_sec": catalog["lowest_ttl_sec"],
        "error": None,
    }
