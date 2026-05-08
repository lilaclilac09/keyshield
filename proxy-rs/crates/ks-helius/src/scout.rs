/// Scoutable trait — mandatory for heavy paginated Helius methods.
///
/// Spec: ADR-005 §"The shape"
///
/// Implementing methods: `getTransactionsForAddress`, `getAssetsByOwner`,
/// `getAssetsByCreator`, `getSignaturesForAsset`.
///
/// Guarantees (per ADR-005):
/// - Concurrency bounded by `HeliusClient::semaphore` (shared).
/// - Concurrent scouts for identical `(method, params)` collapse to one in-flight
///   via a simple dedup window (5 s, memory-only, never disk).
/// - Partial sub-batch failures surface as Class A errors — no half-data.

use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;

use crate::error::HeliusError;

// ─── ScoutParams ──────────────────────────────────────────────────────────────

/// Input parameters for a `Scoutable::scout` call.
/// Deliberately generic so different methods can embed their own fields.
#[derive(Debug, Clone)]
pub struct ScoutParams {
    /// Primary key: address, owner pubkey, asset id, etc.
    pub key: String,
    /// Maximum items the caller wants.  Defaults to 100.
    pub limit: u32,
    /// Opaque cursor for resuming a previous page.
    pub cursor: Option<String>,
    /// Arbitrary extra params forwarded to the Helius method.
    pub extra: Value,
}

impl ScoutParams {
    pub fn new(key: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            limit: 100,
            cursor: None,
            extra: Value::Null,
        }
    }

    pub fn with_limit(mut self, limit: u32) -> Self {
        self.limit = limit;
        self
    }

    pub fn with_cursor(mut self, cursor: impl Into<String>) -> Self {
        self.cursor = Some(cursor.into());
        self
    }

    pub fn with_extra(mut self, extra: Value) -> Self {
        self.extra = extra;
        self
    }
}

// ─── Scoutable trait ─────────────────────────────────────────────────────────

/// Scout-and-fetch pattern for heavy paginated Helius APIs.
///
/// See ADR-005 for the full rationale.  Call [`Scoutable::scout_and_fetch`]
/// unless you need to interleave results yourself.
///
/// Using `async fn` in trait (stable since Rust 1.75).
/// The lint about Send bounds is suppressed — this trait is used only within
/// this crate where the implementors are known to be Send.
#[allow(async_fn_in_trait)]
pub trait Scoutable {
    /// The fully-hydrated item type (e.g. `EnrichedTransaction`, `Asset`).
    type Item: Send + 'static;
    /// The lightweight probe result (e.g. list of signatures / asset IDs).
    type Scout: Send + 'static;

    /// Cheap probe — bounded latency, returns identifiers + pagination cursors.
    ///
    /// Must acquire `HeliusClient::semaphore` for any upstream call.
    /// Must write scout results to the memory cache with a short TTL (5–30 s).
    async fn scout(&self, params: ScoutParams) -> Result<Self::Scout, HeliusError>;

    /// Heavy fetch — fully hydrate the items identified by `scout`.
    ///
    /// Must use `futures::future::try_join_all` (or equivalent) for batch
    /// parallelism, bounded by the semaphore.  A failure in any sub-batch
    /// must propagate as `Err` — no partial returns.
    async fn fetch_full(&self, slice: &Self::Scout) -> Result<Vec<Self::Item>, HeliusError>;

    /// Default driver: `scout` → `fetch_full`.
    ///
    /// Override only when custom interleaving is necessary.
    async fn scout_and_fetch(&self, params: ScoutParams) -> Result<Vec<Self::Item>, HeliusError> {
        let scout_result = self.scout(params).await?;
        self.fetch_full(&scout_result).await
    }
}

// ─── ScoutDedup — in-memory 5-second collapse window ────────────────────────

/// Tracks in-flight scout keys so concurrent callers share a single upstream
/// probe instead of each firing their own.
///
/// ADR-005: "Concurrent calls for the same (method, params) collapse to a
/// single in-flight scout.  Default dedup window: 5 s (memory-only, never
/// disk)."
///
/// Implementation: a lightweight `Arc<tokio::sync::RwLock<HashMap<…>>>` that
/// stores key → expiry.  The first caller inserts; subsequent callers within
/// the window see the key is live and skip the probe, relying on the memory
/// cache for the result.
///
/// Note: This is a *stamp*, not a value store.  The actual result lives in
/// `TtlCache`; the dedup window just prevents concurrent upstream probes.
#[derive(Clone, Default)]
pub struct ScoutDedup {
    inner: Arc<tokio::sync::RwLock<std::collections::HashMap<String, std::time::Instant>>>,
}

impl ScoutDedup {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `true` if `key` is already registered as in-flight (within 5 s).
    /// If not, registers it and returns `false` (caller should run the scout).
    pub async fn is_in_flight(&self, key: &str) -> bool {
        // Fast read path.
        {
            let r = self.inner.read().await;
            if let Some(&exp) = r.get(key) {
                if std::time::Instant::now() < exp {
                    return true;
                }
            }
        }
        // Register — re-check after acquiring write lock (avoid TOCTOU).
        let mut w = self.inner.write().await;
        if let Some(&exp) = w.get(key) {
            if std::time::Instant::now() < exp {
                return true;
            }
        }
        let dedup_window = Duration::from_secs(5);
        w.insert(key.to_string(), std::time::Instant::now() + dedup_window);
        false
    }

    /// Remove a key from the in-flight set (call after scout completes).
    pub async fn clear(&self, key: &str) {
        self.inner.write().await.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn scout_params_builder() {
        let p = ScoutParams::new("9Wz...AWWM")
            .with_limit(200)
            .with_cursor("abc123")
            .with_extra(serde_json::json!({"commitment": "confirmed"}));
        assert_eq!(p.key, "9Wz...AWWM");
        assert_eq!(p.limit, 200);
        assert_eq!(p.cursor.as_deref(), Some("abc123"));
        assert_eq!(p.extra["commitment"], "confirmed");
    }

    #[tokio::test]
    async fn dedup_first_call_returns_false() {
        let dedup = ScoutDedup::new();
        let in_flight = dedup.is_in_flight("key1").await;
        assert!(!in_flight, "first caller should not see in-flight");
    }

    #[tokio::test]
    async fn dedup_second_call_returns_true_within_window() {
        let dedup = ScoutDedup::new();
        // First registration.
        dedup.is_in_flight("key2").await;
        // Second call within window.
        let in_flight = dedup.is_in_flight("key2").await;
        assert!(in_flight, "second caller within 5 s window should be deduped");
    }

    #[tokio::test]
    async fn dedup_clear_allows_rerun() {
        let dedup = ScoutDedup::new();
        dedup.is_in_flight("key3").await;
        dedup.clear("key3").await;
        let in_flight = dedup.is_in_flight("key3").await;
        assert!(!in_flight, "after clear, next caller should not be deduped");
    }

    #[tokio::test]
    async fn scout_params_defaults() {
        let p = ScoutParams::new("addr");
        assert_eq!(p.limit, 100);
        assert!(p.cursor.is_none());
        assert!(p.extra.is_null());
    }
}
