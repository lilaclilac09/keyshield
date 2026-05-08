"""Proxy routes — forward to upstream providers."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


@router.api_route("/proxy/{upstream}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_route(upstream: str, path: str, request: Request):
    from ..auth import session as sess_mod
    from ..vault import vault as vault_mod
    from ..proxy import api_router
    token = _bearer(request)
    sess = await _session(token) if token else None
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    key_info = _resolve_key(sess["user_id"], upstream, sess["password"])
    if not key_info:
        return JSONResponse({"error": "key not found"}, status_code=404)
    body = await request.body()
    result = await api_router.call_rest(
        upstream, str(request.method), f"/{path}", body, key_info["key"]
    )
    content, status, cache_status = result
    try:
        data = json.loads(content) if content else {}
    except Exception:
        data = {"raw": content.decode("utf-8", errors="replace")}
    return JSONResponse(data, status_code=status)


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


async def _session(token: str) -> dict | None:
    from ..auth import session as sess_mod
    if not token:
        return None
    return sess_mod.get(token)


def _resolve_key(user_id: str, upstream: str, password: str) -> dict | None:
    from ..vault import vault as vault_mod
    try:
        key = vault_mod.load(user_id, upstream, password)
        return {"key": key, "key_type": "self_custodian"}
    except Exception:
        pass
    return None
