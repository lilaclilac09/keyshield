# Spec 12 — KeyShield Production HTTPS

## What user does

1. Operator deploys ks-proxy to a host with DNS pointing at it (e.g.
   `vault.example.com → 1.2.3.4`). Sets three env vars:
   ```
   KS_TLS_MODE=acme
   KS_TLS_DOMAIN=vault.example.com
   KS_TLS_CONTACT_EMAIL=ops@example.com
   ```
2. ks-proxy starts. On first boot:
   - Binds `:80` for ACME HTTP-01 challenges
   - Asks Let's Encrypt for a cert; LE polls `:80` to verify domain ownership
   - Saves cert to `/var/lib/keyshield/tls/{cert,key}.pem`
   - Binds `:443` with that cert
3. Client opens `https://vault.example.com` in a browser → real
   browser-trusted TLS, no warnings.
4. Random scanner hits `https://vault.example.com/admin` without a
   bearer token → sees `Server: nginx/1.24.0` and a stock nginx 404.
5. Cert renews automatically at <30 days remaining; restart not
   required (hot-reload via `RustlsConfig::reload_from_pem`).

## Where it lives

- TLS framework: `proxy-rs/crates/ks-proxy/src/tls.rs`
- ACME flow: `proxy-rs/crates/ks-proxy/src/acme.rs`
- Stealth default: `proxy-rs/crates/ks-proxy/src/stealth.rs`
- Wire-up: `proxy-rs/crates/ks-proxy/src/main.rs`
- Decisions: `proxy-rs/ADR-007-tls-and-stealth.md`

## Three modes

### `KS_TLS_MODE=off` (default)
Plain HTTP on `KS_BIND` (default `0.0.0.0:8000`). Identical to all
prior behaviour — no test, dev script, or operator workflow changes.
Stealth defaults OFF (verbose 401s help debugging).

### `KS_TLS_MODE=self-signed`
Generates a fresh self-signed cert at startup via `rcgen`. Useful for:
- Docker-compose smoke tests verifying TLS plumbing without LE
- Internal staging where operators are OK clicking through
  certificate warnings
- CI where we want to assert the TLS handshake works

Listens on `KS_TLS_BIND` (default `0.0.0.0:443`). Stealth defaults ON.
Cert lasts as long as the process; not persisted.

### `KS_TLS_MODE=acme`
Full Let's Encrypt path:
1. Reads `KS_TLS_DOMAIN`, `KS_TLS_CONTACT_EMAIL`, optional
   `KS_ACME_DIRECTORY` (defaults to LE prod), optional
   `KS_TLS_CACHE_DIR` (defaults to `/var/lib/keyshield/tls`).
2. Loads any cached `{cert,key}.pem` from cache dir; if cert has
   ≥30 days validity, reuses without contacting LE (preserves rate-limit).
3. Otherwise:
   - Spawns the `:80` HTTP-01 challenge listener
     (`/.well-known/acme-challenge/:token`)
   - Calls `obtain_certificate`: account creation, order, challenge
     ready, finalize, certificate fetch
   - Atomic-saves the cert bundle to cache dir
4. Binds `:443` with the cert.
5. Spawns `run_renewal_loop`: wakes every 24h, renews at <30d,
   hot-reloads via `RustlsConfig::reload_from_pem`.

Stealth defaults ON.

## Stealth-default order

| `KS_TLS_MODE` | `KS_STEALTH` | Effective stealth |
|---------------|--------------|--------------------|
| any           | `1`/`true`/`on`     | on  (explicit)    |
| any           | `0`/`false`/`off`   | off (explicit)    |
| `off`         | unset                | off (dev default) |
| `self-signed` | unset                | on  (TLS default) |
| `acme`        | unset                | on  (TLS default) |

Explicit always wins. Operators flipping `KS_STEALTH=0` on a TLS
listener (e.g. for verbose debugging) get verbose 401s instead of
nginx fingerprint.

## Env contract

Required for `KS_TLS_MODE=acme`:
- `KS_TLS_DOMAIN` — FQDN. Must be reachable on `:80` from the internet.
- `KS_TLS_CONTACT_EMAIL` — for the LE account.

Optional:
- `KS_TLS_BIND` — TLS listener address (default `0.0.0.0:443`)
- `KS_ACME_DIRECTORY` — ACME directory URL (default LE prod). Use
  `https://acme-staging-v02.api.letsencrypt.org/directory` for testing.
- `KS_ACME_HTTP01_BIND` — challenge listener (default `0.0.0.0:80`)
- `KS_TLS_CACHE_DIR` — cert persistence (default `/var/lib/keyshield/tls`)

## Failure modes

| Symptom | Likely cause | Operator action |
|---------|--------------|-----------------|
| ks-proxy fails to start with "EACCES on :443" | non-root, no CAP_NET_BIND_SERVICE | systemd `AmbientCapabilities=CAP_NET_BIND_SERVICE` or use `KS_TLS_BIND=0.0.0.0:8443` + a port-mapping front |
| LE returns "no A record for {domain}" | DNS not pointing at the host | check `dig {domain}` returns the host's IP |
| LE returns "5xx fetching challenge" | `:80` blocked by firewall or upstream LB | open `:80` for `*` origin during issuance, can close after |
| Cert serves but browser still warns | resolved IP serves a different cert (split-brain DNS, cdn) | check the cert chain matches the SAN in cert.pem |
| Renewal task logs "rate limited" | restarted too often without persistent cache dir | mount KS_TLS_CACHE_DIR on a persistent volume |

## Rate-limit safety

LE prod allows 50 certs / registered-domain / week. To avoid burning:
- Use staging during development: `KS_ACME_DIRECTORY=https://acme-staging-v02.api.letsencrypt.org/directory`
- Persist `KS_TLS_CACHE_DIR` between restarts
- Scale-out deployments: only one replica should run `KS_TLS_MODE=acme`;
  others read pre-issued certs from a shared cache dir or a sidecar
  cert-manager.

## Out of scope (v1)

- DNS-01 challenge / wildcard certs — needs a DNS-provider abstraction
  that doesn't exist in the Rust ecosystem yet
- OCSP stapling — depends on webpki-ocsp stabilising
- Multi-domain SAN certs — instant-acme supports it; UX choice deferred
- Metric export (`tls_cert_expires_in_seconds`) — Stage 3 observability
  pillar
