# KeyShield Path A — iCloud-Keychain-style Sync Vault (v1.1)

> Adjunct to [`LOCAL_VAULT_ARCHITECTURE.md`](./LOCAL_VAULT_ARCHITECTURE.md).
> This document describes the **`extension-sync/`** workspace and
> its companion **`infra/sync-worker/`**, which together let a vault
> follow the user across every device that has their passkey synced
> via iCloud Keychain / Google Password Manager.
>
> **What changed since v0.1:** added a 24-word BIP-39 recovery
> phrase as a true offline root-of-trust, dual-writes to a
> seed-derived ID for passkey-less recovery, tombstones for
> delete-vs-edit conflict resolution, and a one-tap "Add a passkey
> to this device" promotion after recovery. See §11 below.

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

- **iOS native client** — the same `vault.ts` / `sync.ts` modules
  can be lifted into a React Native app once we pick a wallet
  adapter. See `mobile/` for the in-progress skeleton.
- **Quota / abuse** — Cloudflare's edge rate limits cover most cases;
  per-vault rate limiting on `/auth/*` is V1.2.
- **Verifying attestation** — the worker accepts self-signed
  attestations (`attestationFormat: 'none'` in WebAuthn terms). For an
  enterprise tier we'd add an attestation policy and a CRL check.
- **Old PRF slot garbage collection** — when a recovery promotes a
  device to a new PRF (see §11.4), the old PRF-derived slot at the
  sync backend is orphaned. R2 lifecycle policies can sweep stale
  objects, or we can add an explicit DELETE on promotion. V1.2.

---

## 11. V1.1 additions (recovery + cross-device safety)

Five Phase commits (b13f2be → b8fbda9 → bb1942d → 15c7962 → c725274)
turned Path A from "iCloud Keychain UX as long as you don't lose
every device" into "iCloud Keychain UX with an offline recovery
root." This section documents the cumulative shape.

### 11.1 Two-stage key derivation

The PRF output is no longer the master secret. Instead:

```
                       PRF (per-device, deterministic across
                            devices via passkey sync)
                                  │
                                  │ HKDF info='seed-wrap-key'
                                  ▼
                          wrap key W (32 bytes)
                                  │
                  ┌───────────────┴────────────────┐
                  │                                │
            unwrap a stored                    wrap a fresh
            seed envelope                      seed envelope
                  │                                │
                  ▼                                ▼
                                 SEED (32 bytes)
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
       HKDF info=                HKDF info=        BIP-39 entropy
       'encryption-key'          'vault-id'        (256 bits)
              │                   │                   │
              ▼                   ▼                   ▼
       AES-GCM master key   16-byte vault ID    24-word phrase
       (non-extractable)    (URL-safe base64)   (recovery root)
```

Domain separation between the three HKDF outputs comes from
distinct `info` strings: leaking the wrap key cannot reveal the
encryption key, the public vault ID cannot reveal either, etc.

The 24-word phrase IS the seed — there's no extra PBKDF2 step.
Lose every device + every PRF, type the phrase on a fresh device,
and the seed (and therefore the master key + vault ID) come back
exactly. The phrase is shown ONCE on first run and never persisted
anywhere.

### 11.2 Dual-write storage

A single cipher is stored at TWO IDs in R2:

- `/vault/<prf-derived-id>` — found by daily PRF unlock
- `/vault/<seed-derived-id>` — found by mnemonic-only recovery

Both contain the same ciphertext (encrypted with the seed-derived
master key) and the same `seedEnvelope` (PRF-wrapped seed). The
seed-derived ID is reachable from the mnemonic alone; the PRF-
derived ID is reachable only from a registered device.

Push semantics:
- The DAILY slot's CAS (`updatedAt`) gates conflict detection. A
  409 there triggers the merge dialog.
- The RECOVERY slot is best-effort: a transient failure to write
  it doesn't surface to the user; the next push catches it up.

Storage cost: 2× per vault. For a typical KeyShield vault (≤ 4 KB),
this is trivially cheap.

### 11.3 Tombstones for delete-vs-edit

`VaultPlain.deletedKeys?: Record<string, number>` maps key name →
unix-ms deletion timestamp. The merge in `findConflicts`:

1. Tombstones from both sides merge by `max(deletedAt)`.
2. For each candidate active record, compare the merged tombstone
   against `max(mine.createdAt, theirs.createdAt)`.
3. Tombstone wins iff strictly newer → key stays deleted, no UI
   prompt.
4. Active record wins → tombstone is dropped from the merged
   `deletedKeys` (it's stale).
5. A value-mismatch conflict is suppressed if the tombstone wins
   anyway.

`upsertKey` clears the tombstone for that name (re-adding revives
a deleted key). Empty `deletedKeys` is omitted from the cipher to
keep payloads small.

### 11.4 Post-recovery passkey promotion

After a mnemonic restore the user is `unlocked` but with NO PRF
on this device. The popup shows an `AddPasskeyBanner` over the
session bar; one tap runs `services.auth.registerPasskey` and
flow's `registerPasskeyAfterRestore`:

1. Re-wrap the in-memory seed (held only in `state.seed` for this
   transient mode) under the new PRF → fresh `seedEnvelope`.
2. Re-encrypt the current vault with the unchanged master key +
   attach the new envelope.
3. Dual-push the cipher to a NEW PRF-derived ID and the existing
   recovery ID.
4. POST `/auth/register` at the new ID (409 = idempotent OK).
5. POST `/auth/exchange` to mint a fresh JWT, store in `bearer`.
6. Promote state: `vaultId` → new PRF id, `seedEnvelope` → fresh
   wrap, drop `state.seed`.

The OLD PRF-derived slot from the lost device is orphaned at the
sync backend. Cleanup is a future housekeeping job (see §10).

### 11.5 Seed-bound force-revoke

After a mnemonic restore the in-memory `state.seed` doubles as a
revocation credential. The user can drop every existing passkey
registration server-side without holding any of those passkeys —
useful when a device is genuinely lost (not just borrowed).

Wire layout (see `extension-sync/src/lib/seed-revoke.ts` and the new
worker endpoints):

```
seed (32 bytes)
   │
   ├── HKDF info='keyshield-prf-v1:revoke-key'
   ▼
Ed25519 keypair (privateKey, publicKey)
   │
   ├── publicKey registered on /auth/register alongside the passkey.
   │   Stored in REGISTRY/<vaultId> under `seedPublicKey`.
   │
   └── privateKey signs nonces from /auth/revoke-challenge.
       /auth/force-revoke verifies and deletes the registration.
```

End-to-end:

1. `POST /auth/revoke-challenge { vaultId }` → 32-byte random nonce,
   stashed at `REGISTRY/<vaultId>-revoke-challenge`.
2. Client signs `UTF-8(challenge)` with the seed-derived private key.
3. `POST /auth/force-revoke { vaultId, challenge, signature }` →
   server consumes the nonce, verifies against `seedPublicKey`,
   and deletes both `REGISTRY/<vaultId>` and any pending WebAuthn
   challenge. The vault ciphertext is NOT touched — revocation
   drops AUTH only.

Domain separation matters here: the HKDF `info` for the revoke key
is distinct from `keyshield-prf-v1:encryption-key` (the AES-GCM
master) and `keyshield-prf-v1:seed-wrap-key` (the envelope wrapper),
so a leak of any one role can't be substituted for another.

The popup surfaces this through the AddPasskeyBanner: alongside the
"Add passkey" action it offers "Force-revoke other devices", wired
to `useVaultFlow.forceRevokeOtherDevices()`. The action is only
enabled while `state.seed` is in scope — i.e. between
`restoreFromMnemonic` and `registerPasskeyAfterRestore`.

### 11.6 The five end-to-end paths

Each is exercised by `extension-sync/src/popup/hooks/useVaultFlow.test.tsx`:

| Path | Triggers | What's stored after |
|---|---|---|
| First run on any device | UnlockScreen "Create vault" | Cipher at PRF-id and SEED-id with seedEnvelope wrapping the new seed; `showMnemonic` shows the 24 words |
| Cross-device unlock (passkey synced) | UnlockScreen "Unlock" on a fresh device | No new write; cipher pulled from PRF-id, envelope unwrapped, vault decrypted |
| Mutual edit conflict | Two devices modify the same key while offline | `ConflictDialog` shows the per-key picks; resolution dual-writes the merged cipher |
| Mnemonic-only recovery (no passkey) | UnlockScreen "I have a recovery phrase" → RestoreScreen | Cipher pulled from SEED-id only; popup enters `unlocked` with `state.seed` set |
| Post-recovery passkey enrollment | `AddPasskeyBanner` "Add passkey" after a recovery | Fresh cipher dual-written under NEW PRF-id and the existing SEED-id; subsequent unlocks go through the normal PRF path |
