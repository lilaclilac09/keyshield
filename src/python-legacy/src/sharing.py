"""
sharing.py — vault-share registry

A "share" is a row that says "owner_id has granted recipient_id read access
to vault key `key_name`, with the encrypted DEK (data-encryption key)
re-wrapped to a key the recipient can derive."

Per spec C3, the actual DEK re-wrap requires a passkey-vault: the recipient's
public key (from their passkey) is needed to derive a wrap key the owner can
encrypt the DEK to without exposing it server-side. The current AES-GCM
file vault doesn't carry that public key, so the route layer returns 501 from
/share/grant on this branch (see CRYPTO_REWRAP_AVAILABLE below). The table
schema, list endpoints, revoke flow, and tenant isolation are all wired up
so the upgrade lands as a single function swap.

Table: vault_shares
  id            INTEGER PK AUTOINCREMENT
  owner_id      TEXT NOT NULL  -- vault owner (Solana wallet or login userId)
  recipient_id  TEXT NOT NULL  -- recipient's user_id (same address space)
  key_name      TEXT NOT NULL  -- upstream slug from owner's vault
  encrypted_dek BLOB           -- recipient-wrapped DEK (NULL until re-wrap lands)
  expires_at    INTEGER        -- nullable; epoch seconds
  created_at    INTEGER NOT NULL
  UNIQUE(owner_id, recipient_id, key_name)
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "sharing.db"

# When True, /share/grant performs the DEK re-wrap and inserts a row.
# When False (current state on this branch), /share/grant returns 501 with
# a clear explanation. Flipping this constant alone is not enough to enable
# real sharing — the route layer also needs a recipient public-key lookup
# and the actual wrap step. Both are tracked under spec C3 v2.
CRYPTO_REWRAP_AVAILABLE = False


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS vault_shares (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id      TEXT    NOT NULL,
            recipient_id  TEXT    NOT NULL,
            key_name      TEXT    NOT NULL,
            encrypted_dek BLOB,
            expires_at    INTEGER,
            created_at    INTEGER NOT NULL,
            UNIQUE(owner_id, recipient_id, key_name)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_shares_owner     ON vault_shares(owner_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_shares_recipient ON vault_shares(recipient_id)")
    conn.commit()
    return conn


# ── public API ────────────────────────────────────────────────────────────────


def grant(
    owner_id:      str,
    recipient_id:  str,
    key_name:      str,
    encrypted_dek: bytes | None = None,
    expires_at:    int | None = None,
) -> int:
    """
    Insert a share row. Returns the new share id.

    Raises ValueError on duplicate (owner_id, recipient_id, key_name).
    Caller is expected to have checked CRYPTO_REWRAP_AVAILABLE before
    invoking this — passing encrypted_dek=None when the contract requires
    a wrapped DEK is supported (for placeholder / future activation) but
    the route layer should not call grant() with a NULL DEK in production.
    """
    conn = _db()
    try:
        cur = conn.execute(
            """
            INSERT INTO vault_shares
              (owner_id, recipient_id, key_name, encrypted_dek, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (owner_id, recipient_id, key_name, encrypted_dek, expires_at, int(time.time())),
        )
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]
    except sqlite3.IntegrityError:
        raise ValueError(
            f"already shared: {owner_id}/{key_name} → {recipient_id}",
        )
    finally:
        conn.close()


def revoke(owner_id: str, share_id: int) -> bool:
    """
    Remove a share. Owner-scoped: a recipient cannot revoke a share that
    was granted TO them (they can refuse to use it, but the canonical row
    belongs to the owner). Returns True if a row was deleted.
    """
    conn = _db()
    try:
        cur = conn.execute(
            "DELETE FROM vault_shares WHERE id = ? AND owner_id = ?",
            (share_id, owner_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_outgoing(owner_id: str) -> list[dict]:
    """Shares this user has GRANTED."""
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT id, owner_id, recipient_id, key_name, expires_at, created_at
            FROM vault_shares
            WHERE owner_id = ?
            ORDER BY created_at DESC
            """,
            (owner_id,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def list_incoming(recipient_id: str) -> list[dict]:
    """Shares that have been granted TO this user."""
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT id, owner_id, recipient_id, key_name, expires_at, created_at
            FROM vault_shares
            WHERE recipient_id = ?
            ORDER BY created_at DESC
            """,
            (recipient_id,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def purge_user(user_id: str) -> int:
    """
    Wipe every share row that this user is part of (as owner OR recipient).
    Used by /auth/delete-account during cascade. Returns total rows deleted.

    Recipient-side rows are wiped because a deleted user's incoming-shares
    row would point at a now-tombstoned recipient_id, leaving stale
    references the rest of the app can't display correctly.
    """
    conn = _db()
    try:
        cur = conn.execute(
            "DELETE FROM vault_shares WHERE owner_id = ? OR recipient_id = ?",
            (user_id, user_id),
        )
        conn.commit()
        return cur.rowcount or 0
    finally:
        conn.close()


def _row_to_dict(r) -> dict:
    return {
        "id":           r[0],
        "owner_id":     r[1],
        "recipient_id": r[2],
        "key_name":     r[3],
        "expires_at":   r[4],
        "created_at":   r[5],
    }
