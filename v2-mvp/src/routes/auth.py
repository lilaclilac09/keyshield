"""Auth routes — login, logout, wallet, passkey, delete-account."""
from __future__ import annotations

import time
import json as _json

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse

from ..auth import session as sess_mod
from ..vault import vault
from ..proxy import api_router


router = APIRouter()

# ─── Helpers ──────────────────────────────────────────────────────

def _bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


async def _session(token: str) -> dict | None:
    if not token:
        return None
    return sess_mod.get(token)


# ─── Auth routes ────────────────────────────────────────────────

@router.post("/auth/login")
async def auth_login(request: Request):
    body = await request.json()
    user_id = body["userId"]
    password = body.get("password", "default")
    token = sess_mod.create_token(user_id, password)
    return JSONResponse({"token": token})


@router.post("/auth/logout")
async def auth_logout(request: Request):
    token = _bearer(request)
    if token:
        sess_mod.delete(token)
    return JSONResponse({"ok": True})


@router.get("/auth/wallet-challenge")
async def wallet_challenge():
    nonce = str(hash(time.time()))
    sess_mod._record_nonce(nonce)
    return JSONResponse({"challenge": nonce, "nonce": nonce})


@router.post("/auth/wallet-login")
async def wallet_login(request: Request):
    body = await request.json()
    wallet_addr = body["walletAddress"]
    challenge = body["challenge"]
    passphrase = body["passphrase"]
    if not sess_mod._validate_challenge(challenge, str(body.get("nonce", ""))):
        return JSONResponse({"error": "challenge expired or used"}, status_code=400)
    token = sess_mod.create_token(wallet_addr, passphrase)
    sess_mod._consume_nonce(str(body.get("nonce")))
    return JSONResponse({"token": token, "userId": wallet_addr})


@router.post("/auth/agent-challenge")
async def agent_challenge():
    nonce = str(hash(time.time()))
    sess_mod._record_nonce(nonce)
    return JSONResponse({"challenge": nonce, "nonce": nonce})


@router.post("/auth/agent-login")
async def agent_login(request: Request):
    body = await request.json()
    from ..agents import agents as agents_mod
    agent_info = agents_mod.lookup_owner(body["pubkeyB58"])
    if not agent_info:
        return JSONResponse({"error": "agent not registered"}, status_code=401)
    token = sess_mod.create_token(agent_info["owner_wallet"], "default")
    return JSONResponse({"token": token})
