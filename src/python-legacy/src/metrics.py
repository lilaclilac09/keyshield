"""
metrics.py — Prometheus metrics for the KeyShield Python control plane.

Exposed at GET /metrics (text/plain; version=0.0.4).
Opt-in: only collected when prometheus_client is installed.
All counters/histograms use the `ks_` prefix.

Env vars:
  KS_METRICS_TOKEN — if set, /metrics requires Bearer <token>
"""
from __future__ import annotations

from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
)

# ── counters ────────────────────────────────────────────────────────────────

PROXY_REQUESTS = Counter(
    "ks_proxy_requests_total",
    "Total proxy requests forwarded",
    ["upstream", "status_code"],
)

PROXY_LATENCY = Histogram(
    "ks_proxy_latency_seconds",
    "Proxy round-trip latency in seconds",
    ["upstream"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

VAULT_OPS = Counter(
    "ks_vault_ops_total",
    "Vault CRUD operations",
    ["op"],  # store | get | delete
)

AUTH_ATTEMPTS = Counter(
    "ks_auth_attempts_total",
    "Authentication attempts",
    ["result"],  # success | failure
)

BILLING_TOPUPS = Counter(
    "ks_billing_topup_total",
    "Billing top-up events",
    ["method"],  # solana_sol | solana_usdc | x402
)

BILLING_TOPUP_USD = Counter(
    "ks_billing_topup_usd_total",
    "Cumulative USD credited via top-ups",
)

ACTIVE_SESSIONS = Gauge(
    "ks_active_sessions",
    "Number of currently active sessions",
)


# ── public helpers ───────────────────────────────────────────────────────────

def record_proxy(upstream: str, status_code: int, latency_s: float) -> None:
    PROXY_REQUESTS.labels(upstream=upstream, status_code=str(status_code)).inc()
    PROXY_LATENCY.labels(upstream=upstream).observe(latency_s)


def record_vault_op(op: str) -> None:
    VAULT_OPS.labels(op=op).inc()


def record_auth(result: str) -> None:
    AUTH_ATTEMPTS.labels(result=result).inc()


def record_topup(method: str, amount_usd: float) -> None:
    BILLING_TOPUPS.labels(method=method).inc()
    BILLING_TOPUP_USD.inc(amount_usd)


def set_active_sessions(count: int) -> None:
    ACTIVE_SESSIONS.set(count)


def metrics_response() -> tuple[str, str]:
    """Return (body, content_type) suitable for an HTTP response."""
    return generate_latest().decode("utf-8"), CONTENT_TYPE_LATEST
