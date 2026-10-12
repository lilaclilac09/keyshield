"""Vault routes — SQLite store for the Python backend.

Plaintext in `vault_items.value`. List is masked. Reveal is
`GET /manage/decrypt/{id}`. Cipher-only rows cannot be decrypted on
Railway and must not be stored.

Schema is shared with the Rust reader (see
`src/proxy/crates/ks-vault/src/sqlite.rs::lookup_upstream_key`):
    vault_items(id, user_id, name, type, upstream, value, tags,
                created_at, updated_at, expires_at,
                cipher, iv, cipher_v)

Endpoints:
  GET    /manage/vault         → list (masked; empty-value rows dropped)
  POST   /manage/store         → upsert plaintext (apiKey / value required)
  GET    /manage/decrypt/{id}  → plaintext; 404 if the row is empty
  DELETE /manage/vault/{id}    → delete one item
  PUT    /manage/vault/{id}    → partial update (will not wipe value)
"""

from __future__ import annotations

import json as _json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


def _vault_db_path() -> Path:
    """Same file the Rust proxy reads (`KS_VAULT_DB_PATH`)."""
    env = (os.environ.get("KS_VAULT_DB_PATH") or "").strip()
    if env:
        return Path(env)
    return Path(__file__).parent.parent / "data" / "vault_shim.db"


# SQLite DB path — shared with `ks_vault::sqlite::lookup_upstream_key`
# (Rust hot-path proxy). Tests monkeypatch `_DB_PATH`.
_DB_PATH = _vault_db_path()


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


def _require_user_id(request: Request) -> "tuple[str | None, JSONResponse | None]":
    """Resolve the caller. A Bearer token, even a stale one, is the
    session. X-Dev-Mode:1 is only the no-Authorization local-dev
    fallback. A bad Bearer plus X-Dev-Mode must not write to the
    shared ``default`` user — that hid extension saves from Vault.

    The 2-tuple shape is kept so callers can early-return on error.
    """
    token = request.headers.get("Authorization", "")
    if token.startswith("Bearer "):
        sess = _auth(request)
        if sess:
            return sess["user_id"], None
        return None, JSONResponse({"detail": "unauthorized"}, status_code=401)
    if request.headers.get("X-Dev-Mode") == "1":
        return "default", None
    return None, JSONResponse({"detail": "unauthorized"}, status_code=401)


def _may_claim_default(request: Request) -> bool:
    """Local / explicit only. Never adopt shared Railway ``default`` rows."""
    if os.environ.get("KS_CLAIM_DEFAULT_VAULT") == "1":
        return True
    host = (request.headers.get("host") or "").split(":")[0].lower()
    return host in {"127.0.0.1", "localhost"}


def _claim_default_rows(conn: sqlite3.Connection, uid: str) -> int:
    """Move orphaned ``default`` rows onto an empty session user.

    Extension + stale Bearer used to write ``user_id=default``. After a
    real login the Vault list was empty even though the keys were in
    the same SQLite file. Hosted/shared DBs must not do this.
    """
    if not uid or uid == "default":
        return 0
    n = conn.execute("SELECT COUNT(*) FROM vault_items WHERE user_id = ?", (uid,)).fetchone()[0]
    if n:
        return 0
    cur = conn.execute(
        "UPDATE vault_items SET user_id = ? WHERE user_id = 'default'",
        (uid,),
    )
    return int(cur.rowcount or 0)


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
    raw = row["value"] or ""
    if not str(raw).strip() and int(row["cipher_v"] or 0) == 1:
        masked = "encrypted"
    else:
        masked = _mask(raw)
    from ..proxy import keychain as kc

    upstream = str(row["upstream"] or "")
    meta = kc.provider_meta(upstream)
    product = kc.infer_product(upstream, str(raw))
    expires_iso = _iso(row["expires_at"]) if row["expires_at"] else None
    expiry_label = f"expires {expires_iso[:10]}" if expires_iso else "no expiry"
    if not isinstance(tags, list):
        tags = []
    return {
        "id": row["id"],
        "name": kc.distinguish_name(
            upstream=upstream, raw=str(raw), name=str(row["name"] or "")
        ),
        "type": row["type"],
        "upstream": row["upstream"],
        "masked_value": masked,
        "prefix": masked if str(raw).strip() else "",
        "family": meta["family"],
        "product": product,
        "domain": meta["domain"],
        "notes": f"{meta['family']} · {product} · {expiry_label}",
        "has_plaintext": bool(str(raw).strip()),
        "cipher": row["cipher"] or "",
        "iv": row["iv"] or "",
        "cipher_v": row["cipher_v"] or 0,
        "tags": kc.catalog_tags(upstream, [str(t) for t in tags]),
        "created_at": _iso(row["created_at"]),
        "updated_at": _iso(row["updated_at"]),
        "expires_at": expires_iso,
    }


@router.get("/manage/vault")
async def vault_list(request: Request):
    uid, err = _require_user_id(request)
    if err:
        return err
    with _db() as conn:
        if _may_claim_default(request):
            _claim_default_rows(conn, uid)
        # Cipher-only leftovers listed as 4 cards with a blank RAW field.
        conn.execute(
            "DELETE FROM vault_items WHERE user_id = ? AND TRIM(value) = ''",
            (uid,),
        )
        rows = conn.execute(
            "SELECT * FROM vault_items WHERE user_id = ? AND TRIM(value) != '' "
            "ORDER BY created_at DESC",
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
    stored_value = str(body.get("value") or body.get("apiKey") or body.get("api_key") or "").strip()
    upstream = body.get("upstream") or ""
    if not stored_value:
        return JSONResponse({"detail": "Paste the API key"}, status_code=400)
    from ..proxy import keychain as kc

    host = str(
        body.get("origin") or body.get("domain") or body.get("host") or ""
    ).strip()
    page_title = str(body.get("pageTitle") or body.get("page_title") or "").strip()
    stored_name = kc.distinguish_name(
        upstream=str(upstream),
        raw=stored_value,
        host=host,
        name=str(body.get("name") or ""),
        page_title=page_title,
    )
    extra_tags = body.get("tags", [])
    if not isinstance(extra_tags, list):
        extra_tags = []
    if host:
        extra_tags = [*extra_tags, f"host:{host}"]
    tags_json = _json.dumps(kc.catalog_tags(str(upstream), [str(t) for t in extra_tags]))

    # Same plaintext key → same row. A second Helius UUID stays a new row.
    # Cipher-only leftovers (empty value) get the next pasted secret instead
    # of stacking a fifth blank card.
    if not body.get("id") and stored_value:
        with _db() as conn:
            existing = conn.execute(
                "SELECT id FROM vault_items WHERE user_id = ? AND upstream = ? AND value = ? "
                "ORDER BY created_at DESC LIMIT 1",
                (uid, upstream, stored_value),
            ).fetchone()
            if existing:
                item_id = existing[0]
            else:
                blank = conn.execute(
                    "SELECT id FROM vault_items WHERE user_id = ? AND upstream = ? "
                    "AND TRIM(value) = '' ORDER BY created_at DESC LIMIT 1",
                    (uid, upstream),
                ).fetchone()
                if blank:
                    item_id = blank[0]

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
                value      = CASE WHEN excluded.value = '' THEN vault_items.value ELSE excluded.value END,
                tags       = excluded.tags,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at,
                cipher     = excluded.cipher,
                iv         = excluded.iv,
                cipher_v   = excluded.cipher_v
            """,
            (
                item_id,
                uid,
                stored_name,
                body.get("type") or "api_key",
                upstream,
                stored_value,
                tags_json,
                now,
                now,
                expires_at,
                body.get("cipher") or "",
                body.get("iv") or "",
                int(body.get("cipher_v") or 0),
            ),
        )
    return JSONResponse({"id": item_id})


@router.get("/manage/decrypt/{item_id}")
async def vault_decrypt(item_id: str, request: Request):
    """Return the stored plaintext. Empty cipher leftovers 404."""
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
    plaintext = str(row["value"] or "").strip()
    if not plaintext:
        return JSONResponse(
            {
                "detail": "no plaintext in vault_shim.db — save the API key again",
                "code": "empty_plaintext",
            },
            status_code=404,
        )
    return JSONResponse({"id": item_id, "value": plaintext, "key": plaintext})


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
    allowed = (
        "name",
        "type",
        "upstream",
        "value",
        "tags",
        "expires_at",
        "cipher",
        "iv",
        "cipher_v",
    )
    updates = {k: v for k, v in body.items() if k in allowed}
    if "tags" in updates and isinstance(updates["tags"], list):
        updates["tags"] = _json.dumps(updates["tags"])
    if "value" in updates and not str(updates["value"] or "").strip():
        updates.pop("value")
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
