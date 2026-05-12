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
import logging
import os
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..auth import session as sess_mod
from ..billing import usage as usage_mod

logger = logging.getLogger(__name__)

router = APIRouter()

# ── x402 interceptor (lazy singleton) ─────────────────────────────────────

_x402_interceptor = None
_x402_checked = False


def _get_x402_interceptor():
    """Return a ManualKeypairInterceptor if env vars are present, else None."""
    global _x402_interceptor, _x402_checked
    if _x402_checked:
        return _x402_interceptor
    _x402_checked = True
    kp = os.getenv("KS_X402_HOT_KEYPAIR_B58", "").strip()
    hk = os.getenv("HELIUS_API_KEY", "").strip()
    if kp and hk:
        try:
            from ..proxy.x402_interceptor import ManualKeypairInterceptor
            _x402_interceptor = ManualKeypairInterceptor(kp, hk)
            logger.info("x402 ManualKeypairInterceptor loaded")
        except Exception as exc:
            logger.warning("x402 interceptor init failed: %s", exc)
    return _x402_interceptor


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


def _is_helius(upstream: str) -> bool:
    return upstream in ("helius", "helius-rpc", "helius-das", "helius-enhanced")


@router.api_route(
    "/proxy/{upstream}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
)
async def proxy_route(upstream: str, path: str, request: Request):
    """Stateless proxy: read upstream key from X-Upstream-API-Key header,
    forward one request, return the upstream response. The key is never
    stored or logged.

    For `upstream=helius`, auto-detects JSON-RPC and dispatches via
    call_helius() which routes to the correct Helius surface (RPC / DAS /
    Enhanced) based on the RPC method name.
    """
    from ..proxy import api_router
    from ..proxy.x402_interceptor import PaymentRequired

    api_key = request.headers.get("X-Upstream-API-Key")
    if not api_key:
        return JSONResponse(
            {"error": "missing X-Upstream-API-Key"},
            status_code=401,
        )

    sess = sess_mod.get(_bearer(request) or "") or {}
    user_id = sess.get("user_id") or sess.get("userId") or "anonymous"

    body = await request.body()
    interceptor = _get_x402_interceptor()
    t0 = time.perf_counter()

    try:
        if _is_helius(upstream):
            content, status, cache_status = await _proxy_helius(
                api_router, upstream, path, body, api_key, request, interceptor
            )
        else:
            content, status, cache_status = await api_router.call_rest(
                upstream,
                str(request.method),
                f"/{path}",
                body,
                api_key,
                interceptor=interceptor,
            )
    except PaymentRequired as exc:
        return JSONResponse(
            {"error": "payment_required", "x402": exc.raw},
            status_code=402,
        )
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)

    latency_ms = (time.perf_counter() - t0) * 1000.0

    try:
        tokens_in, tokens_out, cost_usd = usage_mod.extract_token_usage(upstream, content)
        usage_mod.log_call(
            user_id=user_id,
            upstream=upstream,
            key_type="user",
            method=str(request.method),
            path=f"/{path}",
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            status_code=status,
        )
    except Exception:
        pass

    try:
        data = json.loads(content) if isinstance(content, (bytes, bytearray)) else content
    except Exception:
        data = {"raw": content.decode("utf-8", errors="replace") if isinstance(content, bytes) else str(content)}

    resp = JSONResponse(data, status_code=status)
    resp.headers["x-ks-cache"] = cache_status
    return resp


async def _proxy_helius(api_router, upstream, path, body, api_key, request, interceptor):
    """Route Helius calls: JSON-RPC bodies go through call_helius() for
    smart sub-provider routing + caching; everything else falls through
    to call_rest on helius-rpc."""
    parsed = None
    if body:
        try:
            parsed = json.loads(body)
        except Exception:
            pass

    if parsed and isinstance(parsed, dict) and "method" in parsed:
        rpc_method = parsed["method"]
        rpc_params = parsed.get("params", [])
        rpc_id = parsed.get("id", 1)
        result, cache_status = await api_router.call_helius(
            rpc_method, rpc_params, api_key, rpc_id, interceptor=interceptor
        )
        return json.dumps(result).encode(), result.get("error") and 400 or 200, cache_status

    # Non-JSON-RPC: fall through to REST on the specific helius sub-provider
    provider = upstream if upstream.startswith("helius-") else "helius-rpc"
    content, status, cache_status = await api_router.call_rest(
        provider,
        str(request.method),
        f"/{path}",
        body,
        api_key,
        interceptor=interceptor,
    )
    return content, status, cache_status
