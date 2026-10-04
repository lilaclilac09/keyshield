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


def _mpp_stream_id(request: Request) -> int | None:
    raw = request.headers.get("x-mpp-stream-id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _mpp_acquire_hold(request: Request, user_id: str, upstream: str):
    """Phase 1. Lock the estimated cost before the upstream call.

    BudgetExceeded returns 409 and the caller must not call upstream.
    A missing stream or a closed stream does not block the call; metering
    reports that rejection after the response is in hand.
    """
    stream_id = _mpp_stream_id(request)
    if stream_id is None or not user_id or user_id == "anonymous":
        return None, None
    from ..mpp import mpp_streams
    from ..mpp.fulfillment import FulfillmentRejected

    raw_est = request.headers.get("x-mpp-estimate-micro-usdc")
    estimate = None
    if raw_est is not None and str(raw_est).strip() != "":
        try:
            estimate = int(str(raw_est).strip())
        except ValueError:
            estimate = None
    try:
        held = mpp_streams.hold_estimate(user_id, stream_id, upstream, estimate)
    except mpp_streams.BudgetExceeded:
        return None, JSONResponse(
            {"detail": "BudgetExceeded", "code": "budget_exceeded"},
            status_code=409,
        )
    except (
        mpp_streams.StreamNotFound,
        mpp_streams.StreamClosed,
        FulfillmentRejected,
        ValueError,
    ):
        return None, None
    return held.get("hold_id"), None


def _header_u64(request: Request, name: str) -> int:
    raw = request.headers.get(name)
    if raw is None or str(raw).strip() == "":
        return 0
    try:
        value = int(str(raw).strip())
    except ValueError:
        return 0
    return value if value > 0 else 0


def _velocity_admit(request: Request, user_id: str):
    """Sliding window before the hold and before the upstream call."""
    from ..proxy.velocity import SessionSuspended, VelocityLimited, limiter, session_key

    key = session_key(_bearer(request), user_id)
    try:
        limiter.admit(
            key,
            est_micro=_header_u64(request, "x-mpp-estimate-micro-usdc"),
            est_tokens=_header_u64(request, "x-ks-est-tokens"),
        )
    except SessionSuspended:
        return key, JSONResponse(
            {"detail": "Suspended", "code": "session_suspended"},
            status_code=423,
        )
    except VelocityLimited as exc:
        return key, JSONResponse(
            {"detail": exc.detail, "code": "velocity_limited"},
            status_code=429,
        )
    return key, None


def _velocity_observe(key: str, status: int, content, tokens: int) -> None:
    try:
        from ..proxy.velocity import limiter

        limiter.observe(key, status, content, tokens)
    except Exception as exc:  # noqa: BLE001
        logger.warning("velocity observe failed: %s", exc)


def _mpp_release(user_id: str, stream_id: int | None, hold_id: int | None) -> None:
    if not hold_id or stream_id is None:
        return
    try:
        from ..mpp import mpp_streams

        mpp_streams.release_hold(user_id, stream_id, int(hold_id))
    except Exception as exc:  # noqa: BLE001
        logger.warning("mpp hold release failed stream=%s hold=%s: %s", stream_id, hold_id, exc)


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

    velocity_key, velocity_err = _velocity_admit(request, user_id)
    if velocity_err is not None:
        return velocity_err

    body = await request.body()
    interceptor = _get_x402_interceptor()
    hold_id, hold_err = _mpp_acquire_hold(request, user_id, upstream)
    if hold_err is not None:
        return hold_err
    stream_id = _mpp_stream_id(request)
    t0 = time.perf_counter()

    stream_complete = None
    try:
        if _is_helius(upstream):
            content, status, cache_status = await _proxy_helius(
                api_router, upstream, path, body, api_key, request, interceptor
            )
        else:
            content, status, cache_status, stream_complete = await _call_upstream(
                api_router, upstream, path, body, api_key, request, interceptor
            )
    except PaymentRequired as exc:
        # A 402 challenge is not an upstream 5xx or an empty body.
        _mpp_release(user_id, stream_id, hold_id)
        return JSONResponse(
            {"error": "payment_required", "x402": exc.raw},
            status_code=402,
        )
    except ValueError as exc:
        _mpp_release(user_id, stream_id, hold_id)
        return JSONResponse({"error": str(exc)}, status_code=404)

    if stream_complete is False and not content:
        _mpp_release(user_id, stream_id, hold_id)
        _velocity_observe(velocity_key, 502, b"", 0)
        return JSONResponse({"error": "upstream disconnected"}, status_code=502)

    latency_ms = (time.perf_counter() - t0) * 1000.0

    tokens_total = 0
    try:
        tokens_in, tokens_out, cost_usd = usage_mod.extract_token_usage(upstream, content)
        tokens_total = int(tokens_in or 0) + int(tokens_out or 0)
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
    _velocity_observe(velocity_key, status, content, tokens_total)

    meter_header, bound_hold, artifact_hex, billed_tokens = _mpp_meter_header(
        request,
        user_id,
        upstream,
        status,
        content,
        truncated=stream_complete is False,
        hold_id=hold_id,
    )

    try:
        data = json.loads(content) if isinstance(content, (bytes, bytearray)) else content
    except Exception:
        data = {
            "raw": content.decode("utf-8", errors="replace")
            if isinstance(content, bytes)
            else str(content)
        }

    resp = JSONResponse(data, status_code=status)
    resp.headers["x-ks-cache"] = cache_status
    if stream_complete is not None:
        resp.headers["x-ks-stream-complete"] = "1" if stream_complete else "0"
    if meter_header:
        resp.headers["x-ks-mpp-meter"] = meter_header
    if bound_hold:
        resp.headers["x-ks-mpp-hold"] = str(bound_hold)
    if artifact_hex:
        resp.headers["x-ks-mpp-artifact"] = str(artifact_hex)
    if billed_tokens is not None:
        resp.headers["x-ks-mpp-tokens"] = str(int(billed_tokens))
    return resp


# ─── /vproxy/{upstream}/{path} — vault-key auto-resolve ───────────────────
# Companion route: Bearer token identifies the caller; the upstream API key
# is looked up from the user's vault (vault_items SQLite table) so the
# client never has to send X-Upstream-API-Key. Same path/method semantics
# as /proxy/*, just one less header.
#
# This is the route that the Rust hot-path proxy (ks-proxy) shadows for
# helius via `helius_fast_path`, and that pay.sh's `value_from_env` gateway
# auth pattern routes to. Schema reads `vault_items` written by
# /manage/store — see routes/vault.py.
@router.api_route(
    "/vproxy/{upstream}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
)
async def vault_proxy_route(upstream: str, path: str, request: Request):
    from ..proxy import api_router
    from ..proxy.x402_interceptor import PaymentRequired
    from .vault import _DB_PATH as _VAULT_DB
    import sqlite3

    token = _bearer(request)
    sess = sess_mod.get(token) if token else None
    user_id = (sess or {}).get("user_id") or (sess or {}).get("userId")
    if not user_id:
        # Dev fallback — same opt-in header /manage/* uses.
        if request.headers.get("X-Dev-Mode") == "1":
            user_id = "default"
        elif not token:
            return JSONResponse({"error": "authorization required"}, status_code=401)
        else:
            return JSONResponse({"error": "invalid token"}, status_code=401)

    _VAULT_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_VAULT_DB))
    try:
        row = conn.execute(
            "SELECT value FROM vault_items "
            "WHERE user_id = ? AND upstream = ? AND value != '' "
            "ORDER BY created_at DESC LIMIT 1",
            (user_id, upstream),
        ).fetchone()
    finally:
        conn.close()
    if not row or not row[0]:
        return JSONResponse(
            {"error": f"no {upstream} key in vault — POST /manage/store first"},
            status_code=422,
        )
    api_key = row[0]
    velocity_key, velocity_err = _velocity_admit(request, user_id)
    if velocity_err is not None:
        return velocity_err
    body = await request.body()
    interceptor = _get_x402_interceptor()
    hold_id, hold_err = _mpp_acquire_hold(request, user_id, upstream)
    if hold_err is not None:
        return hold_err
    stream_id = _mpp_stream_id(request)
    t0 = time.perf_counter()

    stream_complete = None
    try:
        if _is_helius(upstream):
            content, status, cache_status = await _proxy_helius(
                api_router, upstream, path, body, api_key, request, interceptor
            )
        else:
            content, status, cache_status, stream_complete = await _call_upstream(
                api_router, upstream, path, body, api_key, request, interceptor
            )
    except PaymentRequired as exc:
        _mpp_release(user_id, stream_id, hold_id)
        return JSONResponse({"error": "payment_required", "x402": exc.raw}, status_code=402)
    except ValueError as exc:
        _mpp_release(user_id, stream_id, hold_id)
        return JSONResponse({"error": str(exc)}, status_code=404)

    if stream_complete is False and not content:
        _mpp_release(user_id, stream_id, hold_id)
        _velocity_observe(velocity_key, 502, b"", 0)
        return JSONResponse({"error": "upstream disconnected"}, status_code=502)

    latency_ms = (time.perf_counter() - t0) * 1000.0
    tokens_total = 0
    try:
        tokens_in, tokens_out, cost_usd = usage_mod.extract_token_usage(upstream, content)
        tokens_total = int(tokens_in or 0) + int(tokens_out or 0)
        usage_mod.log_call(
            user_id=user_id,
            upstream=upstream,
            key_type="vault",
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
    _velocity_observe(velocity_key, status, content, tokens_total)

    meter_header, bound_hold, artifact_hex, billed_tokens = _mpp_meter_header(
        request,
        user_id,
        upstream,
        status,
        content,
        truncated=stream_complete is False,
        hold_id=hold_id,
    )

    try:
        data = json.loads(content) if isinstance(content, (bytes, bytearray)) else content
    except Exception:
        data = {
            "raw": content.decode("utf-8", errors="replace")
            if isinstance(content, bytes)
            else str(content)
        }
    resp = JSONResponse(data, status_code=status)
    resp.headers["x-ks-cache"] = cache_status
    resp.headers["x-ks-key-type"] = "vault"
    if stream_complete is not None:
        resp.headers["x-ks-stream-complete"] = "1" if stream_complete else "0"
    if meter_header:
        resp.headers["x-ks-mpp-meter"] = meter_header
    if bound_hold:
        resp.headers["x-ks-mpp-hold"] = str(bound_hold)
    if artifact_hex:
        resp.headers["x-ks-mpp-artifact"] = str(artifact_hex)
    if billed_tokens is not None:
        resp.headers["x-ks-mpp-tokens"] = str(int(billed_tokens))
    return resp


async def _call_upstream(api_router, upstream, path, body, api_key, request, interceptor):
    """Forward one REST call, streaming when the caller asked for SSE.

    The fourth value is `None` for a buffered body, `True` when a
    stream finished, and `False` when it ended early.
    """
    if api_router.wants_upstream_stream(body, request.headers.get("accept")):
        content, status, cache_status, complete = await api_router.call_rest_streaming(
            upstream,
            str(request.method),
            f"/{path}",
            body,
            api_key,
            interceptor=interceptor,
        )
        return content, status, cache_status, complete
    content, status, cache_status = await api_router.call_rest(
        upstream,
        str(request.method),
        f"/{path}",
        body,
        api_key,
        interceptor=interceptor,
    )
    return content, status, cache_status, None


def _mpp_meter_header(
    request: Request,
    user_id: str,
    upstream: str,
    status: int,
    content: bytes | str,
    truncated: bool = False,
    hold_id: int | None = None,
) -> tuple[str | None, int | None, str | None, int | None]:
    """Bind the phase-1 hold to the response this proxy just observed.

    Present only when the caller sent `X-Mpp-Stream-Id`. A rejected
    fulfillment does not fail the proxy call — the upstream body is
    still returned, and the header says why nothing was billed. The
    estimate lock is released on that path. A successful bind returns
    `held` plus the hold id. Capture is a separate signed step.
    The artifact hash and billed token count are returned so a live
    client can sign the capture MAC without recomputing the preimage.
    """
    raw_id = request.headers.get("x-mpp-stream-id")
    if not raw_id:
        return None, None, None, None
    if not user_id or user_id == "anonymous":
        return "rejected:authentication required", None, None, None
    try:
        stream_id = int(raw_id)
    except (TypeError, ValueError):
        return "rejected:invalid stream id", None, None, None

    from ..mpp import mpp_streams
    from ..mpp.fulfillment import FulfillmentRejected, assert_settlement_artifact

    payload = content if isinstance(content, (bytes, bytearray)) else str(content).encode()
    try:
        recorded = mpp_streams.meter_proxy_response(
            user_id=user_id,
            stream_id=stream_id,
            upstream=upstream,
            status_code=int(status),
            body=payload,
            request_id=request.headers.get("x-idempotency-key"),
            truncated=truncated,
            hold_id=hold_id,
        )
    except FulfillmentRejected as exc:
        logger.info("mpp meter rejected stream=%s: %s", raw_id, exc)
        return f"rejected:{exc.reason}", None, None, None
    except mpp_streams.BudgetExceeded:
        return "rejected:BudgetExceeded", None, None, None
    except mpp_streams.StreamNotFound:
        _mpp_release(user_id, stream_id, hold_id)
        return "rejected:stream not found", None, None, None
    except mpp_streams.StreamClosed:
        return "rejected:stream closed", None, None, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("mpp meter failed stream=%s: %s", raw_id, exc)
        _mpp_release(user_id, stream_id, hold_id)
        return "rejected:meter error", None, None, None
    artifact = recorded.get("artifact_hash")
    tokens = recorded.get("tokens_billed")
    billed = int(tokens) if tokens is not None else None
    try:
        assert_settlement_artifact(artifact)
    except (FulfillmentRejected, TypeError, ValueError):
        _mpp_release(user_id, stream_id, hold_id)
        return "rejected:unverified artifact", None, None, None
    if recorded.get("idempotent_replay"):
        return "idempotent_replay", None, artifact, billed
    bound = recorded.get("hold_id") or hold_id
    return "held", int(bound) if bound else None, artifact, billed


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
        return (
            json.dumps(result).encode(),
            result.get("error") and 400 or 200,
            cache_status,
        )

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
