//! `withdraw_agent_wallet` (ix #27) — owner reclaims residual funds.
//!
//! Spec 10 Q6 (line 418-453). Once the AgentGrant has been revoked
//! (i.e. `revoked_at != 0`), the owner is allowed to drain the
//! remaining USDC out of the agent's PaymentStream into their own
//! USDC ATA, then close both the token ATA and the AgentPaymentStream
//! PDA so rent is reclaimed.
//!
//! This handler does not auto-revoke. Owner must have already called
//! the existing `revoke_agent` ix (which sets `is_active = 0` and
//! writes `revoked_at`) before this one will succeed. This split
//! prevents the server from accidentally triggering a withdraw on an
//! active stream — only the explicit owner-signed ordering wins.

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::Pubkey,
    seeds,
    ProgramResult,
};
use pinocchio_token::instructions::{CloseAccount, TransferChecked};

use crate::{
    error::KeyShieldError,
    state::{
        aps_offset, AgentPaymentStream, AGENT_GRANTS_START, AGENT_GRANT_SIZE,
        AGENT_GRANT_REVOKED_AT_OFFSET, MAX_AGENTS, UniversalVault,
        AGENT_PAYMENT_STREAM_DISCRIMINATOR,
    },
    instructions::open_stream::APS_SEED,
};

/// Process `withdraw_agent_wallet` (ix #27).
///
/// ### Accounts
/// 0. `[signer, writable]` Owner — recipient of the residual lamports.
/// 1. `[]`                 UniversalVault — to confirm the agent grant
///                         has been revoked.
/// 2. `[writable]`         AgentPaymentStream PDA (will be closed).
/// 3. `[writable]`         PaymentStream's USDC ATA (drained + closed).
/// 4. `[writable]`         Owner's USDC ATA (residual destination).
/// 5. `[]`                 USDC mint.
/// 6. `[]`                 SPL Token Program.
///
/// ### Data
/// `withdraw_amount` (8) u64 micro-USDC the caller claims is currently
///   in the source ATA. Off-chain code passes it explicitly so we can
///   transfer the exact amount without parsing the SPL token account.
///   The SPL `transfer_checked` will itself reject if the ATA balance
///   is smaller, so a wrong value is safe — it just causes the ix to
///   fail rather than silently miscalculate.
pub fn process_withdraw_agent_wallet(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 8 {
        return Err(KeyShieldError::InvalidPaymentAmount.into());
    }

    let mut iter = accounts.iter();
    let owner = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let owner_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let usdc_mint = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _spl_token = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    if !owner.is_signer() {
        return Err(KeyShieldError::NotOwner.into());
    }

    let withdraw_amount = u64::from_le_bytes(
        data[0..8]
            .try_into()
            .map_err(|_| KeyShieldError::InvalidPaymentAmount)?,
    );

    // Read AgentPaymentStream metadata.
    let mut sbuf = stream.try_borrow_mut_data()?;
    if sbuf.len() < AgentPaymentStream::SIZE {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }
    let discriminator = &sbuf[aps_offset::DISCRIMINATOR..aps_offset::DISCRIMINATOR + 8];
    if crate::guards::is_closed_account(discriminator) {
        return Err(KeyShieldError::AccountClosed.into());
    }
    if discriminator != AGENT_PAYMENT_STREAM_DISCRIMINATOR.as_ref() {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }

    let stream_owner_bytes: [u8; 32] = sbuf[aps_offset::OWNER..aps_offset::OWNER + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_owner = Pubkey::try_from(&stream_owner_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if &stream_owner != owner.key() {
        return Err(KeyShieldError::NotOwner.into());
    }
    let stream_agent_bytes: [u8; 32] = sbuf
        [aps_offset::AGENT_PUBKEY..aps_offset::AGENT_PUBKEY + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_agent = Pubkey::try_from(&stream_agent_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;

    let stream_mint_bytes: [u8; 32] = sbuf[aps_offset::USDC_MINT..aps_offset::USDC_MINT + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_mint = Pubkey::try_from(&stream_mint_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if &stream_mint != usdc_mint.key() {
        return Err(KeyShieldError::InvalidEnvelope.into());
    }

    let stream_ata_bytes: [u8; 32] = sbuf[aps_offset::USDC_ATA..aps_offset::USDC_ATA + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_ata_pk = Pubkey::try_from(&stream_ata_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if &stream_ata_pk != stream_ata.key() {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }

    // Confirm grant has been revoked
    {
        let vault_data = borrow_vault!(vault);
        if &vault_data[0..8] != UniversalVault::DISCRIMINATOR.as_ref() {
            return Err(KeyShieldError::UniversalVaultNotFound.into());
        }
        let vault_owner_bytes: [u8; 32] = vault_data[8..40]
            .try_into()
            .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
        let vault_owner = Pubkey::try_from(&vault_owner_bytes[..])
            .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
        if vault_owner != stream_owner {
            return Err(KeyShieldError::NotOwner.into());
        }

        let mut found_revoked = false;
        let mut found_grant = false;
        for i in 0..MAX_AGENTS {
            let off = AGENT_GRANTS_START + i * AGENT_GRANT_SIZE;
            let pk_bytes: [u8; 32] = vault_data[off..off + 32]
                .try_into()
                .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
            let pk = Pubkey::try_from(&pk_bytes[..])
                .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
            if pk == stream_agent && pk != Pubkey::default() {
                found_grant = true;
                let is_active = vault_data[off + 58];
                let revoked_at_off = off + AGENT_GRANT_REVOKED_AT_OFFSET;
                let revoked_at = i64::from_le_bytes(
                    vault_data[revoked_at_off..revoked_at_off + 8]
                        .try_into()
                        .map_err(|_| KeyShieldError::AgentGrantNotFound)?,
                );
                // Either explicit revoked_at marker, or the legacy
                // is_active=0 path. Both count as revoked.
                if revoked_at != 0 || is_active == 0 {
                    found_revoked = true;
                }
                break;
            }
        }
        if !found_grant {
            return Err(KeyShieldError::AgentGrantNotFound.into());
        }
        if !found_revoked {
            return Err(KeyShieldError::PaymentStreamActive.into());
        }
    }

    // Read the canonical bump before the tombstone zeroes the account
    // body. The tombstone is written before the CPI so a re-entrant
    // settle sees a closed account. The write reverts if the transfer fails.
    let bump = sbuf[aps_offset::BUMP];
    crate::guards::seal_closed_account(&mut sbuf);
    drop(sbuf);

    {
        let mint_data = usdc_mint.try_borrow_data()?;
        crate::guards::assert_canonical_usdc_mint(usdc_mint.key(), usdc_mint.owner(), &mint_data)?;
    }
    {
        let ata_data = stream_ata.try_borrow_data()?;
        crate::guards::assert_escrow_token_account(&ata_data, usdc_mint.key(), stream.key())?;
    }
    crate::guards::assert_stream_pda(
        _program_id,
        stream.key(),
        &stream_agent,
        &stream_owner,
        bump,
    )?;

    // CPI 1: drain remaining USDC into owner's ATA (if non-zero)
    let bump_arr = [bump];
    let stream_seeds = seeds!(
        APS_SEED,
        stream_agent.as_ref(),
        stream_owner.as_ref(),
        &bump_arr
    );
    let pda_signer = Signer::from(&stream_seeds);

    if withdraw_amount > 0 {
        TransferChecked {
            from: stream_ata,
            mint: usdc_mint,
            to: owner_ata,
            authority: stream,
            amount: withdraw_amount,
            decimals: AgentPaymentStream::USDC_DECIMALS,
        }
        .invoke_signed(&[pda_signer.clone()])?;
    }

    // CPI 2: close the USDC ATA — sends the rent lamports to owner
    CloseAccount {
        account: stream_ata,
        destination: owner,
        authority: stream,
    }
    .invoke_signed(&[pda_signer])?;

    // Reclaim rent. The tombstone stays in the first 8 bytes so a
    // same-transaction reopen cannot treat the account as fresh.
    // Lamports move to the owner with checked addition.
    {
        let mut owner_lamports = owner.try_borrow_mut_lamports()?;
        let mut stream_lamports = stream.try_borrow_mut_lamports()?;
        *owner_lamports = owner_lamports
            .checked_add(*stream_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        *stream_lamports = 0;
    }

    Ok(())
}
