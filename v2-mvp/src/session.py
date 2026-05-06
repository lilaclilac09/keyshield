"""
Session 管理：用户登录一次 → 拿到 session token → 后续请求不再传密码。

密码用 SERVER_SECRET 加密后存入 SQLite。
服务重启后 session 仍有效（不用重新登录）。
"""

import os
import secrets
import sqlite3
import time
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DB_PATH = Path(__file__).parent.parent / "sessions.db"
SESSION_TTL = 24 * 3600  # 24 小时
_SERVER_SECRET = os.getenv("SERVER_SECRET", "CHANGE-ME-IN-PROD-32-BYTES-MIN!!")


def _server_key() -> bytes:
    import hashlib
    return hashlib.sha256(_SERVER_SECRET.encode()).digest()


def _encrypt(plaintext: str) -> bytes:
    nonce = os.urandom(12)
    ct = AESGCM(_server_key()).encrypt(nonce, plaintext.encode(), None)
    return nonce + ct


def _decrypt(data: bytes) -> str:
    nonce, ct = data[:12], data[12:]
    return AESGCM(_server_key()).decrypt(nonce, ct, None).decode()


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL,
            enc_pass   BLOB NOT NULL,
            expires_at INTEGER NOT NULL
        )
    """)
    # deleted_users: anti-replay tombstone. Set on /auth/delete-account so
    # the same wallet re-registering can't impersonate the prior identity
    # (or, more importantly, can't have the prior identity's stale tokens
    # still work after re-registration). Soft-delete is intentional —
    # we don't hard-purge so audit logs / chain-of-custody inquiries
    # ("did this user ever exist?") still have an answer.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS deleted_users (
            user_id    TEXT PRIMARY KEY,
            deleted_at INTEGER NOT NULL
        )
    """)
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
    conn.commit()
    return conn


class UserDeleted(Exception):
    """Raised by create() when the user_id was previously soft-deleted.

    Lifts the soft-delete tombstone into a typed exception the route layer
    can map to a 410 Gone (vs a generic 401), so the frontend can show
    'this account was deleted; reconnect a different wallet' instead of
    'login failed'.
    """


def create(user_id: str, password: str) -> str:
    if is_deleted(user_id):
        raise UserDeleted(user_id)
    token = secrets.token_hex(32)
    expires_at = int(time.time()) + SESSION_TTL
    with _db() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, enc_pass, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, _encrypt(password), expires_at),
        )
    return token


def get(token: str) -> dict | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT user_id, enc_pass FROM sessions WHERE token = ? AND expires_at > ?",
            (token, int(time.time())),
        ).fetchone()
        if not row:
            return None
        # If the user was tombstoned via /auth/delete-account, reject — even
        # if the row somehow survived. Belt-and-braces against a partial
        # cascade leaving an orphan session row.
        deleted = conn.execute(
            "SELECT 1 FROM deleted_users WHERE user_id = ?", (row[0],),
        ).fetchone()
    if deleted:
        return None
    return {"user_id": row[0], "password": _decrypt(row[1])}


def delete(token: str) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def delete_all_for_user(user_id: str) -> int:
    """
    Wipe every active session for a user. Used by /auth/delete-account so
    a deleted user can't keep using a token issued before the cascade ran.
    Returns the number of rows deleted (mostly for tests/audit).
    """
    with _db() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        return cur.rowcount or 0


def mark_deleted(user_id: str) -> None:
    """
    Insert a tombstone for a deleted user. Idempotent — re-deleting an
    already-deleted user just bumps the deleted_at timestamp so the
    cascade can be safely retried after a partial failure.
    """
    with _db() as conn:
        conn.execute(
            "INSERT INTO deleted_users (user_id, deleted_at) VALUES (?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET deleted_at = excluded.deleted_at",
            (user_id, int(time.time())),
        )


def is_deleted(user_id: str) -> bool:
    """Did this user_id pass through /auth/delete-account at any point?"""
    with _db() as conn:
        row = conn.execute(
            "SELECT 1 FROM deleted_users WHERE user_id = ?", (user_id,),
        ).fetchone()
    return row is not None
