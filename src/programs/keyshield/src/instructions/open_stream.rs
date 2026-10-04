//! `OpenPaymentStream` (ix #24) — opens a per-agent embedded wallet.
//!
//! See `proxy-rs/specs/10-embedded-wallet.md` Q1/Q3/Q7. Allocates an
//! `AgentPaymentStream` PDA owned by this program, binds it to a
//! specific `AgentGrant`, and records the metadata the other three
//! ixs (#25 `pay_x402`, #26 `mpp_settle`, #27 `withdraw_agent_wallet`)
//! use to enforce budget caps and authorization.
//!
//! Critically, this ix does *not* itself create the USDC ATA. Token
//! ATAs are owned by the SPL Associated Token Program — the client
//! creates that account with a separate ix in the same transaction
//! and passes the resulting pubkey here so we can bind it. Doing it
//! that way keeps this handler free of cross-program ATA derivation
//! and lets clients reuse standard `@solana/spl-token` helpers.

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::Pubkey,
    seeds,
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};

use crate::{
    error::KeyShieldError,
    state::{
        aps_offset, AgentPaymentStream, ConsumedNonce,
        AGENT_GRANTS_START, AGENT_GRANT_SIZE, AGENT_GRANT_REVOKED_AT_OFFSET,
        CONSUMED_NONCES_LEN, MAX_AGENTS, UniversalVault,
        AGENT_PAYMENT_STREAM_DISCRIMINATOR,
    },
};

/// PDA seeds: ["agent_payment_stream", agent_grant_pubkey, owner].
pub const APS_SEED: &[u8] = b"agent_payment_stream";

/// Process `OpenPaymentStream` (ix #24).
///
/// ### Accounts
/// 0. `[signer]`   Owner — the wallet that owns the AgentGrant.
/// 1. `[]`         UniversalVault — to validate `owner` is the vault owner
///                 and the agent grant exists / is active.
/// 2. `[writable]` AgentPaymentStream PDA to initialize (system-owned at
///                 entry; this ix `CreateAccount`s it under our program).
/// 3. `[]`         USDC mint (recorded into the stream).
/// 4. `[]`         USDC ATA pubkey (recorded into the stream — the
///                 ATA itself must be created by a separate ix, e.g.
///                 the SPL Associated Token Program's `create`).
/// 5. `[]`         Agent grant pubkey — the agent this stream pays
///                 for. Must already exist in `UniversalVault.agent_grants`.
/// 6. `[]`         MPP settler pubkey (server keypair authorized for
///                 ix #26).
/// 7. `[]`         System Program (for `CreateAccount`).
///
/// ### Data
/// `[discriminator=24]` (1) — already stripped by dispatcher.
/// `bump`                       (1)
/// `max_total_micro_usdc`       (8)
/// `cost_per_unit_micro_usdc`   (8)
/// `max_rate_usd_per_min_bits`  (8) — `f64::to_bits` for portability
/// `settlement_interval_secs`   (4)
/// = 29 bytes after dispatcher strips discriminator.
pub fn process_open_payment_stream(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 29 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let mut iter = accounts.iter();
    let owner = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let usdc_mint = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let usdc_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let agent = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let mpp_settler = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _system_program = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    if !owner.is_signer() {
        return Err(KeyShieldError::NotOwner.into());
    }

    let bump = data[0];
    let max_total_micro_usdc = u64::from_le_bytes(
        data[1..9].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?,
    );
    let cost_per_unit_micro_usdc = u64::from_le_bytes(
        data[9..17].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?,
    );
    let max_rate_bits = u64::from_le_bytes(
        data[17..25].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?,
    );
    let settlement_interval = u32::from_le_bytes(
        data[25..29].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?,
    );

    if max_total_micro_usdc == 0 {
        return Err(KeyShieldError::InvalidPaymentAmount.into());
    }

    // Validate vault owner + agent grant
    let vault_data = borrow_vault!(vault);
    let vault_disc = &vault_data[0..8];
    if vault_disc != UniversalVault::DISCRIMINATOR {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }
    let owner_bytes: [u8; 32] = vault_data[8..40]
        .try_into()
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
    let vault_owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
    if owner.key() != &vault_owner {
        return Err(KeyShieldError::NotOwner.into());
    }

    // Agent grant must exist + be active + not revoked.
    let agent_pubkey = *agent.key();
    let mut grant_active = false;
    for i in 0..MAX_AGENTS {
        let grant_off = AGENT_GRANTS_START + (i * AGENT_GRANT_SIZE);
        let pk_bytes: [u8; 32] = vault_data[grant_off..grant_off + 32]
            .try_into()
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
        let pk = Pubkey::try_from(&pk_bytes[..])
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
        if pk == agent_pubkey && pk != Pubkey::default() {
            let is_active = vault_data[grant_off + 58];
            let revoked_at_off = grant_off + AGENT_GRANT_REVOKED_AT_OFFSET;
            let revoked_at = i64::from_le_bytes(
                vault_data[revoked_at_off..revoked_at_off + 8]
                    .try_into()
                    .map_err(|_| KeyShieldError::AgentGrantNotFound)?,
            );
            if is_active == 0 || revoked_at != 0 {
                return Err(KeyShieldError::AgentRevoked.into());
            }
            grant_active = true;
            break;
        }
    }
    if !grant_active {
        return Err(KeyShieldError::AgentGrantNotFound.into());
    }
    drop(vault_data);

    // Canonical USDC mint + escrow binding. A counterfeit mint with
    // decimals == 6 fails the allowlist. The token account's own mint
    // and owner fields must match this stream PDA.
    {
        let mint_data = usdc_mint.try_borrow_data()?;
        crate::guards::assert_canonical_usdc_mint(usdc_mint.key(), usdc_mint.owner(), &mint_data)?;
    }
    {
        let ata_data = usdc_ata.try_borrow_data()?;
        crate::guards::assert_escrow_token_account(
            &ata_data,
            usdc_ata.owner(),
            usdc_mint.key(),
            stream.key(),
        )?;
    }
    crate::guards::assert_stream_pda(program_id, stream.key(), agent.key(), owner.key(), bump)?;

    // Allocate the AgentPaymentStream PDA
    // Seeds: ["agent_payment_stream", agent_pubkey, owner_pubkey, bump].
    let bump_arr = [bump];
    let stream_seeds = seeds!(APS_SEED, agent.key().as_ref(), owner.key().as_ref(), &bump_arr);
    let stream_signer = Signer::from(&stream_seeds);

    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(AgentPaymentStream::SIZE);

    if stream.is_owned_by(program_id) {
        let existing = stream.try_borrow_data()?;
        let disc: &[u8] = if existing.len() >= 8 { &existing[..8] } else { &[] };
        return crate::guards::refuse_program_owned_reopen(disc);
    } else if stream.lamports() == 0 && stream.data_is_empty() {
        CreateAccount {
            from: owner,
            to: stream,
            lamports: min_balance,
            space: AgentPaymentStream::SIZE as u64,
            owner: program_id,
        }
        .invoke_signed(&[stream_signer.clone()])?;
    } else {
        if stream.data_len() < AgentPaymentStream::SIZE {
            Allocate {
                account: stream,
                space: AgentPaymentStream::SIZE as u64,
            }
            .invoke_signed(&[stream_signer.clone()])?;
        }
        Assign {
            account: stream,
            owner: program_id,
        }
        .invoke_signed(&[stream_signer.clone()])?;
        let cur = stream.lamports();
        if cur < min_balance {
            Transfer {
                from: owner,
                to: stream,
                lamports: min_balance - cur,
            }
            .invoke()?;
        }
    }

    // Initialize stream fields
    let now = Clock::get()?.unix_timestamp;
    let mut buf = stream.try_borrow_mut_data()?;
    if buf.len() < AgentPaymentStream::SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Zero everything first so re-init always lands clean.
    for byte in buf.iter_mut() {
        *byte = 0;
    }

    buf[aps_offset::DISCRIMINATOR..aps_offset::DISCRIMINATOR + 8]
        .copy_from_slice(&AGENT_PAYMENT_STREAM_DISCRIMINATOR);
    buf[aps_offset::OWNER..aps_offset::OWNER + 32].copy_from_slice(owner.key().as_ref());
    buf[aps_offset::AGENT_PUBKEY..aps_offset::AGENT_PUBKEY + 32]
        .copy_from_slice(agent.key().as_ref());
    buf[aps_offset::MPP_SETTLER..aps_offset::MPP_SETTLER + 32]
        .copy_from_slice(mpp_settler.key().as_ref());
    buf[aps_offset::USDC_MINT..aps_offset::USDC_MINT + 32]
        .copy_from_slice(usdc_mint.key().as_ref());
    buf[aps_offset::USDC_ATA..aps_offset::USDC_ATA + 32]
        .copy_from_slice(usdc_ata.key().as_ref());
    buf[aps_offset::MAX_TOTAL..aps_offset::MAX_TOTAL + 8]
        .copy_from_slice(&max_total_micro_usdc.to_le_bytes());
    // SPENT_TOTAL stays 0 from the zero-fill above.
    buf[aps_offset::COST_PER_UNIT..aps_offset::COST_PER_UNIT + 8]
        .copy_from_slice(&cost_per_unit_micro_usdc.to_le_bytes());
    buf[aps_offset::MAX_RATE_BITS..aps_offset::MAX_RATE_BITS + 8]
        .copy_from_slice(&max_rate_bits.to_le_bytes());
    buf[aps_offset::SETTLEMENT_INTERVAL..aps_offset::SETTLEMENT_INTERVAL + 4]
        .copy_from_slice(&settlement_interval.to_le_bytes());
    buf[aps_offset::IS_ACTIVE] = 1;
    buf[aps_offset::BUMP] = bump;
    buf[aps_offset::LAST_PAYMENT_TS..aps_offset::LAST_PAYMENT_TS + 8]
        .copy_from_slice(&now.to_le_bytes());
    buf[aps_offset::CREATED_AT..aps_offset::CREATED_AT + 8]
        .copy_from_slice(&now.to_le_bytes());
    // Ring buffer head = 0; entries already zeroed.
    let _ = (CONSUMED_NONCES_LEN, ConsumedNonce::SIZE);

    Ok(())
}
