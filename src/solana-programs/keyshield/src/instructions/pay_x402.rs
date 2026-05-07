//! `pay_x402` (ix #25) — agent makes a single x402 micropayment.
//!
//! See `proxy-rs/specs/10-embedded-wallet.md` Q1 (line 117-170) for
//! the seven verification steps. This handler executes them in order
//! and CPIs into the SPL Token Program for the actual transfer.
//!
//! KeyShield's existing `AgentGrant` lives inline inside the
//! `UniversalVault`, not as its own standalone PDA. The spec
//! describes "AgentGrant PDA" but that is implementation-flavored
//! wording — what matters is that the on-chain code can locate the
//! grant for the signer, confirm it isn't revoked, and confirm the
//! grant's owner matches the PaymentStream's owner. We achieve that
//! by passing `UniversalVault` as account 1 and scanning its
//! `agent_grants` table.

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
    state::{
        aps_offset, AgentPaymentStream, ConsumedNonce, AGENT_GRANTS_START,
        AGENT_GRANT_SIZE, AGENT_GRANT_REVOKED_AT_OFFSET, CONSUMED_NONCES_LEN,
        MAX_AGENTS, UniversalVault, AGENT_PAYMENT_STREAM_DISCRIMINATOR,
    },
    instructions::open_stream::APS_SEED,
};

/// Process `pay_x402` (ix #25). Spec 10 Q1 logic.
///
/// ### Accounts
/// 0. `[signer]`   EphemeralSigner — the agent's per-grant signer.
/// 1. `[]`         UniversalVault (acts as "AgentGrant PDA" in spec).
/// 2. `[writable]` AgentPaymentStream PDA (owner check + budget update).
/// 3. `[writable]` PaymentStream's USDC ATA (debit source).
/// 4. `[writable]` Recipient's USDC ATA (transfer destination).
/// 5. `[]`         USDC mint (must match stream's recorded mint).
/// 6. `[]`         SPL Token Program.
/// 7. `[]`         This program (for PDA self-validation).
///
/// ### Data (after dispatcher strips the `25` discriminator byte)
/// `amount`        (8)   micro-USDC
/// `nonce`         (16)  random replay-protection bytes
/// `expires_at`    (8)   i64 unix; ix fails if clock > this
/// `envelope_hash` (32)  sha256 of canonical `X402Envelope`
/// = 64 bytes.
pub fn process_pay_x402(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 64 {
        return Err(KeyShieldError::InvalidEnvelope.into());
    }

    let mut iter = accounts.iter();
    let signer = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let recipient_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let usdc_mint = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _spl_token = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _self_program = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    if !signer.is_signer() {
        return Err(KeyShieldError::InvalidEphemeralSigner.into());
    }

    let amount = u64::from_le_bytes(
        data[0..8].try_into().map_err(|_| KeyShieldError::InvalidEnvelope)?,
    );
    let mut nonce = [0u8; 16];
    nonce.copy_from_slice(&data[8..24]);
    let expires_at = i64::from_le_bytes(
        data[24..32].try_into().map_err(|_| KeyShieldError::InvalidEnvelope)?,
    );
    let mut envelope_hash = [0u8; 32];
    envelope_hash.copy_from_slice(&data[32..64]);

    if amount == 0 {
        return Err(KeyShieldError::InvalidPaymentAmount.into());
    }

    // 1+2. Locate the agent grant for `signer.key()` in the vault and
    // confirm it isn't revoked.
    let signer_pubkey = *signer.key();
    let grant_owner: Pubkey;
    {
        let vault_data = borrow_vault!(vault);
        if &vault_data[0..8] != UniversalVault::DISCRIMINATOR.as_ref() {
            return Err(KeyShieldError::UniversalVaultNotFound.into());
        }
        let owner_bytes: [u8; 32] = vault_data[8..40]
            .try_into()
            .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
        grant_owner = Pubkey::try_from(&owner_bytes[..])
            .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;

        let mut found = false;
        for i in 0..MAX_AGENTS {
            let off = AGENT_GRANTS_START + i * AGENT_GRANT_SIZE;
            let pk_bytes: [u8; 32] = vault_data[off..off + 32]
                .try_into()
                .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
            let pk = Pubkey::try_from(&pk_bytes[..])
                .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
            if pk == signer_pubkey && pk != Pubkey::default() {
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
                found = true;
                break;
            }
        }
        if !found {
            return Err(KeyShieldError::AgentNotAuthorized.into());
        }
    }

    // Time bound.
    let now = Clock::get()?.unix_timestamp;
    if now > expires_at {
        return Err(KeyShieldError::PaymentStreamExpired.into());
    }

    // Read + validate the AgentPaymentStream
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

    // owner consistency: stream.owner must match the agent grant's owner.
    let stream_owner_bytes: [u8; 32] = sbuf[aps_offset::OWNER..aps_offset::OWNER + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_owner = Pubkey::try_from(&stream_owner_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if stream_owner != grant_owner {
        return Err(KeyShieldError::NotOwner.into());
    }

    // mint consistency.
    let stream_mint_bytes: [u8; 32] = sbuf[aps_offset::USDC_MINT..aps_offset::USDC_MINT + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_mint = Pubkey::try_from(&stream_mint_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if &stream_mint != usdc_mint.key() {
        return Err(KeyShieldError::InvalidEnvelope.into());
    }

    // source ATA consistency.
    let stream_ata_bytes: [u8; 32] = sbuf[aps_offset::USDC_ATA..aps_offset::USDC_ATA + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_ata_pk = Pubkey::try_from(&stream_ata_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if &stream_ata_pk != stream_ata.key() {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }

    // signer consistency: the signer pubkey must match the stream's
    // recorded agent_pubkey (one stream per agent grant).
    let stream_agent_bytes: [u8; 32] = sbuf
        [aps_offset::AGENT_PUBKEY..aps_offset::AGENT_PUBKEY + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_agent = Pubkey::try_from(&stream_agent_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if stream_agent != signer_pubkey {
        return Err(KeyShieldError::AgentNotAuthorized.into());
    }

    // Budget cap.
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

    // Replay check — scan ring buffer.
    {
        let nonces_off = aps_offset::NONCES;
        for i in 0..CONSUMED_NONCES_LEN {
            let entry_off = nonces_off + i * ConsumedNonce::SIZE;
            let stored_hash = &sbuf[entry_off..entry_off + 32];
            // Empty slot guard: discriminator is zeroed envelope_hash.
            let is_empty = stored_hash.iter().all(|&b| b == 0);
            if is_empty {
                continue;
            }
            let stored_nonce = &sbuf[entry_off + 32..entry_off + 48];
            if stored_hash == envelope_hash.as_ref() && stored_nonce == nonce.as_ref() {
                return Err(KeyShieldError::NonceReused.into());
            }
        }
    }

    // Update state — record nonce, bump head, bump spent_total.
    let head = sbuf[aps_offset::NONCES_HEAD] as usize;
    let new_head = (head + 1) % CONSUMED_NONCES_LEN;
    let entry_off = aps_offset::NONCES + head * ConsumedNonce::SIZE;
    sbuf[entry_off..entry_off + 32].copy_from_slice(&envelope_hash);
    sbuf[entry_off + 32..entry_off + 48].copy_from_slice(&nonce);
    sbuf[aps_offset::NONCES_HEAD] = new_head as u8;
    sbuf[aps_offset::SPENT_TOTAL..aps_offset::SPENT_TOTAL + 8]
        .copy_from_slice(&new_total.to_le_bytes());
    sbuf[aps_offset::LAST_PAYMENT_TS..aps_offset::LAST_PAYMENT_TS + 8]
        .copy_from_slice(&now.to_le_bytes());

    // Capture bump + agent + owner before we drop the mutable borrow,
    // so we can reconstruct PDA seeds for the CPI signer below.
    let bump = sbuf[aps_offset::BUMP];
    drop(sbuf);

    // CPI to SPL Token: transfer_checked from stream's ATA to the
    // recipient ATA, signed by the AgentPaymentStream PDA.
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
