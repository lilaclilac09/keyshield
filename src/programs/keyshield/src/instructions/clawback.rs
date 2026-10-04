//! `force_clawback` (ix #28) — unilateral escrow recovery.
//!
//! After `last_active_slot + dispute_timeout_slots` with no `pay_x402`
//! or `mpp_settle`, the owner takes the SPL token balance back and
//! closes the stream. The provider does not sign.

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::Pubkey,
    seeds,
    sysvars::{clock::Clock, Sysvar},
    ProgramResult,
};
use pinocchio_token::instructions::{CloseAccount, TransferChecked};

use crate::{
    error::KeyShieldError,
    instructions::open_stream::APS_SEED,
    state::{
        aps_offset, AgentPaymentStream, AGENT_PAYMENT_STREAM_DISCRIMINATOR,
        DEFAULT_DISPUTE_TIMEOUT_SLOTS,
    },
};

/// `now > last_active + timeout`. Equal is still inside the window.
///
/// A stored timeout of 0 uses `DEFAULT_DISPUTE_TIMEOUT_SLOTS` (2250).
/// Overflow of the addition is `ArithmeticOverflow` (6113).
pub fn clawback_ready(
    now_slot: u64,
    last_active_slot: u64,
    dispute_timeout_slots: u64,
) -> Result<(), ProgramError> {
    let timeout = if dispute_timeout_slots == 0 {
        DEFAULT_DISPUTE_TIMEOUT_SLOTS
    } else {
        dispute_timeout_slots
    };
    let deadline = last_active_slot
        .checked_add(timeout)
        .ok_or(KeyShieldError::ArithmeticOverflow)?;
    if now_slot > deadline {
        Ok(())
    } else {
        Err(KeyShieldError::DisputeWindowActive.into())
    }
}

/// Process `force_clawback` (ix #28).
///
/// ### Accounts
/// 0. `[signer, writable]` Owner.
/// 1. `[writable]` AgentPaymentStream PDA.
/// 2. `[writable]` Stream USDC ATA.
/// 3. `[writable]` Owner USDC ATA.
/// 4. `[]` USDC mint.
/// 5. `[]` SPL Token program.
///
/// No instruction data past the discriminator. The SPL token amount at
/// offset 64 is transferred, then the ATA and the stream are closed.
/// `remaining_budget` (`cap - spent`) is not the transfer amount: the
/// token account is the escrow.
pub fn process_force_clawback(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    let mut iter = accounts.iter();
    let owner = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let stream_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let owner_ata = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let usdc_mint = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _spl_token = iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    if !owner.is_signer() {
        return Err(KeyShieldError::NotOwner.into());
    }

    let mut sbuf = stream.try_borrow_mut_data()?;
    if sbuf.len() < AgentPaymentStream::SIZE {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }
    let discriminator = &sbuf[aps_offset::DISCRIMINATOR..aps_offset::DISCRIMINATOR + 8];
    if crate::guards::is_closed_account(discriminator) {
        return Err(KeyShieldError::AccountClosed.into());
    }
    if discriminator != AGENT_PAYMENT_STREAM_DISCRIMINATOR.as_ref() {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }

    let stream_owner_bytes: [u8; 32] = sbuf[aps_offset::OWNER..aps_offset::OWNER + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_owner = Pubkey::try_from(&stream_owner_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if &stream_owner != owner.key() {
        return Err(KeyShieldError::NotOwner.into());
    }

    let last_active = u64::from_le_bytes(
        sbuf[aps_offset::LAST_ACTIVE_SLOT..aps_offset::LAST_ACTIVE_SLOT + 8]
            .try_into()
            .map_err(|_| KeyShieldError::ArithmeticOverflow)?,
    );
    let timeout = u64::from_le_bytes(
        sbuf[aps_offset::DISPUTE_TIMEOUT_SLOTS..aps_offset::DISPUTE_TIMEOUT_SLOTS + 8]
            .try_into()
            .map_err(|_| KeyShieldError::ArithmeticOverflow)?,
    );
    // Owner is already checked. The window returns before the mint
    // checks so a too-early clawback is DisputeWindowActive (6115).
    let now_slot = Clock::get()?.slot;
    clawback_ready(now_slot, last_active, timeout)?;

    let stream_agent_bytes: [u8; 32] = sbuf
        [aps_offset::AGENT_PUBKEY..aps_offset::AGENT_PUBKEY + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_agent = Pubkey::try_from(&stream_agent_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_mint_bytes: [u8; 32] = sbuf[aps_offset::USDC_MINT..aps_offset::USDC_MINT + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_mint = Pubkey::try_from(&stream_mint_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if &stream_mint != usdc_mint.key() {
        return Err(KeyShieldError::InvalidEnvelope.into());
    }
    let stream_ata_bytes: [u8; 32] = sbuf[aps_offset::USDC_ATA..aps_offset::USDC_ATA + 32]
        .try_into()
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    let stream_ata_pk = Pubkey::try_from(&stream_ata_bytes[..])
        .map_err(|_| KeyShieldError::PaymentStreamNotFound)?;
    if &stream_ata_pk != stream_ata.key() {
        return Err(KeyShieldError::PaymentStreamNotFound.into());
    }

    let bump = sbuf[aps_offset::BUMP];
    crate::guards::seal_closed_account(&mut sbuf)?;
    drop(sbuf);

    {
        let mint_data = usdc_mint.try_borrow_data()?;
        crate::guards::assert_canonical_usdc_mint(usdc_mint.key(), usdc_mint.owner(), &mint_data)?;
    }
    let amount = {
        let ata_data = stream_ata.try_borrow_data()?;
        crate::guards::assert_escrow_token_account(
            &ata_data,
            stream_ata.owner(),
            usdc_mint.key(),
            stream.key(),
        )?;
        u64::from_le_bytes(
            ata_data[crate::guards::TOKEN_ACCOUNT_AMOUNT_OFFSET
                ..crate::guards::TOKEN_ACCOUNT_AMOUNT_OFFSET + 8]
                .try_into()
                .map_err(|_| KeyShieldError::ArithmeticOverflow)?,
        )
    };
    {
        let dest_data = owner_ata.try_borrow_data()?;
        crate::guards::assert_destination_mint(&dest_data, owner_ata.owner(), usdc_mint.key())?;
    }
    crate::guards::assert_stream_pda(
        program_id,
        stream.key(),
        &stream_agent,
        &stream_owner,
        bump,
    )?;

    let bump_arr = [bump];
    let stream_seeds = seeds!(
        APS_SEED,
        stream_agent.as_ref(),
        stream_owner.as_ref(),
        &bump_arr
    );
    let pda_signer = Signer::from(&stream_seeds);

    if amount > 0 {
        TransferChecked {
            from: stream_ata,
            mint: usdc_mint,
            to: owner_ata,
            authority: stream,
            amount,
            decimals: AgentPaymentStream::USDC_DECIMALS,
        }
        .invoke_signed(&[pda_signer.clone()])?;
    }

    CloseAccount {
        account: stream_ata,
        destination: owner,
        authority: stream,
    }
    .invoke_signed(&[pda_signer])?;

    {
        let mut owner_lamports = owner.try_borrow_mut_lamports()?;
        let mut stream_lamports = stream.try_borrow_mut_lamports()?;
        *owner_lamports = owner_lamports
            .checked_add(*stream_lamports)
            .ok_or(KeyShieldError::ArithmeticOverflow)?;
        *stream_lamports = 0;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::clawback_ready;
    use crate::error::KeyShieldError;
    use crate::state::DEFAULT_DISPUTE_TIMEOUT_SLOTS;
    use pinocchio::program_error::ProgramError;

    fn code(err: ProgramError) -> u32 {
        match err {
            ProgramError::Custom(code) => code,
            _ => 0,
        }
    }

    #[test]
    fn equal_deadline_stays_inside_the_window() {
        let err = clawback_ready(1000 + 2250, 1000, 2250).unwrap_err();
        assert_eq!(code(err), KeyShieldError::DisputeWindowActive as u32);
    }

    #[test]
    fn one_slot_past_the_window_is_ready() {
        clawback_ready(1000 + 2251, 1000, 2250).unwrap();
    }

    #[test]
    fn zero_timeout_uses_the_default() {
        let err = clawback_ready(DEFAULT_DISPUTE_TIMEOUT_SLOTS, 0, 0).unwrap_err();
        assert_eq!(code(err), KeyShieldError::DisputeWindowActive as u32);
        clawback_ready(DEFAULT_DISPUTE_TIMEOUT_SLOTS + 1, 0, 0).unwrap();
    }

    #[test]
    fn deadline_overflow_fails_closed() {
        let err = clawback_ready(1, u64::MAX - 10, 100).unwrap_err();
        assert_eq!(code(err), KeyShieldError::ArithmeticOverflow as u32);
    }
}
