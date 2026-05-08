"""Agent routes — register, list, delete, wallet."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


@router.post("/agents/register")
async def agent_register(request: Request):
    body = await request.json()
    from ..agents import agents as agents_mod
    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    agents_mod.register(owner, body["pubkeyB58"], name=body.get("name", "agent"))
    return JSONResponse({"ok": True})


@router.get("/agents/list")
async def agent_list(request: Request):
    from ..agents import agents as agents_mod
    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    ag_list = agents_mod.list_agents(owner)
    return JSONResponse({"agents": ag_list})


@router.delete("/agents/{agent_id}")
async def agent_delete(agent_id: int, request: Request):
    from ..agents import agents as agents_mod
    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    ok = agents_mod.revoke(owner, agent_id)
    return JSONResponse({"ok": ok})
