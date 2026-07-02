"""
agent_wallet.py — Ephemeral Signer (Agent Embedded Wallet) ix builders.

Wraps `CreateEphemeralSigner` (ix #23, see programs/keyshield/src/
instructions/agent_access.rs) so the server can build a byte-perfect
unsigned ix payload that the owner's wallet adapter signs in-browser.

This is the "agent embedded wallet" pillar — the differentiator vs.
Coinbase Agentic. Today the on-chain primitives exist (EphemeralSigner
struct, ix #23 dispatch) but the server + frontend wrapping is missing;
this module is the server half.

### What an "ephemeral signer" is

A per-agent ed25519 keypair the owner pre-authorizes via on-chain ix
#23. The on-chain `EphemeralSigner` struct (state.rs:312) records:
  - agent_pubkey      (which agent grant this binds to)
  - ephemeral_pubkey  (the keypair this signer can sign for)

When that agent later needs to sign on-chain (e.g. submit a `pay_x402`
ix #25 from spec 10), it signs with the ephemeral keypair instead of
asking the owner to re-sign every call. Spec 10 §Q6 + Q7.

### Allowed-action bitmap

The 1-byte `allowed_actions` field is a bitmap of operation classes the
ephemeral signer is authorized to perform. Mirrors `KS_ALLOWED_ACTION_*`
constants on the on-chain side (see error.rs:6072 reservation):

  bit 0 (0x01) — pay_x402            (sign x402 micropayment ixs)
  bit 1 (0x02) — mpp_record          (record usage in MPP stream)
  bit 2 (0x04) — proxy_call          (use the agent for /proxy/*)
  bit 3 (0x08) — read_vault          (decrypt API keys)
  bits 4-7    — reserved for future use

`AllowedActions.ALL` (0x0F) gives the agent full delegation; a tighter
default (`AllowedActions.PAY_AND_PROXY` = 0x05) just lets it pay+proxy
without exposing vault decryption.

### What's NOT done here (clear follow-ups)

- Top-up flow (`POST /agents/{id}/wallet/topup`) — owner sends SOL/USDC
  to the ephemeral signer's address. Needs a separate ix builder for
  the SystemProgram transfer + SPL Token transfer.
- Balance read — server-side helper that reads the ephemeral signer's
  on-chain balance via Solana RPC.
- Frontend AgentsSection.tsx button — wires `/wallet/create` build-tx
  through the wallet adapter sign+submit (pairs with frontend Bucket 1).
"""

from __future__ import annotations

import hashlib
import json
import logging

# Re-use mpp_onchain's _SimpleInstruction / _SimpleAccountMeta + base58 helpers
# so this module's surface mirrors the same wallet-adapter contract.
from ..mpp import mpp_onchain

logger = logging.getLogger(__name__)


# Discriminator for ix #23 (lib.rs:124, agent_access.rs).
CREATE_EPHEMERAL_SIGNER_DISCRIMINATOR = 23

# Discriminator for ix #25 (pay_x402.rs) — agent-signed x402 micropayment.
PAY_X402_DISCRIMINATOR = 25

# The on-chain ephemeral signer PDA seed. Per spec 10 §Q7 the PDA is
# derived from ["ephemeral_signer", agent_pubkey, owner_pubkey].
EPHEMERAL_SIGNER_SEED = b"ephemeral_signer"


# ─── allowed-action bitmap ────────────────────────────────────────────────


class AllowedActions:
    """1-byte bitmap mirroring the on-chain `allowed_actions` field."""

    PAY_X402: int = 0x01
    MPP_RECORD: int = 0x02
    PROXY_CALL: int = 0x04
    READ_VAULT: int = 0x08

    # Common presets.
    ALL = PAY_X402 | MPP_RECORD | PROXY_CALL | READ_VAULT
    """Full delegation — agent can do anything within its grant scope."""

    PAY_AND_PROXY = PAY_X402 | PROXY_CALL
    """Default for agents that need to pay + run proxy calls but should
    NOT decrypt raw API keys (uses ks-proxy injection instead)."""

    PAY_ONLY = PAY_X402
    """Tightest preset — agent only signs x402 micropayments."""


# ─── ix builders ──────────────────────────────────────────────────────────


def build_create_ephemeral_signer_ix_data(
    allowed_actions: int,
    expiry_seconds: int,
) -> bytes:
    """Construct the full ix data payload for create_ephemeral_signer.

    Wire layout (matches agent_access.rs handler after dispatcher
    strips byte 0):

      [0]:    discriminator = 23 (0x17)
      [1]:    allowed_actions (u8 bitmap)
      [2..10]: expiry_seconds (u64 little-endian; 0 = no expiry)

    Total 10 bytes. The on-chain handler checks `data.len() < 9` after
    dispatcher strip → matches the 10-byte wire payload.
    """
    if not 0 <= allowed_actions <= 0xFF:
        raise ValueError("allowed_actions must fit u8 (0..=255)")
    if expiry_seconds < 0 or expiry_seconds > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("expiry_seconds out of u64 range")
    return (
        bytes([CREATE_EPHEMERAL_SIGNER_DISCRIMINATOR])
        + bytes([allowed_actions])
        + int(expiry_seconds).to_bytes(8, "little")
    )


def build_create_ephemeral_signer_ix(
    config: mpp_onchain.MppConfig,
    owner_pubkey: str,
    agent_pubkey: str,
    ephemeral_signer_pda: str,
    allowed_actions: int,
    expiry_seconds: int,
) -> mpp_onchain._SimpleInstruction:
    """Build the full create_ephemeral_signer instruction.

    Account order matches agent_access.rs:
      0. [signer]    owner                       (owner_pubkey)
      1. []          UniversalVault              (config.vault_pda)
      2. [writable]  EphemeralSigner PDA          (ephemeral_signer_pda)
      3. []          AgentGrant pubkey            (agent_pubkey)
      4. []          System Program

    Owner signs in-browser via wallet adapter. Server only constructs
    the byte-perfect payload.
    """
    if not config.vault_pda:
        raise ValueError(
            "config.vault_pda is required to build create_ephemeral_signer ix; "
            "set KS_VAULT_PDA env var",
        )

    accounts = (
        mpp_onchain._SimpleAccountMeta(
            pubkey=owner_pubkey,
            is_signer=True,
            is_writable=False,
        ),
        mpp_onchain._SimpleAccountMeta(
            pubkey=config.vault_pda,
            is_signer=False,
            is_writable=False,
        ),
        mpp_onchain._SimpleAccountMeta(
            pubkey=ephemeral_signer_pda,
            is_signer=False,
            is_writable=True,
        ),
        mpp_onchain._SimpleAccountMeta(
            pubkey=agent_pubkey,
            is_signer=False,
            is_writable=False,
        ),
        mpp_onchain._SimpleAccountMeta(
            pubkey=mpp_onchain.SYSTEM_PROGRAM_ID,
            is_signer=False,
            is_writable=False,
        ),
    )
    return mpp_onchain._SimpleInstruction(
        program_id=config.keyshield_program_id,
        accounts=accounts,
        data=build_create_ephemeral_signer_ix_data(
            allowed_actions=allowed_actions,
            expiry_seconds=expiry_seconds,
        ),
    )


# ─── pay_x402 (ix #25) — spec 10 Q1 ───────────────────────────────────────
#
# The agent-signed x402 micropayment. Unlike ix #23/#24/#27 (owner-signed,
# built here and signed in-browser), pay_x402 is signed by the AGENT's
# keypair — for server-held wallets (server_wallet.py) the server can
# sign + submit directly, which is what `POST /agents/{id}/wallet/pay_x402`
# does. This closes the `EmbeddedWalletInterceptor` loop in
# proxy/x402_interceptor.py.


def canonical_envelope_hash(envelope: dict) -> bytes:
    """sha256 of the canonical X402Envelope JSON.

    The on-chain ix stores (envelope_hash, nonce) in the stream's
    replay ring buffer but does not itself parse the envelope — so the
    off-chain canonical form defined HERE is authoritative. Keep the
    field set + ordering stable forever: network, amountRequired,
    payTo, asset, resource (sorted-key JSON, no whitespace).
    """
    canonical = json.dumps(
        {
            "amountRequired": int(envelope.get("amountRequired") or envelope.get("amount_required") or 0),
            "asset": str(envelope.get("asset") or ""),
            "network": str(envelope.get("network") or ""),
            "payTo": str(envelope.get("payTo") or envelope.get("pay_to") or ""),
            "resource": str(envelope.get("resource") or ""),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).digest()


def build_pay_x402_ix_data(
    amount_micro_usdc: int,
    nonce: bytes,
    expires_at: int,
    envelope_hash: bytes,
) -> bytes:
    """Construct the full ix data payload for `pay_x402`.

    Wire layout (matches pay_x402.rs after dispatcher strips byte 0):

      [0]:      discriminator = 25 (0x19)
      [1..9]:   amount as u64 little-endian (micro-USDC)
      [9..25]:  nonce (16 random bytes, replay protection)
      [25..33]: expires_at as i64 little-endian (unix seconds)
      [33..65]: envelope_hash (sha256, 32 bytes)

    Total 65 bytes (1 + 64 — matches the `data.len() < 64` check at
    pay_x402.rs:60 once the dispatcher strips the lead byte).
    """
    if amount_micro_usdc <= 0:
        raise ValueError("amount_micro_usdc must be positive (matches on-chain check)")
    if amount_micro_usdc > 0xFFFFFFFFFFFFFFFF:
        raise ValueError("amount_micro_usdc exceeds u64 range")
    if len(nonce) != 16:
        raise ValueError("nonce must be exactly 16 bytes")
    if len(envelope_hash) != 32:
        raise ValueError("envelope_hash must be exactly 32 bytes")
    if not (-0x8000000000000000 <= expires_at <= 0x7FFFFFFFFFFFFFFF):
        raise ValueError("expires_at out of i64 range")
    return (
        bytes([PAY_X402_DISCRIMINATOR])
        + int(amount_micro_usdc).to_bytes(8, "little")
        + nonce
        + int(expires_at).to_bytes(8, "little", signed=True)
        + envelope_hash
    )


def build_pay_x402_ix(
    program_id: str,
    vault_pda: str,
    stream_pda: str,
    stream_usdc_ata: str,
    recipient_usdc_ata: str,
    usdc_mint: str,
    agent_pubkey: str,
    amount_micro_usdc: int,
    nonce: bytes,
    expires_at: int,
    envelope_hash: bytes,
) -> mpp_onchain._SimpleInstruction:
    """Build the full pay_x402 instruction.

    Account order matches pay_x402.rs:40-47:

      0. [signer]    EphemeralSigner / agent      (agent_pubkey)
      1. []          UniversalVault               (vault_pda)
      2. [writable]  AgentPaymentStream PDA       (stream_pda)
      3. [writable]  PaymentStream USDC ATA       (stream_usdc_ata, debit source)
      4. [writable]  Recipient USDC ATA           (recipient_usdc_ata)
      5. []          USDC mint
      6. []          SPL Token Program
      7. []          This program (PDA self-validation)
    """
    accounts = (
        mpp_onchain._SimpleAccountMeta(pubkey=agent_pubkey, is_signer=True, is_writable=False),
        mpp_onchain._SimpleAccountMeta(pubkey=vault_pda, is_signer=False, is_writable=False),
        mpp_onchain._SimpleAccountMeta(pubkey=stream_pda, is_signer=False, is_writable=True),
        mpp_onchain._SimpleAccountMeta(pubkey=stream_usdc_ata, is_signer=False, is_writable=True),
        mpp_onchain._SimpleAccountMeta(
            pubkey=recipient_usdc_ata, is_signer=False, is_writable=True
        ),
        mpp_onchain._SimpleAccountMeta(pubkey=usdc_mint, is_signer=False, is_writable=False),
        mpp_onchain._SimpleAccountMeta(
            pubkey=mpp_onchain.TOKEN_PROGRAM_ID, is_signer=False, is_writable=False
        ),
        mpp_onchain._SimpleAccountMeta(pubkey=program_id, is_signer=False, is_writable=False),
    )
    return mpp_onchain._SimpleInstruction(
        program_id=program_id,
        accounts=accounts,
        data=build_pay_x402_ix_data(
            amount_micro_usdc=amount_micro_usdc,
            nonce=nonce,
            expires_at=expires_at,
            envelope_hash=envelope_hash,
        ),
    )


async def submit_pay_x402(
    ix: mpp_onchain._SimpleInstruction,
    agent_seed_32: bytes,
    rpc_url: str,
) -> str:
    """Sign the pay_x402 ix with the agent's ed25519 seed and submit.

    The agent keypair is BOTH the ix signer (account 0) and the fee
    payer, so the agent wallet needs a small SOL balance for fees —
    that's the documented top-up requirement for server-held wallets.

    Returns the base58 tx signature. Raises MppSubmitError on failure
    (same contract as mpp_onchain.submit_mpp_settle).
    """
    if not mpp_onchain._HAS_SOLDERS:
        raise mpp_onchain.MppSubmitError(
            "solders package not installed — cannot submit pay_x402 ix",
        )
    try:
        import httpx  # type: ignore
    except ImportError as e:
        raise mpp_onchain.MppSubmitError(f"httpx not installed: {e}") from e

    import base64 as _b64

    try:
        kp = mpp_onchain.Keypair.from_seed(agent_seed_32)  # type: ignore[union-attr]
        metas = [
            mpp_onchain.AccountMeta(  # type: ignore[union-attr]
                pubkey=mpp_onchain.Pubkey.from_string(a.pubkey),  # type: ignore[union-attr]
                is_signer=a.is_signer,
                is_writable=a.is_writable,
            )
            for a in ix.accounts
        ]
        sd_ix = mpp_onchain.SoldersInstruction(  # type: ignore[union-attr]
            program_id=mpp_onchain.Pubkey.from_string(ix.program_id),  # type: ignore[union-attr]
            accounts=metas,
            data=ix.data,
        )
    except Exception as e:  # noqa: BLE001
        raise mpp_onchain.MppSubmitError(f"failed to build solders ix: {e}") from e

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getLatestBlockhash",
                "params": [{"commitment": "confirmed"}],
            },
        )
        bh_body = resp.json()
        if "error" in bh_body:
            raise mpp_onchain.MppSubmitError(f"getLatestBlockhash error: {bh_body['error']}")
        blockhash_str = (bh_body.get("result") or {}).get("value", {}).get("blockhash")
        if not blockhash_str:
            raise mpp_onchain.MppSubmitError("getLatestBlockhash response missing blockhash")
        blockhash = mpp_onchain.Hash.from_string(blockhash_str)  # type: ignore[union-attr]

        msg = mpp_onchain.Message.new_with_blockhash(  # type: ignore[union-attr]
            [sd_ix], kp.pubkey(), blockhash
        )
        tx = mpp_onchain.Transaction([kp], msg, blockhash)  # type: ignore[union-attr]

        send_resp = await client.post(
            rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "sendTransaction",
                "params": [
                    _b64.b64encode(bytes(tx)).decode("ascii"),
                    {"encoding": "base64", "preflightCommitment": "confirmed"},
                ],
            },
        )
        send_body = send_resp.json()
        if "error" in send_body:
            raise mpp_onchain.MppSubmitError(f"sendTransaction error: {send_body['error']}")
        sig = send_body.get("result")
        if not sig:
            raise mpp_onchain.MppSubmitError("sendTransaction response missing signature")
        return str(sig)


def derive_ephemeral_signer_pda(
    agent_pubkey: str,
    owner_pubkey: str,
    program_id: str,
) -> tuple[str, int]:
    """Derive the EphemeralSigner PDA from
    ["ephemeral_signer", agent_pubkey, owner_pubkey].

    Mirrors the on-chain `seeds!` macro for ix #23. Returns
    (pda_base58, bump). Requires `solders`; raises MppSubmitError if
    not installed (caller falls back to "frontend computes the PDA").
    """
    if not mpp_onchain._HAS_SOLDERS:
        raise mpp_onchain.MppSubmitError(
            "solders not installed — cannot derive ephemeral signer PDA. "
            "Frontend can compute it via PublicKey.findProgramAddressSync.",
        )
    try:
        agent_pk = mpp_onchain.Pubkey.from_string(agent_pubkey)  # type: ignore[union-attr]
        owner_pk = mpp_onchain.Pubkey.from_string(owner_pubkey)  # type: ignore[union-attr]
        program_pk = mpp_onchain.Pubkey.from_string(program_id)  # type: ignore[union-attr]
    except Exception as e:
        raise mpp_onchain.MppSubmitError(f"invalid pubkey: {e}") from e

    pda, bump = mpp_onchain.Pubkey.find_program_address(  # type: ignore[union-attr]
        [EPHEMERAL_SIGNER_SEED, bytes(agent_pk), bytes(owner_pk)],
        program_pk,
    )
    return (str(pda), bump)
