//! Revocation bitmap (ix #29).
//!
//! One PDA per owner holds 131072 bits. Flipping a bit revokes a
//! session index. Rent stays on that single account.
//!
//! `mpp_settle` consults the bitmap only when the instruction data
//! carries a `u32` session index after the 112-byte body and the
//! bitmap account is present. The 113-byte wire does not.

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::{pubkey_eq, Pubkey},
    seeds,
    sysvars::{rent::Rent, Sysvar},
    ProgramResult,
};
use pinocchio_system::instructions::CreateAccount;

use crate::error::KeyShieldError;

pub const REVOCATION_SEED: &[u8] = b"revocation_bitmap";
pub const REVOCATION_DISC: [u8; 8] = *b"ksrevbmp";
pub const BITMAP_BYTES: usize = 16384;
pub const BITMAP_BITS: u32 = (BITMAP_BYTES as u32) * 8;
const OWNER_OFFSET: usize = 8;
const BUMP_OFFSET: usize = 40;
const BITMAP_OFFSET: usize = 48;

pub struct RevocationBitmap;

impl RevocationBitmap {
    pub const SIZE: usize = BITMAP_OFFSET + BITMAP_BYTES;
}

/// `true` when bit `index` is set. Out of range fails closed.
pub fn revocation_bit(bitmap: &[u8], index: u32) -> Result<bool, ProgramError> {
    if bitmap.len() < BITMAP_BYTES || index >= BITMAP_BITS {
        return Err(KeyShieldError::InvalidKeyData.into());
    }
    let idx = index as usize;
    Ok(((bitmap[idx / 8] >> (idx % 8)) & 1) == 1)
}

/// Set or clear bit `index`. Does not allocate.
pub fn set_revocation_bit(bitmap: &mut [u8], index: u32, revoked: bool) -> Result<(), ProgramError> {
    if bitmap.len() < BITMAP_BYTES || index >= BITMAP_BITS {
        return Err(KeyShieldError::InvalidKeyData.into());
    }
    let idx = index as usize;
    let mask = 1u8 << (idx % 8);
    if revoked {
        bitmap[idx / 8] |= mask;
    } else {
        bitmap[idx / 8] &= !mask;
    }
    Ok(())
}

fn assert_revocation_pda(
    program_id: &Pubkey,
    bitmap: &Pubkey,
    owner: &Pubkey,
    bump: u8,
) -> Result<(), ProgramError> {
    let bump_seed = [bump];
    let derived = pinocchio::pubkey::create_program_address(
        &[REVOCATION_SEED, owner.as_ref(), &bump_seed],
        program_id,
    )
    .map_err(|_| KeyShieldError::InvalidPda)?;
    if !pubkey_eq(&derived, bitmap) {
        return Err(KeyShieldError::InvalidPda.into());
    }
    Ok(())
}

/// Process `SetRevocationBit` (ix #29).
///
/// ### Accounts
/// 0. `[signer, writable]` Owner.
/// 1. `[writable]` Revocation bitmap PDA.
/// 2. `[]` System program.
///
/// ### Data
/// `bump` (1), `bit_index` (u32 LE), `revoked` (1). Zero clears the bit.
pub fn process_set_revocation_bit(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 6 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let bump = data[0];
    let index = u32::from_le_bytes(
        data[1..5]
            .try_into()
            .map_err(|_| KeyShieldError::InvalidKeyData)?,
    );
    let revoked = data[5] != 0;
    if index >= BITMAP_BITS {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let mut iter = accounts.iter();
    let owner = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let bitmap = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _system = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !owner.is_signer() {
        return Err(KeyShieldError::NotOwner.into());
    }
    assert_revocation_pda(program_id, bitmap.key(), owner.key(), bump)?;

    if bitmap.is_owned_by(program_id) {
        let mut buf = bitmap.try_borrow_mut_data()?;
        if buf.len() < RevocationBitmap::SIZE || buf[..8] != REVOCATION_DISC {
            return Err(KeyShieldError::InvalidKeyData.into());
        }
        if &buf[OWNER_OFFSET..OWNER_OFFSET + 32] != owner.key().as_ref() {
            return Err(KeyShieldError::NotOwner.into());
        }
        if buf[BUMP_OFFSET] != bump {
            return Err(KeyShieldError::InvalidPda.into());
        }
        set_revocation_bit(&mut buf[BITMAP_OFFSET..], index, revoked)?;
        return Ok(());
    }

    let rent = Rent::get()?;
    let bump_arr = [bump];
    let bitmap_seeds = seeds!(REVOCATION_SEED, owner.key().as_ref(), &bump_arr);
    let signer = Signer::from(&bitmap_seeds);
    CreateAccount {
        from: owner,
        to: bitmap,
        lamports: rent.minimum_balance(RevocationBitmap::SIZE),
        space: RevocationBitmap::SIZE as u64,
        owner: program_id,
    }
    .invoke_signed(&[signer])?;

    let mut buf = bitmap.try_borrow_mut_data()?;
    if buf.len() < RevocationBitmap::SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }
    buf[..8].copy_from_slice(&REVOCATION_DISC);
    buf[OWNER_OFFSET..OWNER_OFFSET + 32].copy_from_slice(owner.key().as_ref());
    buf[BUMP_OFFSET] = bump;
    set_revocation_bit(&mut buf[BITMAP_OFFSET..], index, revoked)?;
    Ok(())
}

/// Settle-time gate. A 112-byte body skips the bitmap.
///
/// `data.len() >= 116` is a `u32` session index. A set bit, a missing
/// bitmap, or a bitmap that is not this owner's PDA is
/// `SessionRevoked` (6116).
pub fn reject_revoked_session(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
    owner: &Pubkey,
) -> ProgramResult {
    if data.len() < 116 {
        return Ok(());
    }
    let index = u32::from_le_bytes(
        data[112..116]
            .try_into()
            .map_err(|_| KeyShieldError::SessionRevoked)?,
    );
    let bitmap = accounts.get(8).ok_or(KeyShieldError::SessionRevoked)?;
    let buf = bitmap
        .try_borrow_data()
        .map_err(|_| KeyShieldError::SessionRevoked)?;
    if buf.len() < RevocationBitmap::SIZE
        || buf[..8] != REVOCATION_DISC
        || &buf[OWNER_OFFSET..OWNER_OFFSET + 32] != owner.as_ref()
    {
        return Err(KeyShieldError::SessionRevoked.into());
    }
    let bump = buf[BUMP_OFFSET];
    let revoked = match revocation_bit(&buf[BITMAP_OFFSET..], index) {
        Ok(flag) => flag,
        Err(_) => return Err(KeyShieldError::SessionRevoked.into()),
    };
    drop(buf);
    assert_revocation_pda(program_id, bitmap.key(), owner, bump)
        .map_err(|_| KeyShieldError::SessionRevoked)?;
    if revoked {
        return Err(KeyShieldError::SessionRevoked.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{revocation_bit, set_revocation_bit, BITMAP_BITS, BITMAP_BYTES};
    use crate::error::KeyShieldError;
    use pinocchio::program_error::ProgramError;

    fn code(err: ProgramError) -> u32 {
        match err {
            ProgramError::Custom(value) => value,
            _ => 0,
        }
    }

    #[test]
    fn bit_set_and_clear_share_one_account() {
        let mut bitmap = [0u8; BITMAP_BYTES];
        assert!(!revocation_bit(&bitmap, 0).unwrap());
        set_revocation_bit(&mut bitmap, 0, true).unwrap();
        set_revocation_bit(&mut bitmap, 1, true).unwrap();
        set_revocation_bit(&mut bitmap, 8, true).unwrap();
        set_revocation_bit(&mut bitmap, BITMAP_BITS - 1, true).unwrap();
        assert_eq!(bitmap[0], 0b0000_0011);
        assert_eq!(bitmap[1], 0b0000_0001);
        assert_eq!(bitmap[BITMAP_BYTES - 1], 0b1000_0000);
        set_revocation_bit(&mut bitmap, 0, false).unwrap();
        assert!(!revocation_bit(&bitmap, 0).unwrap());
        assert!(revocation_bit(&bitmap, 1).unwrap());
        assert!(revocation_bit(&bitmap, BITMAP_BITS - 1).unwrap());
    }

    #[test]
    fn settle_without_a_session_index_skips_the_bitmap() {
        let owner = pinocchio::pubkey::Pubkey::default();
        super::reject_revoked_session(&owner, &[], &[0u8; 112], &owner).unwrap();
        let err = super::reject_revoked_session(&owner, &[], &[0u8; 116], &owner).unwrap_err();
        assert_eq!(code(err), KeyShieldError::SessionRevoked as u32);
    }

    #[test]
    fn out_of_range_index_fails_closed() {
        let mut bitmap = [0u8; BITMAP_BYTES];
        let err = set_revocation_bit(&mut bitmap, BITMAP_BITS, true).unwrap_err();
        assert_eq!(code(err), KeyShieldError::InvalidKeyData as u32);
        assert_eq!(bitmap[0], 0);
    }
}
