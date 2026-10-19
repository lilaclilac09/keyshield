# KeyShield Protocol Specification

**Version:** 0.1  
**Status:** Draft  
**Full design:** [docs/architecture/system-design.md](docs/architecture/system-design.md)

---

## 1. Problem

AI agents require API credentials to call upstream providers (OpenAI, Anthropic, Helius, …). The current default — pasting raw keys into `.env` files or agent configs — means:

- Keys are copied across machines, tools, and teammates
- Revoking access requires rotating the key at the provider, breaking every consumer
- There is no per-agent spending cap or audit trail

KeyShield defines a protocol for **agent credential delegation**: agents receive scoped session tokens, not raw keys. Raw keys never leave the vault.

---

## 2. Core Primitives

| Primitive | Description |
|---|---|
| **Vault** | Two kinds. The **Device Vault** and **ZK mode** rows are encrypted with AES-256-GCM before leaving the device; the server stores ciphertext only (zero-knowledge). The default **hosted vault** (`/manage/store`) keeps a server-readable copy so the hosted proxy can inject it; it is **not** zero-knowledge. See §3. |
| **Session token** | Short-lived bearer token (`ksv2_…`). Scoped to a provider, an optional spending cap, and a TTL. Issued to humans and agents alike. |
| **Proxy** | Hosted proxy (not ZK): accepts a proxy-scope session token, loads the raw key in memory, injects it into the upstream request, then discards it. The key is never written to logs or returned to the agent. ZK-mode keys are refused here (`409 zk_item`) and are injected by a local proxy instead (`keyshield-proxy`, the extension). |

---

## 3. Vault Encryption Model

Keys are encrypted in the user's browser before transmission:

```
passphrase / WebAuthn PRF output / wallet signature
    │
    └── HKDF-SHA256 → 32-byte key
            │
            └── AES-256-GCM encrypt(api_key, nonce) → ciphertext + tag
```

This applies to the **Device Vault** (Cloudflare sync worker) and to **ZK mode**. The server receives and stores only `{ ciphertext, nonce, tag }`. Decryption requires the user's device credential, so the server cannot decrypt at rest.

### 3.1 Which paths are zero-knowledge

| Path | Server can read the key? |
|---|---|
| Device Vault (sync worker) | No: ciphertext only |
| ZK mode, `cipher_v=2` rows (opt-in) | No: ciphertext plus a per-key server share. The client unlocks with the passkey-derived root and the share, then injects locally |
| Hosted vault, `/manage/store` default | **Yes** (not ZK): stored so the hosted `/vproxy` can inject |
| `/proxy` with `X-Upstream-API-Key` | The key passes through the hosted proxy for that request (not ZK at rest or in transit) |

### 3.2 ZK mode (zk-v1)

Full spec and test vectors are in [`docs/zk/ZK-MODE.md`](docs/zk/ZK-MODE.md) and `docs/zk/vectors.json`.

```
R        = HKDF-SHA256(passkey PRF output, info "keyshield/zk/v1/root")
item key = HKDF-SHA256(ikm R, salt S, info "keyshield/zk/v1/item:<id>:<upstream>")
row      = AES-256-GCM(item key, iv, key, aad "<id>|<upstream>")
```

`S` is 32 random bytes per key, kept only by the server and released by `GET /zk/share/{id}` to a valid owner or proxy token. Revoking the token stops new unlocks; clients cache shares for at most 60 s. Once ZK mode is on, `/manage/store` accepts ciphertext only (`409 zk_mode` for plaintext). Migrating means re-saving each key in ZK mode, purging the old rows (`POST /zk/purge-plaintext`) and **rotating the provider keys**, because the old copies were server-readable. The operator can turn ZK mode off globally with `KS_ZK_DISABLED=1`.

---

## 4. Session Token

Format: `ksv2_<base58(random_32_bytes)>`

Token payload (server-side, opaque to caller):

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

Every token carries a signed scope:

| Scope | Issued to | Allowed |
|---|---|---|
| `owner` | Dashboard passkey / wallet sign-in | Everything, including the vault, decrypt, sessions and agents |
| `proxy` | Agents (`/auth/agent-login`) and developer tokens (`POST /sessions/proxy-token`) | Proxy routes and `/zk/share` only. Vault, decrypt and management routes return `403 insufficient_scope` |

Tokens are verified on every hosted proxy request. A revoked token is rejected within one request cycle (no stale cache window). Local ZK unlocks stop within the 60 s share cache.

---

## 5. Delegation

A human user may issue a **delegated token** to an agent:

- Scope is a strict subset of the user's own permissions
- Spending cap is enforced by the proxy against accumulated usage
- The delegated token can be revoked independently of the parent token
- Revocation is immediate: the next request using the token returns `401`

Agent code receives only the delegated token, never the vault key or raw API key.

```python
from keyshield import KeyShield

ks = KeyShield(token=os.environ["KS_TOKEN"])
client = ks.openai_client()          # raw key never in this process
response = client.chat.completions.create(...)
```

---

## 6. Proxy Request Flow

```
Agent → POST /proxy/openai/v1/chat/completions
         Authorization: Bearer ksv2_…

Proxy:
  1. Verify token signature + expiry
  2. Check revocation list
  3. Check spending cap
  4. Fetch encrypted vault entry
  5. Decrypt raw key (in memory, this request only)
  6. Forward request to upstream with raw key injected
  7. Return upstream response to agent
  8. Record usage against spending cap
```

Raw key exists in memory for the duration of one upstream HTTP round-trip.

---

## 7. Revocation

- Tokens are stored server-side with a `revoked` flag
- Setting the flag takes effect on the next hosted proxy request, with no TTL lag. In ZK mode the server also stops releasing key shares; local proxies stop within their 60 s share cache
- Delegated tokens are independently revocable without affecting the parent
- Users can revoke all tokens for a provider in one action (key rotation equivalent)

---

## 8. Supported Providers (v0.1)

| Provider | Proxy path prefix | Cache eligible |
|---|---|---|
| OpenAI | `/proxy/openai/` | No (stateful completions) |
| Anthropic | `/proxy/anthropic/` | No |
| Helius (Solana RPC) | `/proxy/helius/` | Yes — read-only methods |

Cache uses two-tier memory + disk with single-flight deduplication. Cacheable requests are idempotent, read-only RPC calls (e.g. `getBalance`, `getAccountInfo`).

---

## 9. Out of Scope (v0.1)

- Streaming beyond SSE passthrough
- Webhook endpoints
- Multi-hop delegation chains (depth > 1)
- Cross-user key sharing

---

*Full API reference: [docs/API.md](docs/API.md)*  
*Architecture deep-dive: [docs/architecture/system-design.md](docs/architecture/system-design.md)*
