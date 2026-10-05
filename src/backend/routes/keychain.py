"""Keychain HTTP surface — detect, RPC cache catalog, one-click call, home."""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod

    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


def _require_auth(request: Request):
    sess = _auth(request)
    if not sess:
        return None, JSONResponse({"detail": "unauthorized"}, status_code=401)
    return sess, None


def _refuse_echo(raw: str, payload: dict) -> JSONResponse | None:
    dumped = str(payload)
    secret = (raw or "").strip()
    if secret and secret in dumped:
        return JSONResponse({"detail": "refusing to echo secret"}, status_code=500)
    return None


@router.get("/keychain/rpc-cache")
async def keychain_rpc_cache():
    from ..proxy import keychain as kc

    return JSONResponse(kc.rpc_cache_catalog())


@router.get("/keychain/home")
async def keychain_home(request: Request):
    """First-screen snapshot: wallet balances, stored APIs, connection."""
    sess, err = _require_auth(request)
    if err:
        return err
    import os

    from .. import demo as demo_mod
    from ..billing import usage as usage_mod
    from ..proxy import keychain as kc

    user_id = sess["user_id"]
    address = str(request.query_params.get("address") or "").strip()
    if not kc.looks_like_pubkey(address):
        if kc.looks_like_pubkey(user_id):
            address = user_id
        else:
            try:
                from ..mpp import owner_keystore

                address = owner_keystore.owner_status().get("pubkey") or ""
            except Exception:
                address = ""

    t0 = time.perf_counter()
    helius_key = os.getenv("KS_HELIUS_API_KEY", "").strip() or demo_mod.lookup_vault_key(
        user_id, "helius"
    )
    wallet = await kc.fetch_wallet_balances(address, helius_key or None)
    wallet_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    apis = kc.list_stored_upstreams(user_id)
    catalog = kc.rpc_cache_catalog()

    balance_usd = usage_mod.get_balance(user_id)
    if isinstance(balance_usd, dict):
        ledger_usd = float(balance_usd.get("balance_usd", balance_usd.get("usd_balance", 0)) or 0)
        free_usd = float(balance_usd.get("free_credit_usd", usage_mod.FREE_CREDIT_USD))
    else:
        ledger_usd = float(balance_usd or 0)
        free_usd = float(usage_mod.FREE_CREDIT_USD)

    autosign = {"loaded": False, "pubkey": None}
    try:
        from ..mpp import owner_keystore

        autosign = owner_keystore.owner_status()
    except Exception:
        autosign = {"loaded": False, "pubkey": None}

    try:
        demo = demo_mod.demo_status()
    except Exception:
        demo = {"enabled": False}

    from ..billing import plans as plans_mod

    plan_snap = plans_mod.snapshot(user_id)
    accelerated = bool(plan_snap["allows"].get("accelerate"))
    body = {
        "wallet": wallet,
        "ledger": {
            "balance_usd": round(ledger_usd, 6),
            "free_credit_usd": round(free_usd, 6),
        },
        "plan": {
            "id": plan_snap["plan"]["id"],
            "name": plan_snap["plan"]["name"],
            "tier": plan_snap["plan"]["tier"],
            "features": plan_snap["features"],
            "accelerated": accelerated,
            "auto_plugin": bool(plan_snap["allows"].get("auto_plugin")),
            "biometric_zk": bool(plan_snap["allows"].get("biometric_zk")),
            "low_latency": bool(plan_snap["allows"].get("low_latency")),
        },
        "apis": apis,
        "connection": {
            "api": True,
            "autosign": bool(autosign.get("loaded")),
            "autosign_pubkey": autosign.get("pubkey"),
            "rpc": wallet.get("rpc"),
            "rpc_cached": wallet.get("cache") == "HIT",
            "lowest_ttl_sec": catalog.get("lowest_ttl_sec"),
            "demo": bool(demo.get("enabled")),
        },
        "rpc_cache": {
            "lowest_ttl_sec": catalog.get("lowest_ttl_sec"),
            "writes_bypass": catalog.get("writes_bypass"),
            "accelerated": accelerated,
        },
        "latency": {
            "wallet_ms": wallet_ms,
            "online": wallet.get("error") is None,
        },
    }
    return JSONResponse(body)


@router.post("/keychain/detect")
async def keychain_detect(request: Request):
    sess, err = _require_auth(request)
    if err:
        return err
    from ..proxy import keychain as kc

    try:
        body = await request.json()
    except Exception:
        body = {}
    raw = str((body or {}).get("value") or (body or {}).get("apiKey") or "")
    detected = kc.detect_upstream(raw)
    echo = _refuse_echo(raw, detected)
    if echo:
        return echo
    return JSONResponse(detected)


@router.post("/keychain/store")
async def keychain_store(request: Request):
    """Detect a pasted key and write it to the vault. Prefix only in the reply."""
    sess, err = _require_auth(request)
    if err:
        return err
    from .. import demo as demo_mod
    from ..proxy import keychain as kc

    try:
        body = await request.json()
    except Exception:
        body = {}
    raw = str((body or {}).get("value") or (body or {}).get("apiKey") or "")
    forced = str((body or {}).get("upstream") or "").strip().lower()
    extracted = kc.extract_key(raw)
    detected = kc.detect_upstream(extracted)
    upstream = forced or detected.get("upstream")
    if not extracted:
        return JSONResponse({"detail": "value is required"}, status_code=400)
    if not upstream:
        return JSONResponse(
            {
                "detail": "unrecognized key shape — pick a provider or paste a known prefix",
                "code": "undetected",
            },
            status_code=422,
        )
    item_id = demo_mod.store_upstream_key(sess["user_id"], str(upstream), extracted)
    reply = {
        "stored": True,
        "id": item_id,
        "upstream": upstream,
        "prefix": kc.mask_key(extracted),
        "matched": bool(detected.get("matched")),
    }
    echo = _refuse_echo(extracted, reply)
    if echo:
        return echo
    return JSONResponse(reply)


@router.post("/keychain/call")
async def keychain_call(request: Request):
    """One-click probe through the proxy. Session required. Key stays server-side."""
    sess, err = _require_auth(request)
    if err:
        return err
    from .. import demo as demo_mod
    from ..proxy import api_router
    from ..proxy import keychain as kc

    try:
        payload = await request.json()
    except Exception:
        payload = {}
    upstream = str(payload.get("upstream") or "").strip()
    prompt = str(payload.get("prompt") or "KeyShield keychain ping")
    if not upstream:
        return JSONResponse({"detail": "upstream is required"}, status_code=400)

    api_key, source = demo_mod.resolve_upstream_key(sess["user_id"], upstream)
    if not api_key:
        return JSONResponse(
            {
                "detail": "no key stored for this upstream — paste once or unlock Device Vault",
                "code": "key_missing",
            },
            status_code=409,
        )

    call_upstream, path, body = kc.probe_for(upstream, prompt)
    t0 = time.perf_counter()
    cache = "bypass"
    status = 200
    try:
        if call_upstream.startswith("helius") and body:
            parsed = __import__("json").loads(body)
            result, cache = await api_router.call_helius(
                parsed.get("method") or "getSlot",
                parsed.get("params") or [],
                api_key,
                parsed.get("id", 1),
            )
            status = 400 if result.get("error") else 200
            live = status < 400
        else:
            method = "GET" if body is None else "POST"
            content, status, cache = await api_router.call_rest(
                call_upstream,
                method,
                path,
                body,
                api_key,
            )
            live = status < 400
            _ = content
    except Exception as exc:  # noqa: BLE001
        logger.info("keychain call failed upstream=%s: %s", call_upstream, exc)
        return JSONResponse(
            {"detail": "upstream call failed", "upstream": call_upstream},
            status_code=502,
        )

    latency_ms = (time.perf_counter() - t0) * 1000.0
    reply = {
        "upstream": call_upstream,
        "path": path or "(json-rpc)",
        "live": live,
        "status": status,
        "cache": cache,
        "latency_ms": round(latency_ms, 2),
        "key_source": source,
        "key_prefix": kc.mask_key(api_key),
    }
    echo = _refuse_echo(api_key, reply)
    if echo:
        return echo
    return JSONResponse(reply)
