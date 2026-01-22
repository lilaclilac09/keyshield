//! Instruction handlers

pub mod store_result;

use pinocchio::program_error::ProgramError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Instruction {
    StoreResult = 0,
}

impl Instruction {
    pub fn try_from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Instruction::StoreResult),
            _ => None,
        }
    }
}
