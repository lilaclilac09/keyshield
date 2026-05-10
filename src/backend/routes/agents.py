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


# ─── Frontend-compatible endpoints ─────────────────────────────────────
# The frontend dashboard calls GET/POST/DELETE /agents directly (RESTful).
# We expose these aliases alongside the legacy /agents/register, /agents/list paths.


@router.get("/agents")
async def agent_list_rest(request: Request):
    """GET /agents — list all agents (RESTful alias for /agents/list)."""
    from ..agents import agents as agents_mod

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    ag_list = agents_mod.list_agents(owner)
    # Normalize to the shape the frontend expects
    agents = []
    for a in ag_list:
        agents.append({
            "id": str(a["id"]),
            "agent_id": f"agent_{a['id']:06d}_{a['pubkey_b58'][:8]}",
            "name": a["name"],
            "pubkey": a["pubkey_b58"],
            "is_active": True,
            "last_seen_at": a.get("last_used_at"),
            "created_at": a["created_at"],
        })
    return JSONResponse(agents)


@router.post("/agents")
async def agent_register_rest(request: Request):
    """POST /agents — register a new agent (RESTful alias for /agents/register)."""
    body = await request.json()
    from ..agents import agents as agents_mod
    import secrets

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    name = body.get("name", "agent")
    # Generate a random pubkey placeholder for agents created without crypto
    pubkey = f"agent_{secrets.token_hex(16)}"
    agents_mod.register(owner, pubkey, name=name)
    return JSONResponse({"id": name, "agent_id": pubkey})


@router.delete("/agents/{agent_id}")
async def agent_delete_rest(agent_id: str, request: Request):
    """DELETE /agents/{id} — revoke/delete an agent."""
    from ..agents import agents as agents_mod

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    # Accept both numeric ID and string agent_id
    try:
        aid = int(agent_id)
        ok = agents_mod.revoke(owner, aid)
    except ValueError:
        # String ID — find by pubkey prefix
        ok = False
        agents = agents_mod.list_agents(owner)
        for a in agents:
            agent_str = f"agent_{a['id']:06d}_{a['pubkey_b58'][:8]}"
            if agent_str == agent_id:
                ok = agents_mod.revoke(owner, a["id"])
                break
    return JSONResponse({"ok": ok})


# ─── Legacy endpoints (keep for backward compat) ────────────────────────


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


# ─── Server-held agent wallets (ephemeral) ─────────────────────────────


@router.get("/agents/wallets")
async def agent_wallets_list(request: Request):
    from ..agents import server_wallet

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    return JSONResponse({"wallets": server_wallet.list_server_wallets(owner)})


@router.post("/agents/{agent_id}/wallet/create")
async def agent_wallet_create(agent_id: str, request: Request):
    from ..agents import server_wallet

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    try:
        aid, pubkey = server_wallet.create_server_wallet(owner, agent_id)
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    return JSONResponse({"agent_id": aid, "pubkey": pubkey})


@router.delete("/agents/{agent_id}/wallet")
async def agent_wallet_delete(agent_id: str, request: Request):
    from ..agents import server_wallet

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    ok = server_wallet.delete_server_wallet(owner, agent_id)
    return JSONResponse({"ok": ok})


@router.delete("/agents/{agent_id}")
async def agent_delete(agent_id: int, request: Request):
    from ..agents import agents as agents_mod

    sess = _auth(request)
    owner = sess["user_id"] if sess else "default"
    ok = agents_mod.revoke(owner, agent_id)
    return JSONResponse({"ok": ok})
