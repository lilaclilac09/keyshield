"""Auth routes — login, logout, wallet, passkey, delete-account."""

from __future__ import annotations

import base64
import secrets
from urllib.parse import urlparse

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..auth import session as sess_mod
from ..auth import passkey as pk_mod
from ..auth import ratelimit as rl_mod


router = APIRouter()

# ─── Helpers ──────────────────────────────────────────────────────


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


async def _session(token: str) -> dict | None:
    if not token:
        return None
    return sess_mod.get(token)


_HOSTED_PASSKEY_ORIGINS = (
    "https://app.ks.aileena.xyz",
    "https://ks.aileena.xyz",
)


def _passkey_json_error(exc: Exception, status: int = 400):
    code = getattr(exc, "code", "") or ""
    raw = getattr(exc, "message", None) or str(exc)
    if code == pk_mod._NO_PASSKEY or "no passkey enrolled" in raw:
        status = 404
        detail = (
            "Face ID / Touch ID is saved on this Mac, but the server has no "
            "matching passkey for this account (common after a deploy). Use a "
            "different wallet, sign in, then enroll passkey again."
        )
        code = code or pk_mod._NO_PASSKEY
    elif (
        code == pk_mod._CHALLENGE_GONE
        or "challenge expired" in raw
        or "challenge" in raw
        and "not found" in raw
    ):
        detail = (
            "Passkey challenge expired — tap Sign In again. Your fingerprint "
            "is still on this device."
        )
        code = code or pk_mod._CHALLENGE_GONE
    elif code == pk_mod._UNKNOWN_CRED or "unknown credential" in raw:
        status = 401
        detail = (
            "Face ID worked, but this fingerprint is not the passkey stored "
            "for this account. Forget this device, sign in with wallet, then "
            "enroll passkey again."
        )
        code = code or pk_mod._UNKNOWN_CRED
    else:
        detail = raw
    return JSONResponse(
        {"error": raw, "detail": detail, "code": code or "passkey_failed"},
        status_code=status,
    )


def _origin_rp_id(request: Request) -> tuple[str | None, list[str] | None]:
    """Derive WebAuthn rp_id + allowed origins from the request's Origin
    header. WebAuthn requires rp_id to match the page hostname — for
    multi-deployment setups (localhost + Vercel + custom domain) deriving
    it per-request beats hardcoding a single env var. Returns (None, None)
    if no Origin header — caller falls back to env defaults.
    """
    origin = (request.headers.get("Origin") or "").strip()
    host = urlparse(origin).hostname if origin else None
    origins: list[str] = []
    if origin:
        origins.append(origin)
    for extra in (*pk_mod.ORIGIN, *_HOSTED_PASSKEY_ORIGINS):
        if extra and extra not in origins:
            origins.append(extra)
    if not host:
        return None, origins or None
    return host, origins


# ─── Auth routes ────────────────────────────────────────────────


def _auth_error(message: str, status: int) -> JSONResponse:
    """SDK reads `detail`; the dashboard reads `error`."""
    return JSONResponse({"error": message, "detail": message}, status_code=status)


@router.post("/auth/login")
async def auth_login(request: Request):
    """Registered userId + password opens a session.

    First login for a userId stores the password hash. Later logins must
    match that hash. Wallet and passkey stay available; this path is for
    SDK / CLI / the AuthScreen password form.
    """
    try:
        body = await request.json()
    except Exception:
        return _auth_error("invalid json", 400)
    if not isinstance(body, dict):
        return _auth_error("userId and password required", 400)
    user_id = str(body.get("userId") or body.get("user_id") or "").strip()
    password = body.get("password")
    if not isinstance(password, str):
        password = "" if password is None else str(password)
    if not user_id or not password:
        return _auth_error("userId and password required", 400)
    if sess_mod.is_deleted(user_id):
        return _auth_error("account deleted", 403)
    if sess_mod.has_password(user_id):
        if not sess_mod.verify_password(user_id, password):
            return _auth_error("invalid credentials", 401)
        registered = False
    else:
        sess_mod.register_password(user_id, password)
        registered = True
    token = sess_mod.create_token(user_id, password)
    return JSONResponse({"token": token, "userId": user_id, "registered": registered})


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


@router.get("/auth/demo-status")
async def auth_demo_status():
    from .. import demo as demo_mod

    return JSONResponse(demo_mod.demo_status())


@router.post("/auth/demo-session")
async def auth_demo_session():
    """KS_DEMO_MODE only. Owner keystore signs a wallet-login challenge."""
    import base64

    from .. import demo as demo_mod
    from ..mpp import owner_keystore

    if not demo_mod.demo_enabled():
        return JSONResponse(
            {"error": "demo mode disabled; set KS_DEMO_MODE=1"},
            status_code=403,
        )
    try:
        nonce = secrets.token_hex(32)
        sess_mod._record_nonce(nonce)
        wallet_addr, signature = demo_mod.sign_wallet_challenge(nonce)
    except owner_keystore.OwnerKeystoreError:
        return JSONResponse({"error": "owner keystore unavailable"}, status_code=503)
    except Exception:
        return JSONResponse({"error": "owner keystore unavailable"}, status_code=503)

    try:
        from nacl.signing import VerifyKey
        import base58 as _b58

        vk = VerifyKey(_b58.b58decode(wallet_addr))
        vk.verify(nonce.encode(), signature)
    except Exception as exc:
        return JSONResponse(
            {"error": f"signature verification failed: {exc}"},
            status_code=401,
        )

    token = sess_mod.create_token(wallet_addr, "")
    sess_mod._consume_nonce(nonce)
    agent = demo_mod.seed_demo_agent(wallet_addr)
    status = demo_mod.demo_status()
    return JSONResponse(
        {
            "token": token,
            "userId": wallet_addr,
            "demo": True,
            "agent": agent,
            "upstream": status["upstream"],
            "model": status["model"],
            "openrouter_key_configured": status["openrouter_key_configured"],
            "signature": base64.b64encode(signature).decode("ascii"),
        }
    )


@router.post("/demo/upstream-key")
async def demo_upstream_key(request: Request):
    """Paste an OpenRouter (or other) key into the server vault. Demo only.

    The key is stored under the session user. The response never echoes it.
    This is not a public proxy — callers still need a demo session.
    """
    from .. import demo as demo_mod

    if not demo_mod.demo_enabled():
        return JSONResponse({"error": "demo mode disabled"}, status_code=403)
    sess = await _session(_bearer(request) or "")
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    body = await request.json()
    api_key = (body.get("apiKey") or body.get("api_key") or body.get("value") or "").strip()
    upstream = (body.get("upstream") or demo_mod.DEMO_UPSTREAM).strip() or demo_mod.DEMO_UPSTREAM
    if not api_key:
        return JSONResponse({"error": "apiKey required"}, status_code=400)
    user_id = sess.get("user_id") or sess.get("userId")
    item_id = demo_mod.store_upstream_key(str(user_id), upstream, api_key)
    return JSONResponse(
        {
            "ok": True,
            "id": item_id,
            "upstream": upstream,
            "stored": True,
        }
    )


@router.get("/demo/openrouter")
async def demo_openrouter_status(request: Request):
    """One-click card: model URL, whether a key is stored. Never echoes the key."""
    from .. import demo as demo_mod

    sess = await _session(_bearer(request) or "")
    uid = sess.get("user_id") if sess else None
    return JSONResponse(demo_mod.openrouter_status(str(uid) if uid else None))


@router.api_route("/auth/agent-challenge", methods=["GET", "POST"])
async def agent_challenge():
    nonce = secrets.token_hex(32)
    sess_mod._record_nonce(nonce)
    return JSONResponse({"challenge": nonce, "nonce": nonce})


@router.post("/auth/agent-login")
async def agent_login(request: Request):
    body = await request.json()
    from ..agents import agents as agents_mod

    # Dashboard + curl use pubkeyB58; Python SDK / CLI send agentPubkey.
    pubkey_b58 = body.get("pubkeyB58") or body.get("agentPubkey") or body.get("agent_pubkey") or ""
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
    token = sess_mod.create_token(agent_info["owner_wallet"], "default", scope=sess_mod.SCOPE_PROXY)
    return JSONResponse({"token": token, "scope": sess_mod.SCOPE_PROXY})


# ─── Passkey routes (WebAuthn) ──────────────────────────────────


@router.get("/auth/passkey/register-options")
async def passkey_register_options(request: Request):
    """Generate registration options for the currently-authenticated user."""
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    from ..billing import plans as plans_mod

    level = request.query_params.get("device_level") or "personal"
    try:
        plans_mod.assert_slot(user_id, level, extra=1)
    except plans_mod.PlanLimitError as exc:
        return JSONResponse(exc.payload, status_code=402)
    rp_id, origins = _origin_rp_id(request)
    opts = pk_mod.registration_options(
        user_id, display_name="Device Vault", rp_id=rp_id, expected_origin=origins
    )
    return JSONResponse(opts)


@router.post("/auth/passkey/register-verify")
async def passkey_register_verify(request: Request):
    sess = await _session(_bearer(request))
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    user_id = sess.get("user_id") or sess.get("userId")
    body = await request.json()
    from ..billing import plans as plans_mod

    level = body.get("device_level") or body.get("level") or "personal"
    try:
        plans_mod.assert_slot(user_id, level, extra=1)
    except plans_mod.PlanLimitError as exc:
        return JSONResponse(exc.payload, status_code=402)
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
        return _passkey_json_error(e)
    cred_id = out.get("credentialId") or (body.get("credential") or {}).get("id")
    try:
        if cred_id:
            plans_mod.claim_device(
                user_id,
                level,
                str(body.get("name") or "Passkey"),
                kind="passkey",
                ref_id=str(cred_id),
            )
    except plans_mod.PlanLimitError as exc:
        return JSONResponse(exc.payload, status_code=402)
    return JSONResponse({"ok": True, "device_level": level, **out})


# Passkey-first signup: no session needed. The server mints a fresh random
# user_id and stashes a "signup" challenge for it, so a caller can never
# register a credential onto an existing account through this path.
_SIGNUP_PREFIX = "pk_"
_NAME_MAX = 64


def _signup_limited(request: Request):
    if rl_mod.signup_limiter.allow(rl_mod.client_ip(request)):
        return None
    return JSONResponse({"error": "too many signup attempts"}, status_code=429)


@router.get("/auth/passkey/signup-options")
async def passkey_signup_options(request: Request):
    if (limited := _signup_limited(request)) is not None:
        return limited
    user_id = _SIGNUP_PREFIX + secrets.token_urlsafe(18)
    rp_id, origins = _origin_rp_id(request)
    opts = pk_mod.registration_options(
        user_id, display_name="KeyShield", rp_id=rp_id, expected_origin=origins, kind="signup"
    )
    return JSONResponse({**opts, "ksUserId": user_id})


@router.post("/auth/passkey/signup-verify")
async def passkey_signup_verify(request: Request):
    if (limited := _signup_limited(request)) is not None:
        return limited
    body = await request.json()
    name = str(body.get("name") or "Passkey")[:_NAME_MAX]
    user_id = str(body.get("userId") or "")
    if not user_id.startswith(_SIGNUP_PREFIX) or pk_mod.list_credentials(user_id):
        return JSONResponse({"error": "invalid signup"}, status_code=400)
    rp_id, origins = _origin_rp_id(request)
    try:
        out = pk_mod.registration_verify(
            user_id,
            body.get("credential") or {},
            name,
            rp_id=rp_id,
            expected_origin=origins,
            kind="signup",
        )
    except Exception as e:
        return _passkey_json_error(e)
    from ..billing import plans as plans_mod

    cred_id = str(out.get("credentialId") or "")
    try:
        plans_mod.claim_device(user_id, "personal", name, kind="passkey", ref_id=cred_id)
    except Exception as exc:
        # Roll back so a failed seat claim never leaves an orphan account.
        pk_mod.delete_credential(user_id, cred_id)
        if isinstance(exc, plans_mod.PlanLimitError):
            return JSONResponse(exc.payload, status_code=402)
        return JSONResponse({"error": "signup failed"}, status_code=503)
    token = sess_mod.create_token(user_id, "")
    return JSONResponse({"ok": True, "token": token, "userId": user_id, **out})


@router.get("/auth/passkey/auth-options")
async def passkey_auth_options(user_id: str, request: Request):
    """Unauthenticated — used by login flow."""
    rp_id, origins = _origin_rp_id(request)
    try:
        opts = pk_mod.authentication_options(user_id, rp_id=rp_id, expected_origin=origins)
    except Exception as e:
        return _passkey_json_error(e)
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
        verified = pk_mod.authentication_verify(
            user_id,
            body.get("credential", body),
            rp_id=rp_id,
            expected_origin=origins,
        )
    except Exception as e:
        return _passkey_json_error(e)
    signed_user = (verified or {}).get("userId") or user_id
    token = sess_mod.create_token(signed_user, effective_passphrase)
    return JSONResponse({"token": token, "userId": signed_user})


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
    from ..billing import plans as plans_mod

    plans_mod.release_device(user_id, kind="passkey", ref_id=cred_id)
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
