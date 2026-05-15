"""Vault routes — SQLite-backed store for the Python backend.

Path A production: vault lives on Cloudflare Worker (client-side AES-GCM).
Local dev / Railway: this shim stores to SQLite at
`src/backend/data/vault_shim.db` so:
  - Keys survive Python restarts.
  - The Rust hot-path proxy (`/proxy/helius/*`) can resolve the user's
    upstream API key via `ks_vault::sqlite::lookup_upstream_key`.
  - Extension `IMPORT_VAULT` + manual `/manage/store` both land in the
    same row, queryable by (user_id, upstream).

Schema is shared with the Rust reader (see
`src/proxy/crates/ks-vault/src/sqlite.rs::lookup_upstream_key`):
    vault_items(id, user_id, name, type, upstream, value, tags,
                created_at, updated_at, expires_at,
                cipher, iv, cipher_v)

Endpoints:
  GET    /manage/vault         → list (masked values + optional cipher)
  POST   /manage/store         → upsert one item (idempotent by id)
  GET    /manage/decrypt/{id}  → return plaintext value (local-dev only)
  DELETE /manage/vault/{id}    → delete one item
  PUT    /manage/vault/{id}    → partial update
"""
from __future__ import annotations

import json as _json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()

# SQLite DB path — shared with `ks_vault::sqlite::lookup_upstream_key`
# (Rust hot-path proxy). Kept identical to the path the Rust crate
# defaults to, so both sides read/write the same file.
_DB_PATH = Path(__file__).parent.parent / "data" / "vault_shim.db"


@contextmanager
def _db():
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS vault_items (
            id         TEXT NOT NULL,
            user_id    TEXT NOT NULL,
            name       TEXT NOT NULL DEFAULT 'unnamed',
            type       TEXT NOT NULL DEFAULT 'api_key',
            upstream   TEXT NOT NULL DEFAULT '',
            value      TEXT NOT NULL DEFAULT '',
            tags       TEXT NOT NULL DEFAULT '[]',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            expires_at REAL,
            cipher     TEXT NOT NULL DEFAULT '',
            iv         TEXT NOT NULL DEFAULT '',
            cipher_v   INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (id, user_id)
        )
    """)
    # Idempotent ALTERs in case an older schema lacks the cipher fields.
    for stmt in (
        "ALTER TABLE vault_items ADD COLUMN cipher   TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE vault_items ADD COLUMN iv       TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE vault_items ADD COLUMN cipher_v INTEGER NOT NULL DEFAULT 0",
    ):
        try:
            conn.execute(stmt)
        except sqlite3.OperationalError:
            pass  # column already exists
    # Index used by both the Rust SQLite reader and /manage/vault.
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_vault_items_user_upstream "
        "ON vault_items (user_id, upstream)"
    )
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


def _require_user_id(request: Request) -> "tuple[str, None]":
    """Backward-compatible: returns the bearer-resolved user_id when a
    session exists, else falls back to "default" so the local-dev and
    test paths keep working unchanged. The 2-tuple shape is kept so the
    callers can preserve their early-return error pattern.

    For routes that need real auth, check session existence explicitly."""
    sess = _auth(request)
    if sess:
        return sess["user_id"], None
    return "default", None


def _iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * 8
    return value[:6] + "•" * max(len(value) - 10, 4) + value[-4:]


def _row_to_dict(row: sqlite3.Row) -> dict:
    try:
        tags = _json.loads(row["tags"] or "[]")
    except Exception:
        tags = []
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "upstream": row["upstream"],
        "masked_value": _mask(row["value"] or ""),
        "cipher": row["cipher"] or "",
        "iv": row["iv"] or "",
        "cipher_v": row["cipher_v"] or 0,
        "tags": tags,
        "created_at": _iso(row["created_at"]),
        "updated_at": _iso(row["updated_at"]),
        "expires_at": _iso(row["expires_at"]) if row["expires_at"] else None,
    }


@router.get("/manage/vault")
async def vault_list(request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM vault_items WHERE user_id = ? ORDER BY created_at DESC",
            (uid,),
        ).fetchall()
    return JSONResponse([_row_to_dict(r) for r in rows])


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
    tags = body.get("tags", [])
    if isinstance(tags, list):
        tags_json = _json.dumps(tags)
    else:
        tags_json = "[]"

    with _db() as conn:
        conn.execute(
            """
            INSERT INTO vault_items
              (id, user_id, name, type, upstream, value, tags,
               created_at, updated_at, expires_at,
               cipher, iv, cipher_v)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id, user_id) DO UPDATE SET
                name       = excluded.name,
                type       = excluded.type,
                upstream   = excluded.upstream,
                value      = excluded.value,
                tags       = excluded.tags,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                cipher     = excluded.cipher,
                iv         = excluded.iv,
                cipher_v   = excluded.cipher_v
            """,
            (
                item_id, uid,
                body.get("name") or "unnamed",
                body.get("type") or "api_key",
                body.get("upstream") or "",
                body.get("value") or "",
                tags_json,
                now, now, expires_at,
                body.get("cipher") or "",
                body.get("iv") or "",
                int(body.get("cipher_v") or 0),
            ),
        )
    return JSONResponse({"id": item_id})


@router.get("/manage/decrypt/{item_id}")
async def vault_decrypt(item_id: str, request: Request):
    """Return plaintext value. Production should NOT call this — the CF
    Worker path decrypts client-side. This is the local-dev fallback so
    the dashboard's "reveal" button works without Path A."""
    uid, err = _require_user_id(request)
    if err:
        return err
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM vault_items WHERE id = ? AND user_id = ?",
            (item_id, uid),
        ).fetchone()
    if not row:
        return JSONResponse({"detail": "item not found"}, status_code=404)
    return JSONResponse({"id": item_id, "value": row["value"] or ""})


@router.delete("/manage/vault/{item_id}")
async def vault_delete(item_id: str, request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    with _db() as conn:
        cur = conn.execute(
            "DELETE FROM vault_items WHERE id = ? AND user_id = ?",
            (item_id, uid),
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
    allowed = ("name", "type", "upstream", "value", "tags", "expires_at",
               "cipher", "iv", "cipher_v")
    updates = {k: v for k, v in body.items() if k in allowed}
    if "tags" in updates and isinstance(updates["tags"], list):
        updates["tags"] = _json.dumps(updates["tags"])
    if not updates:
        return JSONResponse({"ok": True})
    updates["updated_at"] = time.time()
    cols = ", ".join(f"{k} = ?" for k in updates)
    vals = list(updates.values()) + [item_id, uid]
    with _db() as conn:
        cur = conn.execute(
            f"UPDATE vault_items SET {cols} WHERE id = ? AND user_id = ?",
            vals,
        )
    if cur.rowcount == 0:
        return JSONResponse({"detail": "item not found"}, status_code=404)
    return JSONResponse({"ok": True})
