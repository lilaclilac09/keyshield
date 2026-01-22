//! Store oracle result instruction handler

use pinocchio::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};

use crate::{
    error::OracleError,
    state::OracleResult,
};

/// Process store result instruction
/// 
/// Accounts:
/// 0. [signer] Oracle Authority - The wallet posting the result
/// 1. [writable] Result Account - Account to store the result
/// 2. [] Vault Owner - Owner of the vault whose API key was used
/// 3. [] System Program
pub fn process_store_result(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Expected data: api_endpoint (up to 128) + status_code (4) + data_length (4) + data (variable)
    if data.len() < 8 {
        return Err(OracleError::InvalidResultData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let oracle_authority = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let result_account = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _vault_owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify oracle authority is signer
    if !oracle_authority.is_signer() {
        return Err(OracleError::InvalidOracleAuthority.into());
    }

    // Verify result account owner is this program
    unsafe {
        if result_account.owner() != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
    }

    // Parse instruction data
    // api_endpoint: first 128 bytes (or less)
    let mut api_endpoint = [0u8; 128];
    let endpoint_len = data.len().min(128);
    api_endpoint[..endpoint_len].copy_from_slice(&data[..endpoint_len]);
    
    // status_code: next 4 bytes
    if data.len() < endpoint_len + 4 {
        return Err(OracleError::InvalidResultData.into());
    }
    let status_code = u32::from_le_bytes(
        data[endpoint_len..endpoint_len + 4].try_into().map_err(|_| OracleError::InvalidResultData)?
    );
    
    // data_length: next 4 bytes
    if data.len() < endpoint_len + 8 {
        return Err(OracleError::InvalidResultData.into());
    }
    let data_length = u32::from_le_bytes(
        data[endpoint_len + 4..endpoint_len + 8].try_into().map_err(|_| OracleError::InvalidResultData)?
    ) as usize;
    
    // Verify data length is reasonable (max 10KB)
    if data_length > 10_000 {
        return Err(OracleError::ResultTooLarge.into());
    }
    
    // data: remaining bytes
    if data.len() < endpoint_len + 8 + data_length {
        return Err(OracleError::InvalidResultData.into());
    }
    let result_data = &data[endpoint_len + 8..endpoint_len + 8 + data_length];

    // Write to result account
    let mut account_data = result_account.try_borrow_mut_data()?;
    let required_size = OracleResult::BASE_SIZE + data_length;
    
    if account_data.len() < required_size {
        return Err(OracleError::AccountDataTooSmall.into());
    }

    // Write discriminator
    account_data[0..8].copy_from_slice(&OracleResult::DISCRIMINATOR);
    // Write oracle_authority
    account_data[8..40].copy_from_slice(oracle_authority.key().as_ref());
    // Write vault_owner (from account, not data)
    // Note: In a real implementation, you'd verify the vault owner account
    // Write api_endpoint
    account_data[40..168].copy_from_slice(&api_endpoint);
    // Write status_code
    account_data[168..172].copy_from_slice(&status_code.to_le_bytes());
    // Write data_length
    account_data[172..176].copy_from_slice(&(data_length as u32).to_le_bytes());
    // Write result data
    account_data[176..176 + data_length].copy_from_slice(result_data);
    // Remaining bytes remain zero

    Ok(())
}
