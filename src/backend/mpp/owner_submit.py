"""Owner-signed MPP submissions using the encrypted owner keystore.

Vault / grant / open / withdraw are owner-signed. When the keystore
(or a gitignored `user-devnet.json`) is loaded, the API signs and
sends instead of returning an unsigned ix for Phantom.

The session wallet must equal the owner pubkey. A leftover empty
settler key is not a substitute for a funded owner.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import replace

from . import mpp_onchain, mpp_streams, owner_keystore

logger = logging.getLogger(__name__)


class OwnerSubmitError(Exception):
    """Owner auto-sign could not build or submit the transaction."""


def _already_on_chain(msg: str) -> bool:
    return bool(
        msg
        and (
            "already in use" in msg.lower()
            or "already been processed" in msg.lower()
            or "already exists" in msg.lower()
        )
    )


def _require_owner() -> owner_keystore.OwnerKey:
    owner = owner_keystore.load_owner()
    if owner is None:
        raise owner_keystore.OwnerKeystoreError("owner keystore is empty")
    return owner


def _require_config() -> mpp_onchain.MppConfig:
    config = mpp_onchain.load_mpp_config()
    if config is None:
        raise OwnerSubmitError("MPP settler config is not loaded")
    return config


def _config_with_vault(config: mpp_onchain.MppConfig, vault_pda: str) -> mpp_onchain.MppConfig:
    """Always bind open/withdraw to the session owner's vault.

    `KS_VAULT_PDA` is the settler vault from `devnet-setup.sh`. Using
    that PDA when the owner is a different funded wallet makes
    `open_payment_stream` fail with UniversalVaultNotFound (6010).
    """
    return replace(config, vault_pda=vault_pda)


def _assert_session_owner(user_id: str, owner: owner_keystore.OwnerKey) -> None:
    if user_id != owner.pubkey_b58:
        raise OwnerSubmitError("autosign open requires the session wallet to be the owner")


def owner_status() -> dict:
    """Public autosign status — pubkeys only, never the secret."""
    keystore = owner_keystore.owner_status()
    config = mpp_onchain.load_mpp_config()
    if keystore.get("loaded"):
        return {
            "loaded": True,
            "mode": "owner-keystore",
            "pubkey": keystore["pubkey"],
            "settlerPubkey": None if config is None else config.settler_pubkey,
            "rpc": None if config is None else config.rpc_url,
            "programId": None if config is None else config.keyshield_program_id,
            "usdcMint": None if config is None else config.usdc_mint,
        }
    if config is None:
        return {"loaded": False, "mode": "owner-keystore", "pubkey": None}
    return {
        "loaded": False,
        "mode": "owner-keystore",
        "pubkey": None,
        "settlerPubkey": config.settler_pubkey,
        "rpc": config.rpc_url,
        "programId": config.keyshield_program_id,
        "usdcMint": config.usdc_mint,
    }


async def _send(config: mpp_onchain.MppConfig, owner: owner_keystore.OwnerKey, ixs) -> str:
    return await mpp_onchain.submit_signed_instructions(
        config.rpc_url,
        owner.secret_64,
        list(ixs),
    )


async def ensure_vault_and_payments() -> dict:
    owner = _require_owner()
    config = _require_config()
    vault_pda, bump = mpp_onchain.derive_universal_vault_pda(
        owner.pubkey_b58,
        config.keyshield_program_id,
    )
    created = False
    enabled = False
    if not await mpp_onchain.rpc_account_exists(config.rpc_url, vault_pda):
        ix = mpp_onchain.build_create_universal_vault_ix(
            program_id=config.keyshield_program_id,
            owner_pubkey=owner.pubkey_b58,
            vault_pda=vault_pda,
            bump=bump,
        )
        sig = await _send(config, owner, [ix])
        created = True
        logger.info("autosign created vault %s tx=%s", vault_pda, sig)
        # Devnet RPC can still return AccountNotFound for a few hundred ms
        # after sendTransaction; wait until the vault account is visible.
        for _ in range(8):
            if await mpp_onchain.rpc_account_exists(config.rpc_url, vault_pda):
                break
            await asyncio.sleep(0.4)
    enable_ix = mpp_onchain.build_update_universal_policy_flags_ix(
        program_id=config.keyshield_program_id,
        owner_pubkey=owner.pubkey_b58,
        vault_pda=vault_pda,
        flags=mpp_onchain.PAYMENT_ENABLED_FLAG,
    )
    try:
        sig = await _send(config, owner, [enable_ix])
        enabled = True
        logger.info("autosign enabled payments vault=%s tx=%s", vault_pda, sig)
    except mpp_onchain.MppSubmitError as exc:
        logger.info("autosign enable-payments skipped: %s", exc)
    return {
        "vaultPda": vault_pda,
        "bump": bump,
        "created": created,
        "paymentsEnabled": enabled,
        "ownerPubkey": owner.pubkey_b58,
    }


async def submit_grant(agent_pubkey: str, max_spend_micro_usdc: int = 0) -> dict:
    owner = _require_owner()
    vault = await ensure_vault_and_payments()
    vault_pda = vault["vaultPda"]
    ix = mpp_onchain.build_grant_agent_access_ix(
        program_id=_require_config().keyshield_program_id,
        owner_pubkey=owner.pubkey_b58,
        vault_pda=vault_pda,
        agent_pubkey=agent_pubkey,
        payment_stream_enabled=True,
        max_spend_micro_usdc=max_spend_micro_usdc,
    )
    try:
        sig = await _send(_require_config(), owner, [ix])
    except mpp_onchain.MppSubmitError as exc:
        msg = str(exc)
        if _already_on_chain(msg):
            logger.info("autosign grant already on chain")
            return {
                "vaultPda": vault_pda,
                "agentPubkey": agent_pubkey,
                "skipped": True,
                "ownerPubkey": owner.pubkey_b58,
            }
        raise OwnerSubmitError(f"grant failed: {exc}") from exc
    return {
        "vaultPda": vault_pda,
        "agentPubkey": agent_pubkey,
        "txSignature": sig,
        "ownerPubkey": owner.pubkey_b58,
    }


async def submit_open_for_stream(
    user_id: str,
    stream_id: int,
    max_total_micro_usdc: int,
    owner_usdc_ata: str | None = None,
) -> dict:
    owner = _require_owner()
    _assert_session_owner(user_id, owner)
    config = _require_config()
    conn = mpp_streams._db()  # noqa: SLF001
    try:
        row = mpp_streams._get_owned_stream(conn, user_id, stream_id)  # noqa: SLF001
    finally:
        conn.close()

    await submit_grant(row["agent_pubkey"], max_spend_micro_usdc=max_total_micro_usdc)
    vault = await ensure_vault_and_payments()
    config = _config_with_vault(config, vault["vaultPda"])
    stream_pda, bump = mpp_onchain.derive_agent_payment_stream_pda(
        row["agent_pubkey"],
        owner.pubkey_b58,
        config.keyshield_program_id,
    )
    stream_usdc_ata = mpp_onchain.derive_associated_token_address(
        owner_pubkey=stream_pda,
        mint_pubkey=config.usdc_mint,
    )
    source_ata = owner_usdc_ata or mpp_onchain.derive_associated_token_address(
        owner_pubkey=owner.pubkey_b58,
        mint_pubkey=config.usdc_mint,
    )
    create_owner_ata = mpp_onchain.build_create_ata_idempotent_ix(
        payer_pubkey=owner.pubkey_b58,
        ata_pubkey=source_ata,
        owner_pubkey=owner.pubkey_b58,
        mint_pubkey=config.usdc_mint,
    )
    create_ata = mpp_onchain.build_create_ata_idempotent_ix(
        payer_pubkey=owner.pubkey_b58,
        ata_pubkey=stream_usdc_ata,
        owner_pubkey=stream_pda,
        mint_pubkey=config.usdc_mint,
    )
    fund = mpp_onchain.build_spl_transfer_checked_ix(
        source_ata=source_ata,
        dest_ata=stream_usdc_ata,
        mint_pubkey=config.usdc_mint,
        authority_pubkey=owner.pubkey_b58,
        amount_micro_usdc=max_total_micro_usdc,
    )
    open_ix = mpp_onchain.build_open_payment_stream_ix(
        config=config,
        owner_pubkey=owner.pubkey_b58,
        agent_pubkey=row["agent_pubkey"],
        stream_pda=stream_pda,
        usdc_ata=stream_usdc_ata,
        bump=bump,
        max_total_micro_usdc=max_total_micro_usdc,
        cost_per_unit_micro_usdc=1,
        max_rate_usd_per_min_bits=0,
        settlement_interval_secs=int(row["settlement_interval_secs"] or 60),
    )
    sig = await _send(config, owner, [create_owner_ata, create_ata, fund, open_ix])
    recorded = mpp_streams.record_tx_signature(
        user_id,
        stream_id,
        sig,
        stream_pda=stream_pda,
        stream_usdc_ata=stream_usdc_ata,
    )
    return {
        "txSignature": sig,
        "streamPda": stream_pda,
        "streamUsdcAta": stream_usdc_ata,
        "ownerPubkey": owner.pubkey_b58,
        "vaultPda": vault["vaultPda"],
        "stream": recorded,
    }


async def submit_full_open(user_id: str, body: dict) -> dict:
    """Create the off-chain row, grant the agent, fund and open on-chain."""
    owner = _require_owner()
    _assert_session_owner(user_id, owner)
    agent_pubkey = str(body.get("agentPubkey") or body.get("agent_pubkey") or "").strip()
    if not agent_pubkey:
        raise OwnerSubmitError("agentPubkey is required")
    raw_cap = body.get("maxTotalMicroUsdc", body.get("max_total_micro_usdc"))
    if raw_cap is None:
        raise OwnerSubmitError("maxTotalMicroUsdc is required")
    max_total = int(raw_cap)
    if max_total <= 0:
        raise OwnerSubmitError("maxTotalMicroUsdc must be positive")

    stream = mpp_streams.open_stream(
        user_id=user_id,
        agent_pubkey=agent_pubkey,
        agent_name=str(body.get("agentName") or body.get("agent_name") or "").strip(),
        upstream=str(body.get("upstream") or "").strip(),
        rate_per_token=int(body.get("ratePerTokenMicroUsdc") or body.get("ratePerToken") or 1),
        rate_per_call=int(body.get("ratePerCallMicroUsdc") or body.get("ratePerCall") or 0),
        settlement_interval=int(
            body.get("settlementIntervalSecs") or body.get("settlementInterval") or 60
        ),
        max_total_micro_usdc=max_total,
    )
    opened = await submit_open_for_stream(
        user_id,
        int(stream["id"]),
        max_total,
        owner_usdc_ata=body.get("usdcAta") or body.get("ownerUsdcAta"),
    )
    return opened
