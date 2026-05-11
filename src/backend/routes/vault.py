"""Vault shim routes — local development fallback.

Path A production: vault lives on Cloudflare Worker (client-side AES-GCM).
Local dev: this shim provides an in-memory vault so the dashboard works
without running the CF Worker. Data is scoped per session user_id.

Endpoints:
  GET    /manage/vault       → list vault items
  POST   /manage/store       → store a new item
  GET    /manage/decrypt/{id} → decrypt an item (returns value)
  DELETE /manage/vault/{id}  → delete an item
  PUT    /manage/vault/{id}  → update an item
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()

# In-memory store: {user_id: {item_id: item_dict}}
_vault: dict[str, dict[str, dict]] = {}


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


def _require_user_id(request: Request) -> "tuple[str | None, JSONResponse | None]":
    """Resolve the authenticated user_id or return a 401.

    The only exception is when the caller sets `X-Dev-Mode: 1`, which
    falls back to the "default" bucket — intended for local dev without
    a session token. This bypass MUST NOT be enabled in production (set
    KEYSHIELD_DEV_MODE=0 or just never send that header in prod code).
    """
    sess = _auth(request)
    if sess:
        return sess["user_id"], None
    if request.headers.get("X-Dev-Mode") == "1":
        return "default", None
    return None, JSONResponse({"detail": "unauthorized"}, status_code=401)


def _user_vault(uid: str) -> dict[str, dict]:
    if uid not in _vault:
        _vault[uid] = {}
    return _vault[uid]


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _mask(value: str) -> str:
    """Mask a secret value like sk-abc...xyz."""
    if len(value) <= 8:
        return "\u2022" * 8
    return value[:6] + "\u2022" * (len(value) - 10) + value[-4:]


@router.get("/manage/vault")
async def vault_list(request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    items = _user_vault(uid)
    result = []
    for item_id, item in items.items():
        result.append({
            "id": item_id,
            "name": item["name"],
            "type": item["type"],
            "upstream": item.get("upstream", ""),
            "masked_value": _mask(item.get("value", "")),
            "tags": item.get("tags", []),
            "created_at": _iso(item["created_at"]),
            "updated_at": _iso(item["updated_at"]),
            "expires_at": _iso(item["expires_at"]) if item.get("expires_at") else None,
        })
    return JSONResponse(result)


@router.post("/manage/store")
async def vault_store(request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    body = await request.json()
    item_id = body.get("id") or f"ks_{uuid.uuid4().hex[:12]}"
    now = time.time()
    expiry_days = body.get("expiry_days", 30)
    _user_vault(uid)[item_id] = {
        "name": body.get("name", "unnamed"),
        "type": body.get("type", "api_key"),
        "upstream": body.get("upstream", ""),
        "value": body.get("value", ""),
        "tags": body.get("tags", []),
        "created_at": now,
        "updated_at": now,
        "expires_at": now + (expiry_days * 86400) if expiry_days else None,
    }
    return JSONResponse({"id": item_id})


@router.get("/manage/decrypt/{item_id}")
async def vault_decrypt(item_id: str, request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    items = _user_vault(uid)
    if item_id not in items:
        return JSONResponse({"detail": "item not found"}, status_code=404)
    return JSONResponse({
        "id": item_id,
        "value": items[item_id]["value"],
    })


@router.delete("/manage/vault/{item_id}")
async def vault_delete(item_id: str, request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    items = _user_vault(uid)
    if item_id not in items:
        return JSONResponse({"detail": "item not found"}, status_code=404)
    del items[item_id]
    return JSONResponse({"ok": True})


@router.put("/manage/vault/{item_id}")
async def vault_update(item_id: str, request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    items = _user_vault(uid)
    if item_id not in items:
        return JSONResponse({"detail": "item not found"}, status_code=404)
    body = await request.json()
    existing = items[item_id]
    existing.update({
        k: v for k, v in body.items()
        if k in ("name", "type", "upstream", "value", "tags", "expires_at")
    })
    existing["updated_at"] = time.time()
    return JSONResponse({"ok": True})
