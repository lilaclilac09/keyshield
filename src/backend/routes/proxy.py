"""Proxy routes — forward to upstream providers.

Path A: keys arrive per-request from the client (decrypted client-side
from R2-stored ciphertext). The server NEVER persists, caches, or logs the
upstream API key. Each /proxy/<upstream>/<path> call MUST include the
header:

    X-Upstream-API-Key: <raw key>

If the header is missing the proxy returns 401. The header value is used
exactly once, for the single upstream call, and then dropped.

See docs/technical/SYNC_VAULT_ARCHITECTURE.md.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


@router.api_route("/proxy/{upstream}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_route(upstream: str, path: str, request: Request):
    """Stateless proxy: read upstream key from X-Upstream-API-Key header,
    forward one request, return the upstream response. The key is never
    stored or logged.
    """
    from ..proxy import api_router

    api_key = request.headers.get("X-Upstream-API-Key")
    if not api_key:
        return JSONResponse(
            {"error": "missing X-Upstream-API-Key"},
            status_code=401,
        )

    body = await request.body()
    try:
        content, status, _cache_status = await api_router.call_rest(
            upstream,
            str(request.method),
            f"/{path}",
            body,
            api_key,
        )
    except ValueError as exc:
        # unknown upstream provider
        return JSONResponse({"error": str(exc)}, status_code=404)

    try:
        data = json.loads(content) if content else {}
    except Exception:
        data = {"raw": content.decode("utf-8", errors="replace")}
    return JSONResponse(data, status_code=status)
