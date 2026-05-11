"""Vault shim routes — local development fallback.

Path A production: vault lives on Cloudflare Worker (client-side AES-GCM).
Local dev: this shim stores to SQLite so keys survive backend restarts.

Endpoints:
  GET    /manage/vault        → list vault items
  POST   /manage/store        → store a new item
  GET    /manage/decrypt/{id} → decrypt an item (returns plaintext value)
  DELETE /manage/vault/{id}   → delete an item
  PUT    /manage/vault/{id}   → update an item
"""
from __future__ import annotations

import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()

_DB_PATH = Path(__file__).parent.parent / "data" / "vault_shim.db"


def _db() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS vault_items (
            id         TEXT NOT NULL,
            user_id    TEXT NOT NULL,
            name       TEXT NOT NULL,
            type       TEXT NOT NULL DEFAULT 'api_key',
            upstream   TEXT NOT NULL DEFAULT '',
            value      TEXT NOT NULL DEFAULT '',
            tags       TEXT NOT NULL DEFAULT '[]',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            expires_at REAL,
            PRIMARY KEY (id, user_id)
        )
    """)
    # Path A lite: client-side AES-GCM ciphertext columns (added late, may
    # not exist on older DBs). ALTER TABLE is idempotent here via try/except.
    for stmt in (
        "ALTER TABLE vault_items ADD COLUMN cipher   TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE vault_items ADD COLUMN iv       TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE vault_items ADD COLUMN cipher_v INTEGER NOT NULL DEFAULT 0",
    ):
        try: conn.execute(stmt)
        except sqlite3.OperationalError: pass   # column already exists
    conn.commit()
    return conn


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


def _require_user_id(request: Request) -> "tuple[str | None, JSONResponse | None]":
    sess = _auth(request)
    if sess:
        return sess["user_id"], None
    if request.headers.get("X-Dev-Mode") == "1":
        return "default", None
    return None, JSONResponse({"detail": "unauthorized"}, status_code=401)


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "•" * 8
    return value[:6] + "•" * (len(value) - 10) + value[-4:]


import json as _json


@router.get("/manage/vault")
async def vault_list(request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM vault_items WHERE user_id = ? ORDER BY created_at DESC", (uid,)
        ).fetchall()
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "name": r["name"],
            "type": r["type"],
            "upstream": r["upstream"],
            "masked_value": _mask(r["value"]),
            "cipher": r["cipher"] if "cipher" in r.keys() else "",
            "iv": r["iv"] if "iv" in r.keys() else "",
            "cipher_v": r["cipher_v"] if "cipher_v" in r.keys() else 0,
            "tags": _json.loads(r["tags"]),
            "created_at": _iso(r["created_at"]),
            "updated_at": _iso(r["updated_at"]),
            "expires_at": _iso(r["expires_at"]) if r["expires_at"] else None,
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
    expires_at = now + (expiry_days * 86400) if expiry_days else None
    with _db() as conn:
        conn.execute("""
            INSERT INTO vault_items (id, user_id, name, type, upstream, value, tags, created_at, updated_at, expires_at, cipher, iv, cipher_v)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id, user_id) DO UPDATE SET
                name=excluded.name, type=excluded.type, upstream=excluded.upstream,
                value=excluded.value, tags=excluded.tags,
                cipher=excluded.cipher, iv=excluded.iv, cipher_v=excluded.cipher_v,
                updated_at=excluded.updated_at, expires_at=excluded.expires_at
        """, (
            item_id, uid,
            body.get("name", "unnamed"),
            body.get("type", "api_key"),
            body.get("upstream", ""),
            body.get("value", ""),
            _json.dumps(body.get("tags", [])),
            now, now, expires_at,
            body.get("cipher", ""),
            body.get("iv", ""),
            int(body.get("cipher_v", 0)),
        ))
    return JSONResponse({"id": item_id})


@router.get("/manage/decrypt/{item_id}")
async def vault_decrypt(item_id: str, request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM vault_items WHERE id = ? AND user_id = ?", (item_id, uid)
        ).fetchone()
    if not row:
        return JSONResponse({"detail": "item not found"}, status_code=404)
    return JSONResponse({"id": item_id, "value": row["value"]})


@router.delete("/manage/vault/{item_id}")
async def vault_delete(item_id: str, request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    with _db() as conn:
        cur = conn.execute(
            "DELETE FROM vault_items WHERE id = ? AND user_id = ?", (item_id, uid)
        )
    if cur.rowcount == 0:
        return JSONResponse({"detail": "item not found"}, status_code=404)
    return JSONResponse({"ok": True})


@router.put("/manage/vault/{item_id}")
async def vault_update(item_id: str, request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    body = await request.json()
    allowed = ("name", "type", "upstream", "value", "tags", "expires_at")
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        return JSONResponse({"ok": True})
    if "tags" in updates:
        updates["tags"] = _json.dumps(updates["tags"])
    updates["updated_at"] = time.time()
    cols = ", ".join(f"{k}=?" for k in updates)
    vals = list(updates.values()) + [item_id, uid]
    with _db() as conn:
        cur = conn.execute(
            f"UPDATE vault_items SET {cols} WHERE id=? AND user_id=?", vals
        )
    if cur.rowcount == 0:
        return JSONResponse({"detail": "item not found"}, status_code=404)
    return JSONResponse({"ok": True})
