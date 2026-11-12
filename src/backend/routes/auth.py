"""Auth routes — login, logout, wallet, passkey, delete-account."""

from __future__ import annotations

import base64
import html
import re
import secrets
from urllib.parse import urlparse

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from ..auth import google_oauth as google_mod
from ..auth import passkey as pk_mod
from ..auth import ratelimit as rl_mod
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


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
_SIGNUP_PASSWORD_MIN = 8


def _looks_like_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(value))


def _limited(limiter, request: Request, message: str):
    if limiter.allow(rl_mod.client_ip(request)):
        return None
    return _auth_error(message, 429)


def _password_from_body(body: dict) -> str:
    password = body.get("password")
    if not isinstance(password, str):
        return "" if password is None else str(password)
    return password


def _account_id(body: dict, *, require_email: bool) -> tuple[str | None, JSONResponse | None]:
    """Resolve email or userId. Emails are lowercased. Signup requires an email."""
    if not isinstance(body, dict):
        msg = "email and password required" if require_email else "userId and password required"
        return None, _auth_error(msg, 400)
    email = str(body.get("email") or "").strip().lower()
    user_id = str(body.get("userId") or body.get("user_id") or "").strip()
    if email:
        if not _looks_like_email(email):
            return None, _auth_error(
                "Enter a valid email (Gmail works). Next step: use you@gmail.com and try again.",
                400,
            )
        return email, None
    if require_email:
        return None, _auth_error(
            "email and password required. Next step: enter your Google email and a password.",
            400,
        )
    if not user_id:
        return None, _auth_error("userId and password required", 400)
    if "@" in user_id:
        uid = user_id.lower()
        if not _looks_like_email(uid):
            return None, _auth_error(
                "Enter a valid email (Gmail works). Next step: use you@gmail.com and try again.",
                400,
            )
        return uid, None
    return user_id, None


def _open_password_session(user_id: str, password: str, *, register: bool) -> JSONResponse:
    if sess_mod.is_deleted(user_id):
        return _auth_error("account deleted", 403)
    if sess_mod.has_password(user_id):
        if register:
            return _auth_error(
                "An account already exists for this email. Next step: sign in with this email and password.",
                409,
            )
        if not sess_mod.verify_password(user_id, password):
            return _auth_error("invalid credentials", 401)
        registered = False
    else:
        sess_mod.register_password(user_id, password)
        registered = True
    token = sess_mod.create_token(user_id, password)
    return JSONResponse(
        {"token": token, "userId": user_id, "registered": registered, "method": "password"}
    )


@router.post("/auth/login")
async def auth_login(request: Request):
    """Email or userId + password opens a session.

    First login for an identity stores the password hash. Later logins must
    match that hash. Wallet and passkey stay available; this path is the
    default for humans with a Google/Gmail address on AuthScreen.
    """
    limited = _limited(
        rl_mod.login_limiter,
        request,
        "too many login attempts. Next step: wait a minute and try again.",
    )
    if limited is not None:
        return limited
    try:
        body = await request.json()
    except Exception:
        return _auth_error("invalid json", 400)
    user_id, err = _account_id(body if isinstance(body, dict) else {}, require_email=False)
    if err is not None:
        return err
    password = _password_from_body(body if isinstance(body, dict) else {})
    if not user_id or not password:
        return _auth_error("userId and password required", 400)
    return _open_password_session(user_id, password, register=False)


@router.post("/auth/signup")
async def auth_signup(request: Request):
    """Create an account with an email (Gmail included) + password.

    Duplicate emails return 409 so the UI can send the user to Sign in.
    """
    limited = _limited(
        rl_mod.login_limiter,
        request,
        "too many signup attempts. Next step: wait a minute and try again.",
    )
    if limited is not None:
        return limited
    try:
        body = await request.json()
    except Exception:
        return _auth_error("invalid json", 400)
    user_id, err = _account_id(body if isinstance(body, dict) else {}, require_email=True)
    if err is not None:
        return err
    password = _password_from_body(body if isinstance(body, dict) else {})
    if not user_id or not password:
        return _auth_error(
            "email and password required. Next step: enter your Google email and a password.",
            400,
        )
    if len(password) < _SIGNUP_PASSWORD_MIN:
        return _auth_error(
            f"password must be at least {_SIGNUP_PASSWORD_MIN} characters. Next step: choose a longer password.",
            400,
        )
    return _open_password_session(user_id, password, register=True)


@router.post("/auth/logout")
async def auth_logout(request: Request):
    token = _bearer(request)
    if token:
        sess_mod.delete(token)
    return JSONResponse({"ok": True})


# ─── Google OAuth (optional; email+password still works without secrets) ──


def _google_html(title: str, body: str, status: int = 200) -> HTMLResponse:
    safe_title = html.escape(title)
    safe_body = html.escape(body)
    return HTMLResponse(
        f"""<!doctype html><html><head><meta charset="utf-8"><title>{safe_title}</title>
<style>body{{font-family:system-ui,sans-serif;background:#0b1226;color:#e8ecff;display:flex;
align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}}
main{{max-width:28rem;line-height:1.45}} h1{{font-size:1.25rem}} p{{color:#a8b3d8}}</style>
</head><body><main><h1>{safe_title}</h1><p>{safe_body}</p></main></body></html>""",
        status_code=status,
    )


@router.get("/auth/google/status")
async def google_status():
    return JSONResponse(google_mod.status_payload())


@router.get("/auth/google/start")
async def google_start(request: Request):
    limited = _limited(
        rl_mod.login_limiter,
        request,
        "too many Google sign-in attempts. Next step: wait a minute and try again.",
    )
    if limited is not None:
        return limited
    if not google_mod.configured():
        payload = google_mod.status_payload()
        return JSONResponse(payload, status_code=503)
    desktop = request.query_params.get("desktop") == "1"
    origin = (request.headers.get("Origin") or "").strip()
    return_url = google_mod.resolve_success_url(origin + "/" if origin else None)
    state = google_mod.new_state(desktop=desktop, return_url=return_url)
    redirect_uri = google_mod.resolve_redirect_uri(str(request.base_url))
    url = google_mod.authorization_url(state, redirect_uri)
    want_json = request.query_params.get("json") == "1" or "application/json" in (
        request.headers.get("accept") or ""
    )
    if want_json:
        return JSONResponse({"url": url, "state": state, "desktop": desktop})
    return RedirectResponse(url, status_code=302)


@router.get("/auth/google/callback")
async def google_callback(request: Request):
    params = request.query_params
    err = (params.get("error") or "").strip()
    state = (params.get("state") or "").strip()
    code = (params.get("code") or "").strip()
    row = google_mod.get_state(state)
    if err:
        google_mod.consume_state(state)
        detail = (
            f"Google sign-in was cancelled ({err}). Next step: return to KeyShield "
            "and tap Continue with Google, or use your Gmail and password."
        )
        return _google_html("Google sign-in cancelled", detail, 400)
    if not row:
        return _google_html(
            "Google sign-in expired",
            "This Google sign-in link expired. Next step: return to KeyShield and tap Continue with Google again.",
            400,
        )
    if not code:
        google_mod.consume_state(state)
        return _google_html(
            "Google sign-in incomplete",
            "Google did not return an authorization code. Next step: tap Continue with Google again.",
            400,
        )
    try:
        info = google_mod.exchange_code(
            code, google_mod.resolve_redirect_uri(str(request.base_url))
        )
    except Exception as exc:
        google_mod.consume_state(state)
        return _google_html(
            "Google sign-in failed",
            f"{exc}. Next step: return to KeyShield and use your Gmail and a password, or retry Continue with Google.",
            401,
        )
    email = info["email"]
    if sess_mod.is_deleted(email):
        google_mod.consume_state(state)
        return _google_html(
            "Account deleted",
            "This Google email belongs to a deleted KeyShield account. Next step: use a different Google account.",
            403,
        )
    registered = not sess_mod.has_password(email)
    if registered:
        # Random password so a stranger cannot claim this Google account via
        # first-login /auth/login. Password signup for the same email 409s.
        sess_mod.register_password(email, secrets.token_urlsafe(32))
    token = sess_mod.create_token(email, "")
    ticket = google_mod.store_session(state, token=token, user_id=email, registered=registered)
    if row.get("desktop"):
        return _google_html(
            "Signed in with Google",
            "Return to the KeyShield app — this window can close. The login window stays on your Mac.",
        )
    dest = google_mod.resolve_success_url(row.get("return_url"))
    sep = "&" if "?" in dest else "?"
    return RedirectResponse(f"{dest}{sep}ks_google={ticket}", status_code=302)


@router.get("/auth/google/poll")
async def google_poll(state: str = ""):
    row = google_mod.poll_state(state)
    if row is None:
        return _auth_error(
            "unknown or expired Google sign-in. Next step: tap Continue with Google again.",
            400,
        )
    if row.get("pending"):
        return JSONResponse({"pending": True}, status_code=202)
    return JSONResponse(row)


@router.post("/auth/google/exchange")
async def google_exchange(request: Request):
    try:
        body = await request.json()
    except Exception:
        return _auth_error("invalid json", 400)
    ticket = str((body or {}).get("ticket") or (body or {}).get("ks_google") or "").strip()
    row = google_mod.take_ticket(ticket)
    if not row:
        return _auth_error(
            "Google sign-in ticket expired. Next step: tap Continue with Google again.",
            400,
        )
    return JSONResponse(
        {
            "token": row["token"],
            "userId": row["userId"],
            "registered": row.get("registered", False),
            "provider": "google",
        }
    )


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
    token = sess_mod.create_token(
        agent_info["owner_wallet"],
        "default",
        scope=sess_mod.SCOPE_PROXY,
        agent_id=agent_info.get("agent_id"),
    )
    try:
        agents_mod.touch(pubkey_b58)
    except Exception:
        pass
    return JSONResponse({"token": token, "scope": sess_mod.SCOPE_PROXY})


def _valid_agent_pubkey(pubkey: str) -> bool:
    try:
        import base58 as _b58
        from nacl.signing import VerifyKey

        VerifyKey(_b58.b58decode(pubkey))
        return True
    except Exception:
        return False


@router.post("/auth/agent-register")
async def agent_register_public(request: Request):
    """Public agent self-register — no human wallet required.

    Body: { name, pubkeyB58 }. The agent then signs POST /auth/agent-challenge
    and logs in at POST /auth/agent-login.
    """
    limited = _limited(
        rl_mod.agent_register_limiter,
        request,
        "too many agent registrations. Next step: wait a minute and try again.",
    )
    if limited is not None:
        return limited
    try:
        body = await request.json()
    except Exception:
        return _auth_error("invalid json", 400)
    if not isinstance(body, dict):
        return _auth_error("name and pubkeyB58 required", 400)
    from ..agents import agents as agents_mod

    name = str(body.get("name") or "").strip() or "agent"
    pubkey = str(
        body.get("pubkeyB58") or body.get("agentPubkey") or body.get("agent_pubkey") or ""
    ).strip()
    if not pubkey:
        return _auth_error(
            "pubkeyB58 required. Next step: generate an ed25519 keypair and send the public key.",
            400,
        )
    if not _valid_agent_pubkey(pubkey):
        return _auth_error(
            "pubkeyB58 must be a 32-byte ed25519 key in base58. Next step: generate a new agent keypair.",
            400,
        )
    owner = pubkey
    from ..billing import plans as plans_mod

    try:
        plans_mod.assert_slot(owner, "runtime", extra=1)
    except plans_mod.PlanLimitError as exc:
        body_out = dict(exc.payload)
        body_out.setdefault("error", body_out.get("detail"))
        return JSONResponse(body_out, status_code=402)
    try:
        agent_id = agents_mod.register(owner, pubkey, name=name)
    except ValueError as e:
        return JSONResponse(
            {"error": str(e), "ok": True, "duplicate": True, "owner": owner, "pubkeyB58": pubkey},
            status_code=409,
        )
    return JSONResponse(
        {
            "ok": True,
            "id": agent_id,
            "name": name[:64],
            "owner": owner,
            "pubkeyB58": pubkey,
            "next": "POST /auth/agent-challenge then POST /auth/agent-login with the signature",
        }
    )


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
