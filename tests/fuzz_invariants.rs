//! Stage 2 — property-based invariant fuzzing for KeyShield streams.
//!
//! Trident expects an Anchor IDL and a compiled SBF. This program is
//! pinocchio, so the harness is proptest against the published guards
//! and a stream state machine. Arbitrary instruction sequences must
//! either apply cleanly or return a custom error without corrupting
//! escrow, `spent_total`, or `last_settled_seq`.
//!
//!   cargo test -p keyshield --test fuzz_invariants
//!
//! Host tests here do not call `create_program_address`.

use keyshield::error::KeyShieldError;
use keyshield::guards::{
    accept_settlement, debit_within_budget, remaining_budget, replayed_sequence,
    seal_closed_account, CLOSED_ACCOUNT_DISCRIMINATOR, RESERVED_LEN,
};
use keyshield::instructions::clawback::clawback_ready;
use keyshield::state::AGENT_PAYMENT_STREAM_DISCRIMINATOR;
use pinocchio::program_error::ProgramError;
use proptest::prelude::*;

const CAP: u64 = 10_000;

fn code(err: &ProgramError) -> u32 {
    match err {
        ProgramError::Custom(c) => *c,
        _ => 0,
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct StreamModel {
    escrow: u64,
    initial_deposit: u64,
    spent: u64,
    cap: u64,
    reserved: [u8; RESERVED_LEN],
    closed: bool,
    revoked: bool,
    last_active_slot: u64,
    timeout: u64,
    disc: [u8; 8],
}

impl StreamModel {
    fn open(deposit: u64, cap: u64) -> Self {
        Self {
            escrow: deposit,
            initial_deposit: deposit,
            spent: 0,
            cap,
            reserved: [0u8; RESERVED_LEN],
            closed: false,
            revoked: false,
            last_active_slot: 1,
            timeout: 2250,
            disc: AGENT_PAYMENT_STREAM_DISCRIMINATOR,
        }
    }

    fn assert_invariants(&self) {
        assert!(self.spent <= self.cap, "invariant B: spent exceeds cap");
        assert_eq!(
            self.escrow,
            self.initial_deposit.saturating_sub(self.spent),
            "invariant A: escrow != deposit - settled"
        );
        let remaining = remaining_budget(self.cap, self.spent).expect("invariant C: remaining");
        assert!(remaining == self.cap - self.spent);
    }
}

#[derive(Clone, Debug)]
enum Op {
    Create { deposit: u64, cap: u64 },
    Settle { amount: u64, seq: u64, hash_byte: u8, verified: bool },
    Revoke,
    Close,
    Clawback { now_slot: u64 },
}

fn apply(model: &mut Option<StreamModel>, op: &Op) -> Result<(), ProgramError> {
    match op {
        Op::Create { deposit, cap } => {
            if *deposit == 0 || *cap == 0 || *deposit > *cap {
                return Err(KeyShieldError::InvalidPaymentAmount.into());
            }
            if model.is_some() {
                return Err(KeyShieldError::PaymentStreamActive.into());
            }
            *model = Some(StreamModel::open(*deposit, *cap));
            Ok(())
        }
        Op::Settle {
            amount,
            seq,
            hash_byte,
            verified,
        } => {
            let stream = model.as_mut().ok_or(KeyShieldError::PaymentStreamNotFound)?;
            if stream.closed {
                return Err(KeyShieldError::AccountClosed.into());
            }
            if stream.revoked {
                return Err(KeyShieldError::AgentRevoked.into());
            }
            if !*verified || *hash_byte == 0 {
                return Err(KeyShieldError::UnverifiedFulfillment.into());
            }
            replayed_sequence(&stream.reserved, *seq)?;
            let new_spent = debit_within_budget(stream.spent, *amount, stream.cap)?;
            if *amount > stream.escrow {
                return Err(KeyShieldError::InsufficientStreamBalance.into());
            }
            let mut hash = [0u8; 32];
            hash[0] = *hash_byte;
            hash[31] = *hash_byte;
            accept_settlement(&mut stream.reserved, &hash, *seq)?;
            stream.escrow = stream
                .escrow
                .checked_sub(*amount)
                .ok_or(KeyShieldError::ArithmeticOverflow)?;
            stream.spent = new_spent;
            stream.last_active_slot = stream.last_active_slot.saturating_add(1);
            Ok(())
        }
        Op::Revoke => {
            let stream = model.as_mut().ok_or(KeyShieldError::PaymentStreamNotFound)?;
            if stream.closed {
                return Err(KeyShieldError::AccountClosed.into());
            }
            stream.revoked = true;
            Ok(())
        }
        Op::Close => {
            let stream = model.as_mut().ok_or(KeyShieldError::PaymentStreamNotFound)?;
            if stream.closed {
                return Err(KeyShieldError::AccountClosed.into());
            }
            let mut buf = [1u8; 16];
            buf[..8].copy_from_slice(&stream.disc);
            seal_closed_account(&mut buf)?;
            stream.disc = CLOSED_ACCOUNT_DISCRIMINATOR;
            stream.closed = true;
            stream.escrow = 0;
            stream.initial_deposit = stream.spent;
            Ok(())
        }
        Op::Clawback { now_slot } => {
            let stream = model.as_mut().ok_or(KeyShieldError::PaymentStreamNotFound)?;
            if stream.closed {
                return Err(KeyShieldError::AccountClosed.into());
            }
            clawback_ready(*now_slot, stream.last_active_slot, stream.timeout)?;
            let mut buf = [1u8; 16];
            buf[..8].copy_from_slice(&stream.disc);
            seal_closed_account(&mut buf)?;
            stream.disc = CLOSED_ACCOUNT_DISCRIMINATOR;
            stream.closed = true;
            stream.escrow = 0;
            stream.initial_deposit = stream.spent;
            Ok(())
        }
    }
}

fn amount_strategy() -> impl Strategy<Value = u64> {
    prop_oneof![
        Just(0u64),
        Just(1u64),
        2u64..CAP,
        Just(CAP),
        Just(CAP + 1),
        Just(u64::MAX - 1),
        Just(u64::MAX),
    ]
}

fn seq_strategy() -> impl Strategy<Value = u64> {
    prop_oneof![
        Just(0u64),
        Just(1u64),
        2u64..32u64,
        Just(u64::MAX - 1),
        Just(u64::MAX),
    ]
}

fn op_strategy() -> impl Strategy<Value = Op> {
    prop_oneof![
        (1u64..=CAP, 1u64..=CAP).prop_map(|(deposit, cap)| Op::Create { deposit, cap }),
        (
            amount_strategy(),
            seq_strategy(),
            any::<u8>(),
            any::<bool>(),
        )
            .prop_map(|(amount, seq, hash_byte, verified)| Op::Settle {
                amount,
                seq,
                hash_byte,
                verified,
            }),
        Just(Op::Revoke),
        Just(Op::Close),
        any::<u64>().prop_map(|now_slot| Op::Clawback { now_slot }),
    ]
}

fn apply_sequence(ops: &[Op]) {
    let mut model: Option<StreamModel> = None;
    for op in ops {
        let before = model.clone();
        match apply(&mut model, op) {
            Ok(()) => {
                if let Some(stream) = &model {
                    stream.assert_invariants();
                }
            }
            Err(err) => {
                assert_ne!(code(&err), 0, "invalid op must be a custom error");
                assert_eq!(model, before, "error must not corrupt account state");
            }
        }
    }
    if let Some(stream) = &model {
        stream.assert_invariants();
    }
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 64,
        ..ProptestConfig::default()
    })]

    #[test]
    fn arbitrary_instruction_sequences_preserve_invariants(
        ops in prop::collection::vec(op_strategy(), 1..24)
    ) {
        apply_sequence(&ops);
    }
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 96,
        ..ProptestConfig::default()
    })]

    #[test]
    fn debit_never_wraps_or_goes_negative(
        spent in any::<u64>(),
        amount in any::<u64>(),
        max in any::<u64>(),
    ) {
        match debit_within_budget(spent, amount, max) {
            Ok(new_spent) => {
                assert!(amount > 0);
                assert!(new_spent >= spent);
                assert!(new_spent <= max);
                let remaining = remaining_budget(max, new_spent).unwrap();
                assert_eq!(remaining, max - new_spent);
            }
            Err(err) => {
                let c = code(&err);
                assert!(
                    c == KeyShieldError::InvalidPaymentAmount as u32
                        || c == KeyShieldError::BudgetExceeded as u32
                        || c == KeyShieldError::ArithmeticOverflow as u32
                );
            }
        }
    }
}

#[test]
fn honest_path_keeps_conservation() {
    let mut model = None;
    apply(&mut model, &Op::Create { deposit: 100, cap: 100 }).unwrap();
    apply(
        &mut model,
        &Op::Settle {
            amount: 40,
            seq: 1,
            hash_byte: 7,
            verified: true,
        },
    )
    .unwrap();
    apply(
        &mut model,
        &Op::Settle {
            amount: 60,
            seq: 2,
            hash_byte: 8,
            verified: true,
        },
    )
    .unwrap();
    let stream = model.unwrap();
    stream.assert_invariants();
    assert_eq!(stream.escrow, 0);
    assert_eq!(stream.spent, 100);
}

#[test]
fn unverified_or_replayed_settle_does_not_move_escrow() {
    let mut model = None;
    apply(&mut model, &Op::Create { deposit: 80, cap: 80 }).unwrap();
    let err = apply(
        &mut model,
        &Op::Settle {
            amount: 10,
            seq: 1,
            hash_byte: 0,
            verified: false,
        },
    )
    .unwrap_err();
    assert_eq!(code(&err), KeyShieldError::UnverifiedFulfillment as u32);
    apply(
        &mut model,
        &Op::Settle {
            amount: 10,
            seq: 1,
            hash_byte: 3,
            verified: true,
        },
    )
    .unwrap();
    let err = apply(
        &mut model,
        &Op::Settle {
            amount: 10,
            seq: 1,
            hash_byte: 4,
            verified: true,
        },
    )
    .unwrap_err();
    assert_eq!(code(&err), KeyShieldError::SettlementReplay as u32);
    let stream = model.unwrap();
    assert_eq!(stream.spent, 10);
    assert_eq!(stream.escrow, 70);
    stream.assert_invariants();
}
