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


@router.post("/share/grant")
async def share_grant(request: Request):
    from ..sharing import sharing as sharing_mod

    body = await request.json()
    share_id = sharing_mod.grant(
        owner_id=body["owner_id"],
        recipient_id=body["recipient_id"],
        key_name=body["key_name"],
        encrypted_dek=body.get("encrypted_dek"),
    )
    return JSONResponse({"share_id": share_id})


@router.get("/share/incoming")
async def share_incoming(request: Request):
    from ..sharing import sharing as sharing_mod

    sess = _auth(request)
    recipient = sess["user_id"] if sess else "default"
    shares = sharing_mod.list_incoming(recipient)
    return JSONResponse({"shares": shares})


@router.get("/share/outgoing")
async def share_outgoing(request: Request):
    from ..sharing import sharing as sharing_mod

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    shares = sharing_mod.list_outgoing(owner)
    return JSONResponse({"shares": shares})


@router.delete("/share/{share_id}")
async def share_delete(share_id: int, request: Request):
    from ..sharing import sharing as sharing_mod

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    ok = sharing_mod.revoke(owner, share_id)
    return JSONResponse({"ok": ok})
