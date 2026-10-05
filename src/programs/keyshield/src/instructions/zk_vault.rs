//! Passkey-commitment escrow — ix #40–#43.
//!
//! Seeds: `[b"keyshield", owner]` and `[b"nullifier", nullifier]`.
//! Proof bytes are a **scaffold assertion** (`proof` non-empty). This is
//! not alt_bn128 / Groth16 pairing. Do not advertise it as on-chain
//! Passkey verification.

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::{create_program_address, pubkey_eq, Pubkey},
    seeds,
    sysvars::{clock::Clock, rent::Rent, Sysvar},
    ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};
use pinocchio_token::instructions::TransferChecked;

use crate::error::KeyShieldError;
use crate::guards;

pub const ZK_VAULT_SEED: &[u8] = b"keyshield";
pub const ZK_NULLIFIER_SEED: &[u8] = b"nullifier";
pub const ZK_VAULT_DISCRIMINATOR: [u8; 8] = *b"zkvault\0";
pub const ZK_NULLIFIER_DISCRIMINATOR: [u8; 8] = *b"zknull\0\0";

pub const ZK_VAULT_SIZE: usize = 8 + 32 + 8 + 32 + 8 + 1 + 1;
pub const ZK_NULLIFIER_SIZE: usize = 8 + 1;

mod off {
    pub const DISC: usize = 0;
    pub const OWNER: usize = 8;
    pub const SPEND_CAP: usize = 40;
    pub const ROOT: usize = 48;
    pub const NONCE: usize = 80;
    pub const BUMP: usize = 88;
    pub const REVOKED: usize = 89;
}

/// Host-oracle + on-chain execute gates. Groth16 pairing is not here.
pub fn assert_zk_execute(
    amount: u64,
    spend_cap: u64,
    revoked: bool,
    now_slot: u64,
    valid_until_slot: u64,
    proof: &[u8],
    nullifier_used: bool,
) -> Result<(), ProgramError> {
    if revoked {
        return Err(KeyShieldError::ZkVaultRevoked.into());
    }
    if nullifier_used {
        return Err(KeyShieldError::NullifierUsed.into());
    }
    if proof.is_empty() {
        return Err(KeyShieldError::InvalidZKProof.into());
    }
    if now_slot > valid_until_slot {
        return Err(KeyShieldError::ProofExpired.into());
    }
    if amount > spend_cap {
        return Err(KeyShieldError::CapExceeded.into());
    }
    Ok(())
}

pub fn assert_zk_owner(signer_is_owner: bool) -> Result<(), ProgramError> {
    if signer_is_owner {
        Ok(())
    } else {
        Err(KeyShieldError::NotOwner.into())
    }
}

pub fn assert_zk_init_fresh(already_exists: bool) -> Result<(), ProgramError> {
    if already_exists {
        Err(KeyShieldError::ZkVaultAlreadyExists.into())
    } else {
        Ok(())
    }
}

fn read_u64(buf: &[u8], off: usize) -> Result<u64, ProgramError> {
    let slice = buf
        .get(off..off + 8)
        .ok_or(KeyShieldError::ZkVaultNotFound)?;
    let arr: [u8; 8] = slice
        .try_into()
        .map_err(|_| KeyShieldError::ZkVaultNotFound)?;
    Ok(u64::from_le_bytes(arr))
}

fn write_u64(buf: &mut [u8], off: usize, v: u64) -> Result<(), ProgramError> {
    let dest = buf
        .get_mut(off..off + 8)
        .ok_or(KeyShieldError::ZkVaultNotFound)?;
    dest.copy_from_slice(&v.to_le_bytes());
    Ok(())
}

fn assert_zk_pda(
    program_id: &Pubkey,
    account: &Pubkey,
    seeds_list: &[&[u8]],
) -> Result<(), ProgramError> {
    let derived =
        create_program_address(seeds_list, program_id).map_err(|_| KeyShieldError::InvalidPda)?;
    if !pubkey_eq(&derived, account) {
        return Err(KeyShieldError::InvalidPda.into());
    }
    Ok(())
}

/// Remaining lamports above rent-exempt. Used by the SOL payout path
/// and the host-oracle matrix — does not touch USDC ATAs.
pub fn assert_zk_sol_available(
    amount: u64,
    vault_lamports: u64,
    rent_exempt: u64,
) -> Result<(), ProgramError> {
    let available = vault_lamports.saturating_sub(rent_exempt);
    if amount > available {
        return Err(KeyShieldError::InsufficientBalance.into());
    }
    Ok(())
}

/// `initialize_vault` — disc 40.
///
/// Data: spend_cap u64 | merkle_root [32] | bump u8 | [deposit_lamports u64]
/// Accounts: owner signer, vault writable, system
/// Optional trailing `deposit_lamports` locks SOL in the vault PDA (plus rent).
pub fn process_init_zk_vault(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 8 + 32 + 1 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }
    let mut iter = accounts.iter();
    let owner = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _system = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    if !owner.is_signer() {
        return Err(KeyShieldError::NotOwner.into());
    }

    let spend_cap = u64::from_le_bytes(
        data[0..8]
            .try_into()
            .map_err(|_| KeyShieldError::InvalidKeyData)?,
    );
    let mut root = [0u8; 32];
    root.copy_from_slice(&data[8..40]);
    let bump = data[40];
    let deposit_lamports = if data.len() >= 49 {
        u64::from_le_bytes(
            data[41..49]
                .try_into()
                .map_err(|_| KeyShieldError::InvalidKeyData)?,
        )
    } else {
        0
    };

    let exists = vault.is_owned_by(program_id) && vault.data_len() >= ZK_VAULT_SIZE;
    if exists {
        let buf = vault.try_borrow_data()?;
        if buf.len() >= 8 && &buf[0..8] == ZK_VAULT_DISCRIMINATOR.as_ref() {
            return Err(KeyShieldError::ZkVaultAlreadyExists.into());
        }
    }

    let bump_ref = &[bump];
    let vault_seeds = seeds!(ZK_VAULT_SEED, owner.key().as_ref(), bump_ref);
    let vault_signer = Signer::from(&vault_seeds);

    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(ZK_VAULT_SIZE);

    if vault.lamports() == 0 && vault.data_is_empty() {
        CreateAccount {
            from: owner,
            to: vault,
            lamports: min_balance,
            space: ZK_VAULT_SIZE as u64,
            owner: program_id,
        }
        .invoke_signed(&[vault_signer.clone()])?;
    } else if !vault.is_owned_by(program_id) {
        if vault.data_len() < ZK_VAULT_SIZE {
            Allocate {
                account: vault,
                space: ZK_VAULT_SIZE as u64,
            }
            .invoke_signed(&[vault_signer.clone()])?;
        }
        Assign {
            account: vault,
            owner: program_id,
        }
        .invoke_signed(&[vault_signer.clone()])?;
    }

    if deposit_lamports > 0 {
        Transfer {
            from: owner,
            to: vault,
            lamports: deposit_lamports,
        }
        .invoke()?;
    }

    let mut buf = vault.try_borrow_mut_data()?;
    if buf.len() < ZK_VAULT_SIZE {
        return Err(KeyShieldError::ZkVaultNotFound.into());
    }
    buf[off::DISC..off::DISC + 8].copy_from_slice(&ZK_VAULT_DISCRIMINATOR);
    buf[off::OWNER..off::OWNER + 32].copy_from_slice(owner.key());
    write_u64(&mut buf, off::SPEND_CAP, spend_cap)?;
    buf[off::ROOT..off::ROOT + 32].copy_from_slice(&root);
    write_u64(&mut buf, off::NONCE, 0)?;
    buf[off::BUMP] = bump;
    buf[off::REVOKED] = 0;
    Ok(())
}

/// `register_root` / `update_policy` — disc 41. Owner only.
/// Data: merkle_root [32]  OR  spend_cap u64 | merkle_root [32]
pub fn process_update_zk_policy(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() != 32 && data.len() < 8 + 32 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }
    let mut iter = accounts.iter();
    let owner = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !owner.is_signer() {
        return Err(KeyShieldError::NotOwner.into());
    }
    let mut buf = vault.try_borrow_mut_data()?;
    if buf.len() < ZK_VAULT_SIZE
        || &buf[off::DISC..off::DISC + 8] != ZK_VAULT_DISCRIMINATOR.as_ref()
    {
        return Err(KeyShieldError::ZkVaultNotFound.into());
    }
    if &buf[off::OWNER..off::OWNER + 32] != owner.key() {
        return Err(KeyShieldError::NotOwner.into());
    }
    if buf[off::REVOKED] != 0 {
        return Err(KeyShieldError::ZkVaultRevoked.into());
    }
    if data.len() == 32 {
        buf[off::ROOT..off::ROOT + 32].copy_from_slice(&data[0..32]);
    } else {
        let spend_cap = u64::from_le_bytes(
            data[0..8]
                .try_into()
                .map_err(|_| KeyShieldError::InvalidKeyData)?,
        );
        write_u64(&mut buf, off::SPEND_CAP, spend_cap)?;
        buf[off::ROOT..off::ROOT + 32].copy_from_slice(&data[8..40]);
    }
    Ok(())
}

/// `verify_and_execute` — disc 42.
///
/// Data: nullifier[32] | action_hash[32] | amount u64 | valid_until_slot u64
///       | nullifier_bump u8 | proof…
///
/// Accounts — SOL path (5, fastest landable):
///   payer signer, vault, nullifier, destination, system
/// Accounts — USDC path (7):
///   payer signer, vault, nullifier, vault_ata, dest_ata, mint, token
///
/// Proof check is a non-empty-bytes scaffold. Not alt_bn128 / Groth16.
pub fn process_execute_zk_action(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 32 + 32 + 8 + 8 + 1 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }
    let usdc_path = accounts.len() >= 7;
    if !usdc_path && accounts.len() < 5 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }

    let mut iter = accounts.iter();
    let payer = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let nullifier_acc = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let dest_or_vault_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let system_or_dest_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let mint = if usdc_path {
        Some(iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?)
    } else {
        None
    };
    let _token = if usdc_path {
        Some(iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?)
    } else {
        None
    };

    if !payer.is_signer() {
        return Err(KeyShieldError::NotOwner.into());
    }

    let mut nullifier = [0u8; 32];
    nullifier.copy_from_slice(&data[0..32]);
    let amount = u64::from_le_bytes(
        data[64..72]
            .try_into()
            .map_err(|_| KeyShieldError::InvalidKeyData)?,
    );
    let valid_until = u64::from_le_bytes(
        data[72..80]
            .try_into()
            .map_err(|_| KeyShieldError::InvalidKeyData)?,
    );
    let n_bump = data[80];
    let proof = &data[81..];

    let now_slot = Clock::get()?.slot;

    let (spend_cap, bump, owner_bytes, revoked) = {
        let buf = vault.try_borrow_data()?;
        if buf.len() < ZK_VAULT_SIZE
            || &buf[off::DISC..off::DISC + 8] != ZK_VAULT_DISCRIMINATOR.as_ref()
        {
            return Err(KeyShieldError::ZkVaultNotFound.into());
        }
        let cap = read_u64(&buf, off::SPEND_CAP)?;
        let bump = buf[off::BUMP];
        let mut owner = [0u8; 32];
        owner.copy_from_slice(&buf[off::OWNER..off::OWNER + 32]);
        (cap, bump, owner, buf[off::REVOKED] != 0)
    };

    let vault_bump_seed = [bump];
    assert_zk_pda(
        program_id,
        vault.key(),
        &[ZK_VAULT_SEED, &owner_bytes, &vault_bump_seed],
    )?;
    let n_bump_seed = [n_bump];
    assert_zk_pda(
        program_id,
        nullifier_acc.key(),
        &[ZK_NULLIFIER_SEED, &nullifier, &n_bump_seed],
    )?;

    let nullifier_used =
        nullifier_acc.is_owned_by(program_id) && nullifier_acc.data_len() >= ZK_NULLIFIER_SIZE && {
            let nbuf = nullifier_acc.try_borrow_data()?;
            nbuf.len() >= 9 && &nbuf[0..8] == ZK_NULLIFIER_DISCRIMINATOR.as_ref() && nbuf[8] != 0
        };

    assert_zk_execute(
        amount,
        spend_cap,
        revoked,
        now_slot,
        valid_until,
        proof,
        nullifier_used,
    )?;

    if usdc_path {
        let vault_ata = dest_or_vault_ata;
        let dest_ata = system_or_dest_ata;
        let mint = mint.ok_or(ProgramError::NotEnoughAccountKeys)?;
        {
            let mint_data = mint.try_borrow_data()?;
            guards::assert_canonical_usdc_mint(mint.key(), mint.owner(), &mint_data)?;
        }
        {
            let ata = vault_ata.try_borrow_data()?;
            guards::assert_escrow_token_account(&ata, vault_ata.owner(), mint.key(), vault.key())?;
        }
        {
            let dest = dest_ata.try_borrow_data()?;
            guards::assert_destination_mint(&dest, dest_ata.owner(), mint.key())?;
        }
    } else {
        let destination = dest_or_vault_ata;
        if pubkey_eq(destination.key(), vault.key()) {
            return Err(KeyShieldError::InvalidPaymentAmount.into());
        }
        let rent = Rent::get()?;
        assert_zk_sol_available(
            amount,
            vault.lamports(),
            rent.minimum_balance(ZK_VAULT_SIZE),
        )?;
    }

    if !nullifier_acc.is_owned_by(program_id) || nullifier_acc.data_len() < ZK_NULLIFIER_SIZE {
        let n_bump_ref = &[n_bump];
        let n_seeds = seeds!(ZK_NULLIFIER_SEED, &nullifier, n_bump_ref);
        let n_signer = Signer::from(&n_seeds);
        let rent = Rent::get()?;
        let min = rent.minimum_balance(ZK_NULLIFIER_SIZE);
        if nullifier_acc.lamports() == 0 && nullifier_acc.data_is_empty() {
            CreateAccount {
                from: payer,
                to: nullifier_acc,
                lamports: min,
                space: ZK_NULLIFIER_SIZE as u64,
                owner: program_id,
            }
            .invoke_signed(&[n_signer])?;
        } else if !nullifier_acc.is_owned_by(program_id) {
            if nullifier_acc.lamports() < min {
                Transfer {
                    from: payer,
                    to: nullifier_acc,
                    lamports: min.saturating_sub(nullifier_acc.lamports()),
                }
                .invoke()?;
            }
            if nullifier_acc.data_len() < ZK_NULLIFIER_SIZE {
                Allocate {
                    account: nullifier_acc,
                    space: ZK_NULLIFIER_SIZE as u64,
                }
                .invoke_signed(&[n_signer.clone()])?;
            }
            Assign {
                account: nullifier_acc,
                owner: program_id,
            }
            .invoke_signed(&[n_signer])?;
        }
    }
    {
        let mut nbuf = nullifier_acc.try_borrow_mut_data()?;
        if nbuf.len() < ZK_NULLIFIER_SIZE {
            return Err(KeyShieldError::NullifierUsed.into());
        }
        nbuf[0..8].copy_from_slice(&ZK_NULLIFIER_DISCRIMINATOR);
        nbuf[8] = 1;
    }

    let new_cap = spend_cap
        .checked_sub(amount)
        .ok_or(KeyShieldError::ArithmeticOverflow)?;
    {
        let mut buf = vault.try_borrow_mut_data()?;
        write_u64(&mut buf, off::SPEND_CAP, new_cap)?;
        let nonce = read_u64(&buf, off::NONCE)?;
        write_u64(
            &mut buf,
            off::NONCE,
            nonce
                .checked_add(1)
                .ok_or(KeyShieldError::ArithmeticOverflow)?,
        )?;
    }

    if amount > 0 {
        if usdc_path {
            let vault_ata = dest_or_vault_ata;
            let dest_ata = system_or_dest_ata;
            let mint = mint.ok_or(ProgramError::NotEnoughAccountKeys)?;
            let bump_arr = [bump];
            let vault_seeds = seeds!(ZK_VAULT_SEED, &owner_bytes, &bump_arr);
            let pda_signer = Signer::from(&vault_seeds);
            TransferChecked {
                from: vault_ata,
                mint,
                to: dest_ata,
                authority: vault,
                amount,
                decimals: 6,
            }
            .invoke_signed(&[pda_signer])?;
        } else {
            let destination = dest_or_vault_ata;
            let mut from_l = vault.try_borrow_mut_lamports()?;
            let mut to_l = destination.try_borrow_mut_lamports()?;
            *from_l = from_l
                .checked_sub(amount)
                .ok_or(KeyShieldError::ArithmeticOverflow)?;
            *to_l = to_l
                .checked_add(amount)
                .ok_or(KeyShieldError::ArithmeticOverflow)?;
        }
    }

    Ok(())
}

/// `revoke_grant` — disc 43. Owner only.
pub fn process_revoke_zk_grant(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    let mut iter = accounts.iter();
    let owner = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !owner.is_signer() {
        return Err(KeyShieldError::NotOwner.into());
    }
    let mut buf = vault.try_borrow_mut_data()?;
    if buf.len() < ZK_VAULT_SIZE
        || &buf[off::DISC..off::DISC + 8] != ZK_VAULT_DISCRIMINATOR.as_ref()
    {
        return Err(KeyShieldError::ZkVaultNotFound.into());
    }
    if &buf[off::OWNER..off::OWNER + 32] != owner.key() {
        return Err(KeyShieldError::NotOwner.into());
    }
    buf[off::REVOKED] = 1;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        assert_zk_execute, assert_zk_init_fresh, assert_zk_owner, assert_zk_sol_available,
    };
    use crate::error::KeyShieldError;
    use pinocchio::program_error::ProgramError;

    fn code(err: ProgramError) -> u32 {
        match err {
            ProgramError::Custom(c) => c,
            _ => 0,
        }
    }

    #[test]
    fn init_twice_is_rejected() {
        assert_zk_init_fresh(false).unwrap();
        let err = assert_zk_init_fresh(true).unwrap_err();
        assert_eq!(code(err), KeyShieldError::ZkVaultAlreadyExists as u32);
    }

    #[test]
    fn non_owner_is_rejected() {
        let err = assert_zk_owner(false).unwrap_err();
        assert_eq!(code(err), KeyShieldError::NotOwner as u32);
    }

    #[test]
    fn replay_nullifier_is_rejected() {
        let err = assert_zk_execute(1, 10, false, 1, 10, &[1], true).unwrap_err();
        assert_eq!(code(err), KeyShieldError::NullifierUsed as u32);
    }

    #[test]
    fn cap_exceeded_does_not_debit() {
        let err = assert_zk_execute(11, 10, false, 1, 10, &[1], false).unwrap_err();
        assert_eq!(code(err), KeyShieldError::CapExceeded as u32);
    }

    #[test]
    fn empty_proof_is_invalid() {
        let err = assert_zk_execute(1, 10, false, 1, 10, &[], false).unwrap_err();
        assert_eq!(code(err), KeyShieldError::InvalidZKProof as u32);
    }

    #[test]
    fn expired_slot_is_rejected() {
        let err = assert_zk_execute(1, 10, false, 11, 10, &[1], false).unwrap_err();
        assert_eq!(code(err), KeyShieldError::ProofExpired as u32);
    }

    #[test]
    fn happy_path_passes() {
        assert_zk_execute(5, 10, false, 5, 10, &[1, 2, 3], false).unwrap();
    }

    #[test]
    fn sol_payout_keeps_rent() {
        assert_zk_sol_available(5, 20, 10).unwrap();
        let err = assert_zk_sol_available(11, 20, 10).unwrap_err();
        assert_eq!(code(err), KeyShieldError::InsufficientBalance as u32);
    }
}
