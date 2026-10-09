//! Host-side copy of the Pinocchio packed instruction layouts.
//! A session key may sign only after this decode succeeds.

use crate::error::EngineError;

pub const OPEN_STREAM_DISC: u8 = 24;
pub const MPP_SETTLE_DISC: u8 = 26;
pub const OPEN_STREAM_IX_LEN: usize = 30;
pub const MPP_SETTLE_IX_LEN: usize = 113;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IxKind {
    OpenStream,
    MppSettle,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MppSettleView {
    pub units_consumed: u64,
    pub artifact_root: [u8; 32],
    pub settlement_seq: u64,
    pub capture_signature: [u8; 32],
    pub request_hash: [u8; 32],
}

/// Structural envelope: known discriminator and exact minimum length.
pub fn assert_instruction_envelope(ix_data: &[u8]) -> Result<IxKind, EngineError> {
    if ix_data.is_empty() {
        return Err(EngineError::InvalidEnvelope);
    }
    match ix_data[0] {
        OPEN_STREAM_DISC if ix_data.len() >= OPEN_STREAM_IX_LEN => Ok(IxKind::OpenStream),
        MPP_SETTLE_DISC if ix_data.len() >= MPP_SETTLE_IX_LEN => Ok(IxKind::MppSettle),
        _ => Err(EngineError::InvalidEnvelope),
    }
}

fn le_u64(bytes: &[u8]) -> Result<u64, EngineError> {
    let arr: [u8; 8] = bytes
        .try_into()
        .map_err(|_| EngineError::InvalidEnvelope)?;
    Ok(u64::from_le_bytes(arr))
}

pub fn parse_mpp_settle(ix_data: &[u8]) -> Result<MppSettleView, EngineError> {
    if assert_instruction_envelope(ix_data)? != IxKind::MppSettle {
        return Err(EngineError::InvalidEnvelope);
    }
    let units = le_u64(&ix_data[1..9])?;
    let mut artifact_root = [0u8; 32];
    artifact_root.copy_from_slice(&ix_data[9..41]);
    let settlement_seq = le_u64(&ix_data[41..49])?;
    let mut capture_signature = [0u8; 32];
    capture_signature.copy_from_slice(&ix_data[49..81]);
    let mut request_hash = [0u8; 32];
    request_hash.copy_from_slice(&ix_data[81..113]);
    if artifact_root == [0u8; 32] || request_hash == [0u8; 32] || settlement_seq == 0 {
        return Err(EngineError::InvalidEnvelope);
    }
    Ok(MppSettleView {
        units_consumed: units,
        artifact_root,
        settlement_seq,
        capture_signature,
        request_hash,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_and_truncated_fail_closed() {
        assert_eq!(
            assert_instruction_envelope(&[]).unwrap_err(),
            EngineError::InvalidEnvelope
        );
        assert!(assert_instruction_envelope(&[26, 1]).is_err());
        assert!(assert_instruction_envelope(&[24; 29]).is_err());
    }
}
