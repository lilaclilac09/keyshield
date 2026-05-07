# ADR 007 — TLS termination + stealth-default-on

**Status:** Accepted
**Date:** 2026-05-05
**Supersedes:** none — first decision on application-level TLS for ks-proxy
**Related:** ADR-002 (ks-proxy boundary), ADR-003 (KS_INTERNAL_SECRET firewall),
spec 12 (`proxy-rs/specs/12-tls-stealth.md`)

## Context

Through Stage 1, ks-proxy bound `0.0.0.0:8000` plain HTTP. Production
deployment was implicitly "put nginx in front for TLS." Two problems:

1. **Operational burden.** Every keyshield deployment needs nginx
   configured, rotated, and monitored separately. Single-binary deploys
   (the spec 0 article-3 form) become two-binary deploys.
2. **Stealth is fingerprintable through nginx.** Even with `KS_STEALTH=1`,
   if the listener is plain HTTP behind a TLS-terminating reverse proxy,
   anyone on the internal network sees `Server: hyper` headers and can
   identify the application. Stealth needs to be on the same TLS
   listener clients reach.

Stage 2 needs ks-proxy to terminate TLS itself + flip stealth
default-on for any TLS mode.

## Decision

### TLS modes — `KS_TLS_MODE` env var

```
off         (default)   plain HTTP on KS_BIND
self-signed             rcgen self-signed cert; axum-server on KS_TLS_BIND
acme                    Let's Encrypt via instant-acme HTTP-01 + renewal
```

Default `off` preserves all existing dev / CI workflows verbatim. No
existing test or operator workflow changes.

### Stealth-default order

| `KS_TLS_MODE` | `KS_STEALTH` | Stealth resolved |
|---------------|--------------|------------------|
| any           | `1` / `true` / `on`  | **on**          |
| any           | `0` / `false` / `off`| **off**         |
| `off`         | unset                 | **off** (dev convenience) |
| `self-signed` | unset                 | **on**          |
| `acme`        | unset                 | **on**          |

Rationale: production deployments (TLS enabled) should hide by default.
Dev (TLS off) wants verbose 401s for debugging, not nginx-shaped 404s.
Explicit `KS_STEALTH` always wins so operators can override either way.

### Library choices

#### TLS: `tokio-rustls` via `axum-server`
- `axum-server` (0.7) integrates rustls + axum in one crate; alternatives
  (`hyper-rustls` + manual axum service) require ~50 lines of glue per
  listener.
- `rustls` (0.23) is pure Rust, no OpenSSL/BoringSSL/aws-lc-sys
  build-time deps. Single dynamic-linker dep (none).
- `default-features = false, features = ["ring", "std"]` — `ring` is
  the smaller, more portable provider; `aws-lc-rs` requires cmake +
  aws-lc-sys at build time. We don't need FIPS today.

#### Cert generation: `rcgen` (0.13)
- Pure Rust self-signed cert generation. Used for `self-signed` mode
  and (via instant-acme's `rcgen` feature) the CSR in `acme` mode.
- Alternatives (`openssl req -x509`, `mkcert`) are subprocess-based.

#### ACME: `instant-acme` (0.8) with `rcgen` feature
- Pure Rust, async-native, small surface (~3 KB main API).
- Alternatives (`acme-lib`, `acme-client`, `certbot` shell-out) bring
  OpenSSL or process management.
- `rcgen` feature lets `Order::finalize()` generate the CSR + key
  internally; otherwise we'd need to manually wire rcgen + the `_csr`
  variant.

#### Challenge: HTTP-01 only for v1
DNS-01 is rejected because:
- No generic Rust DNS-provider abstraction; every provider (Cloudflare,
  Route53, Google DNS, etc.) needs custom code.
- Wildcard certs (the main DNS-01 advantage) aren't on our roadmap.
- Operationally, HTTP-01 just needs port 80 reachable — same firewall
  rule as serving HTTP.

When wildcard certs become a requirement (multi-tenant subdomain
deployments), revisit and add a `KS_ACME_DNS_PROVIDER` env. Until then,
HTTP-01.

### Cert storage

`KS_TLS_CACHE_DIR` (default `/var/lib/keyshield/tls`):
- `cert.pem` — leaf cert + chain, world-readable
- `key.pem` — private key, mode `0600`
- atomic write: `cert.pem.tmp` → rename, so a kill mid-write doesn't
  leave a half-written file the next boot reads as truncated

The directory is FHS-compliant for systemd unit deployments. Operators
running as non-root override via env to e.g. `~/.local/share/keyshield/tls`.

### Renewal

`run_renewal_loop` wakes every 24 h:
- `>30 d` remaining: log at DEBUG, do nothing.
- `7-30 d` remaining: run `obtain_certificate`. On success, atomic-save
  + hot-reload via `RustlsConfig::reload_from_pem`. On failure, log at
  ERROR and retry next wake.
- `<7 d` remaining: log at WARN every wake (pager-level signal that
  the renewal task is failing).

In-memory cert is the source of truth — disk is restart-survival
optimisation. Successful issuance with failed disk-save still serves
correctly until restart.

## Consequences

### Positive
- Single-binary deploys for production (no nginx).
- Stealth default-on means production listeners hide their application
  type without per-deployment configuration.
- Plain-HTTP dev path unchanged — every existing test still passes.

### Negative
- New deps: `axum-server`, `rcgen`, `rustls`, `instant-acme`. Compile
  time grows ~30s on cold cache. Acceptable trade.
- ACME mode requires `:80` reachable from the internet for HTTP-01
  challenges. Operators behind ingress controllers / load balancers
  need to either expose `:80` directly or front-load with a dedicated
  ACME orchestrator (cert-manager, Caddy) and pass certs via the
  cache dir.
- `:80` listener runs unauthed by design — anyone reaching it gets a
  challenge response or 404. The challenge handler is a 12-line scoped
  router; risk surface is bounded.

### Risk: rate-limit burn on cold restart
LE prod has a 50-cert/registered-domain/week limit. A flapping pod
that loses its cache dir issues a fresh cert each restart and burns
the limit fast.

Mitigation: cache dir defaults to a persistent FHS path; CI/staging
deployments must set `KS_ACME_DIRECTORY` to LE staging
(`acme-staging-v02.api.letsencrypt.org`). Documented in the operator
runbook follow-up.

## Alternatives considered

- **`native-tls`** — uses the platform TLS lib (SChannel on Windows,
  SecureTransport on macOS, OpenSSL on Linux). Adds a build-time dep
  on whatever the platform ships. Rejected: rustls works everywhere
  and produces hermetic builds.
- **`acme-lib`** — sync API, fewer maintainers, last release 2023.
- **`certbot` subprocess** — would require Python at runtime; defeats
  the single-binary goal.
- **External cert manager (cert-manager, Caddy)** — viable for k8s
  deployments and supported via the cache-dir read path (operator
  populates `cert.pem` + `key.pem` externally; we just serve it). Not
  a substitute for ks-proxy's own ACME path because solo-VM
  deployments shouldn't need a second piece of software.

## Out of scope (follow-ups)

- DNS-01 challenge for wildcard certs (needs DNS-provider abstraction)
- OCSP stapling (rustls 0.23 doesn't do it automatically; future once
  webpki-ocsp is stable)
- Cert rotation observability (Prometheus metrics on
  `last_renewal_success_ts`, `cert_expires_in_seconds`)
- Multi-domain SAN cert from a single ACME order (instant-acme
  supports it; spec 12 v1 is single-domain)
