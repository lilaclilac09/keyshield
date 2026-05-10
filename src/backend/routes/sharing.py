"""Sharing routes — grant/revoke shares."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod

    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


# ─── RESTful endpoints (frontend dashboard compat) ─────────────────────

@router.get("/sharing")
async def sharing_list(request: Request):
    """GET /sharing — returns {incoming, outgoing} for the dashboard."""
    from ..sharing import sharing as sharing_mod
    sess = _auth(request)
    user_id = sess["user_id"] if sess else "default"

    incoming = sharing_mod.list_incoming(user_id)
    outgoing = sharing_mod.list_outgoing(user_id)

    def _normalize(share):
        return {
            "id": str(share["id"]),
            "vault_key_id": share["key_name"],
            "grantee_address": share["recipient_id"] if "recipient_id" in share else share.get("owner_id", ""),
            "expires_at": share.get("expires_at"),
            "is_active": True,
            "created_at": share.get("created_at"),
        }

    return JSONResponse({
        "incoming": [_normalize(s) for s in incoming],
        "outgoing": [_normalize(s) for s in outgoing],
    })


@router.post("/sharing")
async def sharing_grant(request: Request):
    """POST /sharing — grant a share."""
    from ..sharing import sharing as sharing_mod
    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    body = await request.json()

    recipient = body.get("grantee_address", body.get("recipient_id", ""))
    key_name = body.get("vault_key_id", body.get("key_name", ""))

    try:
        share_id = sharing_mod.grant(
            owner_id=owner,
            recipient_id=recipient,
            key_name=key_name,
            encrypted_dek=None,
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)

    return JSONResponse({"id": str(share_id)})


@router.delete("/sharing/{share_id}")
async def sharing_delete_rest(share_id: str, request: Request):
    """DELETE /sharing/{id} — revoke a share."""
    from ..sharing import sharing as sharing_mod
    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    try:
        sid = int(share_id)
    except ValueError:
        return JSONResponse({"detail": "invalid share_id"}, status_code=400)
    ok = sharing_mod.revoke(owner, sid)
    return JSONResponse({"ok": ok})


# ─── Legacy endpoints (keep for backward compat) ────────────────────────

@router.post("/share/grant")
async def share_grant(request: Request):
    from ..sharing import sharing as sharing_mod

    body = await request.json()
    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    try:
        share_id = sharing_mod.grant(
            owner_id=owner,
            recipient_id=body.get("recipient_id", body.get("grantee_address", "")),
            key_name=body.get("key_name", body.get("vault_key_id", "")),
            encrypted_dek=None,
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    return JSONResponse({"id": str(share_id)})


@router.get("/share/incoming")
async def share_incoming(request: Request):
    from ..sharing import sharing as sharing_mod

    sess = _auth(request)
    recipient = sess["user_id"] if sess else "default"
    shares = sharing_mod.list_incoming(recipient)
    return JSONResponse({"shares": [
        {"id": str(s["id"]), "vault_key_id": s["key_name"], "grantee_address": s["recipient_id"], "expires_at": s.get("expires_at"), "is_active": True, "created_at": s.get("created_at")}
        for s in shares
    ]})


@router.get("/share/outgoing")
async def share_outgoing(request: Request):
    from ..sharing import sharing as sharing_mod

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    shares = sharing_mod.list_outgoing(owner)
    return JSONResponse({"shares": [
        {"id": str(s["id"]), "vault_key_id": s["key_name"], "grantee_address": s["recipient_id"], "expires_at": s.get("expires_at"), "is_active": True, "created_at": s.get("created_at")}
        for s in shares
    ]})


@router.delete("/share/{share_id}")
async def share_delete(share_id: str, request: Request):
    from ..sharing import sharing as sharing_mod

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    try:
        sid = int(share_id)
    except ValueError:
        return JSONResponse({"detail": "invalid share_id"}, status_code=400)
    ok = sharing_mod.revoke(owner, sid)
    return JSONResponse({"ok": ok})
