"""Auth routes — login, logout, wallet, passkey, delete-account."""

from __future__ import annotations

import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..auth import session as sess_mod


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
    if not sess_mod._validate_challenge(challenge):
        return JSONResponse({"error": "challenge expired or used"}, status_code=400)
    token = sess_mod.create_token(wallet_addr, passphrase)
    sess_mod._consume_nonce(challenge)
    return JSONResponse({"token": token, "userId": wallet_addr})


@router.post("/auth/agent-challenge")
async def agent_challenge():
    nonce = str(hash(time.time()))
    sess_mod._record_nonce(nonce)
    return JSONResponse({"challenge": nonce, "nonce": nonce})


@router.post("/auth/agent-login")
async def agent_login(request: Request):
    import base64
    import logging
    from ..agents import agents as agents_mod

    body = await request.json()
    pubkey_b58: str = body.get("pubkeyB58", "")
    challenge: str = body.get("challenge", "")
    nonce: str = body.get("nonce", "")
    signature: str | None = body.get("signature")  # base64-encoded Ed25519 sig

    agent_info = agents_mod.lookup_owner(pubkey_b58)
    if not agent_info:
        return JSONResponse({"error": "agent not registered"}, status_code=401)

    if signature is None:
        # Dev-mode: no signature provided — allow but warn
        logging.getLogger(__name__).warning(
            "agent-login for %s accepted without signature verification (dev mode)",
            pubkey_b58,
        )
    else:
        # Validate the challenge was actually issued by us
        if not sess_mod._validate_challenge(challenge, nonce):
            return JSONResponse({"error": "challenge expired or not recognised"}, status_code=401)

        # Verify Ed25519 signature: agent signed the raw challenge bytes
        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
            from cryptography.exceptions import InvalidSignature
            import base58 as _base58

            pubkey_bytes = _base58.b58decode(pubkey_b58)
            ed_pubkey = Ed25519PublicKey.from_public_bytes(pubkey_bytes)
            sig_bytes = base64.b64decode(signature)
            challenge_bytes = challenge.encode("utf-8")
            ed_pubkey.verify(sig_bytes, challenge_bytes)
        except ImportError as exc:
            logging.getLogger(__name__).error("Ed25519 verification dependency missing: %s", exc)
            return JSONResponse({"error": "server crypto dependency missing"}, status_code=500)
        except (InvalidSignature, Exception) as exc:
            logging.getLogger(__name__).warning(
                "agent-login signature verification failed for %s: %s", pubkey_b58, exc
            )
            return JSONResponse({"error": "signature verification failed"}, status_code=401)

        # Consume the nonce to prevent replay
        sess_mod._consume_nonce(nonce or challenge)

    token = sess_mod.create_token(agent_info["owner_wallet"], "default")
    return JSONResponse({"token": token})
