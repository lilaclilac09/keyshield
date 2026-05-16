"""Usage, billing, and pricing routes."""

import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()

# ─── Pricing store (simple SQLite) ────────────────────────────────────────

_PRICING_DB = Path(__file__).parent.parent / "data" / "pricing.db"

_VALID_UPSTREAMS = {
    "openai", "anthropic", "groq", "mistral", "cohere",
    "helius", "alchemy", "0x", "titan", "pyth",
}


def _pricing_db() -> sqlite3.Connection:
    _PRICING_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_PRICING_DB), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pricing (
            user_id   TEXT NOT NULL,
            upstream  TEXT NOT NULL,
            price_usd REAL NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, upstream)
        )
    """)
    conn.commit()
    return conn


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod

    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


# ─── Frontend-compatible endpoints ─────────────────────────────────────


@router.get("/billing")
async def billing_info(request: Request):
    """GET /billing — returns the shape the frontend dashboard expects."""
    from ..billing import usage as usage_mod

    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"

    # `get_balance` returns a float (USD), `get_stats` returns
    # {"stats": [...]} keyed per-upstream. Normalize to the dashboard shape.
    balance_usd = usage_mod.get_balance(user_id)
    if isinstance(balance_usd, dict):
        # Defensive: support a future dict-shaped balance.
        balance_dict = balance_usd
        balance_usd = balance_dict.get("balance_usd", balance_dict.get("usd_balance", 0))
    else:
        balance_dict = {}

    stats = usage_mod.get_stats(user_id)
    stats_rows = stats.get("stats", []) if isinstance(stats, dict) else []

    total_spent = sum((row.get("cost_usd") or 0) for row in stats_rows)
    total_calls = sum((row.get("calls") or 0) for row in stats_rows)

    return JSONResponse(
        {
            "balance_sol": balance_dict.get("sol_balance", balance_dict.get("balance_sol", 0)),
            "balance_usd": round(float(balance_usd or 0), 6),
            "total_spent_usd": round(total_spent, 6),
            "total_keys_proxied": total_calls,
        }
    )


@router.get("/billing/usage")
async def billing_usage(request: Request):
    """GET /billing/usage?limit=N — usage history."""
    from ..billing import usage as usage_mod

    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    history = usage_mod.get_history(user_id)
    return JSONResponse({"history": history})


# ─── Legacy endpoints (keep for backward compat) ────────────────────────


@router.get("/usage/stats")
async def usage_stats(request: Request):
    from ..billing import usage as usage_mod

    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    stats = usage_mod.get_stats(user_id)
    return JSONResponse(stats)


@router.get("/usage/history")
async def usage_history(request: Request):
    from ..billing import usage as usage_mod

    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    history = usage_mod.get_history(user_id)
    return JSONResponse({"history": history})


@router.get("/billing/balance")
async def billing_balance(request: Request):
    from ..billing import usage as usage_mod

    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    balance_usd = usage_mod.get_balance(user_id)
    if isinstance(balance_usd, dict):
        b = float(balance_usd.get("balance_usd", balance_usd.get("usd_balance", 0)))
        total = float(balance_usd.get("total_spent_usd", 0))
        free = float(balance_usd.get("free_credit_usd", 0))
    else:
        b = float(balance_usd or 0)
        total = 0.0
        free = 0.0
    return JSONResponse(
        {
            "balance_usd": round(b, 6),
            "total_spent_usd": round(total, 6),
            "free_credit_usd": round(free, 6),
        }
    )


@router.post("/billing/topup")
async def billing_topup(request: Request):
    from ..billing import usage as usage_mod

    body = await request.json()
    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    amount_usd = float(body.get("amount_usd", 0))
    new_balance = usage_mod.topup(user_id, amount_usd)
    new_balance_float = (
        float(new_balance)
        if not isinstance(new_balance, dict)
        else float(new_balance.get("balance_usd", new_balance.get("usd_balance", 0)))
    )
    return JSONResponse(
        {
            "credited_usd": round(amount_usd, 6),
            "balance_usd": round(new_balance_float, 6),
        }
    )


# ─── Pricing CRUD ─────────────────────────────────────────────────────────


@router.get("/billing/pricing")
async def pricing_list(request: Request):
    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    conn = _pricing_db()
    try:
        rows = conn.execute(
            "SELECT upstream, price_usd, updated_at FROM pricing WHERE user_id = ? ORDER BY upstream",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    return JSONResponse({
        "pricing": [
            {"upstream": r[0], "price_usd": r[1], "updated_at": r[2]}
            for r in rows
        ]
    })


@router.put("/billing/pricing/{upstream}")
async def pricing_set(upstream: str, request: Request):
    if upstream not in _VALID_UPSTREAMS:
        return JSONResponse({"error": f"unknown upstream: {upstream}"}, status_code=404)
    body = await request.json()
    price = body.get("price_usd")
    if price is None or float(price) < 0:
        return JSONResponse({"error": "price_usd must be >= 0"}, status_code=400)
    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    conn = _pricing_db()
    try:
        conn.execute(
            "INSERT INTO pricing (user_id, upstream, price_usd, updated_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(user_id, upstream) DO UPDATE SET price_usd=excluded.price_usd, updated_at=excluded.updated_at",
            (user_id, upstream, float(price), int(time.time())),
        )
        conn.commit()
    finally:
        conn.close()
    return JSONResponse({"ok": True, "upstream": upstream, "price_usd": float(price)})


@router.delete("/billing/pricing/{upstream}")
async def pricing_clear(upstream: str, request: Request):
    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    conn = _pricing_db()
    try:
        conn.execute(
            "DELETE FROM pricing WHERE user_id = ? AND upstream = ?",
            (user_id, upstream),
        )
        conn.commit()
    finally:
        conn.close()
    return JSONResponse({"ok": True})
