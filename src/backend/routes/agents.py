"""Agent routes — register, list, delete, wallet."""

import base64
import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter()


def _ix_to_response(ix) -> dict:
    """Convert a `_SimpleInstruction` from mpp_onchain into the JSON shape
    expected by the dashboard wallet adapter (programId / keys / base64 data).
    Mirrors `routes/mpp.py::_ix_to_response`."""
    return {
        "programId": ix.program_id,
        "keys": [
            {
                "pubkey": a.pubkey,
                "isSigner": a.is_signer,
                "isWritable": a.is_writable,
            }
            for a in ix.accounts
        ],
        "data": base64.b64encode(ix.data).decode("ascii"),
    }


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
        agents.append(
            {
                "id": str(a["id"]),
                "agent_id": f"agent_{a['id']:06d}_{a['pubkey_b58'][:8]}",
                "name": a["name"],
                "pubkey": a["pubkey_b58"],
                "is_active": True,
                "last_seen_at": a.get("last_used_at"),
                "created_at": a["created_at"],
            }
        )
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
    pubkey = body.get("pubkeyB58")
    if not pubkey:
        return JSONResponse({"error": "pubkeyB58 required"}, status_code=400)
    try:
        agents_mod.register(owner, pubkey, name=body.get("name", "agent"))
    except ValueError as e:
        # Pubkey already registered for this owner — return 409 with the
        # existing record so re-running the demo is idempotent instead of
        # 500-ing inside the SQLite UNIQUE constraint.
        return JSONResponse({"error": str(e), "ok": True, "duplicate": True}, status_code=409)
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
    """Delete the server-held wallet for (owner, agent_id).

    Destroys the encrypted seed permanently — any on-chain grant or
    payment stream bound to the wallet's pubkey becomes unusable (the
    key is gone). Funds in a stream ATA remain withdrawable by the
    OWNER via withdraw_agent_wallet (#27), which is owner-signed.
    Idempotent: deleting a non-existent wallet returns deleted=false.
    """
    from ..agents import server_wallet

    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "authorization required"}, status_code=401)
    owner = sess["user_id"]
    deleted = server_wallet.delete_server_wallet(owner, agent_id)
    return JSONResponse({"deleted": bool(deleted)})


# ─── x402 micropayment via server-held agent wallet (ix #25) ─────────────
#
# Spec 10 Phase 10.7 — completes the `EmbeddedWalletInterceptor` loop in
# proxy/x402_interceptor.py: the interceptor POSTs the 402 envelope here,
# the server signs a `pay_x402` ix with the agent's server-held keypair
# (server_wallet.py) and submits it, returning the tx signature as the
# payment proof.


@router.post("/agents/{agent_id}/wallet/pay_x402")
async def agent_wallet_pay_x402(agent_id: str, request: Request):
    """Sign + submit a `pay_x402` (ix #25) micropayment for an agent.

    Body (JSON) — matches EmbeddedWalletInterceptor's POST shape:
      envelope.network           — e.g. "solana-devnet"
      envelope.amountRequired    — integer micro-USDC
      envelope.payTo             — base58 recipient wallet (ATA derived)
      envelope.asset             — USDC mint; must match the stream's mint
      envelope.resource          — opaque, folded into envelope_hash
      envelope.maxTimeoutSeconds — optional, caps expires_at (≤300s)

    Preconditions:
      - Server wallet exists for (owner, agent_id) — /wallet/create first.
      - The agent has an OPEN mpp stream with on-chain PDA/ATA recorded
        (open_payment_stream signed in-browser, then /record-tx).
      - On-chain: agent grant active in the vault + stream budget not
        exhausted — enforced by pay_x402.rs, not re-checked here.

    Returns {"signature", "network", "agentPubkey", "streamPda"} — the
    signature doubles as the x402 `X-Payment-Proof` value.
    """
    import time as _time

    from ..agents import agent_wallet, server_wallet
    from ..mpp import mpp_onchain, mpp_streams

    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "authorization required"}, status_code=401)
    owner = sess["user_id"]

    body = await request.json()
    env = body.get("envelope") or {}
    try:
        amount = int(env.get("amountRequired") or env.get("amount_required") or 0)
    except (TypeError, ValueError):
        return JSONResponse({"detail": "amountRequired must be an integer"}, status_code=400)
    pay_to = str(env.get("payTo") or env.get("pay_to") or "").strip()
    if amount <= 0 or not pay_to:
        return JSONResponse(
            {"detail": "envelope.amountRequired and envelope.payTo are required"},
            status_code=400,
        )

    # Off-chain per-call guardrail (on-chain enforces the stream budget cap).
    max_per_call = int(os.environ.get("KS_X402_AGENT_MAX_PER_CALL", "100000"))
    if amount > max_per_call:
        return JSONResponse(
            {"detail": f"amount {amount} exceeds per-call cap {max_per_call}"},
            status_code=402,
        )

    sk = server_wallet.get_signing_key(owner, agent_id)
    if sk is None:
        return JSONResponse(
            {
                "detail": f"no server wallet for agent {agent_id!r} — "
                f"POST /agents/{agent_id}/wallet/create first"
            },
            status_code=404,
        )
    agent_pubkey = server_wallet._b58encode(bytes(sk.verify_key))

    config = mpp_onchain.load_mpp_config()
    if config is None or not config.vault_pda:
        return JSONResponse(
            {
                "detail": "on-chain config incomplete — set KS_MPP_SETTLER_KEY, "
                "KS_PLATFORM_USDC_ATA, KS_KEYSHIELD_PROGRAM_ID, KS_VAULT_PDA"
            },
            status_code=503,
        )

    stream = mpp_streams.find_agent_stream(owner, agent_pubkey)
    if stream is None:
        return JSONResponse(
            {
                "detail": "no open on-chain payment stream for this agent — "
                "open one (POST /mpp/streams + build-open-tx + record-tx) first"
            },
            status_code=409,
        )

    mint = str(env.get("asset") or "").strip() or config.usdc_mint
    if mint != config.usdc_mint:
        return JSONResponse(
            {"detail": f"asset {mint} does not match stream mint {config.usdc_mint}"},
            status_code=400,
        )
    try:
        recipient_ata = mpp_onchain.derive_associated_token_address(pay_to, mint)
    except mpp_onchain.MppSubmitError as e:
        return JSONResponse({"detail": str(e)}, status_code=503)

    timeout = min(int(env.get("maxTimeoutSeconds") or 300), 300)
    ix = agent_wallet.build_pay_x402_ix(
        program_id=config.keyshield_program_id,
        vault_pda=config.vault_pda,
        stream_pda=stream["stream_pda"],
        stream_usdc_ata=stream["stream_usdc_ata"],
        recipient_usdc_ata=recipient_ata,
        usdc_mint=mint,
        agent_pubkey=agent_pubkey,
        amount_micro_usdc=amount,
        nonce=os.urandom(16),
        expires_at=int(_time.time()) + max(timeout, 30),
        envelope_hash=agent_wallet.canonical_envelope_hash(env),
    )
    try:
        sig = await agent_wallet.submit_pay_x402(ix, bytes(sk), config.rpc_url)
    except mpp_onchain.MppSubmitError as e:
        return JSONResponse({"detail": str(e)}, status_code=502)

    return JSONResponse(
        {
            "signature": sig,
            "network": str(env.get("network") or "solana"),
            "agentPubkey": agent_pubkey,
            "streamPda": stream["stream_pda"],
        }
    )


# ─── On-chain ephemeral signer (CreateEphemeralSigner ix #23) ───────────
#
# Server builds a byte-perfect unsigned ix; owner signs in-browser via
# the wallet adapter and submits to devnet. This is the demo path the
# /app/agents page wires into.


@router.post("/agents/{agent_id}/wallet/build-tx")
async def agent_wallet_build_tx(agent_id: str, request: Request):
    """Build the unsigned `CreateEphemeralSigner` ix (#23).

    Returns the wallet-adapter-friendly JSON shape (programId / keys /
    base64 data). The dashboard signs + sends in-browser.

    Body (JSON):
      ownerPubkey       — base58 owner wallet (signs the tx)
      agentPubkey       — base58 agent grant pubkey on-chain (defaults to
                          the route param if it parses as base58 32-byte)
      ephemeralPubkey   — base58 EphemeralSigner PDA (frontend derives
                          via PublicKey.findProgramAddressSync)
      allowedActions    — u8 bitmap (see AllowedActions); default 0x05
                          (PAY_AND_PROXY: pay_x402 + proxy_call)
      expirySeconds     — u64; default 0 (no expiry)
    """
    from ..agents import agent_wallet
    from ..mpp import mpp_onchain

    body = await request.json()

    try:
        owner_pubkey = str(body["ownerPubkey"]).strip()
        agent_pubkey = str(body.get("agentPubkey") or agent_id).strip()
        ephemeral_pubkey = str(body["ephemeralPubkey"]).strip()
        allowed_actions = int(body.get("allowedActions", agent_wallet.AllowedActions.PAY_AND_PROXY))
        expiry_seconds = int(body.get("expirySeconds", 0))
    except (KeyError, TypeError, ValueError) as e:
        return JSONResponse({"detail": f"missing/invalid field: {e}"}, status_code=400)

    if not owner_pubkey or not ephemeral_pubkey:
        return JSONResponse(
            {"detail": "ownerPubkey and ephemeralPubkey are required"},
            status_code=400,
        )

    # Try the existing mpp_onchain config (production path with all envs
    # set). If unset, fall back to a minimal devnet config so the demo
    # button works out of the box. The owner signs, so we don't need a
    # settler keypair — but build_create_ephemeral_signer_ix expects a
    # MppConfig with vault_pda + program_id. We synthesize one for the
    # devnet demo: the program ID defaults to the deployed devnet program,
    # and `vault_pda` is sourced from KS_VAULT_PDA or the request body.
    config = mpp_onchain.load_mpp_config()
    if config is None:
        program_id = (
            os.environ.get("KS_KEYSHIELD_PROGRAM_ID", "").strip()
            or "DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj"
        )
        vault_pda = (
            os.environ.get("KS_VAULT_PDA", "").strip()
            or str(body.get("vaultPda") or "").strip()
            or None
        )
        config = mpp_onchain.MppConfig(
            secret_key=b"\x00" * 64,
            settler_pubkey="",
            platform_usdc_ata="",
            keyshield_program_id=program_id,
            usdc_mint="",
            vault_pda=vault_pda,
            rpc_url=os.environ.get("KS_SOLANA_RPC_URL", "https://api.devnet.solana.com").strip(),
        )

    if not config.vault_pda:
        # Allow request body to override (frontend can derive owner-vault
        # PDA via findProgramAddressSync as a fallback).
        body_vault = str(body.get("vaultPda") or "").strip()
        if body_vault:
            config = mpp_onchain.MppConfig(
                secret_key=config.secret_key,
                settler_pubkey=config.settler_pubkey,
                platform_usdc_ata=config.platform_usdc_ata,
                keyshield_program_id=config.keyshield_program_id,
                usdc_mint=config.usdc_mint,
                vault_pda=body_vault,
                rpc_url=config.rpc_url,
            )

    try:
        ix = agent_wallet.build_create_ephemeral_signer_ix(
            config=config,
            owner_pubkey=owner_pubkey,
            agent_pubkey=agent_pubkey,
            ephemeral_signer_pda=ephemeral_pubkey,
            allowed_actions=allowed_actions,
            expiry_seconds=expiry_seconds,
        )
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)

    return JSONResponse(
        {
            **_ix_to_response(ix),
            "programId": config.keyshield_program_id,
            "rpcUrl": config.rpc_url,
            "cluster": "devnet" if "devnet" in config.rpc_url else "mainnet",
        }
    )


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
