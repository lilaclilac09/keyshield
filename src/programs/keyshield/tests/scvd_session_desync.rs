//! SCVD fail-to-pass harness for Pinocchio envelope, CU, and CPI checks.
//!
//!   cargo test -p keyshield --test scvd_session_desync

use keyshield::error::KeyShieldError;
use keyshield::instructions::mpp_settle::{
    parse_artifact_root, parse_capture_signature, parse_request_hash, parse_settlement,
};
use keyshield::session_guard::{
    assert_account_metas, assert_initialized_pda, assert_instruction_envelope,
    assert_no_passthrough_cpi, context_anchor, settle_with_cu_budget, CuMeter, StreamSnap,
    MAX_COMPUTE_UNITS, MPP_SETTLE_IX_LEN, MPP_SETTLE_MIN_ACCOUNTS, OPEN_STREAM_IX_LEN,
};
use pinocchio::program_error::ProgramError;

fn code(err: ProgramError) -> u32 {
    match err {
        ProgramError::Custom(c) => c,
        ProgramError::InvalidInstructionData => 1,
        ProgramError::NotEnoughAccountKeys => 2,
        _ => 0,
    }
}

fn mpp_settle_body() -> [u8; MPP_SETTLE_IX_LEN] {
    let mut data = [0u8; MPP_SETTLE_IX_LEN];
    data[0] = 26;
    data[1..9].copy_from_slice(&5u64.to_le_bytes());
    data[9] = 0x11;
    data[41..49].copy_from_slice(&1u64.to_le_bytes());
    data[49] = 0x22;
    data[81] = 0x33;
    data
}

#[test]
fn empty_instruction_cannot_be_session_signed() {
    let err = assert_instruction_envelope(&[]).unwrap_err();
    assert_eq!(err, ProgramError::InvalidInstructionData);
}

#[test]
fn malformed_discriminator_is_rejected() {
    for disc in [3u8, 9, 34, 99, 255] {
        let err = assert_instruction_envelope(&[disc]).unwrap_err();
        assert_eq!(err, ProgramError::InvalidInstructionData);
    }
}

#[test]
fn truncated_open_stream_and_settle_are_rejected() {
    let short_open = [24u8; OPEN_STREAM_IX_LEN - 1];
    assert!(assert_instruction_envelope(&short_open).is_err());
    let short_settle = [26u8; 40];
    assert!(assert_instruction_envelope(&short_settle).is_err());
    assert!(assert_instruction_envelope(&mpp_settle_body()).is_ok());
}

#[test]
fn missing_account_metas_fail_closed() {
    let err = assert_account_metas(3, MPP_SETTLE_MIN_ACCOUNTS).unwrap_err();
    assert_eq!(err, ProgramError::NotEnoughAccountKeys);
    assert_account_metas(MPP_SETTLE_MIN_ACCOUNTS, MPP_SETTLE_MIN_ACCOUNTS).unwrap();
}

#[test]
fn uninitialized_pda_seeds_cannot_sign() {
    let err = assert_initialized_pda(false, true).unwrap_err();
    assert_eq!(code(err), KeyShieldError::InvalidPda as u32);
    let err = assert_initialized_pda(true, false).unwrap_err();
    assert_eq!(code(err), KeyShieldError::InvalidPda as u32);
    assert_initialized_pda(true, true).unwrap();
}

#[test]
fn passthrough_cpi_without_settler_or_pda_is_rejected() {
    let err = assert_no_passthrough_cpi(false, true).unwrap_err();
    assert_eq!(code(err), KeyShieldError::NotMppSettler as u32);
    let err = assert_no_passthrough_cpi(true, false).unwrap_err();
    assert_eq!(code(err), KeyShieldError::InvalidPda as u32);
    assert_no_passthrough_cpi(true, true).unwrap();
}

#[test]
fn cu_exhaustion_mid_instruction_does_not_orphan_debit() {
    let mut meter = CuMeter::new();
    let before = StreamSnap {
        spent: 7,
        escrow: 93,
    };
    let (err, rolled) = settle_with_cu_budget(&mut meter, before, 10, 4_000).unwrap_err();
    assert_eq!(code(err), KeyShieldError::SettlementFailed as u32);
    assert_eq!(rolled, before);
    assert!(meter.used <= MAX_COMPUTE_UNITS);
}

#[test]
fn honest_settle_stays_under_five_thousand_cu() {
    let mut meter = CuMeter::new();
    let before = StreamSnap {
        spent: 0,
        escrow: 500,
    };
    let after = settle_with_cu_budget(&mut meter, before, 25, 0).unwrap();
    assert!(meter.used < MAX_COMPUTE_UNITS);
    assert_eq!(after.spent, 25);
    assert_eq!(after.escrow, 475);
}

#[test]
fn boundary_length_settlement_bytes_fail_closed() {
    assert!(parse_artifact_root(&[1u8; 8]).is_err());
    assert!(parse_settlement(&[1u8; 40]).is_err());
    assert!(parse_capture_signature(&[1u8; 48]).is_err());
    assert!(parse_request_hash(&[1u8; 80]).is_err());
    let mut full = [0u8; 112];
    full[..8].copy_from_slice(&1u64.to_le_bytes());
    full[8] = 1;
    full[40..48].copy_from_slice(&1u64.to_le_bytes());
    full[48] = 2;
    full[80] = 3;
    assert!(parse_request_hash(&full).is_ok());
}

#[test]
fn context_anchor_binds_program_and_payload() {
    let program = [7u8; 32];
    let a = context_anchor(&program, &[26, 1, 2, 3]);
    let b = context_anchor(&program, &[26, 1, 2, 4]);
    let c = context_anchor(&[8u8; 32], &[26, 1, 2, 3]);
    assert_ne!(a, b);
    assert_ne!(a, c);
    assert_eq!(a, context_anchor(&program, &[26, 1, 2, 3]));
}
