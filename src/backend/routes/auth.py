"""Auth routes — login, logout, wallet, passkey, delete-account."""

from __future__ import annotations

import base64
import secrets
from urllib.parse import urlparse

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


def _origin_rp_id(request: Request) -> tuple[str | None, list[str] | None]:
    """Derive WebAuthn rp_id + allowed origins from the request's Origin
    header. WebAuthn requires rp_id to match the page hostname — for
    multi-deployment setups (localhost + Vercel + custom domain) deriving
    it per-request beats hardcoding a single env var. Returns (None, None)
    if no Origin header — caller falls back to env defaults.
    """
    origin = request.headers.get("Origin")
    if not origin:
        return None, None
    host = urlparse(origin).hostname
    if not host:
        return None, None
    return host, [origin]


# ─── Auth routes ────────────────────────────────────────────────


@router.post("/auth/login")
async def auth_login(request: Request):
    # Dev-only shim disabled in production — use /auth/wallet-login or /auth/passkey/auth-verify.
    return JSONResponse({"error": "direct login disabled; use wallet or passkey"}, status_code=403)


@router.post("/auth/logout")
async def auth_logout(request: Request):
    token = _bearer(request)
    if token:
        sess_mod.delete(token)
    return JSONResponse({"ok": True})


@router.get("/auth/wallet-challenge")
async def wallet_challenge():
    nonce = secrets.token_hex(32)
    sess_mod._record_nonce(nonce)
    return JSONResponse({"challenge": nonce, "nonce": nonce})


@router.post("/auth/wallet-login")
async def wallet_login(request: Request):
    body = await request.json()
    wallet_addr = body.get("walletAddress", "")
    challenge = body.get("challenge", "")
    passphrase = body.get("passphrase", "")
    signature_b64 = body.get("signature", "")
    nonce = str(body.get("nonce", challenge))

    if not sess_mod._validate_challenge(challenge, nonce):
        return JSONResponse({"error": "challenge expired or used"}, status_code=400)

    # Verify ed25519 signature: wallet signed the challenge bytes
    if signature_b64 and wallet_addr:
        try:
            from nacl.signing import VerifyKey
            import base58 as _b58

            sig_bytes = base64.b64decode(signature_b64 + "==")
            # Decode base58 pubkey → raw 32 bytes, then build VerifyKey
            vk = VerifyKey(_b58.b58decode(wallet_addr))
            vk.verify(challenge.encode(), sig_bytes)
        except Exception as _e:
            return JSONResponse({"error": f"signature verification failed: {_e}"}, status_code=401)

    token = sess_mod.create_token(wallet_addr, passphrase)
    sess_mod._consume_nonce(nonce)
    return JSONResponse({"token": token, "userId": wallet_addr})


@router.post("/auth/agent-challenge")
async def agent_challenge():
    nonce = secrets.token_hex(32)
    sess_mod._record_nonce(nonce)
    return JSONResponse({"challenge": nonce, "nonce": nonce})


@router.post("/auth/agent-login")
async def agent_login(request: Request):
    body = await request.json()
    from ..agents import agents as agents_mod

    pubkey_b58 = body.get("pubkeyB58", "")
    challenge = body.get("challenge", "")
    signature_b64 = body.get("signature", "")
    nonce = str(body.get("nonce", challenge))

    if not sess_mod._validate_challenge(challenge, nonce):
        return JSONResponse({"error": "challenge expired or not found"}, status_code=401)

    agent_info = agents_mod.lookup_owner(pubkey_b58)
    if not agent_info:
        return JSONResponse({"error": "agent not registered"}, status_code=401)

    # Verify ed25519 signature
    if signature_b64:
        try:
            from nacl.signing import VerifyKey
            import base58 as _b58

            sig_bytes = base64.b64decode(signature_b64 + "==")
            vk = VerifyKey(_b58.b58decode(pubkey_b58))
            vk.verify(challenge.encode(), sig_bytes)
        except Exception as _e:
            return JSONResponse({"error": f"signature verification failed: {_e}"}, status_code=401)
    else:
        return JSONResponse({"error": "signature required"}, status_code=401)

    sess_mod._consume_nonce(nonce)
    # Carry the agent's registered scopes into the token. A delegated agent
    # only reaches scope-gated endpoints (e.g. POST /agent/execute) if its
    # scopes include "*" or "agent:exec"; a "proxy"-only bot is confined to
    # the pass-through proxy and cannot run code on the host.
    token = sess_mod.create_token(
        agent_info["owner_wallet"], "default", scopes=agent_info.get("scopes", "")
    )
    return JSONResponse({"token": token})


# ─── Passkey routes (WebAuthn) ──────────────────────────────────


@router.get("/auth/passkey/register-options")
async def passkey_register_options(request: Request):
    """Generate registration options for the currently-authenticated user."""
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    rp_id, _ = _origin_rp_id(request)
    opts = pk_mod.registration_options(user_id, display_name="Device Vault", rp_id=rp_id)
    return JSONResponse(opts)


@router.post("/auth/passkey/register-verify")
async def passkey_register_verify(request: Request):
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    body = await request.json()
    rp_id, origins = _origin_rp_id(request)
    try:
        out = pk_mod.registration_verify(
            user_id,
            body["credential"],
            body.get("name", "Passkey"),
            rp_id=rp_id,
            expected_origin=origins,
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return JSONResponse({"ok": True, **out})


@router.get("/auth/passkey/auth-options")
async def passkey_auth_options(user_id: str, request: Request):
    """Unauthenticated — used by login flow."""
    rp_id, _ = _origin_rp_id(request)
    try:
        opts = pk_mod.authentication_options(user_id, rp_id=rp_id)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    return JSONResponse(opts)


@router.post("/auth/passkey/auth-verify")
async def passkey_auth_verify(request: Request, user_id: str, passphrase: str = ""):
    """Verify the assertion and mint a session token (Path A login).

    `passphrase` may be supplied either as a query param (legacy) or inside
    the JSON body as `{ passphrase, credential }` — body takes precedence.
    """
    body = await request.json()
    # Body passphrase overrides URL query param (security: avoid leaking in logs)
    effective_passphrase = body.get("passphrase", passphrase) or ""
    rp_id, origins = _origin_rp_id(request)
    try:
        pk_mod.authentication_verify(
            user_id,
            body.get("credential", body),
            rp_id=rp_id,
            expected_origin=origins,
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    token = sess_mod.create_token(user_id, effective_passphrase)
    return JSONResponse({"token": token, "userId": user_id})


@router.get("/auth/passkey/list")
async def passkey_list(request: Request):
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    return JSONResponse({"credentials": pk_mod.list_credentials(user_id)})


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
    nonce = secrets.token_hex(32)
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
