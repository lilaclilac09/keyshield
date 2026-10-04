//! Account, clock, and settlement guards shared by the payment ixs.
//!
//! The program is pinocchio, not Anchor. These functions are the
//! constraints an Anchor `#[account(...)]` block would have expressed:
//! canonical mint, token-account binding, closed-account tombstone,
//! canonical PDA bump, bounded clock leeway, and a monotonic
//! settlement sequence plus a small root fingerprint ring.

use pinocchio::{program_error::ProgramError, pubkey::Pubkey};

use crate::error::KeyShieldError;

/// Tombstone written over a closed `AgentPaymentStream` discriminator.
/// Distinct from `AGENT_PAYMENT_STREAM_DISCRIMINATOR` (`ksaywal1`).
/// The other bytes of the account are zeroed. Open refuses this tag,
/// so a same-slot lamport refund cannot revive the old balances.
pub const CLOSED_ACCOUNT_DISCRIMINATOR: [u8; 8] = *b"ksc1osed";

/// SPL Token program id (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`).
pub const SPL_TOKEN_PROGRAM_ID: [u8; 32] = [
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133,
    237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
];

/// Mainnet USDC mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
pub const USDC_MINT_MAINNET: [u8; 32] = [
    198, 250, 122, 243, 190, 219, 173, 58, 61, 101, 243, 106, 171, 201, 116, 49, 177, 187, 228,
    194, 210, 246, 224, 228, 124, 166, 2, 3, 69, 47, 93, 97,
];

/// Devnet USDC mint (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`).
pub const USDC_MINT_DEVNET: [u8; 32] = [
    59, 68, 44, 179, 145, 33, 87, 241, 58, 147, 61, 1, 52, 40, 45, 3, 43, 95, 254, 205, 1, 162,
    219, 241, 183, 121, 6, 8, 223, 0, 46, 167,
];

/// SPL mint account: decimals byte and initialized flag.
pub const MINT_DECIMALS_OFFSET: usize = 44;
pub const MINT_INITIALIZED_OFFSET: usize = 45;
pub const MINT_ACCOUNT_LEN: usize = 82;

/// SPL token account: mint pubkey, owner pubkey.
pub const TOKEN_ACCOUNT_MINT_OFFSET: usize = 0;
pub const TOKEN_ACCOUNT_OWNER_OFFSET: usize = 32;
pub const TOKEN_ACCOUNT_MIN_LEN: usize = 72;

/// How far `Clock::get().unix_timestamp` may sit past a deadline before
/// the program treats the session or envelope as expired. Thirty seconds
/// covers slot-time drift during congestion without leaving a stale
/// authorization open.
pub const CLOCK_LEEWAY_SECS: i64 = 30;

/// `AgentPaymentStream._reserved` layout. Account size stays 3368.
pub const RESERVED_ROOT: usize = 0;
pub const RESERVED_SEQ: usize = 32;
pub const RESERVED_RING: usize = 40;
pub const RESERVED_LEN: usize = 64;
pub const RING_SLOTS: usize = 3;

pub fn mint_is_canonical_usdc(mint: &[u8; 32]) -> bool {
    mint == &USDC_MINT_MAINNET || mint == &USDC_MINT_DEVNET
}

/// Reject a counterfeit mint, including one whose decimals byte is 6.
///
/// The mint account must be owned by the SPL Token program, initialized,
/// decimal-6, and equal to the canonical mainnet or devnet USDC mint.
pub fn assert_canonical_usdc_mint(
    mint_key: &[u8; 32],
    mint_owner: &[u8; 32],
    mint_data: &[u8],
) -> Result<(), ProgramError> {
    if mint_owner != &SPL_TOKEN_PROGRAM_ID || !mint_is_canonical_usdc(mint_key) {
        return Err(KeyShieldError::InvalidMint.into());
    }
    if mint_data.len() < MINT_ACCOUNT_LEN {
        return Err(KeyShieldError::InvalidMint.into());
    }
    if mint_data[MINT_DECIMALS_OFFSET] != 6 || mint_data[MINT_INITIALIZED_OFFSET] != 1 {
        return Err(KeyShieldError::InvalidMint.into());
    }
    Ok(())
}

/// The escrow token account's own mint and owner fields must match the
/// stream. A second account with the same decimals does not pass.
pub fn assert_escrow_token_account(
    token_data: &[u8],
    expected_mint: &[u8; 32],
    expected_owner: &[u8; 32],
) -> Result<(), ProgramError> {
    if token_data.len() < TOKEN_ACCOUNT_MIN_LEN {
        return Err(KeyShieldError::InvalidMint.into());
    }
    if &token_data[TOKEN_ACCOUNT_MINT_OFFSET..TOKEN_ACCOUNT_MINT_OFFSET + 32] != expected_mint {
        return Err(KeyShieldError::InvalidMint.into());
    }
    if &token_data[TOKEN_ACCOUNT_OWNER_OFFSET..TOKEN_ACCOUNT_OWNER_OFFSET + 32] != expected_owner {
        return Err(KeyShieldError::InvalidMint.into());
    }
    Ok(())
}

pub fn is_closed_account(discriminator: &[u8]) -> bool {
    discriminator.len() == 8 && discriminator == CLOSED_ACCOUNT_DISCRIMINATOR
}

/// Write the tombstone and zero every byte after it.
pub fn seal_closed_account(buf: &mut [u8]) {
    if buf.len() < 8 {
        return;
    }
    buf[..8].copy_from_slice(&CLOSED_ACCOUNT_DISCRIMINATOR);
    for byte in &mut buf[8..] {
        *byte = 0;
    }
}

/// A program-owned stream account is never re-initialized.
///
/// Active data stays `PaymentStreamActive`. A tombstone, or any other
/// leftover buffer, stays `AccountClosed`. Fresh opens come from the
/// system program via `CreateAccount`.
pub fn refuse_program_owned_reopen(discriminator: &[u8]) -> Result<(), ProgramError> {
    if discriminator.len() >= 8 && discriminator[..8] == crate::state::AGENT_PAYMENT_STREAM_DISCRIMINATOR
    {
        return Err(KeyShieldError::PaymentStreamActive.into());
    }
    Err(KeyShieldError::AccountClosed.into())
}

/// Canonical PDA: `["agent_payment_stream", agent, owner, bump]`.
///
/// `create_program_address` rejects a non-canonical bump. The seeds are
/// the agent grant and the owner, which is the derivation already used
/// by `open_stream` and the Python settler. A signer PDA built from a
/// different seed list cannot pass this check, so it cannot CPI-sign a
/// transfer out of the escrow.
pub fn assert_stream_pda(
    program_id: &Pubkey,
    stream: &Pubkey,
    agent: &Pubkey,
    owner: &Pubkey,
    bump: u8,
) -> Result<(), ProgramError> {
    let bump_seed = [bump];
    let derived = pinocchio::pubkey::create_program_address(
        &[
            crate::instructions::open_stream::APS_SEED,
            agent.as_ref(),
            owner.as_ref(),
            &bump_seed,
        ],
        program_id,
    )?;
    if !pinocchio::pubkey::pubkey_eq(&derived, stream) {
        return Err(KeyShieldError::InvalidPda.into());
    }
    Ok(())
}

/// `true` when `now` is past `deadline + CLOCK_LEEWAY_SECS`.
///
/// Overflow of the grace window fails closed (treated as expired).
pub fn unix_expired(now: i64, deadline: i64) -> bool {
    match deadline.checked_add(CLOCK_LEEWAY_SECS) {
        Some(limit) => now > limit,
        None => true,
    }
}

/// Session deadline is `created_at + timeout + leeway`, all checked.
/// Overflow fails closed so a wrapped timeout cannot extend the grant.
pub fn session_expired(now: u64, created_at: u64, timeout_secs: u64) -> bool {
    match created_at
        .checked_add(timeout_secs)
        .and_then(|deadline| deadline.checked_add(CLOCK_LEEWAY_SECS as u64))
    {
        Some(deadline) => now > deadline,
        None => true,
    }
}

/// First close decrements the vault stream counter. A second close does not.
pub fn close_stream_counter(is_active: u8, count: u8) -> Result<u8, ProgramError> {
    if is_active == 0 {
        return Err(KeyShieldError::AccountClosed.into());
    }
    count
        .checked_sub(1)
        .ok_or_else(|| KeyShieldError::InvalidPaymentAmount.into())
}

/// `max_total - spent`. A spent total already above the cap is
/// `ArithmeticOverflow` (6113), not a wrapped remainder.
pub fn remaining_budget(max_total: u64, spent: u64) -> Result<u64, ProgramError> {
    max_total
        .checked_sub(spent)
        .ok_or(KeyShieldError::ArithmeticOverflow.into())
}

/// Debit `amount` only when it fits in `remaining_budget`.
///
/// `amount > remaining` is `BudgetExceeded` (6100). `checked_sub` or
/// `checked_add` failing is `ArithmeticOverflow` (6113). A zero amount
/// is `InvalidPaymentAmount`.
pub fn debit_within_budget(spent: u64, amount: u64, max_total: u64) -> Result<u64, ProgramError> {
    if amount == 0 {
        return Err(KeyShieldError::InvalidPaymentAmount.into());
    }
    let remaining = remaining_budget(max_total, spent)?;
    if amount > remaining {
        return Err(KeyShieldError::BudgetExceeded.into());
    }
    spent
        .checked_add(amount)
        .ok_or(KeyShieldError::ArithmeticOverflow.into())
}

/// Price `units` and add it to `spent`, failing closed on overflow.
pub fn checked_debit(spent: u64, rate: u64, units: u64, max_total: u64) -> Result<u64, ProgramError> {
    let amount = rate
        .checked_mul(units)
        .ok_or(KeyShieldError::ArithmeticOverflow)?;
    debit_within_budget(spent, amount, max_total)
}

fn root_fingerprint(root: &[u8; 32]) -> [u8; 8] {
    let mut fp = [0u8; 8];
    fp.copy_from_slice(&root[..8]);
    if fp == [0u8; 8] {
        fp.copy_from_slice(&root[8..16]);
    }
    fp
}

fn fingerprint_seen(reserved: &[u8], root: &[u8; 32]) -> bool {
    let fp = root_fingerprint(root);
    if fp == [0u8; 8] {
        return false;
    }
    let mut slot = 0;
    while slot < RING_SLOTS {
        let start = RESERVED_RING + slot * 8;
        let stored = &reserved[start..start + 8];
        if stored.iter().any(|byte| *byte != 0) && stored == fp {
            return true;
        }
        slot += 1;
    }
    false
}

/// Abort when `seq` is not strictly greater than `last_settled_seq`.
///
/// `seq <= last_settled_seq` is `SettlementReplay` (6111). A gap above
/// the stored sequence is still strictly increasing and is allowed.
/// Sequence 0 is a replay. This read happens before any balance write.
pub fn replayed_sequence(reserved: &[u8], seq: u64) -> Result<(), ProgramError> {
    if reserved.len() < RESERVED_LEN {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }
    if seq == 0 {
        return Err(KeyShieldError::SettlementReplay.into());
    }
    let last_seq = u64::from_le_bytes(
        reserved[RESERVED_SEQ..RESERVED_SEQ + 8]
            .try_into()
            .map_err(|_| KeyShieldError::SettlementReplay)?,
    );
    if seq <= last_seq {
        return Err(KeyShieldError::SettlementReplay.into());
    }
    Ok(())
}

/// Accept a strictly newer sequence and a request hash that is neither
/// the last full hash nor one of the three remembered fingerprints.
///
/// On success the reserved region stores that request hash, the new
/// sequence, and the fingerprint at the head of the ring.
pub fn accept_settlement(
    reserved: &mut [u8],
    root: &[u8; 32],
    seq: u64,
) -> Result<(), ProgramError> {
    if reserved.len() < RESERVED_LEN || root == &[0u8; 32] {
        return Err(KeyShieldError::UnverifiedFulfillment.into());
    }
    replayed_sequence(reserved, seq)?;
    let mut prev = [0u8; 32];
    prev.copy_from_slice(&reserved[RESERVED_ROOT..RESERVED_ROOT + 32]);
    if prev.iter().any(|byte| *byte != 0) && prev == *root {
        return Err(KeyShieldError::NonceReused.into());
    }
    if fingerprint_seen(reserved, root) {
        return Err(KeyShieldError::NonceReused.into());
    }

    // The full root is the latest commitment. The ring remembers the
    // three commitments before it, so four roots stay consumed.
    if prev.iter().any(|byte| *byte != 0) {
        let fp = root_fingerprint(&prev);
        let mut ring = [0u8; 24];
        ring[..8].copy_from_slice(&fp);
        ring[8..].copy_from_slice(&reserved[RESERVED_RING..RESERVED_RING + 16]);
        reserved[RESERVED_RING..RESERVED_RING + 24].copy_from_slice(&ring);
    }
    reserved[RESERVED_ROOT..RESERVED_ROOT + 32].copy_from_slice(root);
    reserved[RESERVED_SEQ..RESERVED_SEQ + 8].copy_from_slice(&seq.to_le_bytes());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AGENT_PAYMENT_STREAM_DISCRIMINATOR;

    fn real_mint_data() -> [u8; 82] {
        let mut data = [0u8; 82];
        data[MINT_DECIMALS_OFFSET] = 6;
        data[MINT_INITIALIZED_OFFSET] = 1;
        data
    }

    #[test]
    fn counterfeit_mint_with_six_decimals_is_rejected() {
        let mut fake = [7u8; 32];
        fake[0] = 9;
        let err = assert_canonical_usdc_mint(&fake, &SPL_TOKEN_PROGRAM_ID, &real_mint_data())
            .unwrap_err();
        assert_eq!(err, ProgramError::Custom(KeyShieldError::InvalidMint as u32));
    }

    #[test]
    fn canonical_mainnet_usdc_mint_is_accepted() {
        assert_canonical_usdc_mint(&USDC_MINT_MAINNET, &SPL_TOKEN_PROGRAM_ID, &real_mint_data())
            .unwrap();
    }

    #[test]
    fn uninitialized_or_wrong_decimals_are_rejected() {
        let mut data = real_mint_data();
        data[MINT_DECIMALS_OFFSET] = 9;
        let err = assert_canonical_usdc_mint(&USDC_MINT_DEVNET, &SPL_TOKEN_PROGRAM_ID, &data)
            .unwrap_err();
        assert_eq!(err, ProgramError::Custom(KeyShieldError::InvalidMint as u32));
        data[MINT_DECIMALS_OFFSET] = 6;
        data[MINT_INITIALIZED_OFFSET] = 0;
        let err = assert_canonical_usdc_mint(&USDC_MINT_DEVNET, &SPL_TOKEN_PROGRAM_ID, &data)
            .unwrap_err();
        assert_eq!(err, ProgramError::Custom(KeyShieldError::InvalidMint as u32));
    }

    #[test]
    fn token_account_mint_mismatch_is_rejected() {
        let mut data = [0u8; 165];
        data[..32].copy_from_slice(&USDC_MINT_MAINNET);
        data[32..64].copy_from_slice(&[4u8; 32]);
        let err = assert_escrow_token_account(&data, &USDC_MINT_DEVNET, &[4u8; 32]).unwrap_err();
        assert_eq!(err, ProgramError::Custom(KeyShieldError::InvalidMint as u32));
        assert_escrow_token_account(&data, &USDC_MINT_MAINNET, &[4u8; 32]).unwrap();
    }

    #[test]
    fn closed_tombstone_blocks_reopen_and_duplicate_close() {
        let mut buf = [1u8; 64];
        buf[..8].copy_from_slice(&AGENT_PAYMENT_STREAM_DISCRIMINATOR);
        seal_closed_account(&mut buf);
        assert!(is_closed_account(&buf[..8]));
        assert!(buf[8..].iter().all(|byte| *byte == 0));
        let err = refuse_program_owned_reopen(&buf[..8]).unwrap_err();
        assert_eq!(err, ProgramError::Custom(KeyShieldError::AccountClosed as u32));
        let err = refuse_program_owned_reopen(&AGENT_PAYMENT_STREAM_DISCRIMINATOR).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::PaymentStreamActive as u32)
        );
        assert_eq!(close_stream_counter(1, 2).unwrap(), 1);
        let err = close_stream_counter(0, 1).unwrap_err();
        assert_eq!(err, ProgramError::Custom(KeyShieldError::AccountClosed as u32));
        let err = close_stream_counter(1, 0).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::InvalidPaymentAmount as u32)
        );
    }

    #[test]
    fn replayed_sequence_and_root_are_rejected() {
        let mut reserved = [0u8; 64];
        let mut root_a = [0u8; 32];
        root_a[0] = 1;
        root_a[31] = 2;
        accept_settlement(&mut reserved, &root_a, 1).unwrap();
        let err = accept_settlement(&mut reserved, &root_a, 1).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::SettlementReplay as u32)
        );
        let err = replayed_sequence(&reserved, 1).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::SettlementReplay as u32)
        );
        let err = accept_settlement(&mut reserved, &root_a, 2).unwrap_err();
        assert_eq!(err, ProgramError::Custom(KeyShieldError::NonceReused as u32));

        let mut root_b = [0u8; 32];
        root_b[0] = 3;
        accept_settlement(&mut reserved, &root_b, 2).unwrap();
        let mut root_c = [0u8; 32];
        root_c[0] = 4;
        accept_settlement(&mut reserved, &root_c, 3).unwrap();
        let mut root_d = [0u8; 32];
        root_d[0] = 5;
        accept_settlement(&mut reserved, &root_d, 4).unwrap();
        // `root_a`'s fingerprint is still inside the 3-slot ring.
        let err = accept_settlement(&mut reserved, &root_a, 5).unwrap_err();
        assert_eq!(err, ProgramError::Custom(KeyShieldError::NonceReused as u32));
    }

    #[test]
    fn sequence_at_or_below_last_settled_is_aborted() {
        let mut reserved = [0u8; 64];
        let mut first = [0u8; 32];
        first[0] = 1;
        let mut second = [0u8; 32];
        second[0] = 2;
        let mut third = [0u8; 32];
        third[0] = 3;
        replayed_sequence(&reserved, 1).unwrap();
        accept_settlement(&mut reserved, &first, 1).unwrap();
        let err = replayed_sequence(&reserved, 1).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::SettlementReplay as u32)
        );
        let err = accept_settlement(&mut reserved, &second, 0).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::SettlementReplay as u32)
        );
        // A gap is strictly greater than last_settled_seq, so it is stored.
        accept_settlement(&mut reserved, &second, 4).unwrap();
        let err = accept_settlement(&mut reserved, &third, 3).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::SettlementReplay as u32)
        );
        let err = accept_settlement(&mut reserved, &third, 4).unwrap_err();
        assert_eq!(
            err,
            ProgramError::Custom(KeyShieldError::SettlementReplay as u32)
        );
        accept_settlement(&mut reserved, &third, 5).unwrap();
        let stored =
            u64::from_le_bytes(reserved[RESERVED_SEQ..RESERVED_SEQ + 8].try_into().unwrap());
        assert_eq!(stored, 5);
        assert_eq!(&reserved[RESERVED_ROOT..RESERVED_ROOT + 32], &third);
    }

    #[test]
    fn clock_leeway_bounds_drift_and_checked_debit_does_not_wrap() {
        let deadline = 1_000_i64;
        assert!(!unix_expired(deadline, deadline));
        assert!(!unix_expired(deadline + CLOCK_LEEWAY_SECS, deadline));
        assert!(unix_expired(deadline + CLOCK_LEEWAY_SECS + 1, deadline));
        assert!(unix_expired(50, i64::MAX - 10));
        assert!(!session_expired(1_030, 1_000, 0));
        assert!(session_expired(1_031, 1_000, 0));
        assert!(session_expired(10, u64::MAX - 5, 100));
        assert_eq!(checked_debit(10, 2, 4, 100).unwrap(), 18);
        assert!(checked_debit(u64::MAX - 1, 2, 2, u64::MAX).is_err());
        assert!(checked_debit(90, 2, 6, 100).is_err());
    }

    #[test]
    fn settlement_amount_cannot_exceed_remaining_budget() {
        assert_eq!(remaining_budget(100, 40).unwrap(), 60);
        assert_eq!(debit_within_budget(40, 60, 100).unwrap(), 100);
        let over = debit_within_budget(40, 61, 100).unwrap_err();
        assert_eq!(over, ProgramError::Custom(KeyShieldError::BudgetExceeded as u32));
        let at_cap = debit_within_budget(u64::MAX, 1, u64::MAX).unwrap_err();
        assert_eq!(
            at_cap,
            ProgramError::Custom(KeyShieldError::BudgetExceeded as u32)
        );
        let wrapped = remaining_budget(10, 11).unwrap_err();
        assert_eq!(
            wrapped,
            ProgramError::Custom(KeyShieldError::ArithmeticOverflow as u32)
        );
        let mul = checked_debit(1, u64::MAX, 2, u64::MAX).unwrap_err();
        assert_eq!(
            mul,
            ProgramError::Custom(KeyShieldError::ArithmeticOverflow as u32)
        );
    }
}
