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
| **Vault** | Client-side encrypted store. Keys are encrypted with AES-256-GCM before leaving the browser. Server stores ciphertext only. |
| **Session token** | Short-lived bearer token (`ksv2_…`). Scoped to a provider, an optional spending cap, and a TTL. Issued to humans and agents alike. |
| **Proxy** | Rust reverse proxy. Accepts a session token, fetches and decrypts the raw key in memory, injects it into the upstream request, then discards it. The key is never written to disk or logs. |

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

The server receives and stores only `{ ciphertext, nonce, tag }`. Decryption requires the user's device credential — the server cannot decrypt at rest.

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

Tokens are verified on every proxy request. A revoked token is rejected within one request cycle (no stale cache window).

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
- Setting the flag takes effect on the next request — no TTL lag
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
