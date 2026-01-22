//! Instruction handlers

pub mod store_key;
pub mod access_key;
pub mod share_key;

use pinocchio::program_error::ProgramError;

/// Instruction discriminator enum
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Instruction {
    StoreKey = 0,
    AccessKey = 1,
    ShareKey = 2,
}

impl Instruction {
    pub fn try_from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Instruction::StoreKey),
            1 => Some(Instruction::AccessKey),
            2 => Some(Instruction::ShareKey),
            _ => None,
        }
    }
}
