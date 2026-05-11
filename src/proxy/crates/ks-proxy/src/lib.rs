//! Library surface for the ks-proxy crate.
//!
//! `main.rs` is a thin runner; the integration tests in `tests/` import
//! `AppState`, `bridge::*`, `usage::*` from here so we exercise the same
//! code paths the binary uses.

use std::sync::Arc;

use ks_cache::TtlCache;
use ks_session::SessionStore;
use ks_upstream::UpstreamClients;
use ks_vault::VaultPath;
use tower_http::cors::{Any, CorsLayer};

pub mod acme;
pub mod bridge;
pub mod handlers;
pub mod metrics;
pub mod stealth;
pub mod tls;
pub mod usage;

#[derive(Clone)]
pub struct AppState {
    pub vault: VaultPath,
    pub sessions: Arc<SessionStore>,
    pub upstreams: Arc<UpstreamClients>,
    pub cache: Arc<TtlCache<bytes::Bytes>>,
    pub bridge: Arc<bridge::PythonBridge>,
    pub log_buffer: bridge::LogBuffer,
    /// When `true`, unauthed requests get an nginx-shaped response instead
    /// of a keyshield-flavored 401. Wire from `KS_STEALTH=1` in `main.rs`.
    pub stealth: bool,
    /// Path to the vault SQLite DB. Used by the Helius fast-path to look up
    /// per-user upstream keys (`ks_vault::sqlite::lookup_upstream_key`).
    pub vault_db_path: std::path::PathBuf,
    /// Shared Helius client. Per-request, `helius.fork_with_api_key(user_key)`
    /// yields a per-user client that reuses the warm in-memory cache and
    /// the HTTP/2 keep-alive pool.
    pub helius: std::sync::Arc<ks_helius::HeliusClient>,
}

/// Build the axum `Router` for the hot path. Used by both `main.rs` and
/// the integration tests so they exercise the exact same routing tree.
///
/// `*path` in axum 0.7 only matches **at least one** segment, so we add
/// a sibling route for the empty-path case (`/proxy/helius/` → method
/// dispatch by JSON-RPC body). Without that branch, `POST /proxy/helius/`
/// falls through to Python and the byte-diff oracle silently passes
/// (Rust-as-mirror) — see oracle-diff harness.
pub fn router(state: AppState, prometheus: metrics_exporter_prometheus::PrometheusHandle) -> axum::Router {
    use axum::routing::{any, get, post};
    // CORS for browser clients (frontend on localhost:5173 → proxy on :8000).
    // Origin Any is acceptable here because the proxy enforces auth via
    // Bearer tokens, not cookies; CORS is not the security boundary.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    axum::Router::new()
        .route("/health", get(handlers::health))
        .route("/metrics", get(metrics::metrics_handler).with_state(prometheus))
        .route("/proxy/:upstream", any(handlers::proxy_no_path))
        .route("/proxy/:upstream/", any(handlers::proxy_no_path))
        .route("/proxy/:upstream/*path", any(handlers::proxy))
        .route("/manage/batch", post(handlers::batch))
        .fallback(handlers::fallthrough)
        .layer(cors)
        .with_state(state)
}
