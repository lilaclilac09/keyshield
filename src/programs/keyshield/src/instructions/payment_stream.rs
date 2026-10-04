//! Payment Stream instruction handlers
//!
//! Instructions for x402 streaming payments support:
//! - Per-request micropayments
//! - Streaming/batched usage-based payments
//! - Settlement intervals
//! - Payment verification

use pinocchio::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvars::{clock::Clock, Sysvar},
    ProgramResult,
};

use crate::{
    error::KeyShieldError,
    state::{
        PaymentStream, UniversalVault,
        AGENT_GRANTS_START, AGENT_GRANT_SIZE,
        PAYMENT_STREAMS_START, PAYMENT_STREAM_SIZE, MAX_PAYMENT_STREAMS,
    },
};

/// Process GrantAgentPaymentAccess instruction
///
/// Extends agent access with payment-specific policies.
/// Must be called after GrantAgentUniversalAccess.
///
/// Accounts:
/// 0. [signer] Owner - The vault owner granting payment access
/// 1. [writable] UniversalVault - PDA account
///
/// Instruction data:
/// - agent_pubkey (32 bytes)
/// - rate_per_call_micro_usdc (8 bytes) - Cost per API call
/// - rate_per_token_micro_usdc (8 bytes) - Cost per token
/// - unit_type (1 byte) - 0 = per_call, 1 = per_token
/// - settlement_interval_secs (4 bytes) - How often to settle (e.g., 60 for 60s)
pub fn process_grant_agent_payment_access(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Minimum: agent_pubkey(32) + rate_per_call(8) + rate_per_token(8) + unit_type(1) + settlement(4) = 53 bytes
    if data.len() < 53 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    let agent_pubkey_bytes: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;
    let agent_pubkey = Pubkey::try_from(&agent_pubkey_bytes[..])
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;

    let rate_per_call = u64::from_le_bytes(data[32..40].try_into().map_err(|_| KeyShieldError::InvalidPaymentAmount)?);
    let rate_per_token = u64::from_le_bytes(data[40..48].try_into().map_err(|_| KeyShieldError::InvalidPaymentAmount)?);
    let unit_type = data[48];
    let settlement_interval = u32::from_le_bytes(data[49..53].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?);

    // Read vault data
    let mut vault_data = borrow_vault_mut!(vault);

    // Verify discriminator
    let discriminator = &vault_data[0..8];
    if discriminator != UniversalVault::DISCRIMINATOR {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify owner
    let owner_bytes: [u8; 32] = vault_data[8..40].try_into()
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
    let vault_owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;

    if owner.key() != &vault_owner {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Check payments are enabled
    let vault_flags = u32::from_le_bytes(vault_data[56..60].try_into().map_err(|_| KeyShieldError::UniversalVaultNotFound)?);
    if (vault_flags & 0x08) == 0 {
        return Err(KeyShieldError::PaymentNotEnabled.into());
    }

    // Find agent grant to verify it exists
    let mut found = false;

    for i in 0..32 {
        let offset = AGENT_GRANTS_START + (i * AGENT_GRANT_SIZE);
        let existing_pubkey_bytes: [u8; 32] = vault_data[offset..offset + 32].try_into()
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
        let existing_pubkey = Pubkey::try_from(&existing_pubkey_bytes[..])
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;

        if existing_pubkey == agent_pubkey {
            // Enable payment stream in grant
            vault_data[offset + 57] = 1;
            found = true;
            break;
        }
    }

    if !found {
        return Err(KeyShieldError::AgentGrantNotFound.into());
    }

    let timestamp = Clock::get()?.unix_timestamp as u64;

    // Compute service URL hash (simplified - use first 32 bytes of hash)
    let mut service_url_hash = [0u8; 32];
    // In production, this would hash the actual service URL
    // For now, use a default hash for "x402-payment"
    service_url_hash[0] = b'x';
    service_url_hash[1] = b'4';
    service_url_hash[2] = b'0';
    service_url_hash[3] = b'2';

    // Find empty payment stream slot
    let mut stream_idx = None;

    for i in 0..MAX_PAYMENT_STREAMS {
        let offset = PAYMENT_STREAMS_START + (i * PAYMENT_STREAM_SIZE);
        if vault_data[offset..offset + 32] == [0u8; 32] {
            stream_idx = Some(i);
            break;
        }
    }

    let Some(idx) = stream_idx else {
        return Err(KeyShieldError::PaymentStreamActive.into());
    };
    let offset = PAYMENT_STREAMS_START + (idx * PAYMENT_STREAM_SIZE);

    // Write payment stream
    vault_data[offset..offset + 32].copy_from_slice(&service_url_hash);
    vault_data[offset + 32..offset + 64].copy_from_slice(agent_pubkey.as_ref());
    vault_data[offset + 64..offset + 72].copy_from_slice(&rate_per_call.to_le_bytes());
    vault_data[offset + 72] = unit_type;
    vault_data[offset + 73] = 1; // is_active
    vault_data[offset + 74..offset + 78].copy_from_slice(&settlement_interval.to_le_bytes());
    vault_data[offset + 78..offset + 86].copy_from_slice(&timestamp.to_le_bytes());
    vault_data[offset + 86..offset + 94].copy_from_slice(&0u64.to_le_bytes()); // pending_amount

    // Update payment_stream_count (offset: 63). A wrapped counter would
    // resurrect a free slot; checked_add fails closed.
    let count = vault_data[63];
    vault_data[63] = count
        .checked_add(1)
        .ok_or(KeyShieldError::ArithmeticOverflow)?;

    // Update updated_at
    vault_data[48..56].copy_from_slice(&timestamp.to_le_bytes());

    Ok(())
}

/// Process SettlePayment instruction
///
/// Settles accumulated payment for a streaming payment stream.
/// Can be called by anyone but requires agent authorization.
///
/// Accounts:
/// 0. [signer] Settler - Anyone can trigger settlement (typically the agent)
/// 1. [writable] UniversalVault - PDA account
///
/// Instruction data:
/// - agent_pubkey (32 bytes)
/// - service_url_hash (32 bytes)
/// - units_consumed (8 bytes) - Number of units (calls or tokens)
pub fn process_settle_payment(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Minimum: agent_pubkey(32) + service_url_hash(32) + units(8) = 72 bytes
    if data.len() < 72 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let settler = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Settler must be signer
    if !settler.is_signer() {
        return Err(KeyShieldError::AccessDenied.into());
    }

    let agent_pubkey_bytes: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;
    let agent_pubkey = Pubkey::try_from(&agent_pubkey_bytes[..])
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;

    let service_url_hash: [u8; 32] = data[32..64].try_into()
        .map_err(|_| KeyShieldError::InvalidKeyData)?;
    let units_consumed = u64::from_le_bytes(data[64..72].try_into().map_err(|_| KeyShieldError::InvalidPaymentAmount)?);

    // Read vault
    let mut vault_data = borrow_vault_mut!(vault);

    // Verify discriminator
    let discriminator = &vault_data[0..8];
    if discriminator != UniversalVault::DISCRIMINATOR {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Find payment stream
    let mut stream_offset = None;

    for i in 0..MAX_PAYMENT_STREAMS {
        let offset = PAYMENT_STREAMS_START + (i * PAYMENT_STREAM_SIZE);
        if vault_data[offset..offset + 32] == service_url_hash {
            let agent_check: [u8; 32] = vault_data[offset + 32..offset + 64].try_into()
                .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
            let stream_agent = Pubkey::try_from(&agent_check[..])
                .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;

            if stream_agent == agent_pubkey {
                let is_active = vault_data[offset + 73];
                if is_active == 1 {
                    stream_offset = Some(offset);
                    break;
                }
            }
        }
    }

    let offset = stream_offset.ok_or(KeyShieldError::PaymentStreamNotFound)?;

    // Calculate payment amount
    let rate_per_call = u64::from_le_bytes(vault_data[offset + 64..offset + 72].try_into()
        .map_err(|_| KeyShieldError::InvalidPaymentAmount)?);
    let unit_type = vault_data[offset + 72];

    let amount_due = match unit_type {
        0 | 1 => rate_per_call
            .checked_mul(units_consumed)
            .ok_or(KeyShieldError::ArithmeticOverflow)?,
        _ => return Err(KeyShieldError::InvalidPaymentAmount.into()),
    };

    // Check against agent's max spend
    let mut max_spend = 0u64;

    for i in 0..32 {
        let grant_offset = AGENT_GRANTS_START + (i * AGENT_GRANT_SIZE);
        let existing_pubkey_bytes: [u8; 32] = vault_data[grant_offset..grant_offset + 32].try_into()
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
        let existing_pubkey = Pubkey::try_from(&existing_pubkey_bytes[..])
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;

        if existing_pubkey == agent_pubkey {
            max_spend = u64::from_le_bytes(vault_data[grant_offset + 49..grant_offset + 57].try_into()
                .map_err(|_| KeyShieldError::MaxSpendExceeded)?);
            let cumulative = u64::from_le_bytes(vault_data[grant_offset + 69..grant_offset + 77].try_into()
                .map_err(|_| KeyShieldError::MaxSpendExceeded)?);

            let new_cumulative = cumulative
                .checked_add(amount_due)
                .ok_or(KeyShieldError::ArithmeticOverflow)?;
            if new_cumulative > max_spend {
                return Err(KeyShieldError::MaxSpendExceeded.into());
            }

            vault_data[grant_offset + 69..grant_offset + 77]
                .copy_from_slice(&new_cumulative.to_le_bytes());
            break;
        }
    }

    // Update payment stream - reset pending amount, update last settlement
    let timestamp = Clock::get()?.unix_timestamp as u64;
    vault_data[offset + 78..offset + 86].copy_from_slice(&timestamp.to_le_bytes());
    vault_data[offset + 86..offset + 94].copy_from_slice(&0u64.to_le_bytes());

    // Update vault updated_at
    vault_data[48..56].copy_from_slice(&timestamp.to_le_bytes());

    // In production, this would:
    // 1. Transfer USDC from vault to agent/service
    // 2. Emit payment event for off-chain tracking
    // 3. Log settlement for audit

    Ok(())
}

/// Process PayForService instruction
///
/// One-shot payment for a single API call/request.
/// Similar to x402 "pay-as-you-go".
///
/// Accounts:
/// 0. [signer] Payer - The agent or human paying
/// 1. [writable] UniversalVault - PDA account
///
/// Instruction data:
/// - agent_pubkey (32 bytes) - Agent making the request
/// - service_url_hash (32 bytes) - Service being paid for
/// - amount_micro_usdc (8 bytes) - Amount to pay
/// - memo (variable, null-terminated) - Payment memo
pub fn process_pay_for_service(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Minimum: agent_pubkey(32) + service_url_hash(32) + amount(8) = 72 bytes
    if data.len() < 72 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let payer = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Payer must be signer
    if !payer.is_signer() {
        return Err(KeyShieldError::AccessDenied.into());
    }

    let agent_pubkey_bytes: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;
    let agent_pubkey = Pubkey::try_from(&agent_pubkey_bytes[..])
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;

    let _service_url_hash: [u8; 32] = data[32..64].try_into()
        .map_err(|_| KeyShieldError::InvalidKeyData)?;
    let amount_micro_usdc = u64::from_le_bytes(data[64..72].try_into()
        .map_err(|_| KeyShieldError::InvalidPaymentAmount)?);

    if amount_micro_usdc == 0 {
        return Err(KeyShieldError::InvalidPaymentAmount.into());
    }

    // Read vault
    let vault_data = borrow_vault!(vault);

    // Verify discriminator
    let discriminator = &vault_data[0..8];
    if discriminator != UniversalVault::DISCRIMINATOR {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify payer is either owner or authorized agent
    let owner_bytes: [u8; 32] = vault_data[8..40].try_into()
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
    let vault_owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;

    let is_owner = payer.key() == &vault_owner;
    let mut is_authorized_agent = false;

    if !is_owner {
        // Check if payer is authorized agent
        for i in 0..32 {
            let offset = AGENT_GRANTS_START + (i * AGENT_GRANT_SIZE);
            let existing_pubkey_bytes: [u8; 32] = vault_data[offset..offset + 32].try_into()
                .map_err(|_| KeyShieldError::AgentNotAuthorized)?;
            let existing_pubkey = Pubkey::try_from(&existing_pubkey_bytes[..])
                .map_err(|_| KeyShieldError::AgentNotAuthorized)?;

            if existing_pubkey == *payer.key() {
                let is_active = vault_data[offset + 58];
                if is_active == 1 {
                    // Check payment stream enabled
                    let payment_enabled = vault_data[offset + 57];
                    if payment_enabled == 1 {
                        // Check max spend
                        let max_spend = u64::from_le_bytes(vault_data[offset + 49..offset + 57].try_into()
                            .map_err(|_| KeyShieldError::MaxSpendExceeded)?);
                        let cumulative = u64::from_le_bytes(vault_data[offset + 69..offset + 77].try_into()
                            .map_err(|_| KeyShieldError::MaxSpendExceeded)?);

                        crate::guards::authorize_cumulative_spend(
                            cumulative,
                            amount_micro_usdc,
                            max_spend,
                        )?;
                        is_authorized_agent = true;
                    }
                }
                break;
            }
        }
    }

    if !is_owner && !is_authorized_agent {
        return Err(KeyShieldError::AccessDenied.into());
    }

    // In production, this would:
    // 1. Transfer USDC from payer to service
    // 2. Emit x402 payment event
    // 3. Log payment for audit trail

    Ok(())
}

/// Process ClosePaymentStream instruction
///
/// Closes an active payment stream.
///
/// Accounts:
/// 0. [signer] Owner - The vault owner
/// 1. [writable] UniversalVault - PDA account
///
/// Instruction data:
/// - service_url_hash (32 bytes)
pub fn process_close_payment_stream(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 32 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    let service_url_hash: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidKeyData)?;

    // Read vault
    let mut vault_data = borrow_vault_mut!(vault);

    // Verify discriminator
    let discriminator = &vault_data[0..8];
    if discriminator != UniversalVault::DISCRIMINATOR {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify owner
    let owner_bytes: [u8; 32] = vault_data[8..40].try_into()
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
    let vault_owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;

    if owner.key() != &vault_owner {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Find and close payment stream. The slot's discriminator becomes
    // the closed tombstone and every balance byte is zeroed, so a later
    // open cannot read the old rate or pending amount back out.
    let mut found = false;
    let mut already_closed = false;

    for i in 0..MAX_PAYMENT_STREAMS {
        let offset = PAYMENT_STREAMS_START + (i * PAYMENT_STREAM_SIZE);
        let end = offset + PAYMENT_STREAM_SIZE;
        if crate::guards::embedded_stream_is_closed(
            &vault_data[offset..end],
            &service_url_hash,
        ) {
            already_closed = true;
            continue;
        }
        if vault_data[offset..offset + 32] == service_url_hash {
            let is_active = vault_data[offset + 73];
            if is_active == 0 {
                already_closed = true;
                continue;
            }
            let count = vault_data[63];
            let new_count = crate::guards::close_stream_counter(is_active, count)?;
            crate::guards::seal_embedded_stream_slot(
                &mut vault_data[offset..end],
                &service_url_hash,
            )?;
            vault_data[63] = new_count;
            found = true;
            break;
        }
    }

    if !found {
        if already_closed {
            return Err(KeyShieldError::AccountClosed.into());
        }
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }

    Ok(())
}
