"""Google OAuth for human signup/login.

Live Google sign-in needs these env vars on the Python API:

  GOOGLE_CLIENT_ID          (alias KS_GOOGLE_CLIENT_ID)
  GOOGLE_CLIENT_SECRET      (alias KS_GOOGLE_CLIENT_SECRET)
  GOOGLE_REDIRECT_URI       (alias KS_GOOGLE_REDIRECT_URI)
                            e.g. https://<api-host>/auth/google/callback
  KS_GOOGLE_SUCCESS_URL     optional; browser return URL after callback
                            (default https://app.ks.aileena.xyz/)

Without the client id/secret the dashboard still ships email+password
signup (Gmail addresses included). This module only runs the OAuth
round-trip when those secrets are present.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo"

STATE_TTL = 600
_lock = threading.Lock()
# state -> {created, desktop, return_url, token?, userId?, registered?, ticket?}
_states: dict[str, dict] = {}
_tickets: dict[str, dict] = {}  # one-time ticket -> session payload


def _env(*names: str) -> str:
    for name in names:
        raw = (os.getenv(name) or "").strip()
        if raw:
            return raw
    return ""


def client_id() -> str:
    return _env("GOOGLE_CLIENT_ID", "KS_GOOGLE_CLIENT_ID")


def client_secret() -> str:
    return _env("GOOGLE_CLIENT_SECRET", "KS_GOOGLE_CLIENT_SECRET")


def redirect_uri_env() -> str:
    return _env("GOOGLE_REDIRECT_URI", "KS_GOOGLE_REDIRECT_URI")


def success_url_env() -> str:
    return _env("KS_GOOGLE_SUCCESS_URL")


def configured() -> bool:
    return bool(client_id() and client_secret())


def status_payload() -> dict:
    cid = bool(client_id())
    secret = bool(client_secret())
    redirect = bool(redirect_uri_env())
    enabled = cid and secret
    if enabled:
        detail = "Google OAuth is configured. Continue with Google opens a Google account picker."
    else:
        missing = []
        if not cid:
            missing.append("GOOGLE_CLIENT_ID")
        if not secret:
            missing.append("GOOGLE_CLIENT_SECRET")
        detail = (
            "Google OAuth is not configured on this server. Next step: enter your "
            "Gmail address and a password, or set "
            + " and ".join(missing)
            + " (aliases KS_GOOGLE_CLIENT_ID / KS_GOOGLE_CLIENT_SECRET) on the API."
        )
    return {
        "enabled": enabled,
        "provider": "google",
        "env": {
            "GOOGLE_CLIENT_ID": cid,
            "GOOGLE_CLIENT_SECRET": secret,
            "GOOGLE_REDIRECT_URI": redirect,
            "KS_GOOGLE_SUCCESS_URL": bool(success_url_env()),
        },
        "aliases": [
            "KS_GOOGLE_CLIENT_ID",
            "KS_GOOGLE_CLIENT_SECRET",
            "KS_GOOGLE_REDIRECT_URI",
        ],
        "detail": detail,
    }


def resolve_redirect_uri(request_url: str | None) -> str:
    env = redirect_uri_env()
    if env:
        return env
    if request_url:
        parsed = urllib.parse.urlparse(request_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        return f"{origin}/auth/google/callback"
    return "http://127.0.0.1:8001/auth/google/callback"


def resolve_success_url(fallback: str | None = None) -> str:
    return success_url_env() or (fallback or "https://app.ks.aileena.xyz/")


def _gc(now: float | None = None) -> None:
    now = time.time() if now is None else now
    cutoff = now - STATE_TTL
    with _lock:
        for store in (_states, _tickets):
            dead = [k for k, v in store.items() if float(v.get("created", 0)) < cutoff]
            for k in dead:
                store.pop(k, None)


def new_state(*, desktop: bool, return_url: str) -> str:
    _gc()
    state = secrets.token_urlsafe(24)
    with _lock:
        _states[state] = {
            "created": time.time(),
            "desktop": desktop,
            "return_url": return_url,
        }
    return state


def get_state(state: str) -> dict | None:
    _gc()
    if not state:
        return None
    with _lock:
        row = _states.get(state)
        return dict(row) if row else None


def authorization_url(state: str, redirect_uri: str) -> str:
    params = {
        "client_id": client_id(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH}?{urllib.parse.urlencode(params)}"


def http_json(
    method: str, url: str, *, data: dict | None = None, headers: dict | None = None
) -> dict:
    """Small HTTP helper — tests monkeypatch this instead of hitting Google."""
    hdrs = dict(headers or {})
    if method.upper() == "POST":
        body = urllib.parse.urlencode(data or {}).encode()
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    else:
        req = urllib.request.Request(url, method="GET")
    for key, value in hdrs.items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace") if exc.fp else ""
        raise RuntimeError(f"Google OAuth HTTP {exc.code}: {detail[:200]}") from exc
    except Exception as exc:
        raise RuntimeError(f"Google OAuth request failed: {exc}") from exc
    try:
        parsed = json.loads(raw)
    except Exception as exc:
        raise RuntimeError("Google OAuth returned non-JSON") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("Google OAuth returned an unexpected payload")
    return parsed


def exchange_code(code: str, redirect_uri: str) -> dict:
    token = http_json(
        "POST",
        GOOGLE_TOKEN,
        data={
            "code": code,
            "client_id": client_id(),
            "client_secret": client_secret(),
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    access = str(token.get("access_token") or "")
    if not access:
        raise RuntimeError("Google did not return an access token")
    info = http_json(
        "GET",
        GOOGLE_USERINFO,
        headers={"Authorization": f"Bearer {access}"},
    )
    email = str(info.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise RuntimeError("Google account has no email")
    if info.get("verified_email") is False:
        raise RuntimeError("Google email is not verified")
    return {"email": email, "name": str(info.get("name") or "")}


def store_session(state: str, *, token: str, user_id: str, registered: bool) -> str:
    ticket = secrets.token_urlsafe(24)
    payload = {
        "created": time.time(),
        "token": token,
        "userId": user_id,
        "registered": registered,
        "provider": "google",
    }
    with _lock:
        row = _states.get(state)
        if row is None:
            raise RuntimeError("unknown Google sign-in state")
        row.update(payload)
        row["ticket"] = ticket
        _tickets[ticket] = dict(payload)
    return ticket


def take_ticket(ticket: str) -> dict | None:
    _gc()
    if not ticket:
        return None
    with _lock:
        row = _tickets.pop(ticket, None)
        return dict(row) if row else None


def poll_state(state: str) -> dict | None:
    """Non-consuming peek used by the Mac app while Google is in the browser."""
    _gc()
    if not state:
        return None
    with _lock:
        row = _states.get(state)
        if not row:
            return None
        if not row.get("token"):
            return {"pending": True, "desktop": bool(row.get("desktop"))}
        payload = {
            "token": row["token"],
            "userId": row["userId"],
            "registered": row.get("registered", False),
            "provider": "google",
            "pending": False,
        }
        _states.pop(state, None)
        return payload


def consume_state(state: str) -> None:
    with _lock:
        _states.pop(state, None)


def reset() -> None:
    """Tests only."""
    with _lock:
        _states.clear()
        _tickets.clear()
