# Frontend integration

> Embed KeyShield in your own web app. The user gets a passkey-gated
> vault, encrypted on their device, synced to your Cloudflare
> Worker. **You never see the plaintext.**

## When to use this path

- You're building a web app that needs to store user-supplied API
  keys (OpenAI tokens, Stripe restricted keys, Postgres
  connection strings — anything sensitive).
- You want end-to-end encryption with no server-side decrypt path.
- You'd rather not roll your own WebAuthn-PRF + AES-GCM +
  cross-device sync.

If you only need the popup as a standalone tool, you don't need
this page — point users at the deployed popup URL.

---

## Two URLs, two contracts

The merged architecture (Path A storage + Python usage) means a
KeyShield-integrated frontend talks to **two backends**:

| Backend | Variable | Use |
|---|---|---|
| Cloudflare sync-worker | `VITE_KEYSHIELD_SYNC_URL` | Vault **storage** — `/vault/:id`, `/auth/*` (Path A; zero-knowledge) |
| Python FastAPI | `KEYSHIELD_API_URL` | Vault **usage** — `/proxy/*`, `/billing/*`, `/agents/*`, `/share/*`, `/usage/*`, `/mpp/*` |

The client decrypts the requested key from the cipher pulled from
the Worker, then forwards it to the Python API on the
`X-Upstream-API-Key` header for the actual upstream call. The
Python service is stateless with respect to upstream keys — it
uses the header, calls the upstream, returns the response, and
never persists the key.

---

## What "integration" means here

KeyShield ships as **TypeScript modules**, not a hosted SDK. You
either:

- **Embed the dashboard** as a route in your own SPA (recommended for
  most apps), or
- **Import the lib modules directly** (`vault.ts`, `auth.ts`,
  `sync.ts`, `sync-auth.ts` from `src/web-v2/lib/`) and build
  your own UI on top.

This page covers the embed path. For direct lib usage, read the
TypeScript modules under `src/web-v2/lib/` — they're the source of truth.

---

## Prerequisites

- **Your own deployed sync worker.** You need a URL like
  `https://keyshield-sync.<account>.workers.dev`. Get one by
  following [self-host.md § Deploy the worker](./self-host.md#step-2--deploy-the-cloudflare-worker-vault-storage).
- **Your own deployed Python API.** You need a URL like
  `https://keyshield-production.up.railway.app` (or your own
  custom domain). Get one by following [self-host.md § Deploy the Python
  API](./self-host.md#step-3--deploy-the-python-api-vault-usage).
- **A Solana RPC URL.** The popup hits Solana for session grants.
  - **Recommended:** Helius, Triton, or QuickNode — these are paid
    providers that won't rate-limit you.
  - Public `https://api.mainnet-beta.solana.com` works for
    development but throttles aggressively.
- **A program ID.** Either deploy your own (see [self-host.md
  § Deploy the program](./self-host.md#step-4--deploy-the-solana-program))
  or use the shared devnet program ID
  `CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8` for testing.
- **A frontend with Vite, Next.js, or any bundler that handles
  TypeScript + ESM.** The popup imports React 18.

---

## Step 1 — Add the workspace as a dependency

If your app lives in this monorepo, `src/web-v2` is already a
sibling workspace — just add it to your `package.json`:

```json
{
  "dependencies": {
    "@keyshield/web-v2": "*"
  }
}
```

If your app lives **outside** the monorepo, vendor the lib by
copying `src/web-v2/lib/` into your app and adjusting the
imports. There's no published npm package yet.

**Verify:**

```bash
npm install
node -e "console.log(Object.keys(require('@keyshield/web-v2/lib/vault')))"
# ['LocalVault','VAULT_VERSION', ...]
```

---

## Step 2 — Configure the environment variables

The merged architecture needs **both** the sync-worker (vault
storage) and the Python API (vault usage). Set these in your
app's `.env.local` (Vite / Next) or however you inject runtime
config:

```bash
# Path A — Cloudflare Worker for vault storage (zero-knowledge)
VITE_KEYSHIELD_SYNC_URL=https://keyshield-sync.your-account.workers.dev

# Python FastAPI for vault usage (proxy, billing, agents, sharing)
KEYSHIELD_API_URL=https://keyshield-production.up.railway.app

# Your Solana RPC. If you have a Helius API key:
VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
# ...or the cheap-and-cheerful default for development:
# VITE_SOLANA_RPC_URL=https://api.devnet.solana.com

# Solana program ID (deploy your own or use the shared one)
KEYSHIELD_PROGRAM_ID=CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8
```

> Both `KEYSHIELD_*` and `VITE_KEYSHIELD_*` aliases are accepted
> at build time; pick the one your bundler exposes to client
> code.

**Verify:**

```bash
# In your app, before mounting the popup:
console.log(import.meta.env.VITE_KEYSHIELD_SYNC_URL);
console.log(import.meta.env.KEYSHIELD_API_URL);
// Both should print real URLs, NOT undefined.
```

---

## Step 3 — Mount the popup

In your route or component:

```tsx
// app/vault/page.tsx (or wherever)
import { App as KeyShieldDashboard } from '@keyshield/web-v2/App';

export default function VaultPage() {
  return (
    <div className="h-screen w-full">
      <KeyShieldDashboard />
    </div>
  );
}
```

The dashboard is a self-contained React tree. It reads
`import.meta.env.*` for the variables above.

**Verify:**

- Navigate to `/vault`. You see the **"Set up your vault"**
  screen.
- Click **"Create vault with Face ID"**. Your platform's
  passkey prompt appears.
- After completing it, you see the 24-word recovery phrase.
- Network tab shows requests going to **both** your sync-worker
  domain (vault storage) and your Python API domain (when you
  exercise a `/proxy/*` upstream).

---

## Step 4 — (Optional) Read keys from your app

The dashboard **never exposes the plaintext over postMessage or any
other channel by design** — that would defeat the threat model.

If your app needs to *consume* the stored keys, you have two
choices:

### Option A — Run side-by-side and cooperate via the same vault

Your app ships an SDK that, when given the user's passkey
assertion, derives the same vault key and reads the cipher
directly:

```ts
import { LocalVault } from '@keyshield/web-v2/lib/vault';
import { AuthService } from '@keyshield/web-v2/lib/auth';

const auth = new AuthService({
  credentials: navigator.credentials,
  rpName: 'YourApp',
});
const result = await auth.authenticateWithWebAuthn();
if (!result.success) throw new Error(result.error);

const vault = new LocalVault({
  storage: yourStorageBackend,
  crypto: { subtle: crypto.subtle, getRandomValues: crypto.getRandomValues.bind(crypto) },
});
const masterKey = await vault.deriveMasterKey(result.prfSecret);
const cached = await vault.getCachedCipher();
const plain = await vault.decryptVault(cached, masterKey);

console.log(plain.apiKeys['openai-prod'].value); // sk-...
```

This requires your app to use the **same RP ID** as the popup.

### Option B — Treat the dashboard as a "key picker"

Open the dashboard in a sub-frame or popup window, let the user reveal
the key, and have them paste it into your app. No code-level
integration. Slow but bulletproof.

### Option C — Forward decrypted keys via the Python proxy

If your app already has a Python-side flow, decrypt the key on
the client and call the Python API's `/proxy/<upstream>/...`
endpoint with the key in the `X-Upstream-API-Key` header. The
proxy handles the upstream call without ever persisting the key.
This is what the SDKs do under the hood; see AGENTS.md §2 for
the full contract.

---

## Step 5 — Wire force-revoke into your "lost device" UX

If your app has a "Revoke all my sessions" page, plumb it through:

```tsx
import { useVaultFlow } from '@keyshield/web-v2/popup/hooks/useVaultFlow';

const flow = useVaultFlow(services);

// Only available when the user is in the post-restore unlocked
// state (state.kind === 'unlocked' && state.seed != null).
async function handleLostDevice() {
  await flow.forceRevokeOtherDevices();
  // Every other device's next /auth/exchange now 404s.
}
```

The hook calls `/auth/revoke-challenge` + `/auth/force-revoke` on
your worker; the user's seed-derived Ed25519 key is the
authorization (seed-bound force-revoke; the seed-derived signing key
is the only credential that can wipe a remote passkey).

---

## Security checklist

- [ ] **Worker URL is HTTPS in production** — the popup refuses
      WebAuthn over plain HTTP except on `localhost`.
- [ ] **Python API URL is HTTPS in production** — the
      `X-Upstream-API-Key` header carries plaintext key material
      for the duration of one request; HTTPS is non-negotiable.
- [ ] **`RP_ID` and `RP_ORIGIN`** in the worker match your
      production domain. Changing them later breaks every
      existing passkey.
- [ ] **`JWT_SECRET`** is set via `wrangler secret put`, never
      committed to `wrangler.toml`.
- [ ] **`KS_CORS_ORIGINS`** on the Python API includes only the
      origins you operate.
- [ ] **You're not logging `prfSecret`, `state.seed`, or
      decrypted upstream keys** in your app's analytics. All
      three are sensitive credentials.
- [ ] **CORS** on your worker only allows the origins you operate.
      The default config accepts any origin — fine for dev,
      tighten for prod.

---

## Troubleshooting

- **`AuthService.registerPasskey` returns `success: false`** with
  `error: 'WebAuthn not supported'` → the user's browser doesn't
  expose `PublicKeyCredential`. There's no fallback.
- **`/auth/exchange` returns 401** → the registration was wiped
  by a `/auth/force-revoke` call. The user needs to re-register.
- **Popup hangs on "Loading…"** → check the Network tab. Usually a
  CORS preflight failing against your worker.
- **`InvalidMnemonicError` on restore** → the 24 words don't pass
  the BIP-39 checksum. Likely a typo or autocorrect-mangled words.
- **`/proxy/*` returns 401 / 400 from the Python API** →
  `X-Upstream-API-Key` header is missing or malformed; verify
  the client decrypted the entry locally before forwarding.

## Next steps

- [Self-host](./self-host.md) — deploy your own worker, Python
  API, and Solana program.
- [SYNC_VAULT_ARCHITECTURE.md](../technical/SYNC_VAULT_ARCHITECTURE.md)
  — the full V1.1 design, threat model, and per-key crypto.
- The TypeScript modules under `src/web-v2/lib/` are the canonical
  contract; read them when in doubt.
