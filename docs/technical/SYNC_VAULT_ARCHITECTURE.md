# KeyShield Path A — iCloud-Keychain-style Sync Vault (v0.1)

> Adjunct to [`LOCAL_VAULT_ARCHITECTURE.md`](./LOCAL_VAULT_ARCHITECTURE.md).
> This document describes the **`extension-sync/`** workspace and
> its companion **`infra/sync-worker/`**, which together let a vault
> follow the user across every device that has their passkey synced
> via iCloud Keychain / Google Password Manager.
>
> **V1 (`extension/`) is unchanged** — Path A is an additive parallel
> implementation. We pick which one to ship by which directory the
> manifest points at.

## 1. Why a second implementation

V1 was deliberately device-bound: master key generated on first run,
stored locally, never leaves. That gave us the smallest threat surface
but the worst new-device UX (manual re-import of every API key).

The user-facing target is iCloud Keychain: **install the extension on a
new device, do Face ID once, and your keys are there.** Path A delivers
that without abandoning end-to-end encryption.

## 2. Threat model & invariants

| Invariant | Mechanism |
|---|---|
| The server never sees plaintext | AES-256-GCM client-side, key derived from PRF → HKDF |
| The server can't link vault contents to a user identity | Vault ID is HKDF-derived from the same passkey-PRF — server only sees the derivation, not the input |
| Replay of a stolen JWT is bounded | 15-minute TTL + sub-claim bound to vault ID |
| Replay of a stolen WebAuthn assertion fails | Single-use challenge stored in R2, consumed on /auth/exchange |
| Two devices editing simultaneously can't silently lose data | CAS via `updatedAt` → 409 → ConflictDialog |

What the threat model does **NOT** defend against:
- A malicious extension build (out of scope — same as every wallet)
- A compromised Cloudflare Worker (would let an attacker DoS or
  deny-of-service; cannot decrypt the vault)
- An attacker with the user's passkey (game over — same as iCloud
  Keychain)

## 3. Three layers

```
┌──────────────────────────────────────────────────────────────────────┐
│                  Browser extension (extension-sync)                   │
│                                                                        │
│  src/lib/auth.ts        registerPasskey + authenticate (PRF, no       │
│                         PBKDF2 fallback). Returns                      │
│                         RegistrationResponseJSON / AuthenticationResp. │
│                                                                        │
│  src/lib/vault.ts       HKDF(prfSecret) → AES-256-GCM masterKey       │
│                         HKDF(prfSecret) → 16-byte vaultId              │
│                         encrypt / decrypt / cache (NOT authoritative)  │
│                                                                        │
│  src/lib/sync.ts        HttpSyncBackend with dynamic getToken +       │
│                         single-attempt refreshToken on 401             │
│                                                                        │
│  src/lib/sync-auth.ts   /auth/register, /auth/challenge,              │
│                         /auth/exchange — JWT minted from a fresh      │
│                         WebAuthn assertion. BearerHolder caches with  │
│                         an early-expiry slack window.                 │
│                                                                        │
│  src/lib/platform.ts    Probe getClientCapabilities; route to         │
│                         UpgradeScreen on `extension:prf=false`.       │
│                                                                        │
│  src/lib/conflict.ts    Per-key diff + applyResolutions for the      │
│                         409 ConflictDialog merge UX.                  │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   │  PUT/GET/DELETE /vault/:id (Bearer)
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                Cloudflare Worker (infra/sync-worker)                  │
│                                                                        │
│  /vault/:id   Bearer JWT whose `sub` claim equals :id is required.   │
│               PUT enforces CAS via updatedAt; equal/older → 409.      │
│                                                                        │
│  /auth/*      register / challenge / exchange — WebAuthn signature   │
│               verification via @simplewebauthn/server.                 │
│               Counter monotonicity check rejects basic replay.        │
│                                                                        │
│  Storage      Two R2 buckets: VAULTS (ciphertext) and REGISTRY        │
│               (per-vault publicKey + counter + single-use challenge). │
└──────────────────────────────────────────────────────────────────────┘
```

## 4. End-to-end flow on a fresh device

```
User opens popup on new device with synced passkey
└─ detectPrfSupport()            →  'supported'      (no UpgradeScreen)
└─ getCachedCipher()             →  null             (no local cache)
└─ state = 'firstRun'            (UnlockScreen, "Create vault" mode)

User taps Face ID
└─ AuthService.registerPasskey   (PRF extension requested)
└─ AuthService.authenticate      (gets PRF output + assertion JSON)
└─ vault.deriveMasterKey(prf)    →  AES key
└─ vault.deriveVaultId(prf)      →  16-byte URL-safe ID
└─ syncAuth.registerVault(id, …) →  POST /auth/register
                                    (vaultId + attestation + expectedChallenge)
                                    (server verifies + stores publicKey;
                                     409 if already registered = OK,
                                     means another device beat us here)

The popup now has a fresh master key and vaultId. It pulls:

└─ services.sync.pull(vaultId)   →  ciphertext from R2
                                    (or null on the very first device)

If ciphertext exists, decryptVault → vault is the user's existing one.
If null, encryptVault({}) and push it.

└─ syncAuth.exchange(id, assertion) →  JWT (15 min)
└─ bearer.set(token, expiresAt)
└─ state = 'unlocked'             (VaultList renders the keys)
```

## 5. CRUD = encrypt + cache + push

`useVaultFlow.persist`:

1. encrypt → cache locally
2. `services.sync.push(vaultId, cipher)`
3. `200` → done.
4. `409` → pull remote, run `findConflicts`:
   - 0 real conflicts → silent additive merge, re-encrypt, push.
   - >0 real conflicts → set `pendingConflict`; the popup renders
     `ConflictDialog`; user picks; `applyResolutions` → push.
5. push throws (offline) → cache is updated, server picks up on the
   next successful edit.

## 6. Files to read in order

| Order | Path | What it tells you |
|---|---|---|
| 1 | `infra/sync-worker/src/index.ts` | The HTTP contract the popup talks to |
| 2 | `infra/sync-worker/src/cas.ts` + `registry.ts` | Storage shape inside R2 |
| 3 | `extension-sync/src/lib/auth.ts` | PRF wiring + JSON serialisation |
| 4 | `extension-sync/src/lib/vault.ts` | The two HKDF derivations |
| 5 | `extension-sync/src/lib/sync.ts` | HttpSyncBackend + 401 retry |
| 6 | `extension-sync/src/lib/sync-auth.ts` | JWT round-trip |
| 7 | `extension-sync/src/popup/hooks/useVaultFlow.ts` | The state machine |
| 8 | `extension-sync/src/lib/conflict.ts` | Per-key diff + merge math |

## 7. Tests

```
sync-worker      40   (16 routes + 10 registry + 14 auth-routes)
extension-sync  127   (~) — see workspace counts in `npm test`
extension        57   (V1, unchanged — still passes)
goat-wallet       6
agent-sdk        24
                ----
total           254
```

`infra/sync-worker` runs against a real workerd via
`@cloudflare/vitest-pool-workers`, so the R2 binding behaves like
production. Happy-path WebAuthn signature verification is covered by
`@simplewebauthn/server`'s own suite + browser E2E (deferred).

## 8. Local dev

```bash
# Terminal 1 — sync worker
cd infra/sync-worker
npx wrangler dev          # starts on http://localhost:8787

# Terminal 2 — extension popup
cd extension-sync
VITE_KEYSHIELD_SYNC_URL=http://localhost:8787 npx vite dev
# popup opens on http://localhost:5173
```

If `VITE_KEYSHIELD_SYNC_URL` is unset, the popup uses
`InMemorySyncBackend` instead — convenient for offline UI work but
the vault won't survive a popup reload.

## 9. Production deploy

```bash
cd infra/sync-worker

# One-time: create R2 buckets
wrangler r2 bucket create keyshield-vaults
wrangler r2 bucket create keyshield-registry

# One-time: set the JWT secret (≥ 32 random bytes)
echo -n "$(openssl rand -hex 32)" | wrangler secret put JWT_SECRET

# One-time: tell the worker the relying-party origin
wrangler secret put RP_ID            # e.g. "keyshield.dev"
wrangler secret put RP_ORIGIN        # e.g. "https://keyshield.dev"

# Deploy
wrangler deploy
```

The popup's `VITE_KEYSHIELD_SYNC_URL` then points at the deployed
worker (`https://keyshield-sync.<account>.workers.dev` or a custom
domain).

## 10. Out of scope (future work)

- **Recovery without a passkey** — losing every device that has the
  synced passkey is currently unrecoverable. V1.1 will add an optional
  24-word recovery phrase that AES-wraps the master key.
- **Deletion-vs-edit conflicts** — `findConflicts` only flags
  value/createdAt/tag mismatches; a remote add will silently survive
  a local delete. V1.1 will track tombstones.
- **iOS native client** — the same `vault.ts` / `sync.ts` modules can
  be lifted into a React Native app once we pick a wallet adapter.
- **Quota / abuse** — Cloudflare's edge rate limits cover most cases;
  per-vault rate limiting on `/auth/*` is V1.1.
- **Verifying attestation** — the worker accepts self-signed
  attestations (`attestationFormat: 'none'` in WebAuthn terms). For an
  enterprise tier we'd add an attestation policy and a CRL check.
