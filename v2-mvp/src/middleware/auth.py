"""Auth middleware — shared helper for routes."""
from __future__ import annotations

from functools import wraps
from typing import Callable, Awaitable, Any
from fastapi import Request, HTTPException


def _auth(request: Request) -> dict | None:
    """Extract session from request. Returns None if not authenticated."""
    from ..auth import session as sess_mod
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


def require_auth(f: Callable) -> Callable:
    """Decorator — requires authentication, raises 401 if missing."""
    @wraps(f)
    async def wrapper(request: Request, *args, **kwargs):
        token = request.headers.get("Authorization", "")
        from ..auth import session as sess_mod
        sess_info = sess_mod.get(token[7:]) if token.startswith("Bearer ") else None
        if not sess_info:
            raise HTTPException(status_code=401, detail="not authenticated")
        return await f(request, sess_info, *args, **kwargs)
    return wrapper


def get_session_from_request(request: Request) -> dict | None:
    """Get session info from a FastAPI request."""
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    from ..auth import session as sess_mod
    return sess_mod.get(token[7:])
