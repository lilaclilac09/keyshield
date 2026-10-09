//! Hold-Verify-Capture. A session-key signature never decrements
//! settled quota unless the RPC outcome is `Confirmed` or explicit
//! `Stub`. Timeout is `Indeterminate`: hold stays, no debit, retry ok.

use std::collections::{HashMap, HashSet};

use crate::context::context_digest;
use crate::error::EngineError;
use crate::keys::SessionKey;
use crate::layout::assert_instruction_envelope;
use crate::quota::QuotaLedger;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Held,
    Captured,
    RolledBack,
}

/// Downstream consensus result. Only Confirmed/Stub may capture.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RpcOutcome {
    Confirmed { tx_sig: [u8; 64] },
    Stub,
    Failed,
    Indeterminate,
}

#[derive(Clone, Debug)]
pub struct HoldRequest<'a> {
    pub program_id: &'a [u8; 32],
    pub ix_data: &'a [u8],
    pub stream_id: u64,
    pub artifact_hash: [u8; 32],
    pub nonce: u64,
    pub micro_usdc: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HoldTicket {
    pub id: u64,
    pub stream_id: u64,
    pub micro_usdc: u64,
    pub artifact_hash: [u8; 32],
    pub digest: [u8; 32],
    pub phase: Phase,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Receipt {
    pub ticket_id: u64,
    pub micro_usdc: u64,
    pub digest: [u8; 32],
}

struct LiveHold {
    ticket: HoldTicket,
}

/// In-process HVC engine. WASM-safe (no filesystem, no libc clocks).
pub struct Engine {
    quota: QuotaLedger,
    next_id: u64,
    live: HashMap<u64, LiveHold>,
    consumed_digests: HashSet<[u8; 32]>,
}

impl Engine {
    pub fn new(endowment: u64) -> Self {
        Self {
            quota: QuotaLedger::new(endowment),
            next_id: 1,
            live: HashMap::new(),
            consumed_digests: HashSet::new(),
        }
    }

    pub fn quota(&self) -> &QuotaLedger {
        &self.quota
    }

    pub fn live_holds(&self) -> usize {
        self.live.len()
    }

    pub fn consumed_guards(&self) -> usize {
        self.consumed_digests.len()
    }

    /// Reserve quota and bind a unique SHA-256 context digest.
    /// Signing happens later; this step does not debit settled.
    pub fn hold(&mut self, req: HoldRequest<'_>) -> Result<HoldTicket, EngineError> {
        assert_instruction_envelope(req.ix_data)?;
        if req.micro_usdc == 0 {
            return Err(EngineError::ZeroAmount);
        }
        let digest = context_digest(
            req.program_id,
            req.ix_data,
            req.stream_id,
            &req.artifact_hash,
            req.nonce,
        );
        if self.consumed_digests.contains(&digest)
            || self.live.values().any(|h| h.ticket.digest == digest)
        {
            return Err(EngineError::Replay);
        }
        self.quota.hold(req.micro_usdc)?;
        let id = self.next_id;
        self.next_id += 1;
        let ticket = HoldTicket {
            id,
            stream_id: req.stream_id,
            micro_usdc: req.micro_usdc,
            artifact_hash: req.artifact_hash,
            digest,
            phase: Phase::Held,
        };
        self.live.insert(id, LiveHold { ticket });
        self.quota.assert_conserved()?;
        Ok(ticket)
    }

    /// Verify the session MAC, then commit or fail closed from `rpc`.
    ///
    /// `Indeterminate` leaves the hold in place and returns
    /// `EngineError::Indeterminate` so the caller can retry. Settled
    /// is unchanged.
    pub fn verify(
        &mut self,
        ticket_id: u64,
        key: &SessionKey,
        signature: &[u8],
        rpc: RpcOutcome,
    ) -> Result<Receipt, EngineError> {
        let hold = self.live.get(&ticket_id).ok_or(EngineError::HoldNotFound)?;
        if hold.ticket.phase != Phase::Held {
            return Err(EngineError::NotHeld);
        }
        let artifact = hold.ticket.artifact_hash;
        let amount = hold.ticket.micro_usdc;
        let digest = hold.ticket.digest;
        if !key.verify_artifact(&artifact, signature) {
            return Err(EngineError::InvalidSignature);
        }
        match rpc {
            RpcOutcome::Indeterminate => Err(EngineError::Indeterminate),
            RpcOutcome::Failed => {
                self.quota.rollback(amount)?;
                if let Some(h) = self.live.get_mut(&ticket_id) {
                    h.ticket.phase = Phase::RolledBack;
                }
                self.live.remove(&ticket_id);
                self.consumed_digests.insert(digest);
                self.quota.assert_conserved()?;
                Err(EngineError::SettlementFailed)
            }
            RpcOutcome::Confirmed { .. } | RpcOutcome::Stub => {
                self.quota.capture(amount)?;
                if let Some(h) = self.live.get_mut(&ticket_id) {
                    h.ticket.phase = Phase::Captured;
                }
                self.live.remove(&ticket_id);
                self.consumed_digests.insert(digest);
                self.quota.assert_conserved()?;
                Ok(Receipt {
                    ticket_id,
                    micro_usdc: amount,
                    digest,
                })
            }
        }
    }

    /// Explicit rollback (caller-declared timeout after giving up).
    pub fn rollback(&mut self, ticket_id: u64) -> Result<(), EngineError> {
        let hold = self.live.get(&ticket_id).ok_or(EngineError::HoldNotFound)?;
        if hold.ticket.phase != Phase::Held {
            return Err(EngineError::NotHeld);
        }
        let amount = hold.ticket.micro_usdc;
        let digest = hold.ticket.digest;
        self.quota.rollback(amount)?;
        self.live.remove(&ticket_id);
        self.consumed_digests.insert(digest);
        self.quota.assert_conserved()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settle_ix() -> [u8; MPP_SETTLE_LEN] {
        let mut ix = [0u8; MPP_SETTLE_LEN];
        ix[0] = 26;
        ix[1..9].copy_from_slice(&1u64.to_le_bytes());
        ix[9] = 0x11;
        ix[41..49].copy_from_slice(&1u64.to_le_bytes());
        ix[49] = 0x22;
        ix[81] = 0x33;
        ix
    }

    const MPP_SETTLE_LEN: usize = 113;

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
    fn timeout_does_not_debit_then_confirm_captures_once() {
        let ix = settle_ix();
        let artifact = [0x44; 32];
        let key = SessionKey::from_utf8("ks-session-consumer").unwrap();
        let sig = key.sign_artifact(&artifact);
        let mut eng = Engine::new(10_000);
        let ticket = eng.hold(req(&ix, artifact, 1, 800)).unwrap();
        assert_eq!(eng.quota().held(), 800);
        assert_eq!(eng.quota().settled(), 0);

        let err = eng
            .verify(ticket.id, &key, &sig, RpcOutcome::Indeterminate)
            .unwrap_err();
        assert_eq!(err, EngineError::Indeterminate);
        assert_eq!(eng.quota().held(), 800);
        assert_eq!(eng.quota().settled(), 0);

        let receipt = eng
            .verify(ticket.id, &key, &sig, RpcOutcome::Stub)
            .unwrap();
        assert_eq!(receipt.micro_usdc, 800);
        assert_eq!(eng.quota().settled(), 800);
        assert_eq!(eng.quota().held(), 0);

        let replay = eng.hold(req(&ix, artifact, 1, 800)).unwrap_err();
        assert_eq!(replay, EngineError::Replay);
    }

    #[test]
    fn bad_mac_does_not_move_settled() {
        let ix = settle_ix();
        let artifact = [0x55; 32];
        let key = SessionKey::from_utf8("ks-session-consumer").unwrap();
        let mut eng = Engine::new(500);
        let ticket = eng.hold(req(&ix, artifact, 2, 100)).unwrap();
        let err = eng
            .verify(ticket.id, &key, &[1u8; 32], RpcOutcome::Stub)
            .unwrap_err();
        assert_eq!(err, EngineError::InvalidSignature);
        assert_eq!(eng.quota().settled(), 0);
        assert_eq!(eng.quota().held(), 100);
    }
}
