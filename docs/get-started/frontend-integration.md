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

## What "integration" means here

KeyShield ships as **TypeScript modules**, not a hosted SDK. You
either:

- **Embed the popup** as a route in your own SPA (recommended for
  most apps), or
- **Import the lib modules directly** (`vault.ts`, `auth.ts`,
  `sync.ts`, `sync-auth.ts`) and build your own UI on top.

This page covers the embed path. For direct lib usage, read the
TypeScript modules under `src/web-v2/lib/` — they're the source of truth.

---

## Prerequisites

- **Your own deployed sync worker.** You need a URL like
  `https://keyshield-sync.<account>.workers.dev`. Get one by
  following [self-host.md § Deploy the worker](./self-host.md#step-2--deploy-the-cloudflare-worker).
- **A Solana RPC URL.** The popup hits Solana for session grants.
  - **Recommended:** Helius, Triton, or QuickNode — these are paid
    providers that won't rate-limit you.
  - Public `https://api.mainnet-beta.solana.com` works for
    development but throttles aggressively.
- **A program ID.** Either deploy your own (see [self-host.md
  § Deploy the program](./self-host.md#step-3--deploy-the-solana-program))
  or use the shared devnet program ID
  `CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8` for testing.
- **A frontend with Vite, Next.js, or any bundler that handles
  TypeScript + ESM.** The popup imports React 18.

---

## Step 1 — Add the workspace as a dependency

If your app lives in this monorepo, `extension-sync` is already a
sibling workspace — just add it to your `package.json`:

```json
{
  "dependencies": {
    "@keyshield/extension-sync": "*"
  }
}
```

If your app lives **outside** the monorepo, vendor the lib by
copying `extension-sync/src/lib/` into your app and adjusting the
imports. There's no published npm package yet.

**Verify:**

```bash
npm install
node -e "console.log(Object.keys(require('@keyshield/extension-sync/src/lib/vault')))"
# ['LocalVault','VAULT_VERSION', ...]
```

---

## Step 2 — Configure the three environment variables

Set these in your app's `.env.local` (Vite / Next) or however you
inject runtime config:

```bash
# Where your Cloudflare Worker is deployed
VITE_KEYSHIELD_SYNC_URL=https://keyshield-sync.your-account.workers.dev

# Your Solana RPC. If you have a Helius API key:
VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
# ...or the cheap-and-cheerful default for development:
# VITE_SOLANA_RPC_URL=https://api.devnet.solana.com

# Solana program ID (deploy your own or use the shared one)
VITE_KEYSHIELD_PROGRAM_ID=CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8
```

**Verify:**

```bash
# In your app, before mounting the popup:
console.log(import.meta.env.VITE_KEYSHIELD_SYNC_URL);
// Should print your worker URL, NOT undefined.
```

---

## Step 3 — Mount the popup

In your route or component:

```tsx
// app/vault/page.tsx (or wherever)
import { App as KeyShieldPopup } from '@keyshield/extension-sync/src/popup/App';

export default function VaultPage() {
  return (
    <div className="h-screen w-full">
      <KeyShieldPopup />
    </div>
  );
}
```

The popup is a self-contained React tree. It reads
`import.meta.env.*` for the three variables above.

**Verify:**

- Navigate to `/vault`. You see the **"Set up your vault"**
  screen.
- Click **"Create vault with Face ID"**. Your platform's
  passkey prompt appears.
- After completing it, you see the 24-word recovery phrase.

---

## Step 4 — (Optional) Read keys from your app

The popup **never exposes the plaintext over postMessage or any
other channel by design** — that would defeat the threat model.

If your app needs to *consume* the stored keys, you have two
choices:

### Option A — Run side-by-side and cooperate via the same vault

Your app ships an SDK that, when given the user's passkey
assertion, derives the same vault key and reads the cipher
directly:

```ts
import { LocalVault } from '@keyshield/extension-sync/src/lib/vault';
import { AuthService } from '@keyshield/extension-sync/src/lib/auth';

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

### Option B — Treat the popup as a "key picker"

Open the popup in a sub-frame or popup window, let the user reveal
the key, and have them paste it into your app. No code-level
integration. Slow but bulletproof.

---

## Step 5 — Wire force-revoke into your "lost device" UX

If your app has a "Revoke all my sessions" page, plumb it through:

```tsx
import { useVaultFlow } from '@keyshield/extension-sync/src/popup/hooks/useVaultFlow';

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
- [ ] **`RP_ID` and `RP_ORIGIN`** in the worker match your
      production domain. Changing them later breaks every
      existing passkey.
- [ ] **`JWT_SECRET`** is set via `wrangler secret put`, never
      committed to `wrangler.toml`.
- [ ] **You're not logging `prfSecret` or `state.seed`** in your
      app's analytics. Both are root credentials.
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

## Next steps

- [Self-host](./self-host.md) — deploy your own worker + program.
- The TypeScript modules under `src/web-v2/lib/` are the canonical
  contract; read them when in doubt.
