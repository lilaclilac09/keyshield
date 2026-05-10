# 16 — Path A Device Vault: client-side crypto + Cloudflare sync

> **Status: spec v1.** Written 2026-05-10. Companion to spec 14
> (Dashboard CTA), spec 15 (MPP). Documents the **zero-trust vault
> path** — vault payloads are encrypted in the user's browser before
> leaving the device, so the Cloudflare Worker (and any operator
> with access to R2) only sees opaque ciphertext. The decryption
> key never touches a server.

---

## What the user does

1. First device: **enroll a passkey** (WebAuthn). The browser
   generates a hardware-backed credential and the WebAuthn PRF
   extension produces a 32-byte secret bound to the credential.
2. Click **Unlock vault**. The browser performs another WebAuthn
   assertion, deriving the same PRF output. From it, the client
   computes:
   - **Master key** — AES-256-GCM key, imported `extractable: false`
   - **Vault ID** — 16-byte hex string, used as the URL path
3. The dashboard pulls `/vault/:id` from the Cloudflare Worker (R2),
   AES-GCM-decrypts it, and renders the vault entries.
4. User adds / edits / deletes API keys. Each mutation re-encrypts
   the whole vault with a fresh IV and PUTs back to `/vault/:id`.
5. On a second device: the user enrolls *the same* WebAuthn
   credential (same passkey, registered with the relying party once).
   PRF output is identical → master key + vault ID are identical →
   the second device transparently joins the same vault.

---

## Where it lives

| Layer | File | What runs here |
|---|---|---|
| **Browser (`packages/shared/`)** | `lib/vault.ts` | `deriveMasterKey()`, `deriveVaultId()`, `encryptVault()`, `decryptVault()` — pure WebCrypto; no network |
| | `lib/sync.ts` | `pull()`, `push()`, `delete()` — opaque-cipher transport over the Worker |
| | `lib/sync-auth.ts` | `makeSyncAuthClient()` — runs the `/auth/challenge` → `/auth/exchange` WebAuthn dance to get a Bearer JWT |
| | `lib/vault-session.ts` | Glue: holds the unlocked master key in memory + a `BearerHolder` for the sync token; exposes high-level `enrollVault()` / `unlockVault()` / `lockVault()` |
| | `auth/auth-pathA.ts` | Top-level entry point used by `DeviceVault.tsx` (wires PRF extension into `passkey.create` / `passkey.get`) |
| **UI (`src/web/`)** | `pages/DeviceVault.tsx` (630 lines) | Enroll / unlock / list / add-key / delete UI; calls into vault-session.ts |
| **Edge (`src/infra/sync-worker/`)** | `index.ts` | Hono router: `/auth/challenge`, `/auth/exchange`, `GET/PUT/DELETE /vault/:id` |
| | `auth.ts` | JWT verify + issue (HS256, sub=vaultId, exp=24h) |
| | `cas.ts` | `readVault()`, `writeVaultIfNewer()` — compare-and-set on `updatedAt` |
| | `webauthn.ts` | Verifies the WebAuthn assertion in `/auth/exchange` (libsodium-backed, `@simplewebauthn/server`) |
| | `registry.ts` | Per-relying-party challenge cache + credential registry (R2-backed) |

The Python backend is **not on this path**. The Worker is the entire
server side of vault storage. Backend handles identity / billing /
proxy / agents — see specs 13 and 14.

---

## Crypto contract

```
                                 PRF output (32 bytes, hardware-backed)
                                          │
             ┌────────────────────────────┴────────────────────────────┐
             │                                                          │
             ▼                                                          ▼
       HKDF-SHA256                                                HKDF-SHA256
       info='ks-master-key-v1'                                    info='ks-vault-id-v1'
             │                                                          │
             ▼                                                          ▼
   AES-256-GCM CryptoKey                                       16-byte vault ID
   (extractable: false)                                        (rendered as 32-char hex)
             │                                                          │
             ▼                                                          ▼
     encrypt/decrypt the                                        URL path
     VaultPlaintext JSON                                        /vault/{id}
```

### Why two HKDF info strings (domain separation)

The same 32-byte PRF output produces both the master key and the
vault ID. Without HKDF info-string separation, exposing the vault ID
publicly (it ends up in URLs, R2 object keys, server logs) would leak
a function of the master key.

`info='ks-master-key-v1'` and `info='ks-vault-id-v1'` are
cryptographically distinct outputs even from the same input — the
vault ID being public reveals nothing about the key.

### Why `extractable: false`

`crypto.subtle.importKey('raw', bits, 'AES-GCM', false, [...])` with
`extractable=false` means the JS heap can't read the raw bytes back
out. A heap dump from a malicious extension or DevTools eval still
can't exfiltrate the key — only the WebCrypto API can see it, and the
API only exposes encrypt/decrypt operations.

This effectively turns the user's secure element (TPM, Secure
Enclave, Titan-M, etc.) into the project's TEE. **Without TEE
hardware on the user's device, we'd need a different design** — see
"out of scope" below.

### Why static HKDF salt

```ts
const HKDF_SALT = new Uint8Array(0);
```

The PRF output already mixes in WebAuthn's random challenge each
session, so the input keying material is fresh. A static salt is fine
here and lets a vault be **re-derived deterministically** on any
device that runs the same passkey — no salt-storage problem to solve.

### Wire format (`VaultCipher`)

```ts
interface VaultCipher {
  version: number;     // currently 1
  iv: string;          // base64url, 12 bytes (AES-GCM nonce)
  ciphertext: string;  // base64url, AES-GCM(plaintext) including 16-byte tag
  updatedAt: number;   // Date.now() at encrypt time — used by server CAS
}
```

The `updatedAt` field is in the cipher object (not just the
ciphertext) because the server uses it for CAS. **Both** copies must
match — the client encrypts `{...plaintext, updatedAt}` and emits the
same `updatedAt` in the wrapper. Mismatch is a bug.

---

## Wire shape — Auth (Bearer JWT)

### Step 1: get a challenge

```http
POST /auth/challenge
Content-Type: application/json

{ "vaultId": "deadbeefcafe1234..." }
```

```json
{ "challenge": "BASE64URL_RANDOM_32_BYTES", "expiresAt": 1234567890 }
```

### Step 2: exchange a WebAuthn assertion for a JWT

The browser calls `navigator.credentials.get({publicKey: {challenge,...}})`,
which produces an assertion. Client posts:

```http
POST /auth/exchange
Content-Type: application/json

{
  "vaultId": "deadbeef...",
  "credentialId": "BASE64URL",
  "authenticatorData": "BASE64URL",
  "clientDataJSON": "BASE64URL",
  "signature": "BASE64URL"
}
```

Worker verifies the signature against the credential's public key
(stored in R2's REGISTRY namespace at enroll time), then issues:

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "expiresAt": 1234654290
}
```

JWT claims:

```ts
{
  sub: vaultId,    // bound to the vault, NOT the user
  iat: number,
  exp: number,     // iat + 24h
}
```

### Why `sub == vaultId` (and not a user ID)

A leaked token can only mutate the specific vault it was issued for.
This is the same cardinality as a Cloudflare R2 presigned URL: one
token, one resource. There is no cross-vault token; cross-vault
operations require re-running `/auth/exchange` per vault.

The Worker's middleware enforces this:

```ts
app.use('/vault/:id', async (c, next) => {
  const claims = await verifyJwt(token);
  if (claims.sub !== c.req.param('id')) {
    return c.json({ error: 'token does not match vault id' }, 403);
  }
  await next();
});
```

---

## Wire shape — Vault CRUD

### `GET /vault/:id`

```http
GET /vault/deadbeef...
Authorization: Bearer <jwt>
```

```json
{
  "version": 1,
  "iv": "...",
  "ciphertext": "...",
  "updatedAt": 1234567890123
}
```

`404` if absent. `401` if token invalid. `403` if `sub != id`.

### `PUT /vault/:id` (compare-and-set)

```http
PUT /vault/deadbeef...
Authorization: Bearer <jwt>
Content-Type: application/json

{ "version": 1, "iv": "...", "ciphertext": "...", "updatedAt": 1234567890999 }
```

| Status | Meaning | Client action |
|---|---|---|
| `200 OK` | Stored | Show "Saved ✓" |
| `409 Conflict` | Stored copy has equal-or-newer `updatedAt` | Pull → merge → bump `updatedAt` → retry |
| `413` | Body > 256 KB (R2 object cap) | Abort, surface error |
| `400` | Malformed JSON / wrong `VaultCipher` shape | Bug, fix client |

Conflict handling lives in the **caller of `sync.ts`** (i.e.
`vault-session.ts`), because merge requires unwrapping both ciphers
to plaintext — `sync.ts` works with opaque blobs.

### `DELETE /vault/:id`

```http
DELETE /vault/deadbeef...
Authorization: Bearer <jwt>
```

`200 OK` on success. Idempotent. Does not delete the credential
registry (the user can re-PUT after delete; deleting the credential
is a separate `/auth/credentials/:id DELETE` endpoint, out of scope
here).

---

## CAS write protocol (server side)

```
client                          worker                          R2
  │                                │                              │
  │  PUT /vault/X (updatedAt=999) ──▶                              │
  │                                │  read X (updatedAt=500) ────▶ │
  │                                │ ◀──────────────── { uA=500 } │
  │                                │                              │
  │                                │  if 999 > 500: write X ────▶ │
  │                                │ ◀────────────── 200 OK       │
  │ ◀────── 200 OK                 │                              │
```

If two clients race with the same `updatedAt`, the server returns
`409` to whichever arrives second. Note R2 has eventual consistency
for cross-region reads, but **same-region writes are strongly
consistent** — this CAS works because the Worker reads + writes hit
the same R2 region.

---

## Why these choices (alternatives considered)

### Why a Cloudflare Worker, not the Python backend

Earlier (Path B, deprecated) the vault was stored server-side in the
Python backend, encrypted with a password-derived key. The user's
password gated access. Problems:

- **Server saw plaintext at decrypt time.** Even briefly — for
  `/proxy/*` to inject the API key, backend had to decrypt.
- **No multi-device.** Password change on device A invalidated all
  ciphertexts; device B couldn't unlock without a re-enroll.
- **Server liability.** A hostile operator with backend disk access
  could brute-force passwords against the AES-encrypted vault file.

Path A inverts the trust: server has only ciphertext + JWT-gated
access, decrypt happens client-side, multi-device works because the
PRF output is the same on every device that has the registered
passkey.

### Why R2 not Workers KV

KV has a 25 MB per-value cap and no atomic CAS. R2 lets us:

- Use a real HTTP body (256 KB practical cap is plenty for vaults
  that hold ~1000 entries × 200B each).
- Get a strong `If-Match` semantic via R2 ETags (we use a custom
  `updatedAt` CAS on top, but ETag could be the next iteration).
- Pay per-GB-stored, not per-read like KV.

### Why HS256 not RS256 for the JWT

The Worker is the only verifier. There's no second service that
needs to validate the token without the secret. HS256 is simpler,
faster, and the secret stays in Worker secrets — no cross-service
key distribution.

If we ever federate verification (e.g. the Python backend wants to
check "is this token still valid?"), we'd switch to RS256.

### Why no rotating IVs across re-encryptions

We generate a fresh 12-byte random IV every encrypt:

```ts
const iv = crypto.getRandomValues(new Uint8Array(12));
```

AES-GCM mandates IV uniqueness per (key, message). With a 96-bit
random IV, collision probability is negligible up to ~2³² messages
per key. A user is unlikely to encrypt 4 billion times against the
same vault, so no IV-derivation scheme is needed.

---

## Demo verification

### Pure-client smoke (no backend)

```bash
cd packages/shared && npm test
# vault.ts has unit tests for derive*, encryptVault, decryptVault
```

Round-trip:

```ts
const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
const key = await deriveMasterKey(prfOutput);
const id = await deriveVaultId(prfOutput);

const cipher = await encryptVault(key, emptyVault());
const back = await decryptVault(key, cipher);
// back.entries === {}
```

### End-to-end against running Worker

```bash
cd src/infra/sync-worker && npx wrangler dev      # local Worker on :8787
cd src/web && npm run dev                          # dashboard on :5173
```

Open `/app/device-vault`, click **Enroll**, follow the WebAuthn
prompt, then **Unlock**, then add a key. Reload — the key is still
there (round-tripped through R2 ciphertext).

---

## Out of scope (future specs)

- **Devices without WebAuthn PRF.** iOS Safari has Passkey but PRF
  extension support is limited as of this writing. Fallback: a
  password-derived key with PBKDF2 (slower derivation, single-device,
  user-managed). Not implemented; would be a Path A2.
- **Vault sharing.** Currently each vault is owned by exactly one
  passkey. Granting another user (or another device with a different
  credential) read-only access requires a separate sharing scheme —
  envelope encryption with a re-wrapped DEK. See `/share/*` routes
  in the Python backend (501 stub today; see V2-DOCS for the design
  sketch).
- **Vault rotation / break-glass recovery.** If the user loses every
  device with the registered passkey, the vault is unrecoverable.
  Mitigations (recovery codes, M-of-N social recovery) are deliberately
  *not* in v1 — they reintroduce server-side key material and break
  the zero-trust property. Documented as a known acceptance criterion.
- **Audit log + rate limiting at the Worker.** R2 access logs +
  Cloudflare Analytics give us coarse visibility, but per-vault rate
  limits (anti-abuse for free-tier users) live in a future ADR.
- **Cross-region R2 eventual consistency for multi-device.** When
  device A in us-east-1 writes and device B in eu-west-1 reads
  immediately, B may get stale data. Acceptable for v1 (vault edits
  are slow human-driven, not real-time). If we need strong global
  consistency, we move to Durable Objects or a dedicated KV namespace.
