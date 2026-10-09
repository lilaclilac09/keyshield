//! Session-key envelope and CU budget guards.
//!
//! A session signature is only meaningful when the compiled instruction
//! is a known discriminator, the account list is complete, and the
//! compute path stays inside the 5,000 CU pinocchio budget. Any
//! mid-instruction CU trip must leave stream balances untouched.

use pinocchio::program_error::ProgramError;

use crate::error::KeyShieldError;
use crate::instructions::Instruction;

/// Pinocchio payment path hard cap. Live OpenStream / MppSettle on
/// this program stay under this number; a path that would exceed it
/// must fail closed with no debit.
pub const MAX_COMPUTE_UNITS: u64 = 5_000;

/// Conservative host-side CU weights used when the SBF meter is absent.
pub const CU_PARSE: u64 = 200;
pub const CU_PDA: u64 = 800;
pub const CU_TRANSFER: u64 = 1_500;
pub const CU_ED25519: u64 = 2_000;

/// OpenPaymentStream ix data including discriminator.
/// Layout: disc(1) bump(1) max_total(8) cost_per_unit(8) rate_bits(8) interval(4).
pub const OPEN_STREAM_IX_LEN: usize = 30;
pub const OPEN_STREAM_DISC: u8 = 24;
/// MppSettle ix data including discriminator.
/// Layout: disc(1) units(8) root(32) seq(8) capture_mac(32) request_hash(32).
pub const MPP_SETTLE_IX_LEN: usize = 113;
pub const MPP_SETTLE_DISC: u8 = 26;
/// Minimum accounts for `mpp_settle` (settler … token program).
pub const MPP_SETTLE_MIN_ACCOUNTS: usize = 7;
/// Host-metered honest path: parse + PDA + Ed25519 + TransferChecked.
pub const HONEST_SETTLE_CU: u64 = CU_PARSE + CU_PDA + CU_ED25519 + CU_TRANSFER;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StreamSnap {
    pub spent: u64,
    pub escrow: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct CuMeter {
    pub used: u64,
}

impl CuMeter {
    pub fn new() -> Self {
        Self { used: 0 }
    }

    pub fn charge(&mut self, cost: u64) -> Result<(), ProgramError> {
        let next = self
            .used
            .checked_add(cost)
            .ok_or(KeyShieldError::ArithmeticOverflow)?;
        if next > MAX_COMPUTE_UNITS {
            return Err(KeyShieldError::SettlementFailed.into());
        }
        self.used = next;
        Ok(())
    }
}

/// Reject empty, unknown, or truncated compiled instruction data
/// before a session key is allowed to sign.
pub fn assert_instruction_envelope(ix_data: &[u8]) -> Result<Instruction, ProgramError> {
    if ix_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    let instruction = Instruction::try_from_u8(ix_data[0])
        .ok_or(ProgramError::InvalidInstructionData)?;
    match instruction {
        Instruction::OpenPaymentStream if ix_data.len() < OPEN_STREAM_IX_LEN => {
            return Err(ProgramError::InvalidInstructionData);
        }
        Instruction::MppSettle if ix_data.len() < MPP_SETTLE_IX_LEN => {
            return Err(ProgramError::InvalidInstructionData);
        }
        _ => {}
    }
    Ok(instruction)
}

/// Missing account metas cannot reach the handler with a silent default.
pub fn assert_account_metas(count: usize, required: usize) -> Result<(), ProgramError> {
    if count < required {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    Ok(())
}

/// Uninitialized PDA seeds are not a signer.
pub fn assert_initialized_pda(bump_present: bool, seeds_complete: bool) -> Result<(), ProgramError> {
    if !bump_present || !seeds_complete {
        return Err(KeyShieldError::InvalidPda.into());
    }
    Ok(())
}

/// A foreign program cannot pass through our PDA signer.
pub fn assert_no_passthrough_cpi(
    settler_is_signer: bool,
    pda_verified: bool,
) -> Result<(), ProgramError> {
    if !settler_is_signer {
        return Err(KeyShieldError::NotMppSettler.into());
    }
    if !pda_verified {
        return Err(KeyShieldError::InvalidPda.into());
    }
    Ok(())
}

/// Domain-separated context hash bound into the session guard.
/// Portable FNV-1a over program id + discriminator + payload so the
/// host tests do not need `sol_sha256`.
pub fn context_anchor(program_id: &[u8; 32], ix_data: &[u8]) -> [u8; 32] {
    let mut hash = [0u8; 32];
    let mut state: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in program_id.iter().chain(ix_data.iter()) {
        state ^= u64::from(*byte);
        state = state.wrapping_mul(0x0100_0000_01b3);
    }
    hash[..8].copy_from_slice(&state.to_le_bytes());
    let mut state2 = state ^ (ix_data.len() as u64);
    state2 = state2.wrapping_mul(0x0100_0000_01b3);
    hash[8..16].copy_from_slice(&state2.to_le_bytes());
    hash[16..24].copy_from_slice(&(!state).to_le_bytes());
    hash[24..32].copy_from_slice(&(state ^ 0xA5A5_A5A5_A5A5_A5A5).to_le_bytes());
    hash
}

/// Strict OpenPaymentStream memory view. No padding; every field is
/// little-endian at a fixed offset.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OpenStreamView {
    pub bump: u8,
    pub max_total_micro_usdc: u64,
    pub cost_per_unit_micro_usdc: u64,
    pub max_rate_usd_per_min_bits: u64,
    pub settlement_interval_secs: u32,
}

/// Strict MppSettle memory view. Session signing is only legal after
/// this parse succeeds: the wire bytes are a complete payment, not a
/// receipt-without-order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MppSettleView {
    pub units_consumed: u64,
    pub artifact_root: [u8; 32],
    pub settlement_seq: u64,
    pub capture_signature: [u8; 32],
    pub request_hash: [u8; 32],
}

fn le_u32(bytes: &[u8]) -> Result<u32, ProgramError> {
    let arr: [u8; 4] = bytes
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    Ok(u32::from_le_bytes(arr))
}

fn le_u64(bytes: &[u8]) -> Result<u64, ProgramError> {
    let arr: [u8; 8] = bytes
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    Ok(u64::from_le_bytes(arr))
}

fn copy32(bytes: &[u8]) -> Result<[u8; 32], ProgramError> {
    bytes
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)
}

/// Decode OpenPaymentStream at the canonical offsets. Length and
/// discriminator are checked; semantic budget rules stay in the handler.
pub fn parse_open_stream_layout(ix: &[u8]) -> Result<OpenStreamView, ProgramError> {
    if ix.len() < OPEN_STREAM_IX_LEN || ix[0] != OPEN_STREAM_DISC {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(OpenStreamView {
        bump: ix[1],
        max_total_micro_usdc: le_u64(&ix[2..10])?,
        cost_per_unit_micro_usdc: le_u64(&ix[10..18])?,
        max_rate_usd_per_min_bits: le_u64(&ix[18..26])?,
        settlement_interval_secs: le_u32(&ix[26..30])?,
    })
}

/// Decode MppSettle at the canonical offsets. Structural only — a
/// zero root is still a well-formed envelope so the handler can return
/// `UnverifiedFulfillment` instead of a generic decode error.
pub fn parse_mpp_settle_layout(ix: &[u8]) -> Result<MppSettleView, ProgramError> {
    if ix.len() < MPP_SETTLE_IX_LEN || ix[0] != MPP_SETTLE_DISC {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(MppSettleView {
        units_consumed: le_u64(&ix[1..9])?,
        artifact_root: copy32(&ix[9..41])?,
        settlement_seq: le_u64(&ix[41..49])?,
        capture_signature: copy32(&ix[49..81])?,
        request_hash: copy32(&ix[81..113])?,
    })
}

/// Honest settle path: parse → PDA → Ed25519 → transfer. Stays < 5,000 CU.
/// A CU trip restores `before`.
pub fn settle_with_cu_budget(
    meter: &mut CuMeter,
    before: StreamSnap,
    debit: u64,
    force_extra_cu: u64,
) -> Result<StreamSnap, (ProgramError, StreamSnap)> {
    if meter.charge(CU_PARSE).is_err() {
        return Err((KeyShieldError::SettlementFailed.into(), before));
    }
    if meter.charge(CU_PDA).is_err() {
        return Err((KeyShieldError::SettlementFailed.into(), before));
    }
    if meter.charge(CU_ED25519).is_err() {
        return Err((KeyShieldError::SettlementFailed.into(), before));
    }
    if meter.charge(CU_TRANSFER).is_err() {
        return Err((KeyShieldError::SettlementFailed.into(), before));
    }
    if force_extra_cu > 0 && meter.charge(force_extra_cu).is_err() {
        return Err((KeyShieldError::SettlementFailed.into(), before));
    }
    if debit == 0 {
        return Err((KeyShieldError::InvalidPaymentAmount.into(), before));
    }
    if debit > before.escrow {
        return Err((KeyShieldError::InsufficientStreamBalance.into(), before));
    }
    Ok(StreamSnap {
        spent: before.spent.saturating_add(debit),
        escrow: before.escrow.saturating_sub(debit),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_and_unknown_discriminators_are_rejected() {
        assert!(assert_instruction_envelope(&[]).is_err());
        assert!(assert_instruction_envelope(&[99]).is_err());
        assert!(assert_instruction_envelope(&[26, 1]).is_err());
    }

    #[test]
    fn honest_path_stays_under_budget() {
        let mut meter = CuMeter::new();
        let before = StreamSnap {
            spent: 0,
            escrow: 1_000,
        };
        let after = settle_with_cu_budget(&mut meter, before, 100, 0).unwrap();
        assert_eq!(HONEST_SETTLE_CU, 4_500);
        assert_eq!(meter.used, HONEST_SETTLE_CU);
        assert!(meter.used < MAX_COMPUTE_UNITS);
        assert_eq!(after.spent, 100);
        assert_eq!(after.escrow, 900);
    }

    #[test]
    fn cu_exhaustion_rolls_back() {
        let mut meter = CuMeter::new();
        let before = StreamSnap {
            spent: 40,
            escrow: 60,
        };
        let err = settle_with_cu_budget(&mut meter, before, 10, 10_000).unwrap_err();
        assert_eq!(err.1, before);
    }
}
