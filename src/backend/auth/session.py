"""
Session management — self-contained tokens with HMAC expiry.

Security upgrades:
  - Tokens are now JWT-like: they carry their own expiry and HMAC signature,
    so a token survives server restarts (no dependency on the DB being up).
  - The session DB stores only user metadata (userId, enc_password) for
    auth operations that need the password (e.g., store_key, decrypt_key).
  - Token format: ksv2_<base64_payload>.<hmac> (public) / <base64_payload>.<hmac> (stored)
    where payload = {"uid":..., "exp":..., "iat":...}
  - HMAC key is derived from SERVER_SECRET (configurable via env).
  - Both the prefixed public form and the unprefixed canonical form are accepted.

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
TOKEN_PREFIX = "ksv2_"


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


def canonical_token(token: str) -> str:
    """Strip the public ``ksv2_`` prefix. Stored rows use this form."""
    if token.startswith(TOKEN_PREFIX):
        return token[len(TOKEN_PREFIX) :]
    return token


def public_token(token: str) -> str:
    """Mint/return the documented public form ``ksv2_<payload>.<hmac>``."""
    canon = canonical_token(token)
    return f"{TOKEN_PREFIX}{canon}"


def _b64json(payload_str: str) -> dict:
    padding = "=" * ((4 - len(payload_str) % 4) % 4)
    return json.loads(urlsafe_b64decode(payload_str + padding))


def _hmac_ok(payload_str: str, sig: str) -> bool:
    expected = _sign_token(payload_str)
    try:
        return _hmac.compare_digest(sig, expected)
    except ValueError:
        return False


def _decode_payload(token: str) -> dict | None:
    """HMAC-verify and JSON-decode a public or canonical token. No expiry check."""
    if not token:
        return None
    canon = canonical_token(token)
    if "." not in canon:
        return None
    payload_str, sig = canon.rsplit(".", 1)
    if not _hmac_ok(payload_str, sig):
        return None
    try:
        return _b64json(payload_str)
    except Exception:
        return None


def _make_token_payload(
    user_id: str,
    expires_at: int,
    *,
    aid: int | None = None,
    provider: str | None = None,
    scope: list[str] | str | None = None,
    spend_cap_usd: float | None = None,
    vault_key_id: str | None = None,
) -> str:
    """Create base64-encoded JSON payload."""
    now = int(time.time())
    payload: dict = {
        "uid": user_id,
        "exp": expires_at,
        "iat": now,
        "nbf": now,
    }
    if aid is not None:
        payload["aid"] = int(aid)
    if provider:
        payload["provider"] = str(provider)
    if scope is not None:
        payload["scope"] = scope
    if spend_cap_usd is not None:
        payload["spend_cap_usd"] = float(spend_cap_usd)
    if vault_key_id:
        payload["vault_key_id"] = str(vault_key_id)
    return urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


def _sign_token(payload: str) -> str:
    """HMAC-SHA256 signature of the payload."""
    sig = _hmac.new(_server_secret(), payload.encode(), hashlib.sha256).digest()
    return urlsafe_b64encode(sig).decode().rstrip("=")


def create_token(
    user_id: str,
    password: str,
    ttl: int = SESSION_TTL,
    *,
    aid: int | None = None,
    provider: str | None = None,
    scope: list[str] | str | None = None,
    spend_cap_usd: float | None = None,
    vault_key_id: str | None = None,
) -> str:
    """
    Create a self-contained session token.

    Public token format: ksv2_<payload>.<hmac>
    Stored (canonical) form: <payload>.<hmac> — both proxies strip the prefix.

    Payload contains: uid, exp, iat, nbf, plus optional delegated claims
    (aid, provider, scope, spend_cap_usd, vault_key_id).
    HMAC verifies the payload hasn't been tampered with.

    The password is encrypted and stored in the DB for auth operations that need it.
    """
    expires_at = int(time.time()) + ttl
    payload = _make_token_payload(
        user_id,
        expires_at,
        aid=aid,
        provider=provider,
        scope=scope,
        spend_cap_usd=spend_cap_usd,
        vault_key_id=vault_key_id,
    )
    sig = _sign_token(payload)
    canonical = f"{payload}.{sig}"

    # Store the unprefixed form so Rust/Python lookups share one key.
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
            (canonical, user_id, _encrypt(password), expires_at),
        )
    return public_token(canonical)


def get(token: str) -> dict | None:
    """
    Validate and return session info.

    Checks:
      1. Token format (payload.hmac)
      2. HMAC signature validity (hasn't been tampered with)
      3. Expiry (not past `exp`)
      4. User not soft-deleted

    Returns: {"user_id": str, "password": str} on success.
    """
    data = _decode_payload(token)
    if not data:
        return None

    now = int(time.time())
    if now > data.get("exp", 0):
        return None  # expired
    if now < data.get("nbf", 0):
        return None  # not yet valid

    user_id = data["uid"]
    canon = canonical_token(token)

    # Check if user was soft-deleted (belt-and-braces)
    with _db() as conn:
        deleted = conn.execute(
            "SELECT 1 FROM deleted_users WHERE user_id = ?", (user_id,)
        ).fetchone()
        if deleted:
            return None

        # Accept public, canonical, or a legacy row stored with the prefixed form.
        row = conn.execute(
            "SELECT enc_pass FROM sessions WHERE token IN (?, ?) AND expires_at > ?",
            (canon, token, now),
        ).fetchone()

    if not row:
        return None

    aid = data.get("aid")
    if aid is not None:
        from ..agents import agents as agents_mod

        try:
            if agents_mod.is_revoked(int(aid)):
                return None
        except (TypeError, ValueError):
            return None

    sess = {"user_id": user_id, "password": _decrypt(row[0]), "iat": data.get("iat")}
    for key in ("aid", "provider", "scope", "spend_cap_usd", "vault_key_id"):
        if key in data:
            sess[key] = data[key]
    return sess


def verify_token(token: str) -> tuple[bool, Optional[str]]:
    """
    Verify token without loading from DB. Returns (valid, error_reason).

    Use this when the server is in read-only mode or during migration.
    Error reasons: "expired", "tampered", "malformed", "deleted"
    """
    data = _decode_payload(token)
    if not data:
        if not token or "." not in canonical_token(token):
            return False, "malformed"
        return False, "tampered"

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
    canon = canonical_token(token)
    with _db() as conn:
        conn.execute(
            "DELETE FROM sessions WHERE token IN (?, ?)",
            (canon, token),
        )


def delete_for_provider(user_id: str, provider: str) -> int:
    """Revoke every session whose payload ``provider`` claim matches.

    Owner-wide tokens (no ``provider`` claim) are left intact. Returns the
    number of rows deleted.
    """
    want = (provider or "").strip().lower()
    if not user_id or not want:
        return 0
    deleted = 0
    with _db() as conn:
        rows = conn.execute("SELECT token FROM sessions WHERE user_id = ?", (user_id,)).fetchall()
        for (tok,) in rows:
            data = _decode_payload(tok)
            if not data:
                continue
            claim = str(data.get("provider") or "").strip().lower()
            if claim == want:
                conn.execute("DELETE FROM sessions WHERE token = ?", (tok,))
                deleted += 1
    return deleted


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
    canon = canonical_token(token)
    with _db() as conn:
        cur = conn.execute(
            "UPDATE sessions SET expires_at = expires_at + ? WHERE token IN (?, ?)",
            (extra_secs, canon, token),
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


# Backward compat — server.py and tests import `session.create`
create = create_token
