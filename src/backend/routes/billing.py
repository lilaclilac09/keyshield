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
    balance = usage_mod.get_balance(user_id)
    return JSONResponse({"balance": balance})


@router.post("/billing/topup")
async def billing_topup(request: Request):
    from ..billing import usage as usage_mod

    body = await request.json()
    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    new_balance = usage_mod.topup(user_id, body.get("amount_usd", 0))
    return JSONResponse({"balance": new_balance})
