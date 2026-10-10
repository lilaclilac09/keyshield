"""Devnet wallet snapshot for the top status strip.

One `getMultipleAccounts([owner, usdc_ata])` — same shape as the
Helius cache in `proxy/api_router.py` (short TTL). The dashboard
must not depend on the browser reaching public Devnet RPC; `/mpp/status`
is the handshake. Repeat polls hit memory cache so the bar stays
millisecond after the first fill.
"""

from __future__ import annotations

import base64
import os
import time
from typing import Any, Callable

import httpx

CIRCLE_DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
DEFAULT_RPC = "https://api.devnet.solana.com"
_CACHE: dict[str, tuple[dict, float]] = {}
# Status strip polls every 15s. Keep the handshake (~200ms RPC) and serve
# later reads from memory so the bar stays millisecond.
_TTL_SEC = 20.0


def rpc_url() -> str:
    return (
        os.environ.get("KS_SOLANA_RPC_URL", "").strip()
        or os.environ.get("SOLANA_RPC_URL", "").strip()
        or DEFAULT_RPC
    )


def looks_like_pubkey(value: str) -> bool:
    raw = (value or "").strip()
    if not raw:
        return False
    try:
        from solders.pubkey import Pubkey

        Pubkey.from_string(raw)
        return True
    except Exception:
        return False


def _spl_amount(account: dict | None) -> int | None:
    if account is None:
        return 0
    data = account.get("data")
    blob: bytes | None = None
    if isinstance(data, list) and data:
        blob = base64.b64decode(data[0])
    elif isinstance(data, str):
        blob = base64.b64decode(data)
    elif isinstance(data, (bytes, bytearray)):
        blob = bytes(data)
    if not blob or len(blob) < 72:
        return 0
    return int.from_bytes(blob[64:72], "little")


def fetch_wallet_balances(
    owner_b58: str,
    *,
    fetch_impl: Callable[[str, dict], Any] | None = None,
    usdc_mint: str | None = None,
    rpc: str | None = None,
) -> dict:
    """Return SOL lamports + Circle Devnet USDC atoms for `owner_b58`."""
    owner = (owner_b58 or "").strip()
    empty = {
        "wallet": owner or None,
        "sol_lamports": None,
        "usdc_micro": None,
        "rpc_ms": None,
        "cached": False,
    }
    if not looks_like_pubkey(owner):
        return empty

    mint = (usdc_mint or os.environ.get("KS_USDC_MINT") or CIRCLE_DEVNET_USDC).strip()
    endpoint = (rpc or rpc_url()).strip() or DEFAULT_RPC
    from ..mpp.mpp_onchain import derive_associated_token_address

    ata = derive_associated_token_address(owner, mint)
    cache_key = f"{endpoint}:{owner}:{ata}"
    t0 = time.perf_counter()
    hit = _CACHE.get(cache_key)
    now = time.monotonic()
    if hit and now < hit[1]:
        cached = dict(hit[0])
        cached["cached"] = True
        cached["rpc_ms"] = round((time.perf_counter() - t0) * 1000, 3)
        return cached

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getMultipleAccounts",
        "params": [
            [owner, ata],
            {"encoding": "base64", "commitment": "confirmed"},
        ],
    }
    try:
        if fetch_impl is not None:
            raw = fetch_impl(endpoint, payload)
        else:
            with httpx.Client(timeout=2.5) as client:
                resp = client.post(endpoint, json=payload)
                resp.raise_for_status()
                raw = resp.json()
    except Exception:
        return empty
    rpc_ms = round((time.perf_counter() - t0) * 1000, 2)
    if not isinstance(raw, dict) or raw.get("error"):
        return {**empty, "rpc_ms": rpc_ms}
    values = ((raw.get("result") or {}).get("value")) or [None, None]
    owner_acct = values[0] if len(values) > 0 else None
    ata_acct = values[1] if len(values) > 1 else None
    sol = None if owner_acct is None else int(owner_acct.get("lamports") or 0)
    out = {
        "wallet": owner,
        "sol_lamports": sol,
        "usdc_micro": _spl_amount(ata_acct),
        "rpc_ms": rpc_ms,
        "cached": False,
    }
    _CACHE[cache_key] = (dict(out), time.monotonic() + _TTL_SEC)
    return out


def clear_balance_cache() -> None:
    _CACHE.clear()
