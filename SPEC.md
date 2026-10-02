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

- The request field is **`value`** (not `apiKey`). A body with `apiKey` is accepted but stores an empty value.
- The browser extension encrypts client-side when the dashboard has pushed it a vault key (`src/web/lib/vault-key.ts`: wallet signature over `KeyShield Vault Key Derivation v1` → HKDF-SHA256 → AES-256-GCM) and sends `cipher`/`iv`/`cipher_v: 1` with no `value`; without a registered key it falls back to plaintext `value`. Encrypted rows are decrypted by the extension only — `/vproxy/*` and the Rust fast path select `value != ''` and skip them.
- Caller identity is the Bearer session, or the `X-Dev-Mode: 1` header, which maps to the shared user `default`. The dev-mode header is **not gated by environment** today (📋 gate it behind a `KS_DEV_MODE` flag, see §10).
- Legacy `.enc` vault files (AES-256-GCM, PBKDF2 — the `v2-mvp` format read by `ks-vault`) have no writer in the current codebase.

---

## 4. Session Token

### 4.1 Current format ✅

```
<base64url(payload)>.<base64url(HMAC-SHA256(payload, SHA-256(SERVER_SECRET)))>
```

Payload (plain JSON, readable by the holder):

```json
{ "uid": "<user_id>", "exp": 1700000000, "iat": 1699996400, "nbf": 1699996400 }
```

- `user_id` is the Solana wallet address (wallet login), the passkey user id, or — for agent login — the **owner's** wallet address.
- The token is valid only while a matching row exists in `sessions.db` and `exp` has not passed, so deleting the row revokes it immediately.
- A missing `SERVER_SECRET` falls back to an insecure default with a warning; set it in every deployment.

Implementation: `src/backend/auth/session.py`; read-only mirror in `src/proxy/crates/ks-session`.

### 4.2 Scoped token (target) 📋

The protocol target is a provider-scoped, capped token:

```json
{
  "sub": "<user_id>",
  "vault_key_id": "<provider_key_ref>",
  "provider": "openai",
  "scope": ["chat.completions"],
  "spend_cap_usd": 10.00,
  "exp": 1700000000,
  "iat": 1699996400
}
```

None of `vault_key_id`, `provider`, `scope`, or `spend_cap_usd` are carried by the current token, and the `ksv2_…` prefix used in older docs is not emitted anywhere. Today a token grants access to every upstream the user has a key for.

---

## 5. Delegation

### 5.1 Current behaviour ⚠️

An owner registers an agent's ed25519 public key (`POST /agents/register`, stored in `agent_keys` with a free-form `scopes` string). The agent then authenticates:

```
POST /auth/agent-challenge              → { challenge, nonce }
POST /auth/agent-login                  → { token }
     body: { pubkeyB58, signature, challenge, nonce }
```

- The signature **is required** for agent login (401 without it).
- The returned token is minted for the **owner's wallet** — it is indistinguishable from the owner's own session and carries no scope subset or spend cap.
- Revoking the agent (`DELETE /agents/{id}`) prevents *new* logins; tokens already issued stay valid until expiry or until the owner revokes sessions (§7).

### 5.2 Target behaviour 📋

- Scope is a strict subset of the owner's permissions, enforced by the proxy
- Spending cap is enforced against accumulated usage
- The delegated token is revocable independently of the owner's sessions, with the next request returning `401`

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
  2. Resolve provider config (base URL, auth style)
  3. Serve from the in-memory TTL cache if the call is cacheable (§8)
  4. Forward to upstream; retry once through the x402 interceptor on 402
  5. Record usage (tokens, cost, latency) against the session user
  6. Return the upstream response with `x-ks-cache: HIT|MISS`
```

The **client** decrypts the vault entry (Path A) and sends the raw key per request. The server holds it for one round-trip only. Consequence: in this path the agent process does see the raw key in memory; "never sees the key" holds for the server, not the agent.

### 6.2 Python `/vproxy/{upstream}/{path}` — shim lookup ✅

Same as 6.1, but the key is resolved server-side from `vault_items` by `(user_id, upstream)` and the client sends only the Bearer token. Only plaintext rows qualify (`value != ''`); returns `422` if no usable key is stored. Response carries `x-ks-key-type: vault`.

### 6.3 Rust `ks-proxy` `/proxy/{upstream}/{path}` — hot path ⚠️

```
Client → POST /proxy/helius/
         Authorization: Bearer <session>          (required — 401 if missing)

ks-proxy:
  1. Validate the session against sessions.db (read-only)
  2. helius only: look up the user's key in vault_shim.db and serve a curated
     JSON-RPC method list through ks-helius (moka cache + single-flight dedup)
  3. Otherwise resolve: legacy .enc vault entry → platform env key
     (OPENAI_API_KEY, HELIUS_API_KEY, …) → 401 if neither
  4. Platform key + zero balance → 402 with an x402 payment-required body
  5. Forward, add x-ks-cache / x-ks-key-type, fire-and-forget usage log to Python
  6. Everything that is not /proxy/* or /manage/batch falls through to Python
```

- Ignores `X-Upstream-API-Key`; the Path A client flow therefore does **not** work through the Rust proxy today.
- Only reachable in local development (`:8000`). The documented production topology (dashboard → Railway FastAPI, sync worker on Cloudflare) does not deploy `ks-proxy`.
- Fixtures: byte-parity "oracle" tests in `src/proxy/crates/*/tests` compare against the Python implementation.

Raw key exists in server memory for the duration of one upstream HTTP round-trip in all three paths.

---

## 7. Revocation

| Action | Effect | Status |
|---|---|---|
| `POST /auth/logout` | deletes the caller's session row — token is rejected on the next request | ✅ |
| `DELETE /sessions/{token_prefix}` | revoke another session of the same user | ✅ |
| `POST /auth/delete-account` | deletes all sessions and tombstones the user in `deleted_users` | ✅ (Python) ⚠️ (`ks-session` checks the sessions table but not `deleted_users`) |
| `DELETE /agents/{id}` | blocks future agent logins | ✅ |
| Per-provider "revoke all tokens" (key rotation equivalent) | — | 📋 |
| Independent revocation of a delegated token | — | 📋 (agent tokens are owner tokens, §5.1) |

`GET /sessions` currently returns the **full token string** of every active session to the caller; it should return only the prefix (📋).

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

### 10.1 Security — fix before any production use

| # | Finding | Where |
|---|---|---|
| S1 | `POST /auth/wallet-login` verifies the ed25519 signature **only if** a `signature` field is present. Omitting it mints a valid session for **any** wallet address. | `src/backend/routes/auth.py::wallet_login` |
| S2 | `X-Dev-Mode: 1` is honoured unconditionally on `/manage/*` and `/vproxy/*`, giving unauthenticated read/write/decrypt access to the shared `default` user's shim vault. | `routes/vault.py::_require_user_id`, `routes/proxy.py::vault_proxy_route` |
| S3 | `GET /health/mpp` is unauthenticated. When an env var is set it echoes the first 6 characters + length (`{val[:6]}… ({len} chars)`), including `SERVER_SECRET` and `KS_MPP_SETTLER_KEY`. Unset vars return `null`. | `routes/health.py` |
| S4 | `GET /sessions` returns full bearer tokens for every session of the user. | `routes/sessions.py` |
| S5 | `/manage/decrypt/{id}` returns plaintext from the shim; it is reachable in every deployment that exposes `/manage/*`. | `routes/vault.py` |

### 10.2 Protocol gaps (spec → code)

| Area | Spec target | Today |
|---|---|---|
| Token format | `ksv2_<base58>` with provider / scope / spend cap | `payload.hmac`, `{uid, exp, iat, nbf}` only |
| Delegation | scoped subset + independent revocation | agent receives an owner-equivalent token |
| Spend cap | enforced by proxy | tracked in `usage` tables; x402 402 only on platform keys in `ks-proxy` |
| Path A through Rust | one proxy contract | Rust ignores `X-Upstream-API-Key` |
| Disk cache tier | memory + disk | memory only |
| `/manage/*` removal | announced in AGENTS.md / roadmap | routes restored in `59c8bebac` and still used by the extension |

### 10.3 Broken developer surface (documentation ≠ code)

- `node dev.cjs` starts the backend with `uvicorn app:app` from `src/backend/` → `ImportError: attempted relative import` (`app.py` uses relative imports; the working command is `uvicorn src.backend.app:app` from the repo root).
- Vite serves the dashboard on **:3000** (`src/web/vite.config.ts`), not :5173 as README / DEVELOPMENT.md / docs/API.md state.
- `docs/API.md`, the dashboard Developer tab, and both Python SDKs send `apiKey` to `/manage/store`; the backend reads `value`.
- `packages/sdk-py` calls `/auth/login` (returns 403), `/manage/list`, `/manage/decrypt/{upstream}`, `/manage/secret/{upstream}`, `/manage/batch` — none exist on the Python backend. Its tests import `v2-mvp/src/*`, which was deleted (only `archive/v2-mvp/tests/` remains).
- `src/sdk/packages/cli` (TypeScript) targets the same removed endpoints.
- `pip install keyshield` installs an **unrelated** PyPI project; `keyshield-mcp` is not published.
- Referenced files that do not exist: `keyshield-cli.sh` (AGENTS.md, `GET /install.sh`), `src/_archive/web-v2/` (AGENTS.md), `src/scripts/demo.sh` (`npm run demo`), `scripts/test-store-key.mjs` (Makefile — the file is under `src/scripts/`), `src/proxy/ADR-002-architecture.md`, `src/web/.env.production`, `frontend/` (`playwright.config.ts`), `landing/` (now `sites/landing/`).
- `AGENTS.md` §3–§11 describe a trading stack that only partly exists. Missing: `trading.feeds` (`PythFeed`, `PRICE_IDS`), `JupiterRouter`, `MonitorAgent`, `parallel_quote_and_analyze()`, the `src.backend.trading.agent` entrypoint. Present: `trading.market_data` (`PriceFeed`, `PriceSignal`, `MarketDataAgent`), `trading.analysis` (`ModelRouter`, `TaskType`, `AnalysisAgent`), `trading.execution` (`ZeroXRouter`, `TitanExecutor`, `ExecutionAgent`), `trading.risk`, `trading.orchestrator` (no `__main__`). The same file states `/manage/*` was removed; it was not.
- `proxy-helius/` is a diverged copy of `ks-helius` outside both Cargo workspaces; nothing builds it.
- `Makefile` `deploy` target still contains debug instrumentation writing to an absolute path under `/Users/aileen/…`.

### 10.4 Test & CI reality

| Suite | Result (local, 2026-10) |
|---|---|
| Rust proxy unit (`cargo test --lib`) | 27 passed |
| Rust proxy integration | depends on deleted `v2-mvp` seed scripts (`continue-on-error` in CI) |
| Solana program (Mollusk) | needs `cargo build-sbf`; **not run by any CI job** |
| Python backend | 8 passed, 21 skipped (legacy), 1 failed — `test_routes_register` breaks on FastAPI ≥ 0.142 (`_IncludedRouter`); `requirements.txt` has no upper bounds |
| `packages/sdk-py`, `tests/integration` | collection errors (missing modules / fixtures) |
| TypeScript workspaces | agent-sdk 22, cli 68, goat-wallet 6 passed; sync-worker suite fails to load under workerd (`continue-on-error` in CI) |
| `src/web` typecheck | clean |
| UAT workflow | no-op stub |

---

*Full API reference: [docs/API.md](docs/API.md)*  
*Architecture deep-dive: [docs/architecture/system-design.md](docs/architecture/system-design.md)*
