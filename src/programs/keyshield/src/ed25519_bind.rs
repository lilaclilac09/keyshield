//! Ed25519 settlement binding checked via the instructions sysvar.
//!
//! `mpp_settle` does not verify the signature itself. The Ed25519
//! precompile already did that when it ran as instruction 0. This
//! module checks that the precompile's message is
//! `sha256(stream_pubkey || seq_le || debit_le || artifact_sha256)`
//! and that the public key is the stream owner.

use core::ops::Deref;

use pinocchio::{
    program_error::ProgramError,
    pubkey::{pubkey_eq, Pubkey},
    sysvars::instructions::Instructions,
};

use crate::error::KeyShieldError;

/// `Ed25519SigVerify111111111111111111111111111`.
pub const ED25519_PROGRAM_ID: Pubkey = [
    3, 125, 70, 214, 124, 147, 251, 190, 18, 249, 66, 143, 131, 141, 64, 255, 5, 112, 116, 73, 39,
    244, 138, 100, 252, 202, 112, 68, 128, 0, 0, 0,
];

const SHA256_K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

fn sha256_block(state: &mut [u32; 8], block: &[u8; 64]) {
    let mut w = [0u32; 64];
    let mut i = 0;
    while i < 16 {
        let j = i * 4;
        w[i] = u32::from_be_bytes([block[j], block[j + 1], block[j + 2], block[j + 3]]);
        i += 1;
    }
    while i < 64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16]
            .wrapping_add(s0)
            .wrapping_add(w[i - 7])
            .wrapping_add(s1);
        i += 1;
    }
    let mut a = state[0];
    let mut b = state[1];
    let mut c = state[2];
    let mut d = state[3];
    let mut e = state[4];
    let mut f = state[5];
    let mut g = state[6];
    let mut h = state[7];
    let mut t = 0;
    while t < 64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let temp1 = h
            .wrapping_add(s1)
            .wrapping_add(ch)
            .wrapping_add(SHA256_K[t])
            .wrapping_add(w[t]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = s0.wrapping_add(maj);
        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(temp1);
        d = c;
        c = b;
        b = a;
        a = temp1.wrapping_add(temp2);
        t += 1;
    }
    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
    state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g);
    state[7] = state[7].wrapping_add(h);
}

/// SHA-256. Used on-chain and in host tests. Does not call `sol_sha256`.
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut state: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut offset = 0;
    while offset + 64 <= data.len() {
        let mut block = [0u8; 64];
        block.copy_from_slice(&data[offset..offset + 64]);
        sha256_block(&mut state, &block);
        offset += 64;
    }
    let mut block = [0u8; 64];
    let rest = data.len() - offset;
    block[..rest].copy_from_slice(&data[offset..]);
    block[rest] = 0x80;
    let bits = (data.len() as u64).wrapping_mul(8);
    if rest <= 55 {
        block[56..64].copy_from_slice(&bits.to_be_bytes());
        sha256_block(&mut state, &block);
    } else {
        sha256_block(&mut state, &block);
        block = [0u8; 64];
        block[56..64].copy_from_slice(&bits.to_be_bytes());
        sha256_block(&mut state, &block);
    }
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 8 {
        out[i * 4..i * 4 + 4].copy_from_slice(&state[i].to_be_bytes());
        i += 1;
    }
    out
}

/// `sha256(stream_pubkey || seq_le_u64 || debit_le_u64 || artifact)`.
pub fn settlement_binding_hash(
    stream: &Pubkey,
    seq: u64,
    amount: u64,
    artifact: &[u8; 32],
) -> [u8; 32] {
    let mut preimage = [0u8; 80];
    preimage[..32].copy_from_slice(stream.as_ref());
    preimage[32..40].copy_from_slice(&seq.to_le_bytes());
    preimage[40..48].copy_from_slice(&amount.to_le_bytes());
    preimage[48..80].copy_from_slice(artifact);
    sha256(&preimage)
}

fn read_u16(data: &[u8], at: usize) -> Result<u16, ProgramError> {
    let bytes: [u8; 2] = data
        .get(at..at + 2)
        .ok_or(KeyShieldError::InvalidSettlementSignature)?
        .try_into()
        .map_err(|_| KeyShieldError::InvalidSettlementSignature)?;
    Ok(u16::from_le_bytes(bytes))
}

/// The precompile payload's public key and message match this settle.
///
/// Offsets must name this instruction (`u16::MAX`). The signature bytes
/// are not checked again.
pub fn assert_ed25519_payload(
    data: &[u8],
    message: &[u8; 32],
    consumer: &Pubkey,
) -> Result<(), ProgramError> {
    if data.len() < 16 || data[0] != 1 || data[1] != 0 {
        return Err(KeyShieldError::InvalidSettlementSignature.into());
    }
    let sig_off = read_u16(data, 2)? as usize;
    let sig_ix = read_u16(data, 4)?;
    let pk_off = read_u16(data, 6)? as usize;
    let pk_ix = read_u16(data, 8)?;
    let msg_off = read_u16(data, 10)? as usize;
    let msg_size = read_u16(data, 12)?;
    let msg_ix = read_u16(data, 14)?;
    if sig_ix != u16::MAX || pk_ix != u16::MAX || msg_ix != u16::MAX || msg_size != 32 {
        return Err(KeyShieldError::InvalidSettlementSignature.into());
    }
    let sig_end = sig_off
        .checked_add(64)
        .ok_or(KeyShieldError::InvalidSettlementSignature)?;
    let pk_end = pk_off
        .checked_add(32)
        .ok_or(KeyShieldError::InvalidSettlementSignature)?;
    let msg_end = msg_off
        .checked_add(32)
        .ok_or(KeyShieldError::InvalidSettlementSignature)?;
    if sig_end > data.len() || pk_end > data.len() || msg_end > data.len() {
        return Err(KeyShieldError::InvalidSettlementSignature.into());
    }
    if &data[pk_off..pk_end] != consumer.as_ref() || &data[msg_off..msg_end] != message {
        return Err(KeyShieldError::InvalidSettlementSignature.into());
    }
    Ok(())
}

/// Instruction 0 is the Ed25519 precompile over the settlement tuple.
///
/// `load_current_index` must not be 0: `mpp_settle` is a later
/// instruction in the same transaction.
pub fn assert_settlement_instructions<T>(
    instructions: &Instructions<T>,
    stream: &Pubkey,
    seq: u64,
    amount: u64,
    artifact: &[u8; 32],
    consumer: &Pubkey,
) -> Result<(), ProgramError>
where
    T: Deref<Target = [u8]>,
{
    if instructions.load_current_index() == 0 {
        return Err(KeyShieldError::InvalidSettlementSignature.into());
    }
    let ix0 = instructions
        .load_instruction_at(0)
        .map_err(|_| KeyShieldError::InvalidSettlementSignature)?;
    if !pubkey_eq(ix0.get_program_id(), &ED25519_PROGRAM_ID) {
        return Err(KeyShieldError::InvalidSettlementSignature.into());
    }
    let message = settlement_binding_hash(stream, seq, amount, artifact);
    assert_ed25519_payload(ix0.get_instruction_data(), &message, consumer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pinocchio::sysvars::instructions::Instructions;

    fn err_code(err: ProgramError) -> u32 {
        match err {
            ProgramError::Custom(code) => code,
            _ => 0,
        }
    }

    #[test]
    fn sha256_abc() {
        let digest = sha256(b"abc");
        assert_eq!(
            digest,
            [
                0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
                0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
                0xf2, 0x00, 0x15, 0xad,
            ]
        );
    }

    #[test]
    fn binding_hash_matches_known_preimage() {
        let stream = [0x11u8; 32];
        let artifact = [0x22u8; 32];
        let digest = settlement_binding_hash(&stream, 7, 1000, &artifact);
        assert_eq!(
            digest,
            [
                0x2e, 0x03, 0x60, 0xbb, 0x38, 0x01, 0xf4, 0xde, 0x81, 0xf0, 0xdc, 0xcd, 0x6b, 0x97,
                0xb1, 0x9f, 0xd7, 0x82, 0x4f, 0xe6, 0x9f, 0x60, 0x6c, 0x77, 0x2d, 0x62, 0x88, 0x5b,
                0xbe, 0x20, 0x1c, 0x29,
            ]
        );
    }

    fn honest_payload(pubkey: &[u8; 32], message: &[u8; 32]) -> [u8; 144] {
        let mut data = [0u8; 144];
        data[0] = 1;
        data[2..4].copy_from_slice(&16u16.to_le_bytes());
        data[4..6].copy_from_slice(&u16::MAX.to_le_bytes());
        data[6..8].copy_from_slice(&80u16.to_le_bytes());
        data[8..10].copy_from_slice(&u16::MAX.to_le_bytes());
        data[10..12].copy_from_slice(&112u16.to_le_bytes());
        data[12..14].copy_from_slice(&32u16.to_le_bytes());
        data[14..16].copy_from_slice(&u16::MAX.to_le_bytes());
        data[16] = 0x9;
        data[80..112].copy_from_slice(pubkey);
        data[112..144].copy_from_slice(message);
        data
    }

    /// Two-instruction sysvar. Ed25519 at index 0, current index at the tail.
    fn pack_sysvar(ix0_program: &[u8; 32], ix0_data: &[u8; 144], current: u16) -> [u8; 224] {
        let mut buf = [0u8; 224];
        buf[0..2].copy_from_slice(&2u16.to_le_bytes());
        buf[2..4].copy_from_slice(&6u16.to_le_bytes());
        buf[4..6].copy_from_slice(&186u16.to_le_bytes());
        buf[8..40].copy_from_slice(ix0_program);
        buf[40..42].copy_from_slice(&144u16.to_le_bytes());
        buf[42..186].copy_from_slice(ix0_data);
        buf[222..224].copy_from_slice(&current.to_le_bytes());
        buf
    }

    #[test]
    fn preceding_ed25519_binds_the_tuple() {
        let stream = [0x11u8; 32];
        let artifact = [0x22u8; 32];
        let owner = [0x33u8; 32];
        let message = settlement_binding_hash(&stream, 7, 1000, &artifact);
        let payload = honest_payload(&owner, &message);
        let buf = pack_sysvar(&ED25519_PROGRAM_ID, &payload, 1);
        let instructions = unsafe { Instructions::new_unchecked(&buf[..]) };
        assert_settlement_instructions(&instructions, &stream, 7, 1000, &artifact, &owner).unwrap();
    }

    #[test]
    fn current_index_zero_is_rejected() {
        let stream = [0x11u8; 32];
        let artifact = [0x22u8; 32];
        let owner = [0x33u8; 32];
        let message = settlement_binding_hash(&stream, 7, 1000, &artifact);
        let payload = honest_payload(&owner, &message);
        let buf = pack_sysvar(&ED25519_PROGRAM_ID, &payload, 0);
        let instructions = unsafe { Instructions::new_unchecked(&buf[..]) };
        let err = assert_settlement_instructions(&instructions, &stream, 7, 1000, &artifact, &owner)
            .unwrap_err();
        assert_eq!(err_code(err), KeyShieldError::InvalidSettlementSignature as u32);
    }

    #[test]
    fn wrong_message_or_owner_is_rejected() {
        let stream = [0x11u8; 32];
        let artifact = [0x22u8; 32];
        let owner = [0x33u8; 32];
        let message = settlement_binding_hash(&stream, 7, 1000, &artifact);
        let payload = honest_payload(&owner, &message);
        let buf = pack_sysvar(&ED25519_PROGRAM_ID, &payload, 1);
        let instructions = unsafe { Instructions::new_unchecked(&buf[..]) };
        let err = assert_settlement_instructions(&instructions, &stream, 8, 1000, &artifact, &owner)
            .unwrap_err();
        assert_eq!(err_code(err), KeyShieldError::InvalidSettlementSignature as u32);
        let other = [0x44u8; 32];
        let err = assert_settlement_instructions(&instructions, &stream, 7, 1000, &artifact, &other)
            .unwrap_err();
        assert_eq!(err_code(err), KeyShieldError::InvalidSettlementSignature as u32);
    }
}
