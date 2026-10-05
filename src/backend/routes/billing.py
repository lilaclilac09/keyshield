"""Usage and billing routes."""

import os
import time

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
    rows = stats.get("stats", []) if isinstance(stats, dict) else stats
    return JSONResponse({"stats": rows})


@router.get("/usage/history")
async def usage_history(request: Request):
    from ..billing import usage as usage_mod

    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    try:
        limit = int(request.query_params.get("limit", 50))
    except (TypeError, ValueError):
        limit = 50
    history = usage_mod.get_history(user_id, limit)
    return JSONResponse({"history": history})


@router.get("/billing/balance")
async def billing_balance(request: Request):
    from ..billing import usage as usage_mod

    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"
    balance_usd = usage_mod.get_balance(user_id)
    stats = usage_mod.get_stats(user_id)
    rows = stats.get("stats", []) if isinstance(stats, dict) else []
    spent = sum((row.get("cost_usd") or 0) for row in rows)
    if isinstance(balance_usd, dict):
        b = float(balance_usd.get("balance_usd", balance_usd.get("usd_balance", 0)))
        total = float(balance_usd.get("total_spent_usd", spent))
        free = float(balance_usd.get("free_credit_usd", usage_mod.FREE_CREDIT_USD))
    else:
        b = float(balance_usd or 0)
        total = float(spent)
        free = float(usage_mod.FREE_CREDIT_USD)
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


def _payment_address() -> str:
    raw = os.environ.get("PAYMENT_ADDRESS_SOLANA", "").strip()
    if raw:
        return raw
    from ..mpp import owner_keystore

    status = owner_keystore.owner_status()
    if status.get("loaded") and status.get("pubkey"):
        return str(status["pubkey"])
    return ""


def _rpc_url() -> str:
    return (
        os.environ.get("SOLANA_RPC_URL", "").strip()
        or os.environ.get("KS_SOLANA_RPC_URL", "").strip()
        or "https://api.devnet.solana.com"
    )


def _usdc_mint(rpc_url: str) -> str:
    override = os.environ.get("KS_USDC_MINT", "").strip()
    if override:
        return override
    from ..billing.billing_solana import USDC_MINT_DEVNET, USDC_MINT_MAINNET

    return USDC_MINT_DEVNET if "devnet" in rpc_url else USDC_MINT_MAINNET


def _max_topup_usd() -> float:
    try:
        return float(os.environ.get("MAX_TOPUP_USD", "10"))
    except (TypeError, ValueError):
        return 10.0


@router.get("/billing/sol-quote")
async def billing_sol_quote(request: Request):
    """Pyth (or KS_SOL_USD_PRICE) quote for Phantom SystemProgram.transfer."""
    from ..billing import billing_solana

    try:
        amount_usd = float(request.query_params.get("amount_usd", "0"))
    except (TypeError, ValueError):
        return JSONResponse({"detail": "amount_usd required"}, status_code=400)
    if amount_usd <= 0:
        return JSONResponse({"detail": "amount_usd must be > 0"}, status_code=400)
    ceiling = _max_topup_usd()
    if amount_usd > ceiling:
        return JSONResponse(
            {"detail": f"amount_usd exceeds MAX_TOPUP_USD={ceiling}"},
            status_code=400,
        )
    pay_to = _payment_address()
    if not pay_to:
        return JSONResponse(
            {"detail": "PAYMENT_ADDRESS_SOLANA unset"},
            status_code=503,
        )
    override = os.environ.get("KS_SOL_USD_PRICE", "").strip()
    try:
        if override:
            price = float(override)
            publish_time = int(time.time())
        else:
            px = await billing_solana.fetch_sol_usd_price()
            price = float(px.price_usd)
            publish_time = int(px.publish_time)
    except billing_solana.PaymentVerificationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    if price <= 0:
        return JSONResponse({"detail": "invalid SOL/USD price"}, status_code=502)
    amount_sol = amount_usd / price
    lamports = int(round(amount_sol * 1_000_000_000))
    sess = _auth(request)
    memo = billing_solana.issue_topup_memo(sess["user_id"]) if sess else None
    return JSONResponse(
        {
            "amount_usd": round(amount_usd, 6),
            "amount_sol": round(amount_sol, 9),
            "amount_lamports": lamports,
            "sol_usd_price": price,
            "price_publish_time": publish_time,
            "valid_for_secs": 60,
            "payment_address": pay_to,
            "memo": memo,
            "cluster": "devnet" if "devnet" in _rpc_url() else "mainnet",
        }
    )


@router.get("/billing/topup-history")
async def billing_topup_history(request: Request):
    from ..billing import usage as usage_mod

    sess = _auth(request)
    if not sess:
        return JSONResponse({"detail": "unauthorized"}, status_code=401)
    try:
        limit = int(request.query_params.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    return JSONResponse({"topups": usage_mod.list_topups(sess["user_id"], limit)})


@router.post("/billing/topup-solana")
async def billing_topup_solana(request: Request):
    from ..billing import billing_solana, usage as usage_mod

    sess = _auth(request)
    if not sess:
        return JSONResponse({"detail": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "invalid json"}, status_code=400)
    tx_sig = str(body.get("tx_signature") or body.get("txSignature") or "").strip()
    if not tx_sig:
        return JSONResponse({"detail": "tx_signature required"}, status_code=400)
    pay_to = _payment_address()
    if not pay_to:
        return JSONResponse({"detail": "PAYMENT_ADDRESS_SOLANA unset"}, status_code=503)
    sender = str(body.get("wallet") or sess["user_id"]).strip()
    rpc = _rpc_url()
    commitment = "finalized" if body.get("finalized") else "confirmed"
    try:
        tx = await billing_solana.get_transaction(rpc, tx_sig, commitment=commitment)
        lamports = billing_solana.find_sol_transfer(tx, sender, pay_to)
        memo = body.get("memo")
        if memo:
            billing_solana.verify_topup_memo(str(memo), sess["user_id"])
        override = os.environ.get("KS_SOL_USD_PRICE", "").strip()
        if override:
            price = float(override)
        else:
            price = float((await billing_solana.fetch_sol_usd_price()).price_usd)
        credited_usd = lamports / 1_000_000_000 * price
        expected = body.get("expected_amount_usd")
        if expected is not None:
            try:
                slip = abs(credited_usd - float(expected)) / max(float(expected), 1e-9)
            except (TypeError, ValueError):
                slip = 1.0
            tol = float(os.environ.get("SOL_PRICE_SLIPPAGE", "0.05"))
            if slip > tol:
                return JSONResponse(
                    {"detail": "slippage exceeds SOL_PRICE_SLIPPAGE"},
                    status_code=400,
                )
        if credited_usd > _max_topup_usd():
            return JSONResponse(
                {"detail": "credited amount exceeds MAX_TOPUP_USD"}, status_code=400
            )
        balance = usage_mod.credit_solana_topup(
            sess["user_id"],
            tx_sig,
            asset="SOL",
            amount_atoms=lamports,
            amount_usd=credited_usd,
        )
        if memo:
            billing_solana.consume_topup_memo(str(memo))
    except usage_mod.TopupAlreadyCredited:
        return JSONResponse({"detail": "tx already credited"}, status_code=409)
    except billing_solana.PaymentVerificationError as exc:
        msg = str(exc)
        code = 404 if "not found" in msg or "not confirmed" in msg else 400
        return JSONResponse({"detail": msg}, status_code=code)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return JSONResponse(
        {
            "credited_atoms": lamports,
            "credited_unit": "lamports",
            "credited_usd": round(credited_usd, 6),
            "balance_usd": round(float(balance), 6),
            "tx_signature": tx_sig,
            "sol_usd_price": price,
            "commitment": commitment,
        }
    )


@router.post("/billing/topup-solana-usdc")
async def billing_topup_solana_usdc(request: Request):
    from ..billing import billing_solana, usage as usage_mod

    sess = _auth(request)
    if not sess:
        return JSONResponse({"detail": "unauthorized"}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "invalid json"}, status_code=400)
    tx_sig = str(body.get("tx_signature") or body.get("txSignature") or "").strip()
    if not tx_sig:
        return JSONResponse({"detail": "tx_signature required"}, status_code=400)
    pay_to = _payment_address()
    if not pay_to:
        return JSONResponse({"detail": "PAYMENT_ADDRESS_SOLANA unset"}, status_code=503)
    sender = str(body.get("wallet") or sess["user_id"]).strip()
    rpc = _rpc_url()
    network = str(body.get("network") or ("devnet" if "devnet" in rpc else "mainnet"))
    mint = _usdc_mint(rpc if network != "mainnet" else "mainnet")
    try:
        tx = await billing_solana.get_transaction(rpc, tx_sig)
        atoms = billing_solana.find_usdc_transfer(tx, sender, pay_to, usdc_mint=mint)
        credited_usd = atoms / 1_000_000
        if credited_usd > _max_topup_usd():
            return JSONResponse(
                {"detail": "credited amount exceeds MAX_TOPUP_USD"}, status_code=400
            )
        balance = usage_mod.credit_solana_topup(
            sess["user_id"],
            tx_sig,
            asset="USDC",
            amount_atoms=atoms,
            amount_usd=credited_usd,
        )
    except usage_mod.TopupAlreadyCredited:
        return JSONResponse({"detail": "tx already credited"}, status_code=409)
    except billing_solana.PaymentVerificationError as exc:
        msg = str(exc)
        code = 404 if "not found" in msg or "not confirmed" in msg else 400
        return JSONResponse({"detail": msg}, status_code=code)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return JSONResponse(
        {
            "credited_atoms": atoms,
            "credited_unit": "usdc-6dp",
            "credited_usd": round(credited_usd, 6),
            "balance_usd": round(float(balance), 6),
            "tx_signature": tx_sig,
            "network": network,
        }
    )
