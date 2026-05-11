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
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..auth import session as sess_mod
from ..billing import usage as usage_mod


router = APIRouter()


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


@router.api_route(
    "/proxy/{upstream}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
)
async def proxy_route(upstream: str, path: str, request: Request):
    """Stateless proxy: read upstream key from X-Upstream-API-Key header,
    forward one request, return the upstream response. The key is never
    stored or logged. The CALL ITSELF (no plaintext key, no body) IS logged
    to the usage table so /usage/stats and the Activity dashboard can show
    real-time consumption.
    """
    from ..proxy import api_router

    api_key = request.headers.get("X-Upstream-API-Key")
    if not api_key:
        return JSONResponse(
            {"error": "missing X-Upstream-API-Key"},
            status_code=401,
        )

    # Resolve calling user from session (best-effort — anonymous calls
    # still proxy successfully but won't show in their usage history).
    sess = sess_mod.get(_bearer(request) or "") or {}
    user_id = sess.get("user_id") or sess.get("userId") or "anonymous"

    body = await request.body()
    t0 = time.perf_counter()
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
    latency_ms = (time.perf_counter() - t0) * 1000.0

    # Record usage. extract_token_usage parses provider-specific shapes
    # (OpenAI usage.{prompt,completion}_tokens, Anthropic usage.input/output, etc).
    try:
        tokens_in, tokens_out, cost_usd = usage_mod.extract_token_usage(upstream, content)
        usage_mod.log_call(
            user_id=user_id,
            upstream=upstream,
            key_type="user",  # X-Upstream-API-Key path = user-supplied key, not platform
            method=str(request.method),
            path=f"/{path}",
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            status_code=status,
        )
    except Exception:
        # Usage logging must never break the proxy hot path.
        pass

    try:
        data = json.loads(content) if content else {}
    except Exception:
        data = {"raw": content.decode("utf-8", errors="replace")}
    return JSONResponse(data, status_code=status)
