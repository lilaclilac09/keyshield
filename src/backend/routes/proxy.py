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


router = APIRouter()


@router.api_route(
    "/proxy/{upstream}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
)
async def proxy_route(upstream: str, path: str, request: Request):
    """Stateless proxy: read upstream key from X-Upstream-API-Key header,
    forward one request, return the upstream response. The key is never
    stored or logged, but per-call usage (tokens, cost, latency, status)
    IS recorded against the caller's user_id for the dashboard.
    """
    from ..proxy import api_router
    from ..middleware.auth import get_session_from_request
    from .. import billing

    # Prometheus metrics are opt-in (prometheus_client may not be installed).
    try:
        from ..proxy import metrics as _metrics
    except ImportError:
        _metrics = None

    api_key = request.headers.get("X-Upstream-API-Key")
    if not api_key:
        return JSONResponse(
            {"error": "missing X-Upstream-API-Key"},
            status_code=401,
        )

    sess = get_session_from_request(request)
    user_id = sess["user_id"] if sess else "anonymous"

    body = await request.body()
    method = str(request.method)
    upstream_path = f"/{path}"

    t0 = time.monotonic()
    try:
        content, status, _cache_status = await api_router.call_rest(
            upstream,
            method,
            upstream_path,
            body,
            api_key,
        )
    except ValueError as exc:
        # unknown upstream provider — log the failed attempt then 404
        latency_ms = (time.monotonic() - t0) * 1000
        billing.log_call(
            user_id=user_id,
            upstream=upstream,
            key_type="self_custodian",
            method=method,
            path=upstream_path,
            status_code=404,
            latency_ms=latency_ms,
        )
        return JSONResponse({"error": str(exc)}, status_code=404)

    latency_ms = (time.monotonic() - t0) * 1000
    tokens_in, tokens_out, cost_usd = billing.extract_token_usage(upstream, content)
    billing.log_call(
        user_id=user_id,
        upstream=upstream,
        key_type="self_custodian",
        method=method,
        path=upstream_path,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_usd=cost_usd,
        latency_ms=latency_ms,
        status_code=status,
    )
    if _metrics is not None:
        _metrics.record_proxy(upstream, status, latency_ms / 1000)

    try:
        data = json.loads(content) if content else {}
    except Exception:
        data = {"raw": content.decode("utf-8", errors="replace")}
    return JSONResponse(data, status_code=status)
