"""Sharing routes — grant/revoke shares."""

import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


def _share_payload(share: dict) -> dict:
    """Dashboard ShareRow + REST aliases in one object."""
    sid = share.get("id")
    owner = share.get("owner_id", "")
    recipient = share.get("recipient_id", share.get("grantee_address", ""))
    key_name = share.get("key_name", share.get("vault_key_id", ""))
    return {
        "id": int(sid) if str(sid).isdigit() else sid,
        "owner_id": owner,
        "recipient_id": recipient,
        "key_name": key_name,
        "expires_at": share.get("expires_at"),
        "created_at": share.get("created_at"),
        "vault_key_id": key_name,
        "grantee_address": recipient,
        "is_active": True,
    }


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
        return _share_payload(share)

    return JSONResponse(
        {
            "incoming": [_normalize(s) for s in incoming],
            "outgoing": [_normalize(s) for s in outgoing],
        }
    )


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
            expires_at=body.get("expires_at"),
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)

    share = _share_payload(
        {
            "id": share_id,
            "owner_id": owner,
            "recipient_id": recipient,
            "key_name": key_name,
            "expires_at": body.get("expires_at"),
            "created_at": int(time.time()),
        }
    )
    return JSONResponse({"ok": True, "id": str(share_id), "share": share})


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
    recipient = body.get("recipient_id", body.get("grantee_address", ""))
    key_name = body.get("key_name", body.get("vault_key_id", ""))
    try:
        share_id = sharing_mod.grant(
            owner_id=owner,
            recipient_id=recipient,
            key_name=key_name,
            encrypted_dek=None,
            expires_at=body.get("expires_at"),
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    share = _share_payload(
        {
            "id": share_id,
            "owner_id": owner,
            "recipient_id": recipient,
            "key_name": key_name,
            "expires_at": body.get("expires_at"),
            "created_at": int(time.time()),
        }
    )
    return JSONResponse({"ok": True, "id": str(share_id), "share": share})


@router.get("/share/incoming")
async def share_incoming(request: Request):
    from ..sharing import sharing as sharing_mod

    sess = _auth(request)
    recipient = sess["user_id"] if sess else "default"
    shares = sharing_mod.list_incoming(recipient)
    return JSONResponse({"shares": [_share_payload(s) for s in shares]})


@router.get("/share/outgoing")
async def share_outgoing(request: Request):
    from ..sharing import sharing as sharing_mod

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    shares = sharing_mod.list_outgoing(owner)
    return JSONResponse({"shares": [_share_payload(s) for s in shares]})


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
