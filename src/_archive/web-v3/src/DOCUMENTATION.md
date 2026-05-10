# KeyShield Web — Version Documentation (web, web-v2, web-v3)

## Overview

KeyShield is a **zero-trust API key vault** for Solana and EVM chains. Three web versions share the same core feature set but differ in architecture:

- **`web/`** (v1): Single-file React app, no TanStack Router, manual state
- **`web-v2/`** (v2): React + TanStack Query, section components extracted, Tailwind
- **`web-v3/`** (v3): React + TanStack Router + Zustand, features organized under `features/vault/`, Zod validation

All three versions run on the same backend at `http://localhost:8000`.

---

## Architecture Comparison

| Aspect | web (v1) | web-v2 (v2) | web-v3 (v3) |
|--------|----------|-------------|-------------|
| **Router** | None (manual `section` state) | None (manual `section` state) | TanStack Router (`routes/`) |
| **State Mgmt** | React `useState` + `useCallback` | React + TanStack Query | Zustand store + TanStack Query |
| **Validation** | None | None | Zod schemas (`lib/zod.ts`) |
| **CSS** | Inline styles + Tailwind classes | Tailwind (Tailwind 4) | Tailwind (Tailwind 4) |
| **Section layout** | All inline in `App.tsx` | Extracted to `components/sections/*.tsx` | Organized under `features/vault/components/` |
| **Build** | Vite only | Vite + ESM | Vite + TS project references |
| **Extension** | background.js + content.js | Same | Same |
| **Dependencies** | ~8 deps | ~10 deps | ~16 deps (added zustand, zod, tailwind) |
| **Bundle size** | Smallest (~450KB) | Medium (~480KB) | Largest (~520KB) |

---

## Feature Matrix (All Three Versions Support)

### Authentication & Auth Flow

- **Passkey login**: `navigator.credentials.get()` → WebAuthn verify on server
- **Solana wallet login**: Challenge → Ed25519 signature → session token
- **Dual auth**: Passkey (Face ID/Touch ID) OR wallet
- **Deterministic vault key**: ed25519 signature → SHA-256 → base64 passphrase (same every session)
- **Extension bridge**: `pushTokenToExtension()` via `chrome.runtime.sendMessage`

### Vault

- **VaultItem types**: `api_key | password | note | env | ssh_key`
- **CRUD**: Add, Delete, Decrypt (AES-256-GCM), Toggle Favorite
- **Auto-reveal**: Decrypts key for configurable duration (default 30s) with countdown timer
- **Search**: Case-insensitive on name, domain, tags
- **Hooks**: `useVaultList(query)` — fetches from `/manage/list` via TanStack Query (v2/v3) or manual state (v1)

### Sections (8 total, same across versions)

| Section | Path | Features |
|---------|------|----------|
| **Vault** | `/vault` | Secret management, add/delete/decrypt keys |
| **Activity** | `/activity` | Proxy call logs, usage metrics, balance display |
| **Agents** | `/agents` | Agent registry (ed25519 identities), embedded wallets |
| **Sharing** | `/sharing` | Key sharing via re-encryption (incoming/outgoing) |
| **Sessions** | `/sessions` | Active sessions across devices |
| **Settings** | `/settings` | Account, security, preferences |
| **Developer** | `/developer` | API tokens, SDK snippets, endpoint reference |
| **Docs** | `/docs` | Architecture, integration guides, specs |

### Solana Integrations

- **PDA derivation**: `deriveStreamPda(agentPubkey, ownerPubkey)` with seeds `["open_payment_stream", agent_pubkey, owner_pubkey]`
- **Transaction building**: `buildTxFromResponse()` decodes base64 ix → Transaction
- **Confirmation**: Confirms at `'confirmed'` commitment
- **ATA derivation**: Manual (no `@solana/spl-token` dependency)
- **Wallet support**: Phantom, Backpack, OKX (via Wallet Standard) + Solflare fallback
- **MPP streams** (Phase 10.5): Open stream, build/take withdraw transactions

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/wallet-challenge` | GET | Challenge nonce |
| `/auth/wallet-login` | POST | Sign challenge → session token |
| `/auth/passkey/auth-options?user_id=` | GET | WebAuthn auth options |
| `/auth/passkey/auth-verify` | POST | Verify passkey → token |
| `/auth/passkey/register-options` | GET | Registration options |
| `/auth/passkey/register-verify` | POST | Register credential |
| `/auth/passkey/list` | GET | List credentials |
| `/auth/logout` | POST | Logout |
| `/manage/list` | GET | List vault keys |
| `/manage/store` | POST | Store key |
| `/manage/decrypt/{id}` | GET | Decrypt key |
| `/manage/secret/{id}` | DELETE | Delete secret |
| `/share/grant` | POST | Grant share |
| `/share/incoming` | GET | Incoming shares |
| `/share/outgoing` | GET | Outgoing shares |
| `/mpp/streams/{id}/build-open-tx` | POST | Build open stream TX |
| `/mpp/streams/{id}/build-withdraw-tx` | POST | Build withdraw TX |

### Key Detector (content.js)

30+ API patterns detected:
- **Tier 1 (Solana)**: Helius, QuickNode, Alchemy, Ankr, GetBlock, Chainstack
- **Tier 2 (Analytics)**: Shyft, SolanaFM, Solscan
- **Tier 3 (Trading/MEV)**: bloXroute, 0x API
- **Tier 4**: Moralis, Tatum
- **Classic**: OpenAI, Anthropic, GitHub PAT, Stripe, AWS, Google Cloud, Twilio, Cloudflare

### OCR (Optional)

- **Lazy-loaded** tesseract.js
- **Two modes**: Screen capture (`getDisplayMedia`) + file upload
- Extracts text → runs KeyDetector → shows masked keys with "Save to vault"

### X402 Trust Manager

- **TrustStore**: `Record<hostname, { threshold_usd, enabled, added_at }>`, dual storage (chrome.storage.local + localStorage)
- **Auto-pay flow**: Detects 402 + `X-Payment-Required: x402` → check trust store → auto-pay if amount < threshold
- **Content.js interceptor**: Wraps `window.fetch` to detect and handle X402 payments
- **Background handlers**: `X402_CHECK_TRUST`, `INITIATE_X402_PAYMENT`, `UPDATE_X402_TRUST`

---

## Version-Specific Differences

### web (v1) — Current Working Version

**Structure:**
```
web/
  App.tsx           — Main content + auth screen (single file, ~205 lines)
  index.tsx         — Entry point
  types.ts          — Types
  constants.tsx     — Provider registry
  background.js     — Extension background (238 lines)
  content.js        — Scanner (574 lines)
  components/
    WalletConnector.tsx
    AuthScreen.tsx
    AddKeyModal.tsx
    VaultItemCard.tsx
    SolanaProvider.tsx
    HealthBadge.tsx
    BetaBanner.tsx
    X402TrustManager.tsx
    OcrScanner.tsx
  components/ui/    — 18 UI components
  hooks/
    useVaults.ts    — Manual state management (no TanStack Query)
  lib/              — 12 modules (api, auth, vault-key, solana, key-detector, ocr, etc.)
```

**Key traits:**
- Manual `section` state + `useState` for everything
- `useVaults.ts` maintains its own state (no TanStack Query)
- `background.js` is the full extension background (not a separate package)
- `content.js` has 574 lines — includes provider definitions, scan loop, notification UI, X402 interceptor
- **No Tailwind** — uses inline styles + class names that map to globals
- Smallest bundle size

### web-v2 (v2) — TanStack Query Era

**Structure:**
```
web-v2/
  App.tsx           — Main content with TanStack Query hooks
  router.tsx        — Router setup
  routes.tsx        — Route definitions
  components/sections/  — Extracted section components
  styles.css        — Tailwind entry
  tailwind.config.js
  eslint.config.js
```

**Key traits:**
- First version to use **TanStack Query** (`useVaultList`, `useVaultDelete`, `useVaultAdd`)
- Section components extracted into individual files (was all inline in v1)
- Adds Tailwind CSS for styling
- `router.tsx` + `routes.tsx` exist but are not the primary routing mechanism
- **Still uses manual section state** (not TanStack Router)

### web-v3 (v3) — TanStack Router + Zustand

**Structure:**
```
web-v3/
  src/
    App.tsx           — Main content component
    main.tsx          — Entry point (Vite entry)
    styles.css        — Tailwind 4 CSS
    features/vault/components/  — Section components organized by feature
      VaultSection.tsx
      ActivitySection.tsx
      AgentsSection.tsx
      DeveloperSection.tsx
      DocsSection.tsx
      EphemeralWalletsSection.tsx
      SessionsSection.tsx
      SettingsSection.tsx
      SharingSection.tsx
    hooks/useVaults.ts
    lib/              — Same 12 modules as web/v1
    routes/
      root.tsx
      routeTree.gen.ts
    types/index.ts    — Zod-validated types
```

**Key traits:**
- **TanStack Router** for typed routing (`routes/root.tsx`)
- **Zustand** stores for auth state + settings
- **Zod** schemas in `types/index.ts` for runtime validation
- **Tailwind 4** with `@tailwindcss/vite` plugin
- Features organized under `features/vault/components/` instead of flat `components/sections/`
- Most dependencies but cleanest architecture

---

## Module-by-Module Feature Reference

### lib/auth.ts (all versions)

```typescript
// Core functions
getAuth(): { userId, walletAddress, token } | null
setAuth(auth: AuthState): void
clearAuth(): void
isAuthenticated(): boolean  // checks localStorage for ks_token

// Wallet auth flow
fetchWalletChallenge(userId: string): Promise<{ challenge: string; expiresAt: number }>
walletLogin(challenge: string, signature: string, passphrase: string): Promise<string>

// Passkey auth
getPasskeyTrust(): { userId: string; passphrase: string } | null
passkeyLogin(): Promise<{ userId: string; passphrase: string }>
setPasskeyTrust(userId: string, passphrase: string): void
registerPasskey(name: string): Promise<PublicKeyCredential>
listPasskeys(): Promise<Array<{ id: string; name: string }>>
deletePasskey(credId: string): Promise<void>

// Extension bridge
pushTokenToExtension(token: string): void
clearTokenInExtension(): void
pingExtension(): Promise<{ installed: boolean; hasToken: boolean }>
```

### lib/api.ts (all versions)

```typescript
API_BASE = import.meta.env.VITE_KEYSHIELD_API_URL ?? 'http://localhost:8000'

// Account
fetchDeleteAccountChallenge(walletAddress: string): Promise<{ challenge: string }>
deleteAccount(challenge: string, signature: string): Promise<DeleteAccountReport>

// Sharing
grantShare(recipient: string, keyIds: string[]): Promise<void>
listIncomingShares(): Promise<Share[]>
listOutgoingShares(): Promise<Share[]>
revokeShare(shareId: string): Promise<void>

// MPP Wallet (Phase 10.5)
buildOpenStreamTx(ownerPubkey: string, agentPubkey: string): Promise<string>
buildWithdrawTx(streamId: string, amount: number): Promise<string>
recordMppTxSignature(streamId: string, txSig: string): Promise<void>

// API fetch with auth injection
apiFetch(path: string, options?: RequestInit): Promise<Response>
getToken(): string | null
```

### lib/solana.ts (all versions)

```typescript
// PDA derivation
deriveStreamPda(agentPubkey: PublicKey, ownerPubkey: PublicKey): PublicKey

// Transaction building
buildTxFromResponse(response: BuildTxResponse): Transaction
signAndConfirmTx(tx: Transaction): Promise<string>  // returns signature

// ATA (without @solana/spl-token)
deriveAta(owner: PublicKey, mint: PublicKey): PublicKey

// Explorer
explorerTxUrl(sig: string, cluster: string): string
```

### lib/key-detector.ts (all versions)

```typescript
class KeyDetector {
  // 6 detection methods
  detectFormFields(): DetectedKey[]
  detectClipboard(): DetectedKey | null
  detectFromText(text: string): DetectedKey[]
  setupFormMonitoring(): () => void
  setupClipboardMonitoring(intervalMs?: number): () => void
  detectFromDOMContent(): DetectedKey[]

  // Pattern matching
  isValidKey(key: string): boolean
}
```

### lib/x402-trust.ts (all versions)

```typescript
// Trust store
type TrustList = Record<string, { threshold_usd: number; enabled: boolean; added_at: string }>

isTrusted(hostname: string): boolean
getThreshold(hostname: string): number
addDomain(hostname: string, threshold_usd: number): void
removeDomain(hostname: string): void
listTrustedDomains(): TrustList
toggleDomain(hostname: string): void
```

### hooks/useVaults.ts (v2/v3 use TanStack Query)

```typescript
// web-v2 and web-v3
useVaultList(searchQuery: string, defaultTag: string): UseQueryResult<VaultItem[]>
useVaultDelete(): MutationResult
useVaultAdd(): MutationResult

// web (v1) — manual state
const [items, setItems] = useState<VaultItem[]>([])
// + methods: addItem, deleteItem, decryptItem, toggleFavorite
```

---

## Extension Architecture (all versions)

### background.js

```javascript
// Message handlers
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'SAVE_KEY':           // Save detected key directly
    case 'KS_TOKEN_REGISTER':   // Dashboard → extension token sync
    case 'KS_TOKEN_CLEAR':      // Logout → clear extension token
    case 'KS_PING':             // Check if extension is alive
    case 'X402_CHECK_TRUST':    // Auto-pay check
    case 'INITIATE_X402_PAYMENT': // Initiate X402 payment
  }
});

// Audit log retention: 30-day age + 500-entry cap
```

### content.js (574 lines)

```javascript
// Provider definitions
const providers = [
  { id, name, domain[], pattern, minLen, requiresDomain },
  // OpenAI, Anthropic, Groq, Mistral, Cohere, Helius, 0x, Alchemy
];

// Scan loop: every 3 seconds + MutationObserver
function scan() { ... }

// X402 fetch interceptor
window.fetch = new Proxy(window.fetch, {
  apply(target, thisArg, args) {
    return target.apply(thisArg, args).then(response => {
      if (response.status === 402 && response.headers.get('X-Payment-Required') === 'x402') {
        handleX402Payment(response);
      }
      return response;
    });
  }
});
```

---

## Migration Guide: web → web-v3

### What Changed

1. **Router**: Manual `section` state → TanStack Router (typed routes)
2. **State**: React `useState` → Zustand stores (`authStore`, `settingsStore`)
3. **Validation**: None → Zod schemas in `types/index.ts`
4. **Layout**: Flat `components/` → feature-organized `features/vault/components/`
5. **CSS**: Tailwind (any) → Tailwind 4 with `@tailwindcss/vite` plugin
6. **Entry**: `index.tsx` → `src/main.tsx`

### What Stayed the Same

- All 8 section features
- Auth flow (passkey + wallet)
- Vault CRUD operations
- Solana integrations (PDA, TX building, ATA)
- X402 trust manager
- Key detector (30+ patterns)
- Extension bridge
- API endpoints
- Content.js scanner logic

---

## Running Each Version

### web (v1)
```bash
cd src/web
npm install
npm run dev     # http://localhost:5173
npm run build   # Vite build
```

### web-v2
```bash
cd src/web-v2
npm install
npm run dev
npm run build
```

### web-v3
```bash
cd src/web-v3
npm install
npm run dev     # TypeScript + Vite
npm run build   # tsc -b && vite build
```

---

## Key Design Decisions

1. **Zero-trust proxy**: Keys encrypted with AES-256-GCM, decrypted per-request, never stored in plaintext between calls
2. **Deterministic vault key**: Same wallet produces same passphrase every session — unguessable without private key
3. **Dual auth**: Passkey for convenience (Face ID/Touch ID), Solana wallet for cryptographic proof
4. **Extension + dashboard sync**: Token flows dashboard → extension and back; content.js can save keys directly
5. **No @solana/spl-token dependency**: ATA derivation done manually to save ~80KB bundle
6. **Lazy OCR**: tesseract.js loaded on-demand, not bundled by default
7. **X402 dual transport**: chrome.storage.local (extension) and localStorage (web dashboard)
8. **Health checks**: 30-second polling of `/health` endpoint

---

## Recommended Version

For a fresh KeyShield codebase, use **web-v3** as the source of truth:

- TanStack Router gives typed navigation
- Zustand stores are simpler than React context chains
- Zod validation catches bugs at runtime
- Tailwind 4 with Vite plugin is the fastest dev experience
- Feature-organized `features/` structure scales better than flat `components/`

To migrate web (v1) to web-v3 architecture:
1. Copy all source files from `web-v3/src/` into `web/src/`
2. Replace inline styles with Tailwind classes
3. Update imports to match new paths
4. Keep existing `background.js` and `content.js` (they're compatible with all versions)
