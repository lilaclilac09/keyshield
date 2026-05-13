# KeyShield — Cryptography overview

This page is the **high-level crypto map**. For wire formats and HTTP contracts, see **[`SYNC_VAULT_ARCHITECTURE.md`](./SYNC_VAULT_ARCHITECTURE.md)** (Path A sync vault) and **`docs/API.md`**.

---

## 1. Primitives (what we actually use)

| Building block | Role |
|----------------|------|
| **WebAuthn PRF extension** | Hardware- or platform-bound secret per passkey ceremony; never exported as a raw “password.” |
| **HKDF-SHA256** | Stretch PRF output (or wallet signature material) into fixed-length keying material with domain separation (`info` strings). |
| **AES-256-GCM** | Authenticated encryption for vault blobs and per-secret records. Random 12-byte IV per encryption. |
| **ed25519** | Wallet signatures for login challenges; agent delegated auth. |
| **Session token (HMAC-signed)** | API `Authorization: Bearer` — authorizes proxy and vault registry access, **not** a replacement for vault master keys. |

---

## 2. Path A — dashboard vault ↔ Cloudflare Worker (zero-knowledge storage)

**Goal:** sync encrypted vault **ciphertext** across devices; the Worker and R2 hold **no** decryption key.

**Client** (`src/web/lib/auth.ts`, `sync-auth.ts`, vault helpers): user completes WebAuthn with the **PRF extension**. PRF output is fed through HKDF to derive:

- a **master AES-256-GCM key** for encrypting vault JSON;
- a **vault identifier** (opaque to the server).

**Server** (`src/infra/sync-worker/`): accepts `PUT/GET/DELETE /vault/:id` with a short-lived **Bearer JWT** minted after WebAuthn assertion exchange. It stores **only ciphertext** and metadata (e.g. CAS `updatedAt`). It **cannot** decrypt.

**Invariants** (from the Path A spec):

- Plaintext API keys never touch R2.
- Vault ID does not reveal the PRF input; linking identity to content requires the passkey flow + JWT issuance path.

Full threat model, replay handling, and conflict resolution: **[`SYNC_VAULT_ARCHITECTURE.md`](./SYNC_VAULT_ARCHITECTURE.md)**.

---

## 3. Browser extension — Path A “lite” (wallet HKDF + ciphertext to API)

**Goal:** when the user saves a key from a **provider webpage**, encrypt in the extension before any server sees it.

**Key material:** after dashboard login, the wallet signs **`VAULT_KEY_MESSAGE`** — the literal UTF-8 string `KeyShield Vault Key Derivation v1` (`src/web/lib/vault-key.ts`). **`registerExtensionVaultKey`** imports the **raw 64-byte ed25519 signature bytes** as HKDF IKM (`deriveExtensionVaultKey`): HKDF-SHA256, **salt = empty**, **`info = ks-extension-vault-v1`**, **256 output bits** → **32-byte AES-256 key** (base64url) pushed to the extension as **`KS_VAULT_KEY_REGISTER`**. The extension holds this key in memory / `chrome.storage.session` and uses it in **`directStore`** / AES-GCM flows (`src/extension/background.js`).

**Encrypt:** per secret: random IV, AES-GCM encrypt plaintext API key → POST to backend **`/manage/store`** with `cipher`, `iv`, `cipher_v` (server stores ciphertext; legacy plaintext path may still exist for unmigrated rows).

**Limitations vs full Path A:**

- Root of trust is **wallet signature material**, not TPM PRF (unless you use a hardware wallet — then the chain is stronger).
- Firefox temporary loads clear on exit; Chrome session storage semantics apply.
- Cross-device: same wallet + same backend ⇒ same derived key (see extension README for fingerprint UX).

---

## 4. Proxy hot path — decrypt once, forward upstream

**Goal:** agents and curl callers use **`KS_TOKEN`** only; upstream API keys live in the **vault registry** as ciphertext.

On `POST /proxy/{upstream}/...` with valid session:

1. Resolve the user’s vault entry for `upstream`.
2. **Decrypt in process memory** (using server-side keying tied to your deployment model — shim DB or integration with vault service).
3. Attach **`X-Upstream-API-Key: <plaintext>`** to the outbound HTTP request.
4. **Do not** persist plaintext keys to disk or logs as part of proxy design (operational hygiene still required).

This is **not** E2E between your agent and OpenAI: the **KeyShield API** necessarily sees the upstream key for that request. The win is **agents and CI never store raw keys**; rotation happens in the vault.

---

## 5. Agents (delegation)

Registered **agents** use **ed25519** keypairs: `_auth/agent-login` flow mints a scoped token. Cryptographically separate from the vault PRF chain; authorization is **server policy** (which agent may debit which vault / balance).

Details: **`python-sdk/README.md`**, **`docs/API.md`**.

---

## 6. Quick “what does each party see?”

| Party | See plaintext API keys? |
|--------|-------------------------|
| Cloudflare sync Worker | **No** — ciphertext only. |
| Typical R2 / logs for Path A | **No** decryption key. |
| Python API at proxy time | **Yes, in RAM** for that request (by design). |
| Your agent process / env | **No** — only `KS_TOKEN`. |
| Browser extension (unlocked) | **Yes, locally** — to encrypt or fill forms. |

---

## 7. Further reading

| Document | Focus |
|----------|--------|
| [`SYNC_VAULT_ARCHITECTURE.md`](./SYNC_VAULT_ARCHITECTURE.md) | Path A JWT, R2, CAS, WebAuthn exchange |
| [`docs/API.md`](../API.md) | Auth modes, `/manage/store`, `/proxy` |
| [`src/extension/README.md`](../../src/extension/README.md) | Extension install, troubleshooting |
| [`docs/zh/path-a-plain-language.md`](../zh/path-a-plain-language.md) | Path A 通俗版（中文） |
| [`docs/architecture/system-design.md`](../architecture/system-design.md) | System split: storage vs control plane |
