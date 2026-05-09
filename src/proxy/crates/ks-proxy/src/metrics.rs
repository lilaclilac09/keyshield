//! Prometheus metrics for the ks-proxy hot path.
//!
//! Call [`init_prometheus`] once at startup to get a [`PrometheusHandle`].
//! Mount `GET /metrics` → [`metrics_handler`] to expose the text output.
//!
//! All metric names carry the `ks_` prefix to match the Python control plane.

use std::sync::OnceLock;
use std::time::Duration;

use metrics::{counter, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

/// Initialise the Prometheus recorder and return the render handle.
///
/// Idempotent: subsequent calls return a clone of the same `PrometheusHandle`.
/// `metrics_exporter_prometheus::install_recorder()` sets a process-global
/// recorder and panics if called twice; the test suite has 19+ callsites
/// that need a handle but cannot share a single `init` call (each test
/// builds its own router). Wrapping the install in a `OnceLock` makes the
/// production binary's single call work AND lets tests call this freely.
pub fn init_prometheus() -> PrometheusHandle {
    static HANDLE: OnceLock<PrometheusHandle> = OnceLock::new();
    HANDLE
        .get_or_init(|| {
            PrometheusBuilder::new()
                .install_recorder()
                .expect("failed to install Prometheus recorder")
        })
        .clone()
}

/// Record a completed proxy request.
pub fn record_request(upstream: &str, status: u16, latency: Duration) {
    let status_str = status.to_string();
    counter!("ks_proxy_requests_total", "upstream" => upstream.to_owned(), "status" => status_str).increment(1);
    histogram!("ks_proxy_latency_seconds", "upstream" => upstream.to_owned())
        .record(latency.as_secs_f64());
}

/// Record a cache hit for an upstream.
pub fn record_cache_hit(upstream: &str) {
    counter!("ks_cache_hits_total", "upstream" => upstream.to_owned()).increment(1);
}

/// Record a cache miss for an upstream.
pub fn record_cache_miss(upstream: &str) {
    counter!("ks_cache_misses_total", "upstream" => upstream.to_owned()).increment(1);
}

/// Axum handler: render all collected metrics as Prometheus text exposition format.
pub async fn metrics_handler(
    axum::extract::State(handle): axum::extract::State<PrometheusHandle>,
) -> impl axum::response::IntoResponse {
    (
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        handle.render(),
    )
}
