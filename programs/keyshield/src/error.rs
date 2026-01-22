use pinocchio::program_error::ProgramError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum KeyShieldError {
    InvalidVaultOwner = 6000,
    VaultNotFound = 6001,
    InvalidEncryptionData = 6002,
    InvalidZKProof = 6003,
    InvalidMPCHash = 6004,
    AccessDenied = 6005,
    InvalidTimeLock = 6006,
    VaultAlreadyExists = 6007,
    InvalidKeyData = 6008,
}

impl From<KeyShieldError> for ProgramError {
    fn from(e: KeyShieldError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
