# KeyShield TEE Architecture — Three Layers

> Audience: KeyShield engineers and security reviewers. Status: commit
> `f99c1fcad` on `main` (2026-05-10). For vault-storage internals (CAS,
> JWT exchange, BIP-39 recovery) see
> [`SYNC_VAULT_ARCHITECTURE.md`](./SYNC_VAULT_ARCHITECTURE.md). This doc
> is the cross-layer picture.

KeyShield treats every server it operates as untrusted. The "TEE" it
relies on is not a single enclave — it is **three composed layers**,
each with a different trust anchor and blast radius.

```
┌─ Layer 1 — Device-as-TEE (Path A, primary) ──────────────────────────────┐
│  Browser / web-v2 client                                                  │
│   WebAuthn passkey → PRF (32 bytes, never leaves secure element)          │
│   HKDF-SHA256 ─┬─► AES-GCM-256 master key  (extractable: false)          │
│                └─► 16-byte vaultId        (anonymous to server)           │
│   encrypt(VaultPlaintext) → VaultCipher (iv ‖ ciphertext ‖ updatedAt)    │
└─────────┬─────────────────────────────────┬─────────────────────────────┘
          │ PUT/GET /vault/:id              │ /proxy/<upstream>/<path>
          │ Bearer (CF JWT)                 │ + X-Upstream-API-Key: <pt>
          ▼                                 ▼
┌─ CF Worker + R2 ─────────────────┐  ┌─ Layer 3 — Pass-through ──────────┐
│  VAULTS / REGISTRY / CHAL        │  │  Python FastAPI / Rust ks-proxy   │
│  CAS on updatedAt                │  │  plaintext lives 1 async fn scope │
│  never sees plaintext            │  │  GC'd; never persisted, logged    │
└──────────────────────────────────┘  └──────────────┬────────────────────┘
                                                     ▼ HTTPS to upstream
┌─ Layer 2 — On-chain TEE (Solana devnet, prog 41P2wHKA…Bxr9j) ───────────┐
│  UniversalVault PDA  (state.rs:559, SIZE = 2992)                         │
│   owner, key_groups[16], agent_grants[8], policy_rules[8]                │
│   payment_streams[4], vault_flags                                         │
│  AgentPaymentStream PDA  (state.rs:421, spec 10 embedded wallet)         │
│   usdc_ata, max_total_micro_usdc, spent_total, consumed_nonces[64]       │
│  Bonsol/Arcium hooks (errors 6090–6093) — call sites are stubs          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Layer 1 — Device-as-TEE (Path A, primary)

The user's authenticator is the trust root. A WebAuthn passkey in the
platform secure element (Touch ID, Windows Hello, Android StrongBox,
YubiKey) plus the **PRF extension** returns 32 bytes per
(credential, salt). That output seeds everything else.

In `src/web-v2/lib/vault.ts`:

- `deriveMasterKey(prfOutput)` — `vault.ts:52-60`. HKDF-SHA256 with
  `info = "ks-master-key-v1"` → AES-GCM-256, imported
  `extractable: false` so heap dumps can't exfiltrate raw bytes.
- `deriveVaultId(prfOutput)` — `vault.ts:62-70`. HKDF with
  `info = "ks-vault-id-v1"` → 16-byte ID. Domain separation matters:
  the server can't link vaultId to identity or recover the master key.
- `encryptVault` / `decryptVault` — AES-GCM, fresh 12-byte IV per
  write; `updatedAt` mirrored into the envelope for server CAS.

Passkey ceremonies in `src/web-v2/lib/auth.ts`:

- `registerPasskey(name)` — `auth.ts:253`. Sets
  `extensions.prf.eval.first = salt`, dual-registers with CF Worker via
  `enrollVault(prfOutput, …)` (`auth.ts:308`). If PRF is unsupported,
  vault crypto is disabled on that device — no silent downgrade.
- `requestVaultUnlock()` — `auth.ts:337`. Probe ceremony derives
  vaultId locally; real ceremony runs against a CF-issued challenge.
  The master key never crosses a network boundary.

Storage is `src/infra/sync-worker/`, which sees only
`(vaultId, VaultCipher)` plus CAS. See `SYNC_VAULT_ARCHITECTURE.md` for
JWT lifecycle, replay defences, and 24-word recovery.

## Layer 2 — On-chain TEE (Solana devnet program `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`)

The Solana program — Pinocchio-based, `#![no_std]`,
`src/programs/keyshield/src/lib.rs` — is the **public access ledger**.
It is intentionally NOT where plaintext API keys live. What the chain
holds:

- **`UniversalVault` PDA** (`state.rs:559`, `SIZE = 2992`). One per
  user. 16 key groups (typed pointers to off-chain ciphertext), 8 agent
  grants (rate limits, spend caps, session timeouts), 8 policy rules
  (domain allow/block, rate limit, max spend, output redaction, allowed
  tools), 4 in-vault `PaymentStream` slots. Slot caps were trimmed
  (32→8, 8→4, 64→8) to fit Solana's 10240-byte per-tx data cap;
  deployed at slot ≥461190304.
- **`AgentPaymentStream` PDA** (`state.rs:421`, spec 10 embedded
  wallet). Per-agent USDC sub-account with `max_total_micro_usdc`,
  `spent_total_micro_usdc`, a 64-entry x402 replay ring buffer, and a
  designated `mpp_settler_pubkey` authorised to call `mpp_settle` (ix
  #26).
- **Vault flags** (`state.rs:633`): `TIME_LOCK_ENABLED`,
  `REQUIRE_ZK_PROOF`, `REQUIRE_MPC`, `PAYMENT_ENABLED` gate ix paths.

What is honestly a stub today:

| Hook | Where | Status |
|---|---|---|
| Bonsol ZK proof verification | `agent_access.rs:88-91`, `access_key.rs:74-86`, `agent_access.rs:367-372` | **Stub.** Code checks `zk_proof.is_empty()` and emits `InvalidBonsolProof` (error `6092`). The `verify_bonsol_proof(...)` call is a `// TODO:` comment. |
| Arcium MPC verification | `share_key.rs:157-158`, `agent_access.rs:375-381` | **Stub.** `arcium_arcis::mpc_compute(...)` is a `// TODO:` comment; failures map to `ArciumMPCFailed = 6091` / `MPCSignatureInvalid = 6093`. |
| `KeyShieldError::InvalidZKProof = 6003` and `InvalidMPCHash = 6004` | `error.rs:10-11` | Defined; reachable from legacy paths only. |

What is real and verified on devnet today: PDA layout, ownership checks,
`UniversalVault` create/update, agent grant + revoke + rate-limit
arithmetic, `OpenPaymentStream`, `PayX402` (with replay-nonce ring),
`MppSettle`, and `WithdrawAgentWallet`. Instruction discriminators 0–2,
10–12, 20–27, 30–33 are tested in `lib.rs:142-181`.

## Layer 3 — Per-request ephemeral pass-through (the "1%")

Even with Layer 1 doing client-side crypto, the upstream provider
(OpenAI, Anthropic, Helius, Stripe, …) still wants the raw API key in
an `Authorization` header. Path A handles this with a single-roundtrip
pass-through:

- Browser: `proxyFetch(upstream, path, …)` — `auth.ts:142-155`. Pulls
  cleartext from the in-memory unlocked vault via
  `getDecryptedKey(upstream)`, sets `X-Upstream-API-Key`, posts to
  `/proxy/<upstream>/<path>`.
- Python: `routes/proxy.py:26-58`. Reads
  `request.headers.get("X-Upstream-API-Key")`, forwards as a function
  arg to `api_router.call_rest(...)`. The key lives in one async fn
  scope and is dropped when the request completes — never persisted,
  never logged.
- Rust hot path: `src/proxy/crates/ks-proxy/src/handlers.rs:122-156`.
  Resolves the key (vault → platform fallback), passes by reference
  to `state.upstreams.forward(... &api_key ...)`, and emits a usage
  log of `user_id`, `upstream`, `path`, latency, tokens — never the
  key value. The `tracing::warn!` sites at 131 and 170 log only
  `upstream` and `error`.

The header at `routes/proxy.py:1-13` documents this contract.

## Threat model — what each layer protects

| Threat | L1 (device) | L2 (chain) | L3 (pass-through) |
|---|---|---|---|
| Operator reads ciphertext at rest | yes — AES-GCM, key in SE | n/a | n/a (stateless) |
| Operator dumps memory mid-request | yes — key never sent | n/a | partial — plaintext for 1 fn scope |
| Stolen R2 dump | yes — ciphertext only | n/a | n/a |
| Replay stolen WebAuthn assertion | yes — single-use challenge | n/a | n/a |
| Agent exceeds budget | UI only | yes — `max_total_micro_usdc` | n/a |
| Agent uses revoked grant | UI only | yes — `AgentRevoked = 6102` in `pay_x402` | n/a |
| x402 nonce replay | n/a | yes — 64-entry ring buffer | n/a |
| Malicious extension build | no (out of scope) | no | no |
| Compromised passkey | no (= iCloud Keychain) | partial — chain policy gates spend | no |

## Blast radius if a layer is compromised

- **Layer 1 compromised** (device passkey + malicious extension):
  attacker decrypts the vault and calls upstreams as the user — same as
  a stolen iCloud Keychain. Layer 2 still rate-limits and spend-caps
  any agent grants they try to issue.
- **Layer 2 compromised** (chain halt or program bug): on-chain agent
  policy is gone — grants can't be revoked atomically and stream
  budgets can't be enforced on-chain. Layers 1 and 3 unaffected. With
  Bonsol/Arcium still stubs, the chain is the **only** agent-policy
  enforcement point today, so this is more exposure than the README
  implies.
- **Layer 3 compromised** (proxy RCE): attacker captures plaintext
  upstream keys for in-flight requests during the window. No historical
  keys (none stored), no vault decryption (Layer 1 owns the key), no
  agent overspend (capped on-chain). Mitigation: rotate upstream keys
  and revoke any grants issued during the window.

## Compared to other secret-manager architectures

| Property | Vercel / Stripe (server-vault) | 1Password (client-only) | **KeyShield (hybrid)** |
|---|---|---|---|
| Where does plaintext exist? | Server, encrypted at rest with provider keys | User device only | User device + 1 async fn scope per call |
| Can the operator read your secret? | Yes (operational access) | No | No (Layer 1) |
| Cross-device sync, no re-import? | Yes (server holds it) | Yes (their cloud, client-side encrypted) | Yes (CF Worker, ciphertext only) |
| On-chain agent spend cap enforcement? | No | No | Yes (Layer 2) |
| Pass-through to arbitrary upstreams? | No | No | Yes (Layer 3) |
| Trust anchor | Provider HSM | User passphrase | Secure element + passkey |

## What is real vs. stub today (honest table)

| Component | Real on devnet today | Stub / TODO |
|---|---|---|
| WebAuthn-PRF → HKDF → AES-GCM-256 | ✅ `vault.ts`, `auth.ts` |  |
| HKDF-derived anonymous vaultId | ✅ |  |
| CF Worker zero-knowledge storage + CAS | ✅ `src/infra/sync-worker/` |  |
| `UniversalVault` PDA layout & instructions 10–12 | ✅ |  |
| Agent grant + revoke + rate limits | ✅ ix 20–23 |  |
| Embedded wallet + x402 + mpp_settle | ✅ ix 24–27 |  |
| Replay-nonce ring buffer | ✅ `AgentPaymentStream.consumed_nonces` |  |
| Bonsol ZK proof verification | ❌ | placeholder, `agent_access.rs:88-91`, errors `6090/6092` reserved |
| Arcium MPC computation/verification | ❌ | placeholder, `share_key.rs:157`, errors `6091/6093` reserved |
| Lit Protocol decryption (mentioned in `lib.rs:9` comment) | ❌ | not wired |

## Where to look next

- `docs/technical/SYNC_VAULT_ARCHITECTURE.md` — Path A internals, JWT
  lifecycle, conflict resolution, BIP-39 recovery.
- `src/programs/keyshield/src/instructions/` — on-chain ix handlers.
- `src/proxy/crates/ks-proxy/src/handlers.rs` — Rust hot-path proxy.
- `src/backend/routes/proxy.py` — Python control-plane proxy.
- `src/web-v2/lib/{vault,auth,vault-session,sync,sync-auth}.ts` —
  client crypto.
