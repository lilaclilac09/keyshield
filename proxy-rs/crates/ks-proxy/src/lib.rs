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

pub mod bridge;
pub mod handlers;
pub mod usage;

#[derive(Clone)]
pub struct AppState {
    pub vault: VaultPath,
    pub sessions: Arc<SessionStore>,
    pub upstreams: Arc<UpstreamClients>,
    pub cache: Arc<TtlCache<bytes::Bytes>>,
    pub bridge: Arc<bridge::PythonBridge>,
    pub log_buffer: bridge::LogBuffer,
}

/// Build the axum `Router` for the hot path. Used by both `main.rs` and
/// the integration tests so they exercise the exact same routing tree.
///
/// `*path` in axum 0.7 only matches **at least one** segment, so we add
/// a sibling route for the empty-path case (`/proxy/helius/` → method
/// dispatch by JSON-RPC body). Without that branch, `POST /proxy/helius/`
/// falls through to Python and the byte-diff oracle silently passes
/// (Rust-as-mirror) — see oracle-diff harness.
pub fn router(state: AppState) -> axum::Router {
    use axum::routing::{any, get, post};
    axum::Router::new()
        .route("/health", get(handlers::health))
        .route("/proxy/:upstream", any(handlers::proxy_no_path))
        .route("/proxy/:upstream/", any(handlers::proxy_no_path))
        .route("/proxy/:upstream/*path", any(handlers::proxy))
        .route("/manage/batch", post(handlers::batch))
        .fallback(handlers::fallthrough)
        .with_state(state)
}
