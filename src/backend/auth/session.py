"""
Session management — self-contained tokens with HMAC expiry.

Security upgrades:
  - Tokens are now JWT-like: they carry their own expiry and HMAC signature,
    so a token survives server restarts (no dependency on the DB being up).
  - The session DB stores only user metadata (userId, enc_password) for
    auth operations that need the password (e.g., store_key, decrypt_key).
  - Token format: <base64_payload>.<hmac> where payload = {"uid":..., "exp":..., "iat":...}
  - HMAC key is derived from SERVER_SECRET (configurable via env).

Token lifecycle:
  1. User logs in → server issues token with HMAC
  2. Client uses token for all requests
  3. Token expires at `exp` time (checked by client + server)
  4. On logout or delete-account, token becomes invalid immediately

Usage:
  >>> from src.session import create, get
  >>> token = create("alice", "my_password")
  >>> sess = get(token)  # {"user_id": "alice", "password": "my_password"}
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import json
import os
import sqlite3
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from pathlib import Path
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DB_PATH = Path(__file__).parent.parent / "sessions.db"
SESSION_TTL = 24 * 3600  # 24 hours

# Token scopes. "owner" is a signed-in user (passkey, wallet or password
# login) and may manage the vault. "proxy" is for agents and developer
# tokens: it can call /proxy and /vproxy but never read, store or decrypt
# vault items, manage sessions or register agents. The scope is a signed
# claim (`scp`) in the token payload, so it can't be edited client-side.
SCOPE_OWNER = "owner"
SCOPE_PROXY = "proxy"
_SCOPES = (SCOPE_OWNER, SCOPE_PROXY)
# Agent tokens issued before scopes existed carry no `scp` claim. They were
# always created with this stored password (routes/auth.py agent-login),
# which is how get() recognises them and downgrades them to "proxy".
_LEGACY_AGENT_PASSWORD = "default"


def _db() -> sqlite3.Connection:
    """Open the sessions database. Shared with legacy session.create()."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL,
            enc_pass   BLOB NOT NULL,
            expires_at INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS deleted_users (
            user_id    TEXT PRIMARY KEY,
            deleted_at INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS credentials (
            user_id       TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            created_at    INTEGER NOT NULL
        )
    """)
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
    conn.commit()
    return conn


_DEFAULT_SECRET = "CHANGE-ME-IN-PROD-32-BYTES-MIN!!"


def _server_secret() -> bytes:
    """Get the HMAC key from env. Warns loudly if default is used."""
    raw = os.getenv("SERVER_SECRET", "")
    if not raw:
        import warnings

        warnings.warn(
            "SERVER_SECRET env var is not set — using insecure default. "
            "Set SERVER_SECRET to a random 32+ byte string in production.",
            stacklevel=2,
        )
        raw = _DEFAULT_SECRET
    return hashlib.sha256(raw.encode()).digest()


class UserDeleted(Exception):
    """Raised when user was soft-deleted via /auth/delete-account."""


def _encrypt(plaintext: str) -> bytes:
    nonce = os.urandom(12)
    ct = AESGCM(_server_secret()).encrypt(nonce, plaintext.encode(), None)
    return nonce + ct


def _decrypt(data: bytes) -> str:
    nonce, ct = data[:12], data[12:]
    return AESGCM(_server_secret()).decrypt(nonce, ct, None).decode()


# ─── Token format ──────────────────────────────────────────────────────────


def _make_token_payload(
    user_id: str, expires_at: int, scope: str = SCOPE_OWNER, agent_id: int | None = None
) -> str:
    """Create base64-encoded JSON payload."""
    claims = {
        "uid": user_id,
        "exp": expires_at,
        "iat": int(time.time()),
        "nbf": int(time.time()),  # not-before (now),
        "scp": scope,
    }
    if agent_id is not None:
        claims["agt"] = int(agent_id)  # which registered agent signed in (usage attribution)
    payload = json.dumps(claims)
    return urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def _sign_token(payload: str) -> str:
    """HMAC-SHA256 signature of the payload."""
    sig = _hmac.new(_server_secret(), payload.encode(), hashlib.sha256).digest()
    return urlsafe_b64encode(sig).decode().rstrip("=")


def create_token(
    user_id: str,
    password: str,
    ttl: int = SESSION_TTL,
    scope: str = SCOPE_OWNER,
    agent_id: int | None = None,
) -> str:
    """
    Create a self-contained session token.

    Token format: <payload>.<hmac>
    Payload contains: uid (user_id), exp (expiry epoch), iat (issued_at), nbf (not_before)
    HMAC verifies the payload hasn't been tampered with.

    The password is encrypted and stored in the DB for auth operations that need it.
    """
    if scope not in _SCOPES:
        raise ValueError(f"unknown token scope: {scope!r}")
    expires_at = int(time.time()) + ttl
    payload = _make_token_payload(user_id, expires_at, scope, agent_id)
    sig = _sign_token(payload)
    token = f"{payload}.{sig}"

    # Store password in DB (needed for key management operations)
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO sessions (token, user_id, enc_pass, expires_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(token) DO UPDATE SET
                user_id = excluded.user_id,
                enc_pass = excluded.enc_pass,
                expires_at = excluded.expires_at
        """,
            (token, user_id, _encrypt(password), expires_at),
        )
    return token


def get(token: str) -> dict | None:
    """
    Validate and return session info.

    Checks:
      1. Token format (payload.hmac)
      2. HMAC signature validity (hasn't been tampered with)
      3. Expiry (not past `exp`)
      4. User not soft-deleted

    Returns: {"user_id": str, "password": str, "scope": str} on success.
    """
    if not token or "." not in token:
        return None

    parts = token.rsplit(".", 1)
    payload_str, sig = parts[0], parts[1]

    # Verify HMAC
    expected_sig = _sign_token(payload_str)
    if not _hmac.compare_digest(sig, expected_sig):
        return None

    # Decode payload and check expiry
    padding = "=" * (4 - len(payload_str) % 4) if len(payload_str) % 4 else ""
    try:
        data = json.loads(urlsafe_b64decode(payload_str + padding))
    except Exception:
        return None

    now = int(time.time())
    if now > data.get("exp", 0):
        return None  # expired
    if now < data.get("nbf", 0):
        return None  # not yet valid

    user_id = data["uid"]

    # Check if user was soft-deleted (belt-and-braces)
    with _db() as conn:
        deleted = conn.execute(
            "SELECT 1 FROM deleted_users WHERE user_id = ?", (user_id,)
        ).fetchone()
        if deleted:
            return None

    # Get encrypted password from DB
    with _db() as conn:
        row = conn.execute(
            "SELECT enc_pass FROM sessions WHERE token = ? AND expires_at > ?",
            (token, now),
        ).fetchone()

    if not row:
        return None

    password = _decrypt(row[0])
    scope = data.get("scp")
    if scope not in _SCOPES:
        # Pre-scope token: agent-login tokens become proxy-only, everything
        # else stays an owner session so signed-in users aren't logged out.
        scope = SCOPE_PROXY if password == _LEGACY_AGENT_PASSWORD else SCOPE_OWNER
    return {
        "user_id": user_id,
        "password": password,
        "scope": scope,
        "expires_at": int(data.get("exp", 0)),
        "agent_id": data.get("agt") if isinstance(data.get("agt"), int) else None,
    }


def is_owner(sess: dict | None) -> bool:
    """True when the session may manage the vault (see SCOPE_OWNER)."""
    return bool(sess) and sess.get("scope", SCOPE_OWNER) == SCOPE_OWNER


def verify_token(token: str) -> tuple[bool, Optional[str]]:
    """
    Verify token without loading from DB. Returns (valid, error_reason).

    Use this when the server is in read-only mode or during migration.
    Error reasons: "expired", "tampered", "malformed", "deleted"
    """
    if not token or "." not in token:
        return False, "malformed"

    parts = token.rsplit(".", 1)
    payload_str, sig = parts[0], parts[1]

    expected_sig = _sign_token(payload_str)
    if not _hmac.compare_digest(sig, expected_sig):
        return False, "tampered"

    padding = "=" * (4 - len(payload_str) % 4) if len(payload_str) % 4 else ""
    try:
        data = json.loads(urlsafe_b64decode(payload_str + padding))
    except Exception:
        return False, "malformed"

    now = int(time.time())
    if now > data.get("exp", 0):
        return False, "expired"
    if now < data.get("nbf", 0):
        return False, "not_yet_valid"

    # Check deletion (best-effort, DB may be unavailable)
    try:
        with _db() as conn:
            deleted = conn.execute(
                "SELECT 1 FROM deleted_users WHERE user_id = ?", (data["uid"],)
            ).fetchone()
            if deleted:
                return False, "deleted"
    except Exception:
        pass  # DB unavailable — trust the token

    return True, None


def delete(token: str) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def delete_all_for_user(user_id: str) -> int:
    with _db() as conn:
        cur = conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        return cur.rowcount or 0


def mark_deleted(user_id: str) -> None:
    with _db() as conn:
        conn.execute(
            "INSERT INTO deleted_users (user_id, deleted_at) VALUES (?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET deleted_at = excluded.deleted_at",
            (user_id, int(time.time())),
        )


def is_deleted(user_id: str) -> bool:
    with _db() as conn:
        row = conn.execute("SELECT 1 FROM deleted_users WHERE user_id = ?", (user_id,)).fetchone()
    return row is not None


def extend_token(token: str, extra_secs: int = 86400) -> bool:
    """Extend token expiry by extra_secs. Returns True if extended."""
    with _db() as conn:
        cur = conn.execute(
            "UPDATE sessions SET expires_at = expires_at + ? WHERE token = ?",
            (extra_secs, token),
        )
        return cur.rowcount > 0


# ─── One-time-use challenge nonces ───────────────────────────────────────
# Used by the wallet-login / agent-login / delete-account challenge flow:
#   1. Server records a nonce when issuing a challenge
#   2. Client signs the challenge and posts it back along with the nonce
#   3. Server validates the nonce was issued and not yet consumed
#   4. Server consumes the nonce so the same challenge can't be replayed
#
# Stored in-memory (good enough for a single-process dev backend; nonces
# expire after NONCE_TTL seconds either way).

NONCE_TTL = 300  # 5 minutes
_nonce_store: dict[str, int] = {}  # nonce -> created_at epoch


def _gc_nonces(now: int | None = None) -> None:
    """Drop expired nonces."""
    cutoff = (now or int(time.time())) - NONCE_TTL
    expired = [n for n, ts in _nonce_store.items() if ts < cutoff]
    for n in expired:
        _nonce_store.pop(n, None)


def _record_nonce(nonce: str) -> None:
    """Record a freshly-issued challenge nonce."""
    if not nonce:
        return
    _gc_nonces()
    _nonce_store[str(nonce)] = int(time.time())


def _validate_challenge(challenge: str, nonce: str) -> bool:
    """Return True if the nonce is recorded and not yet consumed.

    The current flow uses ``challenge == nonce`` (see routes/auth.py),
    so this just verifies the nonce is in the store and not stale.
    """
    if not nonce:
        return False
    _gc_nonces()
    ts = _nonce_store.get(str(nonce))
    if ts is None:
        return False
    if int(time.time()) - ts > NONCE_TTL:
        _nonce_store.pop(str(nonce), None)
        return False
    # If a challenge string is also passed, require it to match the nonce
    # (current callers always pass the same value for both).
    if challenge and str(challenge) != str(nonce):
        return False
    return True


def _consume_nonce(nonce: str) -> bool:
    """Mark a nonce as used. Returns True if it was present."""
    if not nonce:
        return False
    return _nonce_store.pop(str(nonce), None) is not None


# ─── Registered password (userId + password login) ────────────────────────
# First successful /auth/login stores a PBKDF2 hash. Later logins must match.
# Wallet / passkey paths do not write this table.

_PBKDF2_ITERS = 210_000
_HASH_ALGO = "pbkdf2_sha256"


def _b64(data: bytes) -> str:
    return urlsafe_b64encode(data).decode().rstrip("=")


def _b64d(raw: str) -> bytes:
    pad = "=" * ((4 - len(raw) % 4) % 4)
    return urlsafe_b64decode(raw + pad)


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERS)
    return f"{_HASH_ALGO}${_PBKDF2_ITERS}${_b64(salt)}${_b64(dk)}"


def _verify_password_hash(password: str, stored: str) -> bool:
    try:
        algo, iters_s, salt_b64, hash_b64 = stored.split("$", 3)
        if algo != _HASH_ALGO:
            return False
        expected = _b64d(hash_b64)
        got = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            _b64d(salt_b64),
            int(iters_s),
        )
        return _hmac.compare_digest(got, expected)
    except Exception:
        return False


def has_password(user_id: str) -> bool:
    if not user_id:
        return False
    with _db() as conn:
        row = conn.execute("SELECT 1 FROM credentials WHERE user_id = ?", (user_id,)).fetchone()
    return row is not None


def register_password(user_id: str, password: str) -> bool:
    """Store a password hash if this userId has none. Returns True if created."""
    if not user_id or not password:
        return False
    with _db() as conn:
        row = conn.execute("SELECT 1 FROM credentials WHERE user_id = ?", (user_id,)).fetchone()
        if row:
            return False
        conn.execute(
            "INSERT INTO credentials (user_id, password_hash, created_at) VALUES (?, ?, ?)",
            (user_id, _hash_password(password), int(time.time())),
        )
    return True


def verify_password(user_id: str, password: str) -> bool:
    if not user_id or not password:
        return False
    with _db() as conn:
        row = conn.execute(
            "SELECT password_hash FROM credentials WHERE user_id = ?", (user_id,)
        ).fetchone()
    if not row:
        return False
    return _verify_password_hash(password, row[0])


# Backward compat — server.py and tests import `session.create`
create = create_token
