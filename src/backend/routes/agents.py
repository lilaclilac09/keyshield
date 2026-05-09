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


# ─── Server-held agent wallets (ephemeral) ─────────────────────────────
# Backs EphemeralWalletsSection.tsx — distinct from on-chain ix #23
# (CreateEphemeralSigner). Server generates and holds the ed25519 keypair
# entirely off-chain; only the pubkey is ever returned. See
# src/backend/agents/server_wallet.py.

# Note: declared BEFORE `DELETE /agents/{agent_id}` so the literal
# "/agents/wallets" path is matched before any wildcard fallback.


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
