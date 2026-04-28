"""
Session 管理：用户登录一次 → 拿到 session token → 后续请求不再传密码。

密码用 SERVER_SECRET 加密后存入 SQLite。
服务重启后 session 仍有效（不用重新登录）。

`caller_id` 是为 slice 3 加的：当一个 agent 用 owner 的密钥登录时，
session.user_id 仍是 owner（vault 解密用 owner 的密码），但
caller_id 记录这是谁在调（用 agent pubkey）。计费根据 caller_id 走，
所以 agent 调用扣 agent 自己的余额，owner 的钱包不动。
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
    # Slice 3: optional caller identity (e.g. agent pubkey). NULL =
    # session represents the owner themselves. Added with ALTER so an
    # existing DB doesn't need a fresh migration.
    cols = {row[1] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()}
    if "caller_id" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN caller_id TEXT")
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
    conn.commit()
    return conn


def create(user_id: str, password: str, caller_id: str | None = None) -> str:
    """
    Create a session for `user_id` (the vault owner). Pass `caller_id`
    when the session is being created on behalf of a non-owner identity
    — typically an agent pubkey from /auth/agent-login. Billing reads
    caller_id when present, so the agent's own balance gets debited.
    """
    token = secrets.token_hex(32)
    expires_at = int(time.time()) + SESSION_TTL
    with _db() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, enc_pass, expires_at, caller_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (token, user_id, _encrypt(password), expires_at, caller_id),
        )
    return token


def get(token: str) -> dict | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT user_id, enc_pass, caller_id FROM sessions "
            "WHERE token = ? AND expires_at > ?",
            (token, int(time.time())),
        ).fetchone()
    if not row:
        return None
    return {
        "user_id":   row[0],
        "password":  _decrypt(row[1]),
        "caller_id": row[2],   # None for owner sessions
    }


def delete(token: str) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
