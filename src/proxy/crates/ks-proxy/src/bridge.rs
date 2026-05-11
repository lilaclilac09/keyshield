//! Internal HTTP bridge to the Python control plane.
//!
//! See `proxy-rs/specs/07-bridge.md`.
//!
//! Two endpoints:
//!   - `GET /_internal/balance/<user_id>`  — sub-ms balance read (for 402)
//!   - `POST /_internal/log`              — buffered usage-log ingest
//!
//! The bridge is fronted by a `LogBuffer` so the hot path never blocks on
//! Python: handlers push entries via an `mpsc::Sender`; a background task
//! drains, batches (≥100 entries OR ≥100ms old), and POSTs to Python.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::{mpsc, Notify};
use tokio::time::sleep;

use ks_cache::TtlCache;

/// The Python control-plane bridge. Cheap to clone — `reqwest::Client` and
/// the optional balance cache are both `Arc` internally.
#[derive(Clone)]
pub struct PythonBridge {
    pub base_url: String,
    pub internal_secret: String,
    pub client: reqwest::Client,
    /// 1-second balance cache (per spec 07: "Rust may cache the result for
    /// a short window (suggest 1s) to avoid a per-request bridge call burst
    /// on the same user").
    balance_cache: Arc<TtlCache<f64>>,
}

impl PythonBridge {
    pub fn new(base_url: String, internal_secret: String) -> Self {
        Self::new_with_client(base_url, internal_secret, reqwest::Client::new())
    }

    pub fn new_with_client(
        base_url: String,
        internal_secret: String,
        client: reqwest::Client,
    ) -> Self {
        Self {
            base_url,
            internal_secret,
            client,
            balance_cache: Arc::new(TtlCache::new()),
        }
    }

    /// `GET /_internal/balance/<user_id>` → `{"balance_usd": <float>}`.
    /// 404 collapses to 0.0 per spec 07 ("treat as 0 balance for 402 logic").
    pub async fn balance(&self, user_id: &str) -> Result<f64, BridgeError> {
        // Cache hit → skip the bridge call.
        if let Some(v) = self.balance_cache.get(user_id) {
            return Ok(v);
        }

        let url = format!(
            "{}/_internal/balance/{}",
            self.base_url.trim_end_matches('/'),
            user_id
        );
        let resp = self
            .client
            .get(&url)
            .header("X-Internal-Secret", &self.internal_secret)
            .send()
            .await?;

        let status = resp.status();
        let value = if status == reqwest::StatusCode::OK {
            let body: BalanceResponse = resp.json().await?;
            body.balance_usd
        } else if status == reqwest::StatusCode::NOT_FOUND {
            0.0
        } else if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(BridgeError::Unauthorized);
        } else {
            return Err(BridgeError::Status(status.as_u16()));
        };

        // 1-second cache window — see spec 07.
        self.balance_cache
            .set(user_id.to_string(), value, Duration::from_secs(1));
        Ok(value)
    }

    /// Fire-and-forget MPP charging hook. After a successful upstream call,
    /// the proxy POSTs `{calls: 1, tokens: N}` to `/mpp/streams/<id>/record`
    /// on the Python backend with the caller's session bearer. Failures are
    /// logged via `tracing::warn` and never block the hot path.
    ///
    /// The whole network roundtrip happens in a detached `tokio::spawn`;
    /// this method returns immediately.
    pub fn record_mpp_call(&self, stream_id: u64, bearer: String, tokens: u32) {
        let client = self.client.clone();
        let url = format!(
            "{}/mpp/streams/{}/record",
            self.base_url.trim_end_matches('/'),
            stream_id,
        );
        tokio::spawn(async move {
            let resp = client
                .post(&url)
                .header("Authorization", format!("Bearer {bearer}"))
                .json(&serde_json::json!({"calls": 1, "tokens": tokens}))
                .send()
                .await;
            match resp {
                Ok(r) if r.status().is_success() => {}
                Ok(r) => tracing::warn!(stream_id, status = %r.status(), "mpp record_mpp_call non-2xx"),
                Err(e) => tracing::warn!(stream_id, error = %e, "mpp record_mpp_call failed"),
            }
        });
    }

    /// `POST /_internal/log` with `{"entries": [...]}`. Non-200 → log
    /// `warn!` and drop the batch (spec 07 "do NOT retry"). The function
    /// itself never returns `Err` for an HTTP-level failure — that would
    /// risk callers retrying. The only `Err` is a malformed URL or a
    /// transport bug we want surfaced in tests.
    pub async fn log_batch(&self, entries: Vec<UsageEntry>) -> Result<(), BridgeError> {
        if entries.is_empty() {
            return Ok(());
        }
        let url = format!("{}/_internal/log", self.base_url.trim_end_matches('/'));
        let body = LogBatchRequest { entries };

        let resp = self
            .client
            .post(&url)
            .header("X-Internal-Secret", &self.internal_secret)
            .json(&body)
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => Ok(()),
            Ok(r) => {
                let status = r.status();
                let txt = r.text().await.unwrap_or_default();
                tracing::warn!(
                    status = status.as_u16(),
                    body = %truncate(&txt, 200),
                    "bridge log_batch non-200 — dropping batch (usage is non-critical)"
                );
                Ok(())
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "bridge log_batch transport error — dropping batch"
                );
                Ok(())
            }
        }
    }
}

fn truncate(s: &str, n: usize) -> &str {
    let end = s
        .char_indices()
        .nth(n)
        .map(|(i, _)| i)
        .unwrap_or(s.len());
    &s[..end]
}

#[derive(serde::Deserialize, Debug)]
struct BalanceResponse {
    balance_usd: f64,
}

#[derive(serde::Serialize, Debug)]
struct LogBatchRequest {
    entries: Vec<UsageEntry>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct UsageEntry {
    pub user_id: String,
    pub upstream: String,
    pub key_type: String,
    pub method: String,
    pub path: String,
    pub tok_in: u64,
    pub tok_out: u64,
    pub cost: f64,
    pub latency_ms: f64,
    pub status: u16,
}

#[derive(thiserror::Error, Debug)]
pub enum BridgeError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("unauthorized (check KS_INTERNAL_SECRET)")]
    Unauthorized,
    #[error("bridge returned status {0}")]
    Status(u16),
}

// ─── LogBuffer ────────────────────────────────────────────────────────────────

/// Hot-path side of the buffered logger. Cloneable — backed by an
/// `mpsc::Sender`, no locks held when pushing.
#[derive(Clone)]
pub struct LogBuffer {
    sender: mpsc::Sender<UsageEntry>,
}

impl LogBuffer {
    /// Spawn a background drain task. Returns the (clonable) producer
    /// handle; keep the returned `JoinHandle` alive for graceful shutdown.
    pub fn spawn(bridge: Arc<PythonBridge>) -> (Self, LogBufferTask) {
        Self::spawn_with_capacity(bridge, 1024)
    }

    pub fn spawn_with_capacity(
        bridge: Arc<PythonBridge>,
        channel_capacity: usize,
    ) -> (Self, LogBufferTask) {
        let (tx, rx) = mpsc::channel::<UsageEntry>(channel_capacity);
        let shutdown = Arc::new(Notify::new());
        let task_handle = tokio::spawn(drain_loop(rx, bridge, shutdown.clone()));
        (
            Self { sender: tx },
            LogBufferTask {
                handle: task_handle,
                shutdown,
            },
        )
    }

    /// Fire-and-forget enqueue. If the channel is full or the drain task
    /// has died, drop the entry and warn — usage logging never blocks the
    /// hot path.
    pub fn push(&self, entry: UsageEntry) {
        if let Err(e) = self.sender.try_send(entry) {
            tracing::warn!(error = %e, "log buffer full — dropping entry");
        }
    }

    pub fn capacity(&self) -> usize {
        self.sender.capacity()
    }
}

/// Owner of the spawned drain task. Drop the handle to stop the loop on
/// the next iteration; call `shutdown().await` to wait for the final flush.
pub struct LogBufferTask {
    handle: tokio::task::JoinHandle<()>,
    shutdown: Arc<Notify>,
}

impl LogBufferTask {
    /// Trigger a final flush and wait for the drain task to exit. Must be
    /// awaited from within the same tokio runtime that called `spawn`.
    pub async fn shutdown(self) {
        self.shutdown.notify_one();
        // The drain loop checks the shutdown flag whenever the receiver
        // returns; closing the sender side is what makes `recv` return
        // `None`. We don't have direct access to the sender here (it's
        // cloned on the `LogBuffer` side), so instead the drain loop
        // honors the Notify and exits after the next flush.
        let _ = self.handle.await;
    }
}

const FLUSH_THRESHOLD: usize = 100;
const FLUSH_INTERVAL: Duration = Duration::from_millis(100);

async fn drain_loop(
    mut rx: mpsc::Receiver<UsageEntry>,
    bridge: Arc<PythonBridge>,
    shutdown: Arc<Notify>,
) {
    let mut buffer: Vec<UsageEntry> = Vec::with_capacity(FLUSH_THRESHOLD);
    let mut oldest_at: Option<Instant> = None;
    let shutdown_listener = shutdown.notified();
    tokio::pin!(shutdown_listener);

    loop {
        let deadline = oldest_at.map(|t| t + FLUSH_INTERVAL);
        let wait = match deadline {
            Some(d) => {
                let now = Instant::now();
                if d <= now {
                    Duration::from_millis(0)
                } else {
                    d - now
                }
            }
            // No pending entries → wait essentially forever; recv() will
            // wake us up.
            None => Duration::from_secs(60 * 60 * 24),
        };

        tokio::select! {
            biased;

            // Shutdown triggered — flush remaining entries and exit.
            _ = &mut shutdown_listener => {
                // Drain any remaining entries off the channel without
                // waiting (best-effort final flush).
                while let Ok(entry) = rx.try_recv() {
                    buffer.push(entry);
                }
                if !buffer.is_empty() {
                    let _ = bridge.log_batch(std::mem::take(&mut buffer)).await;
                }
                tracing::info!("log buffer drained on shutdown");
                return;
            }

            recv = rx.recv() => match recv {
                Some(entry) => {
                    if buffer.is_empty() {
                        oldest_at = Some(Instant::now());
                    }
                    buffer.push(entry);
                    if buffer.len() >= FLUSH_THRESHOLD {
                        let batch = std::mem::take(&mut buffer);
                        oldest_at = None;
                        let _ = bridge.log_batch(batch).await;
                    }
                }
                None => {
                    // Sender side dropped — flush whatever's left and exit.
                    if !buffer.is_empty() {
                        let _ = bridge.log_batch(std::mem::take(&mut buffer)).await;
                    }
                    return;
                }
            },

            // Timer hit (oldest entry too old) → flush.
            _ = sleep(wait), if oldest_at.is_some() => {
                if !buffer.is_empty() {
                    let batch = std::mem::take(&mut buffer);
                    oldest_at = None;
                    let _ = bridge.log_batch(batch).await;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn record_mpp_call_posts_to_record_endpoint() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/mpp/streams/42/record"))
            .and(header("Authorization", "Bearer session-tok"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let bridge = PythonBridge::new(server.uri(), "irrelevant".into());
        bridge.record_mpp_call(42, "session-tok".to_string(), 1234);

        // record_mpp_call is fire-and-forget — give the spawned task time
        // to actually fire.
        tokio::time::sleep(Duration::from_millis(100)).await;

        let reqs = server.received_requests().await.unwrap();
        assert_eq!(reqs.len(), 1, "wiremock should have seen the record POST");
        let r = &reqs[0];
        assert_eq!(r.url.path(), "/mpp/streams/42/record");
        let body: serde_json::Value =
            serde_json::from_slice(&r.body).expect("body must be valid JSON");
        assert_eq!(body["calls"], 1);
        assert_eq!(body["tokens"], 1234);
    }

    #[tokio::test]
    async fn record_mpp_call_swallows_5xx() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/mpp/streams/7/record"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let bridge = PythonBridge::new(server.uri(), "irrelevant".into());
        // Must return immediately, never panic, never propagate the 500.
        bridge.record_mpp_call(7, "sess".to_string(), 99);
        tokio::time::sleep(Duration::from_millis(100)).await;
        // Confirm the request was at least attempted.
        let reqs = server.received_requests().await.unwrap();
        assert_eq!(reqs.len(), 1);
    }
}
