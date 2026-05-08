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

import logging
from dataclasses import dataclass
from typing import Optional

# Re-use mpp_onchain's _SimpleInstruction / _SimpleAccountMeta + base58 helpers
# so this module's surface mirrors the same wallet-adapter contract.
from ..mpp import mpp_onchain

logger = logging.getLogger(__name__)


# Discriminator for ix #23 (lib.rs:124, agent_access.rs).
CREATE_EPHEMERAL_SIGNER_DISCRIMINATOR = 23

# The on-chain ephemeral signer PDA seed. Per spec 10 §Q7 the PDA is
# derived from ["ephemeral_signer", agent_pubkey, owner_pubkey].
EPHEMERAL_SIGNER_SEED = b"ephemeral_signer"


# ─── allowed-action bitmap ────────────────────────────────────────────────


class AllowedActions:
    """1-byte bitmap mirroring the on-chain `allowed_actions` field."""

    PAY_X402:   int = 0x01
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
            pubkey=owner_pubkey, is_signer=True, is_writable=False,
        ),
        mpp_onchain._SimpleAccountMeta(
            pubkey=config.vault_pda, is_signer=False, is_writable=False,
        ),
        mpp_onchain._SimpleAccountMeta(
            pubkey=ephemeral_signer_pda, is_signer=False, is_writable=True,
        ),
        mpp_onchain._SimpleAccountMeta(
            pubkey=agent_pubkey, is_signer=False, is_writable=False,
        ),
        mpp_onchain._SimpleAccountMeta(
            pubkey=mpp_onchain.SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False,
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
        agent_pk = mpp_onchain.Pubkey.from_string(agent_pubkey)        # type: ignore[union-attr]
        owner_pk = mpp_onchain.Pubkey.from_string(owner_pubkey)        # type: ignore[union-attr]
        program_pk = mpp_onchain.Pubkey.from_string(program_id)        # type: ignore[union-attr]
    except Exception as e:
        raise mpp_onchain.MppSubmitError(f"invalid pubkey: {e}") from e

    pda, bump = mpp_onchain.Pubkey.find_program_address(  # type: ignore[union-attr]
        [EPHEMERAL_SIGNER_SEED, bytes(agent_pk), bytes(owner_pk)],
        program_pk,
    )
    return (str(pda), bump)
