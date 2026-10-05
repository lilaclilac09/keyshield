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

        current_token = request.headers.get("Authorization", "")[7:]
        ip = _get_ip(request)
        ua = _get_ua(request)
        device = _detect_device(ua)
        result = []
        saw_current = False
        for row in rows:
            token = row["token"] or ""
            token_prefix = token[-8:] if len(token) >= 8 else token
            is_current = bool(token) and token == current_token
            saw_current = saw_current or is_current
            result.append(
                {
                    "id": token_prefix,
                    "token_id": token_prefix,
                    "user_id": row["user_id"],
                    "ip": ip,
                    "ip_address": ip,
                    "user_agent": ua,
                    "device": device,
                    "device_label": device,
                    "last_seen_at": now,
                    "last_active_at": now,
                    "expires_at": row["expires_at"],
                    "is_current": is_current,
                }
            )
        if current_token and not saw_current:
            result.insert(
                0,
                {
                    "id": current_token[-8:] if len(current_token) >= 8 else current_token,
                    "token_id": current_token[-8:] if len(current_token) >= 8 else current_token,
                    "user_id": user_id,
                    "ip": ip,
                    "ip_address": ip,
                    "user_agent": ua,
                    "device": device,
                    "device_label": device,
                    "last_seen_at": now,
                    "last_active_at": now,
                    "expires_at": sess.get("expires_at") or now + 86400,
                    "is_current": True,
                },
            )
    finally:
        conn.close()

    return JSONResponse({"sessions": result})


@router.post("/sessions/{token_prefix}/revoke")
@router.delete("/sessions/{token_prefix}")
async def revoke_session(token_prefix: str, request: Request):
    """Revoke a session by its token prefix."""
    sess = _auth(request)
    if not sess:
        return JSONResponse({"detail": "unauthorized"}, status_code=401)

    user_id = sess["user_id"]
    current_token = request.headers.get("Authorization", "")[7:]

    if current_token.startswith(token_prefix) or current_token.endswith(token_prefix):
        return JSONResponse({"detail": "cannot revoke current session"}, status_code=400)

    conn = _db()
    try:
        row = conn.execute(
            """
            SELECT token FROM sessions
             WHERE user_id = ? AND (token LIKE ? OR token LIKE ?)
            """,
            (user_id, f"{token_prefix}%", f"%{token_prefix}"),
        ).fetchone()

        if not row:
            return JSONResponse({"detail": "session not found"}, status_code=404)

        conn.execute("DELETE FROM sessions WHERE token = ?", (row["token"],))
        conn.commit()
    finally:
        conn.close()

    return JSONResponse({"ok": True})
