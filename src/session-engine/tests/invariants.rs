//! Fail-to-pass ledger: timeout rollback, replay, wipe, CU budget,
//! and a deterministic fuzz that must not panic or orphan a debit.

use std::panic::{catch_unwind, AssertUnwindSafe};

use ks_session_engine::{
    context_anchor, Engine, EngineError, HoldRequest, RpcOutcome, SessionKey, HONEST_SETTLE_CU,
    MAX_COMPUTE_UNITS,
};

fn settle_ix() -> [u8; 113] {
    let mut ix = [0u8; 113];
    ix[0] = 26;
    ix[1..9].copy_from_slice(&1u64.to_le_bytes());
    ix[9] = 0x11;
    ix[41..49].copy_from_slice(&1u64.to_le_bytes());
    ix[49] = 0x22;
    ix[81] = 0x33;
    ix
}

fn req<'a>(ix: &'a [u8], artifact: [u8; 32], nonce: u64, amount: u64) -> HoldRequest<'a> {
    HoldRequest {
        program_id: &[7u8; 32],
        ix_data: ix,
        stream_id: 1,
        artifact_hash: artifact,
        nonce,
        micro_usdc: amount,
    }
}

#[test]
fn before_empty_ix_cannot_hold() {
    let mut eng = Engine::new(1_000);
    let err = eng
        .hold(req(&[], [1u8; 32], 0, 10))
        .unwrap_err();
    assert_eq!(err, EngineError::InvalidEnvelope);
    assert_eq!(eng.quota().settled(), 0);
}

#[test]
fn after_timeout_then_confirm_is_fail_to_pass() {
    let ix = settle_ix();
    let artifact = [0xAB; 32];
    let key = SessionKey::from_utf8("ks-session-consumer").unwrap();
    let sig = key.sign_artifact(&artifact);
    let mut eng = Engine::new(5_000);

    // BEFORE: indeterminate used to look like a debit. Engine must not.
    let ticket = eng.hold(req(&ix, artifact, 9, 800)).unwrap();
    assert_eq!(
        eng.verify(ticket.id, &key, &sig, RpcOutcome::Indeterminate)
            .unwrap_err(),
        EngineError::Indeterminate
    );
    assert_eq!(eng.quota().settled(), 0);
    assert_eq!(eng.quota().held(), 800);

    // AFTER: confirmed/stub captures once.
    let receipt = eng
        .verify(ticket.id, &key, &sig, RpcOutcome::Confirmed { tx_sig: [0; 64] })
        .unwrap();
    assert_eq!(receipt.micro_usdc, 800);
    assert_eq!(eng.quota().settled(), 800);
    assert_eq!(eng.quota().held(), 0);
    assert!(eng.quota().conserved());
}

#[test]
fn hard_fail_rolls_back_and_consumes_anchor() {
    let ix = settle_ix();
    let artifact = [0xCD; 32];
    let key = SessionKey::from_utf8("ks-session-consumer").unwrap();
    let sig = key.sign_artifact(&artifact);
    let mut eng = Engine::new(5_000);
    let ticket = eng.hold(req(&ix, artifact, 3, 200)).unwrap();
    assert_eq!(
        eng.verify(ticket.id, &key, &sig, RpcOutcome::Failed)
            .unwrap_err(),
        EngineError::SettlementFailed
    );
    assert_eq!(eng.quota().available(), 5_000);
    assert_eq!(eng.quota().settled(), 0);
    assert_eq!(
        eng.hold(req(&ix, artifact, 3, 200)).unwrap_err(),
        EngineError::Replay
    );
}

#[test]
fn sha256_anchor_is_session_guard() {
    let ix = settle_ix();
    let a = context_anchor(&[1u8; 32], &ix, 1, &[2u8; 32], 0);
    let b = context_anchor(&[1u8; 32], &ix, 1, &[2u8; 32], 1);
    assert_ne!(a, b);
    assert_eq!(a.len(), 32);
}

#[test]
fn honest_cu_budget() {
    assert_eq!(HONEST_SETTLE_CU, 4_500);
    assert!(HONEST_SETTLE_CU < MAX_COMPUTE_UNITS);
}

#[test]
fn fuzzed_paths_no_panic_no_orphan_debit() {
    const ENDOWMENT: u64 = 1_000_000;
    const ITERS: u32 = 12_000;
    let ix = settle_ix();
    let key = SessionKey::from_utf8("ks-session-consumer").unwrap();
    let mut eng = Engine::new(ENDOWMENT);
    let mut seed: u64 = 0xC0FFEE_5EED;
    let mut next_nonce = 0u64;
    let mut open: Vec<(u64, [u8; 32], u64)> = Vec::new();
    let mut captured_sum = 0u64;

    let panicked = catch_unwind(AssertUnwindSafe(|| {
        for _ in 0..ITERS {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            let op = (seed >> 32) as u32 % 5;
            match op {
                0 => {
                    let mut artifact = [0u8; 32];
                    artifact[..8].copy_from_slice(&next_nonce.to_le_bytes());
                    let amount = 1 + (seed % 50);
                    match eng.hold(req(&ix, artifact, next_nonce, amount)) {
                        Ok(t) => {
                            let sig = key.sign_artifact(&artifact);
                            open.push((t.id, sig, amount));
                            next_nonce += 1;
                        }
                        Err(EngineError::QuotaExceeded | EngineError::Replay) => {}
                        Err(e) => panic!("unexpected hold error {e:?}"),
                    }
                }
                1 => {
                    if let Some((id, sig, amount)) = open.pop() {
                        match eng.verify(id, &key, &sig, RpcOutcome::Indeterminate) {
                            Err(EngineError::Indeterminate) => open.push((id, sig, amount)),
                            other => panic!("indeterminate path {other:?}"),
                        }
                    }
                }
                2 => {
                    if let Some((id, sig, amount)) = open.pop() {
                        match eng.verify(
                            id,
                            &key,
                            &sig,
                            RpcOutcome::Confirmed { tx_sig: [9; 64] },
                        ) {
                            Ok(_) => captured_sum += amount,
                            Err(e) => panic!("confirm path {e:?}"),
                        }
                    }
                }
                3 => {
                    if let Some((id, sig, _)) = open.pop() {
                        match eng.verify(id, &key, &sig, RpcOutcome::Failed) {
                            Err(EngineError::SettlementFailed) => {}
                            other => panic!("fail path {other:?}"),
                        }
                    }
                }
                _ => {
                    if let Some((id, _, _)) = open.pop() {
                        eng.rollback(id).expect("rollback live hold");
                    }
                }
            }
            assert!(
                eng.quota().conserved(),
                "conservation broken available={} held={} settled={} endowment={}",
                eng.quota().available(),
                eng.quota().held(),
                eng.quota().settled(),
                eng.quota().endowment()
            );
        }
    }));

    assert!(panicked.is_ok(), "unhandled panic in fuzzed HVC paths");
    assert!(eng.quota().conserved());
    assert_eq!(eng.quota().settled(), captured_sum);
    assert_eq!(
        eng.quota().available() + eng.quota().held() + eng.quota().settled(),
        ENDOWMENT
    );
    assert_eq!(eng.live_holds(), open.len());
}

#[test]
fn python_hmac_matches_capture_py() {
    let key = SessionKey::from_utf8("ks-session-consumer").unwrap();
    let mut artifact = [0u8; 32];
    for (i, b) in artifact.iter_mut().enumerate() {
        *b = i as u8;
    }
    let mac = key.sign_artifact(&artifact);
    let expected =
        hex::decode("e73c7053ebba0e2e811867cfb36abe5bb4ad03b8b667b956cc71561f57cbd08a").unwrap();
    assert_eq!(mac.as_slice(), expected.as_slice());
}
