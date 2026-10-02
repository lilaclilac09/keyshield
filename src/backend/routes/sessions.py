"""Session routes — list and revoke user sessions."""

from __future__ import annotations

import sqlite3
import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod

    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


def _db() -> sqlite3.Connection:
    """Open the sessions database."""
    from ..auth import session as sess_mod

    conn = sqlite3.connect(str(sess_mod.DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def _get_ip(request: Request) -> str:
    """Get client IP, handling proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _get_ua(request: Request) -> str:
    return request.headers.get("User-Agent", "")


def _detect_device(ua: str) -> str:
    ua_lower = ua.lower()
    if any(x in ua_lower for x in ["mobile", "android", "iphone", "ipad"]):
        return "mobile"
    if any(x in ua_lower for x in ["bot", "crawler", "spider"]):
        return "bot"
    return "desktop"


@router.get("/sessions")
async def list_sessions(request: Request):
    """List all active sessions for the authenticated user."""
    sess = _auth(request)
    if not sess:
        return JSONResponse({"detail": "unauthorized"}, status_code=401)

    user_id = sess["user_id"]
    now = int(time.time())
    current_token = request.headers.get("Authorization", "")[7:]

    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT token, user_id, expires_at
            FROM sessions
            WHERE user_id = ? AND expires_at > ?
            ORDER BY expires_at DESC
            """,
            (user_id, now),
        ).fetchall()

        result = []
        for row in rows:
            token_prefix = row["token"][:8] if row["token"] else ""
            result.append(
                {
                    "id": token_prefix,
                    "token_prefix": token_prefix,
                    "user_id": row["user_id"],
                    "ip_address": _get_ip(request),
                    "user_agent": _get_ua(request),
                    "device": _detect_device(_get_ua(request)),
                    "last_active_at": now,
                    "expires_at": row["expires_at"],
                    "is_current": bool(current_token.startswith(token_prefix)),
                }
            )
    finally:
        conn.close()

    return JSONResponse(result)


@router.delete("/sessions/{token_prefix}")
async def revoke_session(token_prefix: str, request: Request):
    """Revoke a session by its token prefix."""
    sess = _auth(request)
    if not sess:
        return JSONResponse({"detail": "unauthorized"}, status_code=401)

    user_id = sess["user_id"]
    current_token = request.headers.get("Authorization", "")[7:]

    # Don't allow revoking the current session
    if current_token.startswith(token_prefix):
        return JSONResponse({"detail": "cannot revoke current session"}, status_code=400)

    conn = _db()
    try:
        # Find the full token that matches the prefix for this user
        row = conn.execute(
            "SELECT token FROM sessions WHERE user_id = ? AND token LIKE ?",
            (user_id, f"{token_prefix}%"),
        ).fetchone()

        if not row:
            return JSONResponse({"detail": "session not found"}, status_code=404)

        conn.execute("DELETE FROM sessions WHERE token = ?", (row["token"],))
        conn.commit()
    finally:
        conn.close()

    return JSONResponse({"ok": True})
