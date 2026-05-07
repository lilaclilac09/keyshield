//! KeyShield Rust proxy — hot path only. See `proxy-rs/BOUNDARY.md`.

use std::path::PathBuf;
use std::sync::Arc;

use std::collections::HashMap;

use ks_cache::TtlCache;
use ks_proxy::{acme, bridge, router, stealth, tls, AppState};
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
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
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

    // Resolve TLS mode + stealth default-on. ADR-007 §"Stealth-default
    // order": KS_STEALTH explicit always wins; otherwise stealth defaults
    // ON for any TLS mode and OFF for plain HTTP.
    let tls_mode = tls::read_tls_mode();
    let stealth_on =
        stealth::read_stealth_env_with_default(tls_mode.stealth_default());

    tracing::info!(
        ?tls_mode,
        stealth_on,
        "ks-proxy startup config",
    );
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

    match tls_mode {
        tls::TlsMode::Off => {
            let listener = tokio::net::TcpListener::bind(&bind).await?;
            tracing::info!("ks-proxy listening on http://{bind}");
            axum::serve(listener, app)
                .with_graceful_shutdown(shutdown_signal())
                .await?;
        }
        tls::TlsMode::SelfSigned => {
            let tls_bind = tls::read_tls_bind();
            let sans: Vec<String> = std::env::var("KS_TLS_DOMAIN")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .map(|s| vec![s])
                .unwrap_or_default();
            let cfg = tls::build_self_signed_config(&sans).await?;
            let addr: std::net::SocketAddr = tls_bind.parse()?;
            tracing::info!(
                "ks-proxy listening on https://{tls_bind} (self-signed cert; \
                 browsers will warn — use --insecure / curl -k for testing)",
            );
            axum_server::bind_rustls(addr, cfg)
                .serve(app.into_make_service())
                .await?;
        }
        tls::TlsMode::Acme => {
            // Full ACME flow:
            //   1. Resolve domain + email + cache dir from env
            //   2. Load any cached cert; if valid (>RENEWAL_THRESHOLD_DAYS),
            //      reuse it
            //   3. Otherwise, bind :80 with the HTTP-01 challenge handler
            //      and run obtain_certificate
            //   4. Save the new bundle to disk
            //   5. Serve :443 with axum-server, install crypto provider
            //   6. Spawn the renewal task (24h tick, renew at <30d)
            let acme_cfg = match acme::load_acme_config() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!(
                        "KS_TLS_MODE=acme but config invalid ({e}) — \
                         falling back to self-signed",
                    );
                    let tls_bind = tls::read_tls_bind();
                    let cfg = tls::build_self_signed_config(&[]).await?;
                    let addr: std::net::SocketAddr = tls_bind.parse()?;
                    tracing::info!("ks-proxy listening on https://{tls_bind} (acme→self-signed)");
                    axum_server::bind_rustls(addr, cfg)
                        .serve(app.into_make_service())
                        .await?;
                    log_task.shutdown().await;
                    return Ok(());
                }
            };

            // Spin up the HTTP-01 challenge listener on :80 first — LE
            // will hit it during obtain_certificate's ready phase.
            // The store outlives both contexts.
            tls::install_crypto_provider();
            let challenges = acme::ChallengeStore::new();
            let challenge_app = acme::challenge_router(challenges.clone());
            let http01_bind = std::env::var("KS_ACME_HTTP01_BIND")
                .unwrap_or_else(|_| "0.0.0.0:80".into());
            let http01_addr: std::net::SocketAddr = http01_bind.parse()?;
            tracing::info!("ACME HTTP-01 challenge listener on http://{http01_bind}");
            tokio::spawn(async move {
                let listener = match tokio::net::TcpListener::bind(http01_addr).await {
                    Ok(l) => l,
                    Err(e) => {
                        tracing::error!(
                            "failed to bind ACME HTTP-01 listener on {http01_bind}: {e}. \
                             Falling back to challenge handler unreachable — issuance \
                             will fail. Run as root or with CAP_NET_BIND_SERVICE for :80.",
                        );
                        return;
                    }
                };
                if let Err(e) = axum::serve(listener, challenge_app).await {
                    tracing::error!("ACME HTTP-01 listener exited with error: {e}");
                }
            });

            // Try the on-disk cache first.
            let bundle = match acme::load_cached_cert(&acme_cfg.cache_dir) {
                Some(b) if !b.should_renew(acme::RENEWAL_THRESHOLD_DAYS) => {
                    tracing::info!(
                        "acme: reusing cached cert ({}d remaining)",
                        b.days_until_expiry(),
                    );
                    b
                }
                Some(_) => {
                    tracing::info!("acme: cached cert near/past expiry — running renewal");
                    acme::obtain_certificate(&acme_cfg, &challenges).await?
                }
                None => {
                    tracing::info!(
                        "acme: no cached cert at {} — running first-time issuance",
                        acme_cfg.cache_dir.display(),
                    );
                    acme::obtain_certificate(&acme_cfg, &challenges).await?
                }
            };
            if let Err(e) = acme::save_cert(&acme_cfg.cache_dir, &bundle) {
                tracing::warn!(
                    "acme: failed to persist cert to {}: {e}. Cert is in memory; \
                     a restart will burn another LE rate-limit.",
                    acme_cfg.cache_dir.display(),
                );
            }

            // Build the served RustlsConfig from the bundle.
            let served_config = axum_server::tls_rustls::RustlsConfig::from_pem(
                bundle.cert_pem.clone(),
                bundle.key_pem.clone(),
            )
            .await?;

            // Spawn the renewal loop; it can swap the served cert in
            // place without restarting the binary.
            let cfg_for_loop = acme_cfg.clone();
            let challenges_for_loop = challenges.clone();
            let served_config_clone = served_config.clone();
            tokio::spawn(async move {
                acme::run_renewal_loop(
                    cfg_for_loop,
                    challenges_for_loop,
                    bundle,
                    move |new_bundle| {
                        let cfg = served_config_clone.clone();
                        let cert = new_bundle.cert_pem.clone();
                        let key = new_bundle.key_pem.clone();
                        tokio::spawn(async move {
                            if let Err(e) = cfg.reload_from_pem(cert, key).await {
                                tracing::error!("acme: hot-reload of new cert failed: {e}");
                            } else {
                                tracing::info!("acme: hot-reloaded renewed cert");
                            }
                        });
                    },
                )
                .await;
            });

            let tls_bind = tls::read_tls_bind();
            let addr: std::net::SocketAddr = tls_bind.parse()?;
            tracing::info!(
                "ks-proxy listening on https://{tls_bind} (ACME / Let's Encrypt)",
            );
            axum_server::bind_rustls(addr, served_config)
                .serve(app.into_make_service())
                .await?;
        }
    }

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
