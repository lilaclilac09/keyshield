//! Error types for example oracle program

use pinocchio::program_error::ProgramError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum OracleError {
    InvalidOracleAuthority = 0,
    InvalidResultData = 1,
    ResultTooLarge = 2,
    AccountDataTooSmall = 3,
}

impl From<OracleError> for ProgramError {
    fn from(e: OracleError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
