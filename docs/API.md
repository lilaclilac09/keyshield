# KeyShield API — Single Reference

Everything a user, developer, or agent needs to call the KeyShield API in one place.

---

## TL;DR — minimum to call the API

```bash
# 1. Get a session token (one-time)
CHAL=$(curl -s http://localhost:8001/auth/wallet-challenge)
NONCE=$(echo "$CHAL" | jq -r .nonce)
TOKEN=$(curl -s -X POST http://localhost:8001/auth/wallet-login \
  -H 'Content-Type: application/json' \
  -d "{\"walletAddress\":\"YOUR_WALLET\",\"challenge\":\"$(echo $CHAL | jq -r .challenge)\",\"passphrase\":\"any-string\",\"nonce\":\"$NONCE\"}" \
  | jq -r .token)

# 2. Store an upstream API key (server stores ciphertext only)
curl -s -X POST http://localhost:8001/manage/store \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"upstream":"openai","apiKey":"sk-proj-..."}'

# 3. Call any upstream provider through the proxy — KeyShield injects the
#    decrypted key per-request, never persists plaintext.
curl -s http://localhost:8001/proxy/openai/v1/models \
  -H "Authorization: Bearer $TOKEN"
```

That is the whole flow: **token → store → proxy**.

---

## Local development URLs

| Service       | URL                       | Purpose                                            |
|---------------|---------------------------|----------------------------------------------------|
| Frontend      | `http://localhost:3000`   | Vault UI (vite dev server, `src/web/`)             |
| Backend API   | `http://localhost:8001`   | FastAPI — every endpoint below lives here          |
| Sync Worker   | `http://localhost:8787`   | Cloudflare Worker for end-to-end-encrypted vault   |
| Browser Ext.  | `chrome://extensions/`    | Load unpacked from `src/extension/`                |

---

## Authentication

KeyShield mints a **bearer session token**. Every authenticated endpoint expects:

```
Authorization: Bearer <token>     # public form ksv2_<payload>.<hmac>
```

There are four ways to get a token. Pick whichever fits your client.

### 1. Wallet login (Solana — Phantom / Solflare / Backpack)

```
GET  /auth/wallet-challenge         → { challenge, nonce }
POST /auth/wallet-login             → { token, userId }
     body: { walletAddress, challenge, passphrase, nonce }
```

The wallet signs `challenge`. `passphrase` is anything that derives a vault encryption key (the UI uses the signature over `VAULT_KEY_MESSAGE` from `src/web/lib/vault-key.ts`).

### 2. Passkey login (WebAuthn-PRF — Face ID / Touch ID / hardware key)

```
GET  /auth/passkey/auth-options?user_id=...                          → WebAuthn options
POST /auth/passkey/auth-verify?user_id=...&passphrase=...            → { token, userId }
     body: { credential: <PublicKeyCredentialJSON> }
```

You must have already enrolled a passkey on this device (see *Passkey enrollment* below).

### 3. Agent login (ed25519 — for SDK / CLI agents)

```
POST /auth/agent-challenge          → { challenge, nonce }
POST /auth/agent-login              → { token }
     body: { pubkeyB58, signature, challenge, nonce }
```

The agent must be registered first via `POST /agents/register`.

### 4. Username/password login (test only)

```
POST /auth/login                    → { token }
     body: { userId, password }
```

### Passkey enrollment (after first login)

```
GET  /auth/passkey/register-options                   → WebAuthn options (auth required)
POST /auth/passkey/register-verify                    → { ok, credentialId, name }
     body: { credential: <PublicKeyCredentialJSON>, name }
GET  /auth/passkey/list                               → [{ id, name, createdAt }, ...]
DELETE /auth/passkey/{cred_id}                        → { ok }
```

### Session lifecycle

```
POST /auth/logout                   → { ok }                    revoke current token
GET  /sessions                      → [...]                     list this user's sessions
DELETE /sessions/{token_prefix}     → { ok }                    revoke another session
POST /auth/delete-account-challenge → { challenge, nonce }
POST /auth/delete-account           → { ok }                    permanent account wipe
```

---

## Vault — store / list / decrypt / proxy

```
POST   /manage/store                 store a ciphertext blob keyed by upstream
GET    /manage/vault                 list stored upstreams (no plaintext returned)
GET    /manage/decrypt/{item_id}     get the decrypted key (rare — usually you proxy)
PUT    /manage/vault/{item_id}       update metadata (label, expiry, etc.)
DELETE /manage/vault/{item_id}       delete an entry
ANY    /proxy/{upstream}/{path}      forward to upstream with the stored key injected
```

`POST /manage/store` body:

```json
{
  "upstream": "openai",
  "apiKey":   "sk-proj-...",
  "label":    "Personal",
  "expiresAt": "2026-12-31T00:00:00Z"
}
```

`/proxy/{upstream}/{path}` supports **GET / POST / PUT / PATCH / DELETE**. The path after `{upstream}/` is forwarded verbatim. The body is forwarded verbatim. KeyShield strips your `Authorization: Bearer <ks_token>` and replaces it with the upstream's auth header (e.g. `Authorization: Bearer sk-...` for OpenAI).

Example — call OpenAI through the proxy:

```bash
curl -X POST http://localhost:8001/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}'
```

Supported upstreams: `openai`, `anthropic`, `groq`, `mistral`, `cohere`, `helius`. Add more in `src/backend/proxy/api_router.py`.

---

## Agents — register / wallet / list

For programmatic agent identities (ed25519, sometimes with an embedded Solana wallet).

```
POST   /agents                                     create an agent record
GET    /agents                                     list agents you own
GET    /agents/list                                same, alternate path
POST   /agents/register                            register a pubkey under your account
GET    /agents/wallets                             list embedded wallets
POST   /agents/{agent_id}/wallet/create            mint an embedded wallet
POST   /agents/{agent_id}/wallet/build-tx          build a transaction
DELETE /agents/{agent_id}/wallet                   nuke embedded wallet
DELETE /agents/{agent_id}                          delete agent
```

---

## Sharing — re-encryption sharing

```
POST   /share/grant                  body: { share_id, recipient_pubkey, item_id, ... }
GET    /share/incoming               shares granted to you
GET    /share/outgoing               shares you granted
DELETE /share/{share_id}             revoke a share
GET    /sharing                      legacy alias
POST   /sharing                      legacy alias
DELETE /sharing/{share_id}           legacy alias
```

---

## Billing & usage

```
GET  /billing/balance                { balance: number }
GET  /billing/usage                  { totalCalls, totalCost, ... }
GET  /billing                        combined snapshot
POST /billing/topup                  body: { amount_usd } — Solana on-chain top-up
GET  /usage/stats                    aggregated stats
GET  /usage/history?limit=30         per-call history
```

---

## MPP — metered payment protocol

For pay-per-call streams between clients and providers.

```
GET  /mpp/streams                    list streams
POST /mpp/streams                    open a new stream
POST /mpp/streams/{id}/build-open-tx     → tx payload to fund the stream
POST /mpp/streams/{id}/build-withdraw-tx → tx payload for the provider to claim
POST /mpp/streams/{id}/record            record a metered call (off-chain)
POST /mpp/streams/{id}/record-tx         record an on-chain settlement
POST /mpp/streams/{id}/settle            finalize and close
POST /mpp/streams/{id}/close             close without settlement
GET  /mpp/events?limit=20                stream events
```

---

## Health & static

```
GET /health                                        { status, version, ... }
GET /static/keyshield_sdk.py                       Python SDK file (download)
GET /install.sh                                    one-line CLI installer
```

---

## SDK examples

### Python — paste-ready

```python
import os, requests

API = os.getenv("KS_API", "http://localhost:8001")
TOKEN = os.getenv("KS_TOKEN")  # from one of the login flows above
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# Store
requests.post(f"{API}/manage/store", json={
    "upstream": "openai",
    "apiKey":   "sk-proj-...",
}, headers=HEADERS).raise_for_status()

# List
print(requests.get(f"{API}/manage/vault", headers=HEADERS).json())

# Proxy a call to OpenAI through KeyShield
r = requests.post(
    f"{API}/proxy/openai/v1/chat/completions",
    headers=HEADERS,
    json={"model": "gpt-4", "messages": [{"role": "user", "content": "hi"}]},
)
print(r.json())
```

### JavaScript / TypeScript

```ts
const API = "http://localhost:8001";
const TOKEN = "<paste token>";
const h = { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" };

await fetch(`${API}/manage/store`, {
  method: "POST", headers: h,
  body: JSON.stringify({ upstream: "openai", apiKey: "sk-..." }),
});

const list = await (await fetch(`${API}/manage/vault`, { headers: h })).json();

const reply = await (await fetch(`${API}/proxy/openai/v1/chat/completions`, {
  method: "POST", headers: h,
  body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
})).json();
```

### CLI

```bash
curl -fsSL http://localhost:8001/install.sh | bash    # one-liner
keyshield-cli login                                    # walks you through wallet sign
keyshield-cli store openai sk-proj-...
keyshield-cli proxy openai v1/models
```

The CLI script is at `src/backend/keyshield-cli.sh` (wrapper: `src/scripts/keyshield-cli.sh`) and is also served from `GET /install.sh`. Password login is disabled; export `KS_TOKEN`.

---

## Browser extension

Auto-detects API keys you paste anywhere in the browser, lets you 1-click vault them, then injects them on outbound requests so apps never hold plaintext.

**Install:**

- **Chrome**: `chrome://extensions/` → Developer mode → **Load unpacked** → select `src/extension/`
- **Firefox**: `about:debugging` → This Firefox → **Load Temporary Add-on** → select `src/extension/manifest.firefox.json`

The extension's API base defaults to `http://127.0.0.1:8001` and is overridable from the popup. See `src/extension/README.md` for the rest.

---

## Auth-token storage

The frontend stashes `{ ks_token, ks_token_expiry, ks_wallet }` in `localStorage`. CLI / SDK callers should keep the token in their own secure store (env var, OS keychain, etc).

Tokens currently don't expire server-side beyond the in-memory session table, but `apiFetch` in `src/web/lib/auth.ts` will hit `/auth/logout` and clear local state on a 401.

---

## Where things live in the repo

```
src/
├── backend/             FastAPI — every endpoint above
│   ├── app.py           App factory + CORS
│   ├── routes/          One file per route group (auth, vault, agents, …)
│   ├── auth/            Session + passkey logic
│   ├── proxy/           Upstream router (OpenAI / Anthropic / …)
│   └── ...
├── web/                 v2 React frontend (the vault UI)
├── extension/           Chrome / Firefox extension
├── infra/sync-worker/   Cloudflare Worker for E2E-encrypted vault sync (R2)
├── proxy/               Rust proxy crates (alt path to backend)
└── sdk/                 Python + TypeScript SDKs
```

---

## See also

- [`README.md`](../README.md) — high-level overview
- [`AGENTS.md`](../AGENTS.md) — agent SDK and registration deep dive
- [`docs/architecture/system-design.md`](architecture/system-design.md) — security model
- [`docs/get-started/local-development.md`](get-started/local-development.md) — running the stack from scratch
- [`src/extension/README.md`](../src/extension/README.md) — extension internals
- [`src/infra/sync-worker/DEPLOY.md`](../src/infra/sync-worker/DEPLOY.md) — sync worker deploy
