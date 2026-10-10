//! Atomic quota ledger. A hold reserves; capture commits; rollback
//! returns the reservation. Settled never increases unless `capture`
//! is called after a verified downstream state change.

use crate::error::EngineError;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QuotaLedger {
    endowment: u64,
    available: u64,
    held: u64,
    settled: u64,
}

impl QuotaLedger {
    pub fn new(endowment: u64) -> Self {
        Self {
            endowment,
            available: endowment,
            held: 0,
            settled: 0,
        }
    }

    pub fn available(&self) -> u64 {
        self.available
    }

    pub fn held(&self) -> u64 {
        self.held
    }

    pub fn settled(&self) -> u64 {
        self.settled
    }

    pub fn endowment(&self) -> u64 {
        self.endowment
    }

    pub fn conserved(&self) -> bool {
        self.available
            .checked_add(self.held)
            .and_then(|v| v.checked_add(self.settled))
            == Some(self.endowment)
    }

    pub fn assert_conserved(&self) -> Result<(), EngineError> {
        if self.conserved() {
            Ok(())
        } else {
            Err(EngineError::ConservationBroken)
        }
    }

    /// Reserve `amount` from available. No settled movement.
    pub fn hold(&mut self, amount: u64) -> Result<(), EngineError> {
        if amount == 0 {
            return Err(EngineError::ZeroAmount);
        }
        if amount > self.available {
            return Err(EngineError::QuotaExceeded);
        }
        self.available -= amount;
        self.held += amount;
        self.assert_conserved()
    }

    /// Commit a prior hold. This is the only path that increments settled.
    pub fn capture(&mut self, amount: u64) -> Result<(), EngineError> {
        if amount == 0 {
            return Err(EngineError::ZeroAmount);
        }
        if amount > self.held {
            return Err(EngineError::NotHeld);
        }
        self.held -= amount;
        self.settled += amount;
        self.assert_conserved()
    }

    /// Return a hold to available after RPC failure or timeout.
    pub fn rollback(&mut self, amount: u64) -> Result<(), EngineError> {
        if amount == 0 {
            return Err(EngineError::ZeroAmount);
        }
        if amount > self.held {
            return Err(EngineError::NotHeld);
        }
        self.held -= amount;
        self.available += amount;
        self.assert_conserved()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hold_capture_rollback_conserve() {
        let mut q = QuotaLedger::new(1_000);
        q.hold(200).unwrap();
        assert_eq!((q.available(), q.held(), q.settled()), (800, 200, 0));
        q.rollback(200).unwrap();
        assert_eq!((q.available(), q.held(), q.settled()), (1_000, 0, 0));
        q.hold(150).unwrap();
        q.capture(150).unwrap();
        assert_eq!((q.available(), q.held(), q.settled()), (850, 0, 150));
        assert!(q.conserved());
    }

    #[test]
    fn capture_without_hold_is_rejected() {
        let mut q = QuotaLedger::new(50);
        assert_eq!(q.capture(1).unwrap_err(), EngineError::NotHeld);
        assert_eq!(q.settled(), 0);
    }
}
