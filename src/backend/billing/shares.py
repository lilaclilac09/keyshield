"""
Vault secret sharing — one-time links.

The share token is a 32-byte random AES-GCM key.  The server only stores
sha256(token), so it cannot decrypt the ciphertext without the token.
The recipient's URL contains the raw token → the server only sees a
hash during lookup.

DB: data/shares.db  (alongside agents.db, usage.db)
"""

import hashlib
import secrets
import sqlite3
import time
import uuid
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DB_PATH = Path(__file__).parent.parent / "data" / "shares.db"

_AAD = b"ks-share"  # additional authenticated data


# ─── DB init ──────────────────────────────────────────────────────────────────


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""
        CREATE TABLE IF NOT EXISTS vault_shares (
            id          TEXT PRIMARY KEY,
            owner_id    TEXT NOT NULL,
            upstream    TEXT NOT NULL,
            enc_hex     TEXT NOT NULL,
            nonce_hex   TEXT NOT NULL,
            token_hash  TEXT NOT NULL UNIQUE,
            created_at  INTEGER NOT NULL,
            expires_at  INTEGER NOT NULL,
            view_count  INTEGER NOT NULL DEFAULT 0,
            max_views   INTEGER NOT NULL DEFAULT 1
        )
    """)
    con.commit()
    return con


# ─── crypto helpers ────────────────────────────────────────────────────────────


def _encrypt(token_bytes: bytes, plaintext: str) -> tuple[str, str]:
    """Returns (nonce_hex, enc_hex)."""
    nonce = secrets.token_bytes(12)
    aes = AESGCM(token_bytes)
    enc = aes.encrypt(nonce, plaintext.encode(), _AAD)
    return nonce.hex(), enc.hex()


def _decrypt(token_bytes: bytes, nonce_hex: str, enc_hex: str) -> str:
    aes = AESGCM(token_bytes)
    return aes.decrypt(bytes.fromhex(nonce_hex), bytes.fromhex(enc_hex), _AAD).decode()


def _token_hash(token_bytes: bytes) -> str:
    return hashlib.sha256(token_bytes).hexdigest()


# ─── public API ───────────────────────────────────────────────────────────────


def create_share(
    owner_id: str,
    upstream: str,
    plaintext: str,
    ttl_hours: int = 24,
    max_views: int = 1,
) -> dict:
    """
    Encrypt *plaintext* with a fresh random token.

    Returns a dict with:
      id, token (hex, goes in the URL), expires_at (unix ts)
    """
    token_bytes = secrets.token_bytes(32)
    token_hex = token_bytes.hex()
    nonce_hex, enc_hex = _encrypt(token_bytes, plaintext)
    share_id = str(uuid.uuid4())
    now = int(time.time())
    expires_at = now + ttl_hours * 3600

    with _conn() as con:
        con.execute(
            """
            INSERT INTO vault_shares
                (id, owner_id, upstream, enc_hex, nonce_hex,
                 token_hash, created_at, expires_at, view_count, max_views)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (
                share_id,
                owner_id,
                upstream,
                enc_hex,
                nonce_hex,
                _token_hash(token_bytes),
                now,
                expires_at,
                max_views,
            ),
        )

    return {
        "id": share_id,
        "token": token_hex,
        "expires_at": expires_at,
    }


def access_share(token_hex: str) -> dict:
    """
    Look up, decrypt, and increment view_count for a share.

    Returns:
      upstream, value, expires_at, views_remaining

    Raises:
      KeyError  — not found
      ValueError — expired or exhausted (caller should return 410)
    """
    token_bytes = bytes.fromhex(token_hex)
    th = _token_hash(token_bytes)

    with _conn() as con:
        row = con.execute(
            "SELECT * FROM vault_shares WHERE token_hash = ?", (th,)
        ).fetchone()

        if row is None:
            raise KeyError("share not found")

        now = int(time.time())
        if now > row["expires_at"]:
            raise ValueError("expired")

        if row["max_views"] != -1 and row["view_count"] >= row["max_views"]:
            raise ValueError("exhausted")

        # Decrypt before incrementing so a bad token never increments the count
        plaintext = _decrypt(token_bytes, row["nonce_hex"], row["enc_hex"])

        new_count = row["view_count"] + 1
        con.execute(
            "UPDATE vault_shares SET view_count = ? WHERE id = ?",
            (new_count, row["id"]),
        )

        if row["max_views"] == -1:
            views_remaining = -1  # unlimited
        else:
            views_remaining = row["max_views"] - new_count

        return {
            "upstream": row["upstream"],
            "value": plaintext,
            "expires_at": row["expires_at"],
            "views_remaining": views_remaining,
        }


def list_shares(owner_id: str) -> list[dict]:
    """Return all shares (active and expired) for this owner, newest first."""
    now = int(time.time())
    with _conn() as con:
        rows = con.execute(
            """
            SELECT id, upstream, expires_at, view_count, max_views
            FROM vault_shares
            WHERE owner_id = ?
            ORDER BY expires_at DESC
            """,
            (owner_id,),
        ).fetchall()

    result = []
    for row in rows:
        exhausted = row["max_views"] != -1 and row["view_count"] >= row["max_views"]
        result.append(
            {
                "id": row["id"],
                "upstream": row["upstream"],
                "expires_at": row["expires_at"],
                "view_count": row["view_count"],
                "max_views": row["max_views"],
                "expired": now > row["expires_at"] or exhausted,
            }
        )
    return result


def revoke_share(share_id: str, owner_id: str) -> bool:
    """Delete a share.  Returns True if deleted, False if not found/unauthorized."""
    with _conn() as con:
        cur = con.execute(
            "DELETE FROM vault_shares WHERE id = ? AND owner_id = ?",
            (share_id, owner_id),
        )
        return cur.rowcount > 0
