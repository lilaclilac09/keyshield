# KeyShield Protocol Specification

**Version:** 0.1  
**Status:** Draft — reconciled against the code on `main` (2026-10)  
**Full design:** [docs/architecture/system-design.md](docs/architecture/system-design.md)

Every normative statement below carries a status marker so the spec
cannot silently drift from the code again:

| Marker | Meaning |
|---|---|
| ✅ | Implemented and reachable on `main` |
| ⚠️ | Partially implemented, or implemented with a caveat described inline |
| 📋 | Target behaviour — not implemented yet |

Section [10](#10-implementation-status--known-gaps) lists every gap in one place.

---

## 1. Problem

AI agents require API credentials to call upstream providers (OpenAI, Anthropic, Helius, …). The current default — pasting raw keys into `.env` files or agent configs — means:

- Keys are copied across machines, tools, and teammates
- Revoking access requires rotating the key at the provider, breaking every consumer
- There is no per-agent spending cap or audit trail

KeyShield defines a protocol for **agent credential delegation**: agents receive session tokens, not long-lived raw keys in config. Raw keys live in a vault and are exposed to the upstream call path for one request at a time.

---

## 2. Core Primitives

| Primitive | Description | Status |
|---|---|---|
| **Vault (Path A — Device Vault)** | Client-side encrypted store. The dashboard derives an AES-256-GCM key from a WebAuthn PRF output (HKDF) and pushes **ciphertext only** to the Cloudflare sync worker (`src/infra/sync-worker/`, R2-backed). The worker cannot decrypt. | ✅ |
| **Vault (compatibility shim)** | `POST /manage/store` on the Python control plane writes to SQLite (`src/backend/data/vault_shim.db`). The `value` column is **plaintext**; `cipher`/`iv`/`cipher_v` are populated instead when the browser extension encrypts first (AES-256-GCM, key = HKDF(wallet signature)). Server-side key injection (`/vproxy/*`, Rust Helius fast path) can only use plaintext rows. **Not zero-knowledge by design.** | ⚠️ |
| **Session token** | Bearer token minted by the Python control plane after a wallet, passkey, or agent login. HMAC-SHA256 signed, 24 h TTL by default. Stored server-side so it can be revoked. | ✅ |
| **Proxy** | Reverse proxy that injects the upstream key and forwards one request. Two implementations exist (§6): the Python FastAPI routes (`/proxy/*`, `/vproxy/*`) and the Rust `ks-proxy` hot path. They have **different auth contracts**. | ⚠️ |

---

## 3. Vault Encryption Model

### 3.1 Path A — Device Vault (zero-knowledge) ✅

Keys are encrypted in the user's browser before transmission:

```
WebAuthn PRF output
    │
    └── HKDF-SHA256 → 32-byte AES-256-GCM master key
    │                  (separate HKDF info string → opaque 16-byte vault ID)
    │
    └── AES-256-GCM encrypt(vault JSON, random 12-byte IV) → ciphertext + tag
```

The sync worker receives and stores only `{ ciphertext, iv, tag, updatedAt }` under `/vault/:id`, gated by a short-lived JWT obtained through a WebAuthn assertion exchange (`/auth/register`, `/auth/challenge`, `/auth/exchange`). Writes use compare-and-swap on `updatedAt` (409 on conflict). Decryption requires the user's passkey — the server cannot decrypt at rest.

Implementation: `src/web/lib/{vault,sync,sync-auth,vault-session}.ts`, `src/infra/sync-worker/src/`. Wire format: [docs/technical/SYNC_VAULT_ARCHITECTURE.md](docs/technical/SYNC_VAULT_ARCHITECTURE.md).

### 3.2 Compatibility shim — `/manage/*` ⚠️

```
POST   /manage/store         upsert { id?, name, type, upstream, value, tags, expiry_days, cipher?, iv?, cipher_v? }
GET    /manage/vault         list (values masked)
GET    /manage/decrypt/{id}  return the plaintext `value`  ← local-dev only by intent
PUT    /manage/vault/{id}    partial update
DELETE /manage/vault/{id}    delete
```

- Caller identity is the Bearer session, or the `X-Dev-Mode: 1` header **when `KS_DEV_MODE` is enabled**. Without that env flag the header is ignored (401).
- `GET /manage/decrypt/{id}` returns plaintext from the shim **only when `KS_DEV_MODE` is on**; otherwise 403.
- The request field is **`value`**. `apiKey` / `api_key` are accepted as aliases.
- The browser extension encrypts client-side when the dashboard has pushed it a vault key (`src/web/lib/vault-key.ts`: wallet signature over `KeyShield Vault Key Derivation v1` → HKDF-SHA256 → AES-256-GCM) and sends `cipher`/`iv`/`cipher_v: 1` with no `value`; without a registered key it falls back to plaintext `value`. Encrypted rows are decrypted by the extension only — `/vproxy/*` and the Rust fast path select `value != ''` and skip them.
- Legacy `.enc` vault files (AES-256-GCM, PBKDF2 — the `v2-mvp` format read by `ks-vault`) have no writer in the current codebase.

---

## 4. Session Token

### 4.1 Current format ✅

```
<base64url(payload)>.<base64url(HMAC-SHA256(payload, SHA-256(SERVER_SECRET)))>
```

Payload (plain JSON, readable by the holder):

```json
{ "uid": "<user_id>", "exp": 1700000000, "iat": 1699996400, "nbf": 1699996400,
  "aid": 12, "provider": "openai", "scope": ["openai"], "spend_cap_usd": 10.0, "vault_key_id": "ks_…" }
```

Optional delegated claims (`aid`, `provider`, `scope`, `spend_cap_usd`, `vault_key_id`) are included when minted by `/auth/agent-login`. Owner wallet/passkey tokens omit them and keep full access.

- `uid` is the Solana wallet address (wallet login), the passkey user id, or — for agent login — the **owner's** wallet address.
- The token is valid only while a matching row exists in `sessions.db` and `exp` has not passed, so deleting the row revokes it immediately.
- An agent token with `aid` is rejected as soon as that agent is on the CRL (`DELETE /agents/{id}`), even if the session row is still present.
- A missing `SERVER_SECRET` falls back to an insecure default with a warning; set it in every deployment.
- The `ksv2_…` prefix is still not emitted (📋).

Implementation: `src/backend/auth/session.py`; read-only mirror in `src/proxy/crates/ks-session` (Rust does not yet parse the extra claims).

### 4.2 Scoped token ⚠️

Optional claims on the HMAC payload (not a `ksv2_` wrapper):

```json
{
  "uid": "<owner_wallet>",
  "aid": 12,
  "vault_key_id": "<provider_key_ref>",
  "provider": "openai",
  "scope": ["openai"],
  "spend_cap_usd": 10.00,
  "exp": 1700000000,
  "iat": 1699996400,
  "nbf": 1699996400
}
```

Python `/proxy` and `/vproxy` enforce `provider`, `scope`, and `spend_cap_usd`. Rust `ks-proxy` still treats every valid session as owner-wide (📋). The `ksv2_…` prefix is not emitted.

---

## 5. Delegation

### 5.1 Current behaviour ✅

An owner registers an agent's ed25519 public key (`POST /agents/register`, stored in `agent_keys` with a free-form `scopes` string). The agent then authenticates:

```
POST /auth/agent-challenge              → { challenge, nonce }
POST /auth/agent-login                  → { token, aid, provider, scope, spend_cap_usd }
     body: { pubkeyB58, signature, challenge, nonce,
             provider?, scope?, spend_cap_usd?, vault_key_id? }
```

- The signature **is required** for agent login (401 without it). Wallet login now also requires a signature (S1).
- The returned token is minted for the **owner's wallet** and carries `aid` plus any requested `provider` / `scope` (must be a subset of the registration) / `spend_cap_usd` / `vault_key_id`.
- Revoking the agent (`DELETE /agents/{id}`) writes the CRL and deletes the registration row. `session.get()` returns `None` for that `aid` on the next request — independent of the owner's other sessions.

### 5.2 Target behaviour (remaining) 📋

- Rust `ks-proxy` also enforces `provider` / `scope` / `spend_cap_usd`
- `ksv2_` encoding
- Path-level scopes such as `chat.completions` (substring match works today; not a formal ACL)

Agent code receives only a token. Which component ultimately holds the raw key depends on the proxy path (§6).

```python
# Target developer experience. packages/sdk-py currently targets removed
# endpoints and does not send X-Upstream-API-Key — see §10.3.
from keyshield import KeyShield

ks = KeyShield("http://localhost:8001", token=os.environ["KS_TOKEN"])
client = ks.openai_client()              # OpenAI SDK pointed at /proxy/openai/
```

---

## 6. Proxy Request Flow

Three entry points exist. Pick the one that matches the deployment.

### 6.1 Python `/proxy/{upstream}/{path}` — Path A, stateless ✅

```
Client → POST /proxy/openai/v1/chat/completions
         Authorization: Bearer <session>          (optional — used for usage attribution)
         X-Upstream-API-Key: <raw key>            (required — 401 if missing)

Proxy:
  1. Read the upstream key from the header (never persisted or logged)
  2. Enforce delegated claims if the session has `provider` / `scope` / `spend_cap_usd` / `aid`
  3. Resolve provider config (base URL, auth style)
  4. Serve from the in-memory TTL cache if the call is cacheable (§8)
  5. Forward to upstream; retry once through the x402 interceptor on 402
  6. Record usage (tokens, cost, latency, agent_id) against the session user
  7. Return the upstream response with `x-ks-cache: HIT|MISS`
```

The **client** decrypts the vault entry (Path A) and sends the raw key per request. The server holds it for one round-trip only. Consequence: in this path the agent process does see the raw key in memory; "never sees the key" holds for the server, not the agent.

### 6.2 Python `/vproxy/{upstream}/{path}` — shim lookup ✅

Same as 6.1, but the key is resolved server-side from `vault_items` by `(user_id, upstream)` and the client sends only the Bearer token. Only plaintext rows qualify (`value != ''`); returns `422` if no usable key is stored. Response carries `x-ks-key-type: vault`.

### 6.3 Rust `ks-proxy` `/proxy/{upstream}/{path}` — hot path ⚠️

```
Client → POST /proxy/helius/
         Authorization: Bearer <session>          (required — 401 if missing)
         X-Upstream-API-Key: <raw key>            (optional — Path A; used if present)

ks-proxy:
  1. Validate the session against sessions.db (read-only)
  2. If X-Upstream-API-Key is set, use it (key type `user`)
  3. helius: ks-helius cached_call (header key or vault_shim.db) for the curated method list
  4. Otherwise resolve: legacy .enc vault entry → platform env key → 401 if neither
  5. Platform key + zero balance → 402 with an x402 payment-required body
  6. Forward, add x-ks-cache / x-ks-key-type, fire-and-forget usage log to Python
  7. Everything that is not /proxy/* or /manage/batch falls through to Python
```

- Path A header injection works on both Python and Rust.
- Only reachable in local development (`:8000`). Production (dashboard → Railway FastAPI, sync worker on Cloudflare) does not deploy `ks-proxy`.
- Does not yet enforce delegated `provider` / `scope` / `spend_cap_usd` claims (Python does).

Raw key exists in server memory for the duration of one upstream HTTP round-trip in all three paths.

---

## 7. Revocation

| Action | Effect | Status |
|---|---|---|
| `POST /auth/logout` | deletes the caller's session row — token is rejected on the next request | ✅ |
| `DELETE /sessions/{token_prefix}` | revoke another session of the same user | ✅ |
| `POST /auth/delete-account` | deletes all sessions and tombstones the user in `deleted_users` | ✅ (Python) ⚠️ (`ks-session` checks the sessions table but not `deleted_users`) |
| `DELETE /agents/{id}` | blocks future agent logins **and** rejects already-issued tokens with that `aid` | ✅ |
| Per-provider "revoke all tokens" (key rotation equivalent) | — | 📋 |
| Independent revocation of a delegated token | next request 401 via CRL + `aid` | ✅ |

`GET /sessions` returns a `token_prefix` only (not the full bearer).

---

## 8. Supported Providers (v0.1)

| Provider | Python `/proxy` + `/vproxy` | Rust `ks-proxy` | Cacheable reads |
|---|---|---|---|
| OpenAI | ✅ `openai` | ✅ (platform/legacy key) | `GET /v1/models` (1 h), `POST /v1/embeddings` (24 h) |
| Anthropic | ✅ `anthropic` | ✅ | `GET /v1/models` (1 h) |
| Groq / Mistral / Cohere | ✅ | ✅ | — |
| Alchemy | ✅ | ✅ | — |
| Helius RPC / DAS / Enhanced | ✅ `helius`, `helius-rpc`, `helius-das`, `helius-enhanced` (routed by JSON-RPC method) | ✅ fast path for `getBalance`, `getAsset*`, `getSignaturesForAddress`, `getPriorityFeeEstimate`, `getLatestBlockhash`, `getTokenAccountBalance`, … | per-method TTLs, e.g. `getBalance` 5 s, `getAsset` 300 s, `getTransaction` 60 s |
| 0x, Titan, Pyth | — | ✅ (platform key) | — |

Cache characteristics:

- Both implementations cache **in memory only**. The Rust Helius client additionally deduplicates concurrent identical calls (single-flight). A disk tier is 📋.
- Writes (`sendTransaction`, `sendRawTransaction`, `simulateTransaction`) are never cached.
- Cache keys are canonical JSON of `(provider, method/route, params/body)`; the Rust and Python keys are byte-compatible.

---

## 9. Out of Scope (v0.1)

- Streaming beyond SSE passthrough
- Webhook endpoints
- Multi-hop delegation chains (depth > 1)
- Cross-user key sharing on the proxy path (`/share/*` metadata routes exist, but shared entries are not resolved by any proxy)
- Mobile client (`src/mobile/` is a scaffold)

---

## 10. Implementation status & known gaps

Verified against a running local stack (Python `:8001`, Rust `:8000`) on `main` at `e28c24830`.

### 10.1 Security (fixed this change)

| # | Finding | Fix |
|---|---|---|
| S1 | `POST /auth/wallet-login` minted a session without a signature | Signature + `walletAddress` are required; 401 otherwise |
| S2 | `X-Dev-Mode: 1` honoured in every environment | Only when `KS_DEV_MODE` is `1`/`true`/`yes`/`on` |
| S3 | `GET /health/mpp` echoed secret prefixes | Unauthenticated still, but values are booleans (`true`/`false`) |
| S4 | `GET /sessions` returned full bearer tokens | Response has `token_prefix` only |
| S5 | `/manage/decrypt/{id}` reachable in every deploy | 403 unless `KS_DEV_MODE` is on |

### 10.2 Protocol gaps (spec → code)

| Area | Spec target | Today |
|---|---|---|
| Token format | `ksv2_<base58>` | still `payload.hmac`; extra claims now ride in the JSON |
| Delegation | scoped subset + independent revocation | Python proxy + `aid` CRL ✅; Rust does not enforce claims 📋 |
| Spend cap | enforced by proxy | Python sums `usage_log` since `iat` ✅ |
| Path A through Rust | one proxy contract | Rust honours `X-Upstream-API-Key` ✅ |
| Disk cache tier | memory + disk | memory only |
| `/manage/*` removal | announced in older docs | kept as the extension shim; Path A is separate |

### 10.3 Broken developer surface (documentation ≠ code)

- `node dev.cjs` now starts `uvicorn src.backend.app:app` from the repo root (was `app:app` under `src/backend/` → `ImportError`).
- Vite serves the dashboard on **:3000** (`src/web/vite.config.ts`), not :5173 as DEVELOPMENT.md / docs/API.md still state.
- `POST /manage/store` accepts `value` and `apiKey` / `api_key`. SDKs and the CLI send both. `docs/API.md` may still show only `apiKey`.
- `packages/sdk-py` still calls `/auth/login` (403), `/manage/list`, `/manage/decrypt/{upstream}`, `/manage/secret/{upstream}`, `/manage/batch` — none exist on the Python backend. Its tests import `v2-mvp/src/*`, which was deleted (only `archive/v2-mvp/tests/` remains).
- `src/sdk/packages/cli` still targets some of those removed list/decrypt/secret endpoints.
- `pip install keyshield` installs an **unrelated** PyPI project; `keyshield-mcp` is not published.
- Referenced files that do not exist: `keyshield-cli.sh` (AGENTS.md, `GET /install.sh`), `src/_archive/web-v2/` (older AGENTS notes), `src/scripts/demo.sh` (`npm run demo`), `scripts/test-store-key.mjs` (Makefile — the file is under `src/scripts/`), `src/proxy/ADR-002-architecture.md`, `src/web/.env.production`, `frontend/` (`playwright.config.ts`), `landing/` (now `sites/landing/`).
- `AGENTS.md` trading stack: see that file's design-vs-code note.
- `proxy-helius/` is a stale snapshot; canonical crate is `src/proxy/crates/ks-helius`.
- `Makefile` `deploy` target still contains debug instrumentation writing to an absolute path under `/Users/aileen/…`.

### 10.4 Test & CI reality

| Suite | Result (local, 2026-10) |
|---|---|
| Rust proxy unit (`cargo test --lib`) | 27 passed |
| Rust proxy integration | depends on deleted `v2-mvp` seed scripts (`continue-on-error` in CI) |
| Solana program (lib unit) | CI job `program-tests` runs `cargo test --lib`; Mollusk needs `cargo build-sbf` (`continue-on-error`) |
| Python backend | FastAPI pinned `<0.140`; hardening tests cover S1–S5 |
| `packages/sdk-py`, `tests/integration` | collection errors (missing modules / fixtures) |
| TypeScript workspaces | agent-sdk 22, cli 68, goat-wallet 6 passed; sync-worker suite fails to load under workerd (`continue-on-error` in CI) |
| `src/web` typecheck | clean |
| UAT workflow | no-op stub |

---

*Full API reference: [docs/API.md](docs/API.md)*  
*Architecture deep-dive: [docs/architecture/system-design.md](docs/architecture/system-design.md)*
