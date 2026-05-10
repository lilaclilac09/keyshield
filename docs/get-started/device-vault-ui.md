# Using Device Vault — Path A UI

> **2026-05-10 status:** the Device Vault UI (`DeviceVaultSection.tsx`,
> `AddDeviceKeyModal`, etc.) shipped in `src/web-v2/`, which was
> archived to `src/_archive/web-v2/` when the dashboard at `dashboard/`
> was renamed to `src/web/`. The new `src/web/` does **not** contain
> these components yet — reintegration is on the punch list. To run
> the flow today, clone the archive locally:
>
> ```bash
> cd src/_archive/web-v2
> npm install && npm run dev
> # http://localhost:5173 → Device Vault tab
> ```
>
> The crypto + sync-worker contract is unchanged; the Cloudflare Worker
> at `src/infra/sync-worker/` is what the archived UI talks to, and it
> still works against `https://keyshield-sync.<account>.workers.dev`.

> Path A is the zero-knowledge ("device-as-TEE") vault. Your passkey's
> WebAuthn-PRF output derives a master key inside the secure element;
> the server (Cloudflare Worker) only ever sees ciphertext.

This guide describes the UI as it exists in `src/_archive/web-v2/`. For
the crypto and sync-worker contract, read
[`docs/technical/SYNC_VAULT_ARCHITECTURE.md`](../technical/SYNC_VAULT_ARCHITECTURE.md).

---

## Where to open it

After signing in, click **Device Vault** in the left sidebar (between
*Vault* and *Activity*).

```
KeyShield  ┐
  Vault    │   ← server-side AES-256-GCM (Path B)
► Device   │   ← zero-knowledge, encrypted on this device (Path A)
  Activity │
  Agents   │
  …        ┘
```

The page header reads **"Zero-knowledge — encrypted on this device,
server only sees ciphertext"**, and a green badge under it repeats the
same promise, so you can tell at a glance what mode you're in.

---

## Three states

The Device Vault has exactly three states, and the UI tells you which
one you're in:

### 1. Not enrolled (first-time setup)

If this device has no PRF passkey yet, you'll see:

> **Set up Device Vault**
> Enrolls a passkey with WebAuthn PRF. The master key is derived on
> this device and never reaches our servers.

Click **"Enroll passkey"**. Your browser prompts for Face ID / Touch ID
/ Windows Hello / hardware key. Behind the scenes:

1. `navigator.credentials.create()` is called with the `prf` extension.
2. The 32-byte PRF output is fed through HKDF-SHA256 to derive both
   the AES-GCM master key and a stable, anonymous vault ID.
3. The Cloudflare Worker is told "vault `<id>` exists; here's the
   attestation that proves a real authenticator made it". The Worker
   never sees the master key.
4. The just-derived master key is held in JS memory and used to
   pull/push the (currently empty) ciphertext blob.

After enrollment the UI lands on **state 3 (unlocked, empty)**.

### 2. Enrolled but locked

If you've enrolled before but reloaded the page or hit **Lock**, you'll
see:

> **Vault locked**
> Tap your passkey to derive the master key and load the encrypted
> vault from sync storage.

Click **"Unlock vault"** → passkey prompt → vault is downloaded from
the Worker and decrypted in memory.

### 3. Unlocked

Now you see your encrypted entries (or an empty state if you've never
added anything). Each entry card shows the provider name and an action
button.

#### Add an encrypted key

Top-right **Add** button opens a modal:

| Field | Notes |
|---|---|
| Provider | OpenAI / Anthropic / Groq / Helius / Mistral / Cohere |
| API key | `type="password"` so it's not visible by default |

Click **"Encrypt & store"**:

1. The plaintext is added to the in-memory vault state.
2. The whole vault is re-encrypted (AES-GCM, fresh 12-byte IV).
3. The new ciphertext is pushed to the Worker via CAS on `updatedAt`.
4. The plaintext is wiped from React state immediately.

#### Use a key

Each entry card has a one-click demo action ("List models" for AI
providers, "getHealth" for Helius, etc.):

1. The component calls `proxyFetch(upstream, path, { method: 'GET' })`.
2. `proxyFetch` (in `src/web-v2/lib/auth.ts`) pulls the plaintext from
   the in-memory vault and attaches it to the request as
   `X-Upstream-API-Key: <key>`.
3. The Python proxy at `/proxy/:upstream/:path` reads that header,
   forwards to the upstream provider, and **never persists or logs
   the key**.
4. The card renders the response status, latency, and JSON body, with
   a green "✓ proxied · key never persisted server-side" badge.

#### Delete an entry

Trash icon on the entry card. Confirms before removing. The vault is
re-encrypted and re-pushed without that entry.

#### Lock manually

Top-right **Lock** button clears the master key from JS memory and
clears the cached bearer for the Worker. The next operation needs a
fresh passkey tap.

---

## Comparing Path A vs Path B

| Question | Path A (Device Vault) | Path B (legacy "Vault") |
|---|---|---|
| Where does ciphertext live? | Cloudflare Worker + R2 | Server-side encrypted file vault |
| Where is the encryption key? | Derived per-session from your passkey's PRF, never persisted anywhere | Server-side, wrapped by `SERVER_SECRET` |
| Does the server ever see plaintext? | Only inside the proxy's per-request memory, attached to one outbound HTTP call | Yes — server holds the wrapping key |
| New-device onboarding | Tap Face ID once (passkey synced via iCloud Keychain / Google Password Manager) | Re-import each key manually |
| Threat: server compromise | Attacker gets only ciphertext — no plaintext recovery | Attacker can decrypt the whole vault |

Use **Path A** when you can: it's the better default for personal
power-user workflows. **Path B** is still useful for shared accounts,
service-to-service usage where there's no human at a passkey, or older
browsers without WebAuthn-PRF.

---

## Browser compatibility

WebAuthn-PRF is required. As of 2026:

| Browser | PRF support |
|---|---|
| Chrome / Edge (≥ 118) | ✅ |
| Safari (≥ 17, macOS 14 / iOS 17) | ✅ |
| Firefox (≥ 119) | ⚠️ requires hmac-secret authenticator (most do) |
| Brave | ✅ if PRF flag enabled |

If your browser/authenticator doesn't return PRF, the UI surfaces:

> "Passkey did not return PRF — device unsupported for Path A vault"

Fall back to Path B (regular Vault tab) on those devices.

---

## Troubleshooting

**"No passkey registered on this device"**
Click **Enroll passkey** to register one. Note: passkeys are
device-scoped — if you previously enrolled on another machine and the
authenticator isn't synced via iCloud / Google, you'll need to enroll
this device too.

**"Vault conflict — another device wrote first"**
Two devices edited at the same time. Reload the page; the second
write's ciphertext wins (CAS on `updatedAt`). KeyShield never silently
loses data — see the "tombstones" section in
[`SYNC_VAULT_ARCHITECTURE.md`](../technical/SYNC_VAULT_ARCHITECTURE.md)
for the full conflict-resolution model.

**Demo "Use" button returns 401 / 404**
The Python proxy expects upstream credentials configured for the
selected provider. For local self-host, ensure your provider mappings
exist in `src/backend/proxy/api_router.py`. The error body is
forwarded verbatim from the upstream API.
