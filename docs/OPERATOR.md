# KeyShield Operator Runbook

Day-2 operations reference for the production stack: ks-proxy (Rust)
and the v2-mvp Python backend. If you are reading this because
something is on fire, jump to the failure-mode tables in
[Failure modes](#failure-modes).

> Conventions
> - All env vars are namespaced `KS_*` unless they are upstream API
>   keys (`OPENAI_API_KEY`, `HELIUS_API_KEY`, etc.) or pre-existing
>   conventions (`PORT`, `SERVER_SECRET`).
> - "Hot path" = ks-proxy. "Backend" = v2-mvp Python.
> - All commands assume CWD is the repository root.

## Contents

1. [Deployment scenarios](#deployment-scenarios)
2. [Env var reference](#env-var-reference)
3. [Failure modes](#failure-modes)
4. [Rate-limit safety (ACME)](#rate-limit-safety-acme)
5. [Monitoring & alerting](#monitoring--alerting)
6. [Key rotation without downtime](#key-rotation-without-downtime)

---

## Deployment scenarios

Three flavors. Pick the one that matches your environment, then
cross-check against the env var reference for any tweaks specific to
your provider.

### Local-dev

Goal: hack on KeyShield without TLS, without LE, without payment
infrastructure. Everything is loopback, every secret is a stub.

```sh
# Hot path (Rust proxy)
export KS_BIND=0.0.0.0:8000           # plain HTTP — TLS off by default
export KS_TLS_MODE=off                # explicit; the implicit default is also off
export KS_INTERNAL_SECRET=             # empty → fail-open at :8001 (dev only)
export PYTHON_BACKEND_URL=http://127.0.0.1:8001
cargo run -p ks-proxy &

# Backend (Python)
cd v2-mvp
.venv/bin/python -m uvicorn src.server:app --reload --port 8001
```

Stealth defaults OFF. Verbose 401s help debugging. The
`KS_INTERNAL_SECRET=` empty-string sentinel disables the firewall
between ks-proxy and the Python backend — never do this in prod.

### Staging

Goal: dogfood the full TLS path against LE staging without burning
prod rate-limit, all observability hooked up, secrets rotated.

```sh
# ks-proxy
export KS_BIND=0.0.0.0:8000
export KS_TLS_MODE=acme
export KS_TLS_DOMAIN=staging.vault.example.com
export KS_TLS_CONTACT_EMAIL=ops@example.com
export KS_ACME_DIRECTORY=https://acme-staging-v02.api.letsencrypt.org/directory
export KS_TLS_CACHE_DIR=/var/lib/keyshield/tls
export KS_TLS_BIND=0.0.0.0:443
export KS_ACME_HTTP01_BIND=0.0.0.0:80
export KS_INTERNAL_SECRET="$(openssl rand -hex 32)"

# Backend
export KS_X402_BASE_RPC_URL=https://sepolia.base.org   # Base Sepolia testnet
export KS_X402_RECEIVER_ADDRESS=0x...                  # staging platform receiver
export KS_X402_VERIFY_REQUIRED=1                       # refuse stub-fallback
export MAX_TOPUP_USD=10
```

Two key differences from prod:
- `KS_ACME_DIRECTORY` points at LE staging — certs are not
  browser-trusted but rate limits are 30,000/week instead of 50.
- `KS_X402_BASE_RPC_URL` points at Base Sepolia (testnet) so test
  payments don't need real USDC.

### Production

Goal: real users, real money, real LE certs.

```sh
# ks-proxy
export KS_BIND=0.0.0.0:8000
export KS_TLS_MODE=acme
export KS_TLS_DOMAIN=vault.example.com
export KS_TLS_CONTACT_EMAIL=ops@example.com           # LE account contact
# KS_ACME_DIRECTORY unset → defaults to LE prod
export KS_TLS_CACHE_DIR=/var/lib/keyshield/tls        # MUST be on a persistent volume
export KS_TLS_BIND=0.0.0.0:443
export KS_ACME_HTTP01_BIND=0.0.0.0:80
export KS_STEALTH=1                                   # explicit; defaults on for ACME mode
export KS_INTERNAL_SECRET="$(cat /etc/keyshield/internal_secret)"
export SERVER_SECRET="$(cat /etc/keyshield/server_secret)"

# Backend
export KS_X402_BASE_RPC_URL=https://mainnet.base.org  # or Helius/Alchemy/Quicknode
export KS_X402_RECEIVER_ADDRESS=0x...                 # the platform's prod receiver
export KS_X402_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
export KS_X402_MIN_CONFIRMATIONS=5
export KS_X402_VERIFY_REQUIRED=1                      # NEVER unset in prod

# MPP on-chain settle (only if running spec 10 v1)
export KS_KEYSHIELD_PROGRAM_ID="$(cat /etc/keyshield/program_id)"
export KS_PLATFORM_USDC_ATA=...
export KS_MPP_SETTLER_KEY="$(cat /etc/keyshield/settler.b58)"
export KS_VAULT_PDA=...
```

Production checklist:
- [ ] `:80` reachable from the internet (LE polls during issuance).
- [ ] `KS_TLS_CACHE_DIR` on a persistent volume (NFS, EBS, etc.) so
      restart-survival is preserved. See [rate-limit safety](#rate-limit-safety-acme).
- [ ] `KS_INTERNAL_SECRET` provisioned out-of-band; never in git.
- [ ] `KS_X402_VERIFY_REQUIRED=1` to refuse stub-fallback.
- [ ] CORS_ORIGINS narrowed (default is `localhost:300x` for dev).
- [ ] Log shipping configured for `acme:` and `x402_verify:` prefixes
      (see [monitoring](#monitoring--alerting)).
- [ ] Key rotation playbook tested at least once in staging
      (see [key rotation](#key-rotation-without-downtime)).

---

## Env var reference

Alphabetical. "Default" lists the default value when unset; "When to
override" tells you what scenarios force the override.

### `CORS_ORIGINS`
Comma-separated list of origins allowed by the FastAPI CORS
middleware. Default expands to `http://localhost:3000,3001,3002,3003,3004,3005,4000,5173,5174,5175`
for dev. Override in prod to e.g. `https://app.example.com`.

Source: `v2-mvp/src/server.py:361`.

### `KS_ACME_DIRECTORY`
ACME directory URL. Default: `https://acme-v02.api.letsencrypt.org/directory`
(LE prod). Override to LE staging
(`https://acme-staging-v02.api.letsencrypt.org/directory`) for any
iteration testing — prod has a 50-cert/week per-domain limit.

Source: `proxy-rs/crates/ks-proxy/src/acme.rs:88`.

### `KS_ACME_HTTP01_BIND`
Address for the HTTP-01 challenge listener. Default: `0.0.0.0:80`.
Override when you can't bind `:80` (non-root, port taken). LE polls
this during issuance — operators behind a load balancer must
ensure `:80` is reachable from the public internet.

Source: `proxy-rs/crates/ks-proxy/src/main.rs:145`.

### `KS_BIND`
ks-proxy plain-HTTP listener address. Default: `0.0.0.0:8000`.
Active only when `KS_TLS_MODE=off`. Override for non-conventional
ports or to bind a single interface (`127.0.0.1:8000`).

Source: `proxy-rs/crates/ks-proxy/src/main.rs:25`.

### `KS_INTERNAL_SECRET`
Shared secret between ks-proxy and the Python backend at `:8001`.
ks-proxy stamps every internal call with this header; Python rejects
calls without it. **Empty string disables the check (dev mode);
production MUST set a 32-byte random value.**

Default: empty (fail-open). Override: always in any non-local
deployment.

Generate with `openssl rand -hex 32`. Rotation: see
[key rotation](#key-rotation-without-downtime).

Source: `proxy-rs/crates/ks-proxy/src/main.rs:36`, `v2-mvp/src/server.py:290`.

### `KS_KEYSHIELD_PROGRAM_ID`
On-chain Solana program ID for the KeyShield vault program. Default:
unset → MPP on-chain settle returns 503 "config incomplete." Override
when running spec 10 v1 (real on-chain MPP settles).

Example: `KSh1eLDp...` (whichever address you deployed to).

Source: `v2-mvp/src/mpp_onchain.py:172`.

### `KS_MPP_SETTLER_KEY`
Base58-encoded ed25519 secret key (64 bytes) for the MPP settler
account. The settler signs on-chain `mpp_settle` instructions on
behalf of the platform. **HANDLE LIKE PRIVATE KEYS** — never log,
never bake into images, fetch from a secret store at startup.

Default: unset → on-chain MPP returns 503. Override when spec 10 v1
is enabled.

Rotation: see [key rotation](#key-rotation-without-downtime).

Source: `v2-mvp/src/mpp_onchain.py:170`.

### `KS_PLATFORM_USDC_ATA`
Solana associated token account that receives USDC from MPP
settles. Default: unset → 503. Override when spec 10 v1 is enabled.

Example: `BvvVFwbB...` (the ATA derived from your platform owner +
USDC mint).

Source: `v2-mvp/src/mpp_onchain.py:171`.

### `KS_SOLANA_RPC_URL`
Solana RPC endpoint for MPP on-chain submission. Default: the
embedded `DEFAULT_RPC_URL` (`https://api.mainnet-beta.solana.com`).
Override when using a paid provider (Helius, QuickNode) — public
mainnet-beta has aggressive rate limits.

Source: `v2-mvp/src/mpp_onchain.py:238`.

### `KS_STEALTH`
Force stealth mode on or off. Accepts `1|true|on` (force-on) or
`0|false|off` (force-off). When unset, the resolver uses the
TLS-mode default:

| `KS_TLS_MODE` | Effective stealth (when `KS_STEALTH` unset) |
|---------------|---------------------------------------------|
| `off`         | OFF (verbose 401s for dev)                  |
| `self-signed` | ON                                          |
| `acme`        | ON                                          |

In stealth mode, unauth'd requests get a stock nginx 404 with a
`Server: nginx/1.24.0` header. See spec 12 §"Stealth-default order"
for the rationale.

Source: `proxy-rs/crates/ks-proxy/src/stealth.rs:96`.

### `KS_TLS_BIND`
TLS listener address. Default: `0.0.0.0:443`. Active when
`KS_TLS_MODE` is `self-signed` or `acme`. Override when running as
a non-root user without `CAP_NET_BIND_SERVICE` — set to e.g.
`0.0.0.0:8443` and front with a port-mapping ingress.

Source: `proxy-rs/crates/ks-proxy/src/tls.rs:144`.

### `KS_TLS_CACHE_DIR`
Where ks-proxy persists `cert.pem` + `key.pem` between restarts.
Default: `/var/lib/keyshield/tls`. **MUST be on a persistent volume
in production** — if it's on ephemeral storage, every restart issues
a fresh LE cert and burns the rate limit.

Override for non-FHS deployments to e.g. `~/.local/share/keyshield/tls`
when running as a non-root user.

Source: `proxy-rs/crates/ks-proxy/src/acme.rs:94`, `proxy-rs/crates/ks-proxy/src/tls.rs:152`.

### `KS_TLS_CONTACT_EMAIL`
Contact email for the LE account. Required when `KS_TLS_MODE=acme`.
LE sends renewal reminders here if the in-process renewal task
fails. Use a monitored ops mailbox, not a personal email.

Source: `proxy-rs/crates/ks-proxy/src/acme.rs:79`.

### `KS_TLS_DOMAIN`
The fully-qualified domain name to request a cert for. Required
when `KS_TLS_MODE=acme`. Must be reachable on `:80` from the public
internet (LE's HTTP-01 challenge fetches
`http://{domain}/.well-known/acme-challenge/{token}`).

Source: `proxy-rs/crates/ks-proxy/src/acme.rs:71`.

### `KS_TLS_MODE`
Three values: `off` (default — plain HTTP), `self-signed` (rcgen
self-signed cert; browsers will warn), `acme` (real LE cert).
Unknown values fall back to `off` with a WARN log so production
typos don't silently start with the wrong mode.

Source: `proxy-rs/crates/ks-proxy/src/tls.rs:75`.

### `KS_UPSTREAM_OVERRIDE_BASE`
Test-only knob: points every upstream (Helius, OpenAI, etc.) at the
override URL. Used by the oracle-diff harness to intercept all
egress with one mock server. Leave unset in prod.

Source: `proxy-rs/crates/ks-proxy/src/main.rs:46`, `v2-mvp/src/server.py:98`.

### `KS_USDC_MINT`
Solana mint address for USDC. Default: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
(USDC on mainnet-beta). Override only for testing against a custom
mint.

Source: `v2-mvp/src/mpp_onchain.py:235`.

### `KS_VAULT_DIR`
Where the Python backend persists vault entries (encrypted upstream
keys). Default: `v2-mvp/vault`. Override to a system path (`/var/lib/keyshield/vault`)
in production.

Source: `proxy-rs/crates/ks-proxy/src/main.rs:26`, `v2-mvp/src/vault.py:15`.

### `KS_VAULT_PDA`
The Solana PDA address derived from the keyshield program + the
vault seed. Required for MPP on-chain settles. Default: unset → 503.

Source: `v2-mvp/src/mpp_onchain.py:237`.

### `KS_X402_BASE_RPC_URL`
Base mainnet RPC URL for x402 payment verification. Examples:
`https://mainnet.base.org` (free tier), Helius/Alchemy/QuickNode for
production load. Default: unset → x402 falls back to stub mode
(verifies = True without on-chain check). **Production MUST set this.**

Source: `v2-mvp/src/x402_verify.py:124`.

### `KS_X402_MIN_CONFIRMATIONS`
Minimum block confirmations before a payment is accepted as final.
Default: 5 (matches Base finality recommendation). Override to 0
for testing or local anvil; raise to 12+ for high-value flows.

Source: `v2-mvp/src/x402_verify.py:160`.

### `KS_X402_RECEIVER_ADDRESS`
The platform's Base USDC receiver address (40-hex EVM, 0x prefix).
Required to enable real on-chain verify. Topups verify that the
proof-of-payment tx transferred USDC to **this** address; misconfig
here means accepted payments don't credit, OR worse, attacker-routed
payments to *their* receiver pass verification.

Default: unset → stub mode. Override: always in prod.

Source: `v2-mvp/src/x402_verify.py:125`.

### `KS_X402_USDC_ADDRESS`
The USDC contract address on Base. Default:
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Coinbase issuer USDC,
not the bridged USDC.e). Override only to test against custom token
contracts.

Source: `v2-mvp/src/x402_verify.py:151`.

### `KS_X402_VERIFY_REQUIRED`
Set to `1` to refuse stub-fallback. Production gate: even if the
other `KS_X402_*` vars are accidentally unset, this turns topups
into 400s rather than silently accepting any string as proof.

Default: `0` (allow stub-fallback for dev). **Production MUST set
to `1`.**

Source: `v2-mvp/src/x402_verify.py:180`.

### `MAX_TOPUP_USD`
Maximum dollar amount a single topup can credit. Default: `10`.
Raise carefully — large topups are an attractive target for
payment-proof forgery if any part of the verify chain breaks.

Source: `v2-mvp/src/server.py:55`.

### `PAYMENT_ADDRESS`
Legacy EVM payment address, only used by the SOL/Solana topup flows
and certain frontend dialogs. Default: zero address. Override to
your real payment address when running the embedded onramp.

Source: `v2-mvp/src/server.py:38`, `proxy-rs/crates/ks-proxy/src/handlers.rs:633`.

### `PYTHON_BACKEND_URL`
Where ks-proxy reaches the Python backend. Default:
`http://127.0.0.1:8001`. Override for split-host deployments
(ks-proxy on the edge, Python backend behind an ALB).

Source: `proxy-rs/crates/ks-proxy/src/main.rs:34`.

### `SERVER_SECRET`
Symmetric secret for HMAC-signing session cookies. Default: a
hardcoded sentinel that the bootstrap log line warns about. **MUST**
be rotated to a real 32-byte random value in any non-local
deployment.

Generate with `openssl rand -hex 32`. Rotation: any change to this
invalidates all live sessions; coordinate during a maintenance
window.

Source: `proxy-rs/crates/ks-proxy/src/main.rs:32`, `v2-mvp/src/session.py:17`.

### Upstream API keys
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`,
`COHERE_API_KEY`, `GROQ_API_KEY`, `HELIUS_API_KEY`, `ZEROX_API_KEY`,
`TITAN_API_KEY`, `PYTH_API_KEY`, `ALCHEMY_API_KEY`. Each is the
platform's API key for the corresponding upstream. ks-proxy reads
these by name to authenticate proxied requests on the user's behalf
(when no per-user key is stored in the vault).

Default: empty → that upstream returns 503 if proxied. Override for
each upstream you want enabled. Sources: `v2-mvp/src/server.py:63-74`.

---

## Failure modes

### TLS / ACME

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `EACCES on :443` at startup | non-root, no `CAP_NET_BIND_SERVICE` | systemd `AmbientCapabilities=CAP_NET_BIND_SERVICE` or set `KS_TLS_BIND=0.0.0.0:8443` and front with a port-mapping ingress |
| LE returns "no A record for {domain}" | DNS not pointing at the host | `dig {domain}` should resolve to the host's public IP; fix DNS first |
| LE returns 5xx fetching challenge | `:80` blocked by firewall or upstream LB | open `:80` for `*` origin during issuance, can close after; check `KS_ACME_HTTP01_BIND` matches the open port |
| Cert serves but browser warns | resolved IP serves a different cert (split-brain DNS, CDN) | check the cert chain matches the SAN: `openssl s_client -connect {domain}:443 -servername {domain} \| openssl x509 -text -noout` |
| Renewal task logs "rate limited" | too many issuances — usually because cache dir is ephemeral | mount `KS_TLS_CACHE_DIR` on a persistent volume; switch to LE staging until rate limit clears |
| `KS_TLS_MODE=acme but config invalid` WARN at startup | required env (`KS_TLS_DOMAIN` / `KS_TLS_CONTACT_EMAIL`) missing | proxy falls back to self-signed; export the required env vars and restart |
| Logs show `acme: cert expires in 5d — renewal CRITICAL` | renewal task has been failing | check `:80` reachability + LE service status; manual workaround: rm cert files in `KS_TLS_CACHE_DIR` and restart |

### x402 payment verification

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `/billing/topup` returns `stub-fallback` mode in prod | `KS_X402_BASE_RPC_URL` or `KS_X402_RECEIVER_ADDRESS` unset | export the missing var, restart Python backend; set `KS_X402_VERIFY_REQUIRED=1` to force fail-loud |
| Logs: `x402_verify: stub-fallback active — missing env: ...` | `KS_X402_VERIFY_REQUIRED` not set; payments aren't actually verified | export `KS_X402_VERIFY_REQUIRED=1` immediately |
| `VerifyError("only N confirmations, need M")` | tx is too fresh for `min_confirmations` | reduce `KS_X402_MIN_CONFIRMATIONS` only after risk review; otherwise client should retry after a few blocks |
| `VerifyError("RPC returned HTTP 429")` | rate-limited by RPC provider | upgrade to a paid endpoint, or rotate `KS_X402_BASE_RPC_URL` |
| `VerifyError("transaction not found on Base")` | tx hash is malformed, on a different chain, or hasn't propagated | client must re-send proof; if persistent, check that the receiver address on the client matches `KS_X402_RECEIVER_ADDRESS` exactly |
| 409 Conflict on `/billing/topup` | duplicate `payment_proof` (idempotency) | feature, not bug; the tx hash has already credited a user — same tx can never credit twice |
| `VerifyError("no matching USDC Transfer log to platform receiver")` | tx exists but transferred to a different address | client paid the wrong receiver, OR `KS_X402_RECEIVER_ADDRESS` is misconfigured — check both |

### MPP on-chain settle

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| 503 "MPP on-chain config incomplete" on settle endpoints | one of `KS_KEYSHIELD_PROGRAM_ID`, `KS_PLATFORM_USDC_ATA`, `KS_MPP_SETTLER_KEY`, `KS_VAULT_PDA` is unset | export the missing var; check startup logs for `mpp_onchain:` warnings |
| Settle submits but never confirms | RPC provider issue, or settler ran out of SOL for fees | check settler balance with `solana balance {pubkey}`; top up; check RPC health |
| `mpp_onchain: KS_MPP_SETTLER_KEY decoded to N bytes, expected 64` | wrong format — must be base58-encoded ed25519 secret key (the 64-byte form, not the 32-byte seed) | regenerate with `solana-keygen new -o /tmp/k.json && cat /tmp/k.json \| jq -r '.[]' \| ... \| base58` (or use `solders.Keypair.from_seed`) |

### Stealth / 401s

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Healthcheck against `/health` gets nginx 404 | stealth ON + healthcheck has no auth | either add a bearer token to healthchecks, or check via the internal `:8001` Python endpoint |
| Operator wants verbose 401s for debugging | stealth defaults ON for TLS modes | `KS_STEALTH=0` to force-off; remember to flip back |

---

## Rate-limit safety (ACME)

LE prod has hard limits:
- 50 certs / registered-domain / week
- 5 duplicate certs / week
- 5 failed validations / hour / domain
- 300 new orders / 3 hours / account

These tank fast on a flapping pod that loses its cert cache on every
restart. The mitigation order, strongest first:

1. **Persist `KS_TLS_CACHE_DIR`.** Mount a persistent volume (EBS,
   GP, NFS, hostPath) at the cache dir. The renewal task only runs
   if the on-disk cert is < 30 days old. Restart-survival is the
   single most important rate-limit safeguard.
2. **Use LE staging during development** — set
   `KS_ACME_DIRECTORY=https://acme-staging-v02.api.letsencrypt.org/directory`.
   Staging has 30,000 certs/week; you cannot burn it. Certs aren't
   browser-trusted, but the protocol path is identical.
3. **Use pebble for tests** — see `proxy-rs/crates/ks-proxy/tests/acme_pebble.rs`.
   Local docker, zero remote calls.
4. **One ACME replica per domain.** In a multi-replica deployment,
   only one pod should run with `KS_TLS_MODE=acme`; the others read
   from a shared cache dir or pull from a sidecar (cert-manager,
   Caddy). All replicas hammering LE simultaneously trips the
   account-level rate limit.
5. **Monitor `acme: rate limited`** in logs (see [monitoring](#monitoring--alerting));
   alert on every occurrence.

---

## Monitoring & alerting

ks-proxy and the Python backend both use `tracing` / `logging` with
prefix-style log lines. Ship logs to your aggregator and alert on:

### Log prefixes that matter

| Prefix | Source | When to alert |
|--------|--------|---------------|
| `acme:` | ks-proxy `acme.rs` | `error!` always; `warn!` for rate-limit; `cert expires in <7d — renewal CRITICAL` is page-worthy |
| `x402_verify:` | Python backend | `stub-fallback active` in prod, any `VerifyError` clustering |
| `mpp_onchain:` | Python backend | settler decode/balance errors; settle-submit errors |
| `stealth mode enabled` | ks-proxy startup | one-shot at boot — if absent on a TLS deployment, stealth got disabled |
| `KS_INTERNAL_SECRET is empty` | Python backend startup | this is a security-critical WARN — alert if it appears in any non-local environment |
| `ks-proxy startup config` | ks-proxy startup | log the resolved tls_mode + stealth_on; cross-check against expected per env |

### Suggested alert rules

- `count{prefix="acme:", level="error"} > 0 in 5m` → page (cert renewal failing)
- `match("acme:.*expires in [0-6]d")` → page (cert expiring imminently)
- `match("x402_verify:.*stub-fallback")` in prod env → page (verification disabled)
- `count{prefix="x402_verify:", message=~"VerifyError"} > 50 in 5m` → ticket (clients hitting wrong receiver, or attack)
- `count{event="topup", duplicate=true} > 100 in 1h` → ticket (suspicious replay activity)
- `match("KS_INTERNAL_SECRET is empty")` in any non-local env → page

### What to graph

- `tls_cert_days_remaining` — derived from `bundle.days_until_expiry()`.
  Currently log-only; spec 12 §"Out of scope" calls out a future
  Prometheus exporter.
- `topup_count` by `verified_mode` — should be 100% `real` in prod;
  any `stub-fallback` is a misconfig.
- `acme_renewal_attempts` — should be at most 1 every ~60 days per
  domain. More means the renewal task is failing and retrying.

---

## Key rotation without downtime

Three secrets need periodic rotation. Each section assumes the
deployment runs at least 2 replicas behind a load balancer; a
single-replica deployment will need a brief restart for any
rotation.

### `KS_INTERNAL_SECRET`

Rotates the shared HMAC between ks-proxy and the Python backend.

**Approach: dual-secret window.**

1. Generate new secret: `NEW=$(openssl rand -hex 32)`.
2. Roll Python backend first with the new secret accepting **both**
   old and new (requires a code change to accept a comma-separated
   list — track in the rotation playbook before this is possible).
   For now, the mechanism is: **planned brief inconsistency window**.
3. Update ks-proxy replicas one by one (rolling restart) with
   `KS_INTERNAL_SECRET=$NEW`. Requests in-flight with the old
   secret will get 401 from the Python backend — bounded to the
   restart window (~few seconds per replica).
4. Once all ks-proxy replicas have the new secret, retire the old
   one from Python by removing it from the accepted list.

**Future improvement (TODO):** add `KS_INTERNAL_SECRET_PREVIOUS` to
let the Python backend accept both during the rotation. Until that
ships, schedule rotations during a low-traffic window.

### `KS_MPP_SETTLER_KEY`

Rotates the on-chain settler keypair. This is a Solana account that
must hold SOL for fees and (possibly) be a recognized authority on
the keyshield program PDA.

1. Generate the new keypair with `solana-keygen new`.
2. **Fund the new keypair with SOL** for tx fees (~0.05 SOL is
   plenty for a week of activity).
3. **Update on-chain authority** (if your keyshield program has a
   "settler authority" field): submit an admin instruction that
   adds the new pubkey as a recognized settler. This is program-
   specific — check the program's IDL.
4. Roll Python replicas with the new `KS_MPP_SETTLER_KEY`. New
   settles use the new key.
5. After all replicas have rotated and no in-flight txs use the
   old key, **revoke the old authority** on-chain.
6. Drain the old keypair's SOL back to the platform treasury.

The on-chain authority update is the hard part — do not just swap
the env var without updating the on-chain ACL, or settles will
start failing with "signer not authorized" errors.

### `KS_X402_RECEIVER_ADDRESS`

This is special: changing it is **client-coordinated**. Existing
clients have the old receiver hard-coded in their payment flow and
will continue paying to it. New payments to the new receiver verify
fine; payments to the old receiver get `VerifyError("no matching")`.

**Recommended migration:**

1. Keep the old receiver active for a deprecation window
   (typically 30 days).
2. Add a comma-separated list mode to `KS_X402_RECEIVER_ADDRESS`
   accepting either receiver as valid (currently a TODO — track in
   the rotation playbook).
3. Notify clients of the new receiver via your usual channel
   (Discord announcement, email, dashboard banner).
4. After the deprecation window, switch to the new receiver only.

**For now (single-receiver mode):** schedule rotation as a
maintenance window. Notify clients ahead of time, flip the env var,
restart the backend. Clients with the old receiver hard-coded will
fail topups until they update — this is by design (you don't want
to silently accept payments to an address you no longer control).

### `SERVER_SECRET` (session HMAC)

Rotating this invalidates all live sessions. Schedule during a
maintenance window:

1. Notify users (banner, email).
2. Set the new `SERVER_SECRET`, restart all replicas.
3. Users will be logged out and need to re-authenticate. Expected.

There is no zero-downtime rotation for HMAC-signed session cookies
without dual-key support, which is intentional out of scope for
v1 — the security cost of accepting old-key cookies during the
rotation outweighs the UX cost of re-login.

---

## Quick reference: emergency runbook

> "Production is down at 3am, what do I check?"

1. **`acme: cert expires in <Nd — renewal CRITICAL`** in logs?
   - Check `:80` open from internet: `curl -v http://{domain}/.well-known/acme-challenge/test` (404 with nginx Server header is OK).
   - Check LE status: https://letsencrypt.status.io/.
   - Manual workaround: `rm /var/lib/keyshield/tls/{cert,key}.pem && systemctl restart ks-proxy` — runs fresh issuance.
2. **`x402_verify: stub-fallback active`**?
   - Check `KS_X402_BASE_RPC_URL` and `KS_X402_RECEIVER_ADDRESS` are set on the Python backend host.
   - Set `KS_X402_VERIFY_REQUIRED=1` and restart — preferable to failing topups than to silently accepting unverified payments.
3. **All requests returning nginx 404?**
   - You're in stealth mode. Either you forgot the bearer token, or the bearer token rotated.
   - Quick smoke: `curl -v https://{domain}/health -H "Authorization: Bearer $TOKEN"` should return JSON, not nginx HTML.
4. **`mpp_onchain: ... 503 config incomplete`**?
   - Backend hasn't loaded the MPP env. Check all four: `KS_KEYSHIELD_PROGRAM_ID`, `KS_PLATFORM_USDC_ATA`, `KS_MPP_SETTLER_KEY`, `KS_VAULT_PDA`.
5. **Persistent connection refused on `:443`?**
   - Check `axum_server` startup log line: `ks-proxy listening on https://...`. If absent, `KS_TLS_MODE` is misconfigured (probably `off`).

For anything not covered, escalate to engineering and capture the
full startup log line `ks-proxy startup config` plus the first
`error!` after it.
