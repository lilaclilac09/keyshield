//! KeyShield Rust proxy — hot path only. See `proxy-rs/BOUNDARY.md`.

use std::path::PathBuf;
use std::sync::Arc;

use std::collections::HashMap;

use ks_cache::TtlCache;
use ks_proxy::{bridge, router, stealth, AppState};
use ks_session::SessionStore;
use ks_upstream::{UpstreamClients, UpstreamId};
use ks_vault::VaultPath;

const UPSTREAM_IDS_ALL: [UpstreamId; 10] = [
    UpstreamId::Helius, UpstreamId::Openai, UpstreamId::Anthropic,
    UpstreamId::Mistral, UpstreamId::Cohere, UpstreamId::Groq,
    UpstreamId::ZeroX, UpstreamId::Titan, UpstreamId::Pyth,
    UpstreamId::Alchemy,
];

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let bind = std::env::var("KS_BIND").unwrap_or_else(|_| "0.0.0.0:8000".into());
    let vault_root: PathBuf = std::env::var("KS_VAULT_DIR")
        .unwrap_or_else(|_| "v2-mvp/vault".into())
        .into();
    let session_db: PathBuf = std::env::var("KS_SESSION_DB")
        .unwrap_or_else(|_| "v2-mvp/sessions.db".into())
        .into();
    let server_secret = std::env::var("SERVER_SECRET")
        .unwrap_or_else(|_| "CHANGE-ME-IN-PROD-32-BYTES-MIN!!".into());
    let python_url = std::env::var("PYTHON_BACKEND_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8001".into());
    let internal_secret = std::env::var("KS_INTERNAL_SECRET").unwrap_or_default();

    let sessions = SessionStore::open(&session_db, &server_secret)?;
    let bridge_inst = Arc::new(bridge::PythonBridge::new(python_url, internal_secret));
    let (log_buffer, log_task) = bridge::LogBuffer::spawn(bridge_inst.clone());

    // Test-only knob: `KS_UPSTREAM_OVERRIDE_BASE` points every upstream
    // (incl. all three Helius sub-bases) at the override URL so the
    // oracle-diff harness can intercept all egress with one mock server.
    let cache = Arc::new(TtlCache::new());
    let upstreams = std::env::var("KS_UPSTREAM_OVERRIDE_BASE")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|base| {
            let mut overrides = HashMap::new();
            for id in UPSTREAM_IDS_ALL { overrides.insert(id, base.clone()); }
            UpstreamClients::with_bases_and_cache(overrides, cache.clone())
        })
        .unwrap_or_else(UpstreamClients::new);

    let stealth_on = stealth::read_stealth_env();
    if stealth_on {
        tracing::info!("stealth mode enabled — unauthed requests will see nginx");
    }

    let state = AppState {
        vault: VaultPath::new(vault_root),
        sessions: Arc::new(sessions),
        upstreams: Arc::new(upstreams),
        cache,
        bridge: bridge_inst,
        log_buffer,
        stealth: stealth_on,
    };

    let app = router(state);

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!("ks-proxy listening on {bind}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    // After axum exits, flush whatever's still in the buffer.
    tracing::info!("draining log buffer");
    log_task.shutdown().await;
    Ok(())
}

async fn shutdown_signal() {
    use tokio::signal;

    let ctrl_c = async {
        let _ = signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) = signal::unix::signal(signal::unix::SignalKind::terminate()) {
            sig.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received");
}
