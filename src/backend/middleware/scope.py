"""Token-scope guard: proxy-only tokens can't touch owner routes.

Agent tokens (``/auth/agent-login``) and developer tokens
(``POST /sessions/proxy-token``) carry ``scp="proxy"``. They exist so a
process can call ``/proxy`` and ``/vproxy`` without ever holding a provider
key. Before this guard they were full owner sessions, so an agent could call
``/manage/vault`` + ``/manage/decrypt/{id}`` and read every raw key.

Rules:
  * Owner-only paths (below) answer 403 ``insufficient_scope`` to a valid
    proxy token. Invalid / missing tokens fall through so each route keeps
    its own 401 behaviour.
  * Everything else (proxy, vproxy, usage, MPP stream metering, health, ...)
    is unchanged for both scopes.

Implemented as a plain ASGI middleware so streaming proxy responses are
never buffered.
"""

from __future__ import annotations

import json

# Prefix match on the request path. Keep this list in sync with docs/API.md.
OWNER_ONLY_PREFIXES: tuple[str, ...] = (
    "/manage/",  # vault list / store / decrypt / update / delete
    "/sessions",  # list, revoke, mint proxy tokens
    "/agents",  # register / list / revoke agents, agent wallets
    "/auth/passkey/register",  # add a passkey to the account
    "/auth/passkey/list",
    "/auth/delete-account",
    "/share",  # /share/* and /sharing*
    "/keychain/store",
    "/keychain/detect",
    "/keychain/home",
    "/demo/upstream-key",
    "/x402/trust",  # changing auto-pay trust is a spend decision
    "/billing/topup",
    "/billing/devices",
    "/mpp/vault/",
    "/mpp/autosign/",
)

# DELETE /auth/passkey/{cred_id} removes a passkey; owner only.
_PASSKEY_PREFIX = "/auth/passkey/"
_PASSKEY_PUBLIC = (
    "/auth/passkey/auth-options",
    "/auth/passkey/auth-verify",
    "/auth/passkey/signup-options",
    "/auth/passkey/signup-verify",
)


def is_owner_only(method: str, path: str) -> bool:
    if any(path.startswith(p) for p in OWNER_ONLY_PREFIXES):
        return True
    if (
        method.upper() == "DELETE"
        and path.startswith(_PASSKEY_PREFIX)
        and not path.startswith(_PASSKEY_PUBLIC)
    ):
        return True
    return False


def _bearer(scope: dict) -> str:
    for name, value in scope.get("headers") or []:
        if name == b"authorization":
            raw = value.decode("latin-1")
            if raw.startswith("Bearer "):
                return raw[7:].strip()
            return ""
    return ""


FORBIDDEN_BODY = {
    "error": "insufficient_scope",
    "detail": "This token is proxy-only. Use an owner session (sign in with your passkey).",
    "required_scope": "owner",
}


class ScopeGuard:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)
        method = scope.get("method", "GET")
        path = scope.get("path", "")
        if method != "OPTIONS" and is_owner_only(method, path):
            token = _bearer(scope)
            if token:
                from ..auth import session as sess_mod

                sess = sess_mod.get(token)
                if sess and not sess_mod.is_owner(sess):
                    body = json.dumps(FORBIDDEN_BODY).encode()
                    await send(
                        {
                            "type": "http.response.start",
                            "status": 403,
                            "headers": [
                                (b"content-type", b"application/json"),
                                (b"content-length", str(len(body)).encode()),
                            ],
                        }
                    )
                    await send({"type": "http.response.body", "body": body})
                    return
        return await self.app(scope, receive, send)
