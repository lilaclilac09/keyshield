"""Usage and billing routes."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


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

    return JSONResponse({
        "balance_sol": balance_dict.get("sol_balance", balance_dict.get("balance_sol", 0)),
        "balance_usd": round(float(balance_usd or 0), 6),
        "total_spent_usd": round(total_spent, 6),
        "total_keys_proxied": total_calls,
    })


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
    return JSONResponse({"stats": stats})


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
    return JSONResponse({
        "balance_usd": round(b, 6),
        "total_spent_usd": round(total, 6),
        "free_credit_usd": round(free, 6),
    })


@router.post("/billing/topup")
async def billing_topup(request: Request):
    from ..billing import usage as usage_mod

    body = await request.json()
    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    amount_usd = float(body.get("amount_usd", 0))
    new_balance = usage_mod.topup(user_id, amount_usd)
    new_balance_float = float(new_balance) if not isinstance(new_balance, dict) else float(
        new_balance.get("balance_usd", new_balance.get("usd_balance", 0))
    )
    return JSONResponse({
        "credited_usd": round(amount_usd, 6),
        "balance_usd": round(new_balance_float, 6),
    })
