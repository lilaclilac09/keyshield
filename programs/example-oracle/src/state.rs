//! Oracle result state structure

use pinocchio::pubkey::Pubkey;

/// Oracle result account structure
/// Stores API call results from oracle service
#[repr(C)]
pub struct OracleResult {
    /// Discriminator: "oracler" (8 bytes)
    pub discriminator: [u8; 8],
    /// Oracle authority (who posted the result) (32 bytes)
    pub oracle_authority: Pubkey,
    /// Vault owner (whose API key was used) (32 bytes)
    pub vault_owner: Pubkey,
    /// API endpoint that was called (up to 128 bytes)
    pub api_endpoint: [u8; 128],
    /// HTTP status code (4 bytes)
    pub status_code: u32,
    /// Result data length (4 bytes)
    pub data_length: u32,
    /// Result data (variable, stored in remaining space)
    pub data: [u8; 0], // Variable length
}

impl OracleResult {
    pub const DISCRIMINATOR: [u8; 8] = *b"oracler\0";
    pub const BASE_SIZE: usize = 8 + 32 + 32 + 128 + 4 + 4; // 208 bytes

    /// Calculate total size needed for a result
    pub fn calculate_size(data_len: usize) -> usize {
        Self::BASE_SIZE + data_len
    }
}
