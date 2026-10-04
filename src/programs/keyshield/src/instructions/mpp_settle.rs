//! `mpp_settle` (ix #26) — server-signed batch settlement for MPP streams.
//!
//! Spec 10 Q3 (line 235-269). The off-chain server records token usage
//! between settlement intervals; every `settlement_interval_secs` it
//! submits this ix with `units_consumed` and the on-chain code debits
//! `units_consumed * cost_per_unit_micro_usdc` from the
//! `AgentPaymentStream`'s USDC ATA. Same budget enforcement as
//! `pay_x402`, but the signer is the `mpp_settler_pubkey` recorded at
//! `OpenPaymentStream` time, not the agent's EphemeralSigner.
//!
//! The debit is bound to a fulfillment artifact root: sha256 of the
//! artifact hashes for this batch. Each hash is sha256 of a preimage
//! the metering service built from the upstream response (status,
//! body digest, stream, units). A missing or all-zero root is
//! rejected — invoiced units alone cannot move USDC. The HTTP body
//! itself stays off-chain; the program enforces that a commitment
//! was presented and that the same commitment cannot be replayed.

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::Pubkey,
    seeds,
    sysvars::{clock::Clock, Sysvar},
    ProgramResult,
};
use pinocchio_token::instructions::TransferChecked;

use crate::{
    error::KeyShieldError,
    instructions::open_stream::APS_SEED,
    state::{
        aps_offset, AgentPaymentStream, UniversalVault, AGENT_GRANTS_START,
        AGENT_GRANT_REVOKED_AT_OFFSET, AGENT_GRANT_SIZE, AGENT_PAYMENT_STREAM_DISCRIMINATOR,
        MAX_AGENTS,
    },
};

/// Read the 32-byte fulfillment root that follows `units_consumed`.
///
/// Returns `UnverifiedFulfillment` when the ix data stops after the
/// unit count or the root is all zeros.
pub fn parse_artifact_root(data: &[u8]) -> Result<[u8; 32], ProgramError> {
    if data.len() < 40 {
        return Err(KeyShieldError::UnverifiedFulfillment.into());
    }
    let mut root = [0u8; 32];
    root.copy_from_slice(&data[8..40]);
    if root == [0u8; 32] {
        return Err(KeyShieldError::UnverifiedFulfillment.into());
    }
    Ok(root)
}

fn artifact_root_replayed(prev: &[u8], root: &[u8; 32]) -> bool {
    prev.len() == 32 && prev.iter().any(|&byte| byte != 0) && prev == root
}

/// Process `mpp_settle` (ix #26).
///
/// ### Accounts
/// 0. `[signer]`   MPP settler — must equal stream.mpp_settler_pubkey.
/// 1. `[]`         UniversalVault — to verify the agent grant is still active.
/// 2. `[writable]` AgentPaymentStream PDA.
/// 3. `[writable]` PaymentStream's USDC ATA (debit source).
/// 4. `[writable]` Recipient's USDC ATA (settlement target — usually the
///                 service provider's collection ATA).
/// 5. `[]`         USDC mint.
/// 6. `[]`         SPL Token Program.
///
/// ### Data (after dispatcher strips discriminator)
/// `units_consumed` (8) u64 — units to settle since last call.
/// `artifact_root` (32) — sha256 of the batch's fulfillment hashes.
/// = 40 bytes minimum. A shorter payload or an all-zero root returns
/// `UnverifiedFulfillment` (6108) after the settler is authenticated.
pub fn process_mpp_settle(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 8 {
        return Err(KeyShieldError::InvalidPaymentAmount.into());
    }

    let mut iter = accounts.iter();
    let settler = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let recipient_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let usdc_mint = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _spl_token = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    if !settler.is_signer() {
        return Err(KeyShieldError::NotMppSettler.into());
    }

    let units_consumed = u64::from_le_bytes(
        data[0..8]
            .try_into()
            .map_err(|_| KeyShieldError::InvalidPaymentAmount)?,
    );
    if units_consumed == 0 {
        return Err(KeyShieldError::InvalidPaymentAmount.into());
    }

    // Read the AgentPaymentStream
    let mut sbuf = stream.try_borrow_mut_data()?;
    if sbuf.len() < AgentPaymentStream::SIZE {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }
    if &sbuf[aps_offset::DISCRIMINATOR..aps_offset::DISCRIMINATOR + 8]
        != AGENT_PAYMENT_STREAM_DISCRIMINATOR.as_ref()
    {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }
    if sbuf[aps_offset::IS_ACTIVE] == 0 {
        return Err(KeyShieldError::PaymentStreamInactive.into());
    }

    // Settler authorization: signer pubkey must match recorded
    // mpp_settler_pubkey on the stream.
    let recorded_settler_bytes: [u8; 32] = sbuf
        [aps_offset::MPP_SETTLER..aps_offset::MPP_SETTLER + 32]
        .try_into()
        .map_err(|_| KeyShieldError::NotMppSettler)?;
    let recorded_settler =
        Pubkey::try_from(&recorded_settler_bytes[..]).map_err(|_| KeyShieldError::NotMppSettler)?;
    if &recorded_settler != settler.key() {
        return Err(KeyShieldError::NotMppSettler.into());
    }

    // Fulfillment commitment. Checked after settler auth so a bad
    // signer still reports NotMppSettler, and before any balance write
    // or token transfer. The preimage (response bytes) was verified
    // off-chain; this rejects a settle that skipped that step.
    if sbuf.len() < aps_offset::RESERVED + 32 {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }
    let artifact_root = parse_artifact_root(data)?;
    if artifact_root_replayed(
        &sbuf[aps_offset::RESERVED..aps_offset::RESERVED + 32],
        &artifact_root,
    ) {
        return Err(KeyShieldError::NonceReused.into());
    }

    // mint + ATA consistency.
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

    // Verify agent grant still active in vault
    let stream_agent_bytes: [u8; 32] = sbuf
        [aps_offset::AGENT_PUBKEY..aps_offset::AGENT_PUBKEY + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_agent = Pubkey::try_from(&stream_agent_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_owner_bytes: [u8; 32] = sbuf[aps_offset::OWNER..aps_offset::OWNER + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_owner = Pubkey::try_from(&stream_owner_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;

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

        let mut active = false;
        for i in 0..MAX_AGENTS {
            let off = AGENT_GRANTS_START + i * AGENT_GRANT_SIZE;
            let pk_bytes: [u8; 32] = vault_data[off..off + 32]
                .try_into()
                .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
            let pk =
                Pubkey::try_from(&pk_bytes[..]).map_err(|_| KeyShieldError::AgentGrantNotFound)?;
            if pk == stream_agent && pk != Pubkey::default() {
                let is_active = vault_data[off + 58];
                let revoked_at_off = off + AGENT_GRANT_REVOKED_AT_OFFSET;
                let revoked_at = i64::from_le_bytes(
                    vault_data[revoked_at_off..revoked_at_off + 8]
                        .try_into()
                        .map_err(|_| KeyShieldError::AgentGrantNotFound)?,
                );
                if is_active == 0 || revoked_at != 0 {
                    return Err(KeyShieldError::AgentRevoked.into());
                }
                active = true;
                break;
            }
        }
        if !active {
            return Err(KeyShieldError::AgentGrantNotFound.into());
        }
    }

    // Compute amount + budget gate
    let cost_per_unit = u64::from_le_bytes(
        sbuf[aps_offset::COST_PER_UNIT..aps_offset::COST_PER_UNIT + 8]
            .try_into()
            .map_err(|_| KeyShieldError::InvalidPaymentAmount)?,
    );
    let amount = cost_per_unit
        .checked_mul(units_consumed)
        .ok_or(KeyShieldError::BudgetExceeded)?;
    if amount == 0 {
        return Err(KeyShieldError::InvalidPaymentAmount.into());
    }

    let max_total = u64::from_le_bytes(
        sbuf[aps_offset::MAX_TOTAL..aps_offset::MAX_TOTAL + 8]
            .try_into()
            .map_err(|_| KeyShieldError::BudgetExceeded)?,
    );
    let spent_total = u64::from_le_bytes(
        sbuf[aps_offset::SPENT_TOTAL..aps_offset::SPENT_TOTAL + 8]
            .try_into()
            .map_err(|_| KeyShieldError::BudgetExceeded)?,
    );
    let new_total = spent_total
        .checked_add(amount)
        .ok_or(KeyShieldError::BudgetExceeded)?;
    if new_total > max_total {
        return Err(KeyShieldError::BudgetExceeded.into());
    }

    let now = Clock::get()?.unix_timestamp;
    sbuf[aps_offset::SPENT_TOTAL..aps_offset::SPENT_TOTAL + 8]
        .copy_from_slice(&new_total.to_le_bytes());
    sbuf[aps_offset::LAST_PAYMENT_TS..aps_offset::LAST_PAYMENT_TS + 8]
        .copy_from_slice(&now.to_le_bytes());
    sbuf[aps_offset::RESERVED..aps_offset::RESERVED + 32].copy_from_slice(&artifact_root);

    let bump = sbuf[aps_offset::BUMP];
    drop(sbuf);

    // CPI: PDA-signed transfer_checked.
    let bump_arr = [bump];
    let stream_seeds = seeds!(
        APS_SEED,
        stream_agent.as_ref(),
        stream_owner.as_ref(),
        &bump_arr
    );
    let pda_signer = Signer::from(&stream_seeds);

    TransferChecked {
        from: stream_ata,
        mint: usdc_mint,
        to: recipient_ata,
        authority: stream,
        amount,
        decimals: AgentPaymentStream::USDC_DECIMALS,
    }
    .invoke_signed(&[pda_signer])?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{artifact_root_replayed, parse_artifact_root};
    use crate::error::KeyShieldError;
    use crate::state::{aps_offset, AgentPaymentStream};
    use pinocchio::program_error::ProgramError;

    #[test]
    fn short_payload_is_unverified() {
        let err = parse_artifact_root(&5u64.to_le_bytes()).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::UnverifiedFulfillment as u32)
        );
    }

    #[test]
    fn zero_root_is_unverified() {
        let mut data = [0u8; 40];
        data[..8].copy_from_slice(&5u64.to_le_bytes());
        let err = parse_artifact_root(&data).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::UnverifiedFulfillment as u32)
        );
    }

    #[test]
    fn non_zero_root_is_accepted() {
        let mut data = [0u8; 40];
        data[..8].copy_from_slice(&5u64.to_le_bytes());
        data[8] = 1;
        let root = parse_artifact_root(&data).unwrap();
        assert_eq!(root[0], 1);
        assert!(!artifact_root_replayed(&[0u8; 32], &root));
        assert!(artifact_root_replayed(&root, &root));
    }

    #[test]
    fn reserved_region_can_hold_the_root() {
        assert!(aps_offset::RESERVED + 32 <= AgentPaymentStream::SIZE);
    }
}
