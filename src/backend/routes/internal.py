"""Internal bridge routes — Rust ks-proxy ↔ Python control plane.

Spec: src/proxy/specs/07-bridge.md

These endpoints are NOT public. Rust sends `X-Internal-Secret: <KS_INTERNAL_SECRET>`
on every call. Mismatch → 401. Empty secret → 503 (fail closed).

  GET  /_internal/balance/<user_id>  → {"balance_usd": float}
  POST /_internal/log                  → {"ingested": int}
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

router = APIRouter()


def _internal_secret() -> str:
    return os.getenv("KS_INTERNAL_SECRET", "").strip()


def _require_internal(request: Request) -> JSONResponse | None:
    """Return an error response when the caller is not the Rust bridge."""
    secret = _internal_secret()
    if not secret:
        return JSONResponse(
            {"error": "KS_INTERNAL_SECRET not configured"},
            status_code=503,
        )
    header = request.headers.get("X-Internal-Secret", "")
    if header != secret:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return None


class LogEntry(BaseModel):
    user_id: str
    upstream: str
    key_type: str = "platform"
    method: str = ""
    path: str = ""
    tok_in: int = Field(default=0, ge=0)
    tok_out: int = Field(default=0, ge=0)
    cost: float = Field(default=0.0, ge=0.0)
    latency_ms: float = Field(default=0.0, ge=0.0)
    status: int = Field(default=0, ge=0)


class LogBatchBody(BaseModel):
    entries: list[LogEntry] = Field(default_factory=list)


@router.get("/_internal/balance/{user_id}")
async def internal_balance(user_id: str, request: Request):
    """Balance read for Rust x402 gate (platform-key path).

    404 when the user has no balance row — Rust treats that as 0.0.
    """
    from ..billing import usage as usage_mod

    err = _require_internal(request)
    if err is not None:
        return err

    balance = usage_mod.get_balance_if_exists(user_id)
    if balance is None:
        return JSONResponse({"error": "user not found"}, status_code=404)

    return JSONResponse({"balance_usd": balance})


@router.post("/_internal/log")
async def internal_log(request: Request):
    """Buffered usage-log ingest from Rust LogBuffer."""
    from ..billing import usage as usage_mod

    err = _require_internal(request)
    if err is not None:
        return err

    body = await request.json()
    parsed = LogBatchBody.model_validate(body)
    ingested = usage_mod.log_batch(
        [
            {
                "user_id": e.user_id,
                "upstream": e.upstream,
                "key_type": e.key_type,
                "method": e.method,
                "path": e.path,
                "tokens_in": e.tok_in,
                "tokens_out": e.tok_out,
                "cost_usd": e.cost,
                "latency_ms": e.latency_ms,
                "status_code": e.status,
            }
            for e in parsed.entries
        ]
    )
    return JSONResponse({"ingested": ingested})
