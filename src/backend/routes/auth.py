"""Auth routes — login, logout, wallet, passkey, delete-account."""

from __future__ import annotations

import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..auth import session as sess_mod
from ..auth import passkey as pk_mod


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
    user_id = body.get("userId")
    if not user_id:
        return JSONResponse({"error": "userId required"}, status_code=400)
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
    import base64
    import logging
    from ..agents import agents as agents_mod

    body = await request.json()
    pubkey_b58: str = body.get("pubkeyB58", "")
    challenge: str = body.get("challenge", "")
    nonce: str = body.get("nonce", "")
    signature: str | None = body.get("signature")

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
        if not sess_mod._validate_challenge(challenge, nonce):
            return JSONResponse({"error": "challenge expired or not recognised"}, status_code=401)
        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
            from cryptography.exceptions import InvalidSignature
            import base58 as _base58

            pubkey_bytes = _base58.b58decode(pubkey_b58)
            ed_pubkey = Ed25519PublicKey.from_public_bytes(pubkey_bytes)
            sig_bytes = base64.b64decode(signature)
            ed_pubkey.verify(sig_bytes, challenge.encode("utf-8"))
        except ImportError as exc:
            logging.getLogger(__name__).error("Ed25519 verification dependency missing: %s", exc)
            return JSONResponse({"error": "server crypto dependency missing"}, status_code=500)
        except (InvalidSignature, Exception) as exc:
            logging.getLogger(__name__).warning(
                "agent-login signature verification failed for %s: %s", pubkey_b58, exc
            )
            return JSONResponse({"error": "signature verification failed"}, status_code=401)
        sess_mod._consume_nonce(nonce or challenge)

    token = sess_mod.create_token(agent_info["owner_wallet"], "default")
    return JSONResponse({"token": token})


# ─── Passkey routes (WebAuthn) ──────────────────────────────────


@router.get("/auth/passkey/register-options")
async def passkey_register_options(request: Request):
    """Generate registration options for the currently-authenticated user."""
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    opts = pk_mod.registration_options(user_id, display_name="Device Vault")
    return JSONResponse(opts)


@router.post("/auth/passkey/register-verify")
async def passkey_register_verify(request: Request):
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    body = await request.json()
    try:
        out = pk_mod.registration_verify(
            user_id, body["credential"], body.get("name", "Passkey")
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return JSONResponse({"ok": True, **out})


@router.get("/auth/passkey/auth-options")
async def passkey_auth_options(user_id: str):
    """Unauthenticated — used by login flow."""
    try:
        opts = pk_mod.authentication_options(user_id)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return JSONResponse(opts)


@router.post("/auth/passkey/auth-verify")
async def passkey_auth_verify(request: Request, user_id: str, passphrase: str = "default"):
    """Verify the assertion and mint a session token (Path A login)."""
    body = await request.json()
    try:
        pk_mod.authentication_verify(user_id, body.get("credential", body))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    token = sess_mod.create_token(user_id, passphrase)
    return JSONResponse({"token": token, "userId": user_id})


@router.get("/auth/passkey/list")
async def passkey_list(request: Request):
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    return JSONResponse(pk_mod.list_credentials(user_id))


@router.delete("/auth/passkey/{cred_id}")
async def passkey_delete(cred_id: str, request: Request):
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    pk_mod.delete_credential(user_id, cred_id)
    return JSONResponse({"ok": True})


# ─── Delete-account ──────────────────────────────────────────────


@router.post("/auth/delete-account-challenge")
async def delete_account_challenge(request: Request):
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    nonce = str(hash(time.time()))
    sess_mod._record_nonce(nonce)
    return JSONResponse({"challenge": nonce, "nonce": nonce})


@router.post("/auth/delete-account")
async def delete_account(request: Request):
    """Hard-delete: drop all sessions for the user. Wallet/passkey artifacts
    on the device are wiped client-side."""
    token = _bearer(request)
    sess = await _session(token)
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    sess_mod.mark_deleted(user_id)
    sess_mod.delete_all_for_user(user_id)
    return JSONResponse({"ok": True})
