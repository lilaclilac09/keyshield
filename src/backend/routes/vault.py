"""Vault routes — store, load, list, delete keys."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


@router.get("/manage/list")
async def vault_list(request: Request):
    from ..vault import vault as vault_mod
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    keys = vault_mod.list_keys(sess["user_id"])
    return JSONResponse({"keys": keys})


@router.get("/manage/decrypt/{upstream}")
async def vault_decrypt(upstream: str, request: Request):
    from ..vault import vault as vault_mod
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    key = vault_mod.load(sess["user_id"], upstream, sess["password"])
    return JSONResponse({"upstream": upstream, "key": key})


@router.post("/manage/store")
async def vault_store(request: Request):
    from ..vault import vault as vault_mod
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    body = await request.json()
    vault_mod.store(sess["user_id"], body["upstream"], body["apiKey"], password=sess["password"])
    return JSONResponse({"ok": True})


@router.delete("/manage/secret/{upstream}")
async def vault_delete(upstream: str, request: Request):
    from ..vault import vault as vault_mod
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "not authenticated"}, status_code=401)
    vault_mod.delete(sess["user_id"], upstream)
    return JSONResponse({"ok": True})
