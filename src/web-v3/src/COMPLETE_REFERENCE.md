# KeyShield Complete Reference — web / web-v2 / web-v3

> Auto-generated from source. Every function, type, and export for all three web versions.

---

## 1. Summary Comparison

### Build System & Architecture

| Aspect | web (v1) | web-v2 (v2) | web-v3 (v3) |
|--------|----------|-------------|-------------|
| **Framework** | React + Vite | React + TanStack Router + React Query | React + TanStack Router + React Query |
| **Routing** | Manual section switching | TanStack Router (`routes/`) | TanStack Router (routeTree.gen.ts) |
| **State** | useState + CustomEvent | React Query + CustomEvent | React Query + CustomEvent |
| **Icons** | lucide-react | lucide-react | lucide-react |
| **Build Tool** | Vite | Vite | Vite (`vite.config.ts`) |
| **Path Alias** | `@/` -> `src/` | `@/` -> `src/` | `@/` -> `src/` |
| **Typing** | TypeScript | TypeScript | TypeScript |
| **Deployment** | Docker -> localhost:3001 | Docker -> localhost:3001 | Docker -> localhost:3001 |

### Dependencies (web-v3)

```
@solana/wallet-adapter-react  -- wallet connection
@tanstack/react-query          -- data fetching + caching
lucide-react                   -- icons
```

### Key Differences: v2 -> v3

- **TanStack Router** replaces manual section switching with typed routes
- **Section components** moved from inline to `features/vault/components/` directory
- **React Query hooks** (`useVaultList`, `useVaultDelete`, `useVaultAdd`) replace raw `fetch()` calls in components
- **Section config** (`SECTION_CONFIG`) replaces hardcoded titles/subtitles
- **Custom events** (`ks-nav`, `ks-auth-changed`) for cross-component navigation and auth state propagation
- **Extension bridge** functions consolidated into `lib/auth.ts` (`pushTokenToExtension`, `clearTokenInExtension`, `pingExtension`)

---

## 2. web (v1) — Complete Reference

### App.tsx

```
App()                          -> React.FC     -- Root component
MainContent()                  -> React.FC     -- Main layout with auth state, section routing, deep-link handling
NAV                            -> { id; label; icon }[] -- Navigation array (8 items)
SECTION_CONFIG               -> Record<Section, { title; subtitle }> -- Config object
```

### types.ts

```
VaultItemType                -> 'api_key' | 'password' | 'note' | 'env' | 'ssh_key'
VaultItem                    -> id, name, type, value, domain?, createdAt, lastUsedAt, tags, notes?, expiryDate?
PasswordPayload              -> username, password, url?, notes?
NotePayload                  -> title, content
EnvPayload                   -> vars: { key, value }[], notes?
SSHKeyPayload                -> publicKey, privateKey, passphrase?, comment?
TYPE_PREFIX                  -> Record<Exclude<VaultItemType, 'api_key'>, string>
inferType(slug)              -> VaultItemType
```

### hooks/useVaults.ts

```
useVaultList(searchQuery?, selectedType?)  -> useQuery result (VaultItem[])
useVaultDelete()                           -> useMutation<string, void>
useVaultAdd()                              -> useMutation<VaultItem, void>
```

### lib/api.ts

```
API_BASE                         -> string: 'http://localhost:8000'
apiFetch(path, options?)         -> Response -- authenticated fetch with token injection
fetchChallenge()                 -> { challenge; nonce } -- wallet challenge
walletLogin(walletAddress, sigBytes, challenge, passphrase) -> { token; userId }
getToken()                       -> string | null
setToken(token: string)          -> void
clearAuth()                      -> void
isAuthenticated()                -> boolean
getWalletAddress()               -> string | null
setWalletAddress(addr)           -> void
addAuth(token, wallet?)          -> void
getAuth()                        -> { token; walletAddress } | null
notifyAuthChanged()              -> void
fetchDeleteAccountChallenge()    -> { challenge; nonce }
deleteAccount(input)             -> { ok; report }
grantShare(input)                -> { ok; share; status }
listIncomingShares()             -> ShareRow[]
listOutgoingShares()             -> ShareRow[]
revokeShare(shareId)             -> void
buildOpenStreamTx(streamId, body) -> BuildTxResponse
buildWithdrawTx(streamId, body)  -> BuildTxResponse
recordMppTxSignature(streamId, txSig) -> void
```

### lib/auth.ts

```
API_BASE                         -> string
TOKEN_KEY = 'ks_token'
WALLET_KEY = 'ks_wallet'
PASSKEY_USER = 'ks_passkey_user'
PASSKEY_PP = 'ks_passkey_pp'

getToken()                       -> string | null
setToken(token: string)          -> void
clearAuth()                      -> void
isAuthenticated()                -> boolean
getWalletAddress()               -> string | null
setWalletAddress(addr: string)   -> void
addAuth(token, wallet?)          -> void
getAuth()                        -> { token; walletAddress } | null
notifyAuthChanged()              -> void
pushTokenToExtension(token)      -> void -- sends KS_TOKEN_REGISTER to extension
clearTokenInExtension()           -> void -- sends KS_TOKEN_CLEAR to extension
pingExtension()                  -> Promise<{ installed; hasToken }>
apiFetch(path, options?)         -> Response
fetchChallenge()                 -> { challenge; nonce }
walletLogin(walletAddress, signatureBytes, challenge, passphrase) -> { token; userId }
setPasskeyTrust(userId, passphrase) -> void
getPasskeyTrust()                -> { userId; passphrase } | null
clearPasskeyTrust()              -> void
passkeyLogin()                   -> Promise<{ token; userId }>
registerPasskey(name)            -> Promise<{ credentialId; name }>
listPasskeys()                   -> Promise<Array<{ id; name; createdAt }>>
deletePasskey(credId)            -> Promise<void>

_helper _b64urlToBuffer(b64url)  -> ArrayBuffer -- Base64url decode
_helper _bufferToB64url(buf)     -> string      -- Base64url encode
```

### lib/solana.ts

```
SOLANA_CONFIG = { rpcUrl, programId, streamProgramId }

_deriveStreamPda(streamId, ownerPubkey)   -> [publicKey, bump]
_deriveStreamAta(ownerPubkey, streamPda)  -> PublicKey
_deriveOwnerAta(ownerPubkey)               -> PublicKey
deriveMppPda(ownerPubkey, streamId)        -> [PublicKey, number]

_buildOpenStreamInstruction(body)           -> TransactionInstruction
_buildWithdrawInstruction(body)             -> TransactionInstruction
_buildClaimInstruction(streamId, amount)    -> TransactionInstruction

buildOpenStreamTx(body)  -> Promise<Transaction>
buildWithdrawTx(body)     -> Promise<Transaction>
buildClaimTx(streamId, amount) -> Promise<Transaction>
```

### lib/vault-key.ts

```
VAULT_SEED = 'vault'
VAULT_ITEM_SEED = 'vault-item'

_deriveVaultPda(walletAddress)   -> [PublicKey, number]
_deriveVaultItemPda(vaultPda, name) -> [PublicKey, number]
```

### lib/x402-trust.ts

```
X402_TRUST_KEY = 'ks_x402_trust'

trustClaim(claim: { owner; streamId; amount; sig; ts })
getTrustClaim(): { owner; streamId; amount; sig; ts } | null
clearTrustClaim()
verifyTrustClaim(claim): boolean
```

### lib/time.ts

```
nowMs(): number
formatDuration(ms): string
formatTimestamp(ts): string
```

### lib/preferences.ts

```
getPreference(key: string, defaultVal) -> T
setPreference(key: string, value: T)
clearPreferences()
```

### lib/key-detector.ts

```
DETECTED_KEYS_KEY = 'ks_detected_keys'
KEY_PATTERNS = [
  { key: 'openai',   pattern: /sk-(?:pro|org)-[A-Za-z0-9]{40,}/ },
  { key: 'anthropic',pattern: /sk-ant-api03-[A-Za-z0-9]+/ },
  { key: 'groq',     pattern: /gsk_[A-Za-z0-9]{32,}/ },
  { key: 'helius',   pattern: /[A-Za-z0-9]{32,}/ },
]

detectKeys(content: string): DetectedKey[]
isKeyDetected(key: string): boolean
clearDetectedKeys()
```

### lib/ocr-service.ts

```
OCR_SERVICE_URL = 'http://localhost:8001'

scanImage(imageUrl: string): Promise<OcrResult>
parseText(text: string): Promise<{ keys: DetectedKey[] }>
```

### lib/sentry.ts

```
SENTRY_DSN = 'https://...@sentry.io/...'
Sentry.init({ dsn, environment, release })
```

### lib/version.ts

```
VERSION = 'v1.0.0'
```

### extension/background.ts

```
onMessage(message): void -- handles KS_TOKEN_REGISTER, KS_TOKEN_CLEAR, KS_PING
detectKeysInPage(page: Page): Promise<DetectedKey[]>
injectKeyDetector(): void
addVaultItem(item: VaultItem): Promise<void>
deleteVaultItem(id: string): Promise<void>
```

### extension/content.ts

```
CONTENT_SCRIPT_KEY = 'ks-content-script'
detectKeys(content: string): DetectedKey[]
notifyBackground(keys: DetectedKey[]): void
injectDetector(): void
```

### components/ui/index.ts

```
export { Sidebar } from './Sidebar'
export { Header } from './Header'
export { SearchOverlay } from './SearchOverlay'
export { BetaBanner } from './BetaBanner'
export { HealthBadge } from './HealthBadge'
export { AuthScreen } from './AuthScreen'
export { AddKeyModal } from './AddKeyModal'
export { VaultSection } from './VaultSection'
export { ActivitySection } from './ActivitySection'
export { AgentsSection } from './AgentsSection'
export { EphemeralWalletsSection } from './EphemeralWalletsSection'
export { SharingSection } from './SharingSection'
export { SessionsSection } from './SessionsSection'
export { SettingsSection } from './SettingsSection'
export { DeveloperSection } from './DeveloperSection'
export { DocsSection } from './DocsSection'
```

---

## 3. web-v2 (v2) — Complete Reference

### Configuration

| File | Purpose | Key Exports |
|------|---------|-------------|
| `lib/auth.ts` | Auth state, wallet/login, passkey | `apiFetch`, `fetchChallenge`, `walletLogin`, `getToken`, `setToken`, `clearAuth`, `isAuthenticated`, `getWalletAddress`, `setWalletAddress`, `addAuth`, `getAuth`, `notifyAuthChanged`, `pushTokenToExtension`, `clearTokenInExtension`, `pingExtension` |
| `lib/api.ts` | Typed API wrappers | `fetchDeleteAccountChallenge`, `deleteAccount`, `grantShare`, `listIncomingShares`, `listOutgoingShares`, `revokeShare`, `buildOpenStreamTx`, `buildWithdrawTx`, `recordMppTxSignature`, `API_BASE` |
| `lib/solana.ts` | Solana helpers | `SOLANA_CONFIG`, `deriveMppPda`, `buildOpenStreamTx`, `buildWithdrawTx`, `buildClaimTx` |
| `lib/key-detector.ts` | Key detection | `detectKeys`, `isKeyDetected`, `clearDetectedKeys` |
| `lib/ocr-service.ts` | OCR scanning | `scanImage`, `parseText` |
| `lib/x402-trust.ts` | X402 claims | `trustClaim`, `getTrustClaim`, `verifyTrustClaim`, `clearTrustClaim` |
| `lib/time.ts` | Time utilities | `nowMs`, `formatDuration`, `formatTimestamp` |
| `lib/vault-key.ts` | Vault PDAs | `deriveVaultPda`, `deriveVaultItemPda` |
| `lib/preferences.ts` | Preferences | `getPreference`, `setPreference`, `clearPreferences` |
| `lib/sentry.ts` | Sentry init | `Sentry.init()` |
| `lib/version.ts` | Version string | `VERSION` |
| `types.ts` | Type definitions | `VaultItemType`, `VaultItem`, `PasswordPayload`, `NotePayload`, `EnvPayload`, `SSHKeyPayload`, `TYPE_PREFIX`, `inferType` |
| `hooks/useVaults.ts` | React Query hooks | `useVaultList`, `useVaultDelete`, `useVaultAdd` |

### App.tsx (v2)

```tsx
const NAV: { id: Section; label: string }[]  // navigation items
const SECTION_CONFIG: Record<Section, { title; subtitle }>
type Section = 'vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs'

const MainContent: React.FC   // state: isAuthenticated, section, searchQuery, isSearchOpen, isAddModalOpen, prefilledData
  // handlers: handleLogout, handleAddItem, handleDeleteItem, handleDecrypt
  // effects: deep-link (?action=add), cross-component nav (ks-nav)

const App: React.FC           // wraps MainContent in SolanaProvider
```

### Section Components (v2)

| Component | Props | Description |
|-----------|-------|-------------|
| `VaultSection` | items, total, searchQuery, onAdd, onDelete, onDecrypt, isLoading | Vault item list with search and type filter |
| `ActivitySection` | (none) | Usage metrics, billing, proxy calls |
| `AgentsSection` | (none) | Agent registry with ed25519 identities |
| `EphemeralWalletsSection` | (none) | Temporary wallet management |
| `SharingSection` | addr: string | Key sharing UI |
| `SessionsSection` | onLogout | Active sessions across devices |
| `SettingsSection` | addr: string | Account and security settings |
| `DeveloperSection` | (none) | API tokens, SDK snippets, endpoint reference |
| `DocsSection` | (none) | Architecture guides |

---

## 4. web-v3 (v3) — Complete Reference

### App.tsx (web-v3)

```tsx
type Section = 'vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs';
interface PrefillData { name: string; value: string; domain: string; notes: string; }

const NAV: { id: Section; label: string; icon: React.ReactNode }[]
  // vault, activity, agents, sharing, sessions, settings, developer, docs

const SECTION_CONFIG: Record<Section, { title: string; subtitle: string }>

function MainContent(): React.FC
  // state: isAuthenticated (hasStoredToken), section, searchQuery, isSearchOpen, isAddModalOpen, prefilledData
  // vaultQuery = useVaultList(searchQuery, 'All Items')
  // deleteMutation = useVaultDelete()
  // addMutation = useVaultAdd()
  // effects: deep-link (?action=add) -> prefill AddKeyModal, cross-component nav
  // handlers: handleLogout, handleAddItem(item), handleDeleteItem(id), handleDecrypt(id) -> value

const App: React.FC = () => <SolanaProvider><MainContent /></SolanaProvider>
export default App
```

### Component Library (web-v3)

| Export | Component | Props | Description |
|--------|-----------|-------|-------------|
| `SolanaProvider` | SolanaProvider | (none) | Wallet adapter provider |
| `Sidebar` | Sidebar | items, active, onNavigate, walletAddress, connected, onCopyAddress, onLogout | Left navigation sidebar |
| `Header` | Header | title, subtitle, onSearch, onAdd, searchActive, actions | Top header with actions |
| `SearchOverlay` | SearchOverlay | query, onChange, onClose | Full-screen search overlay |
| `BetaBanner` | BetaBanner | (none) | Beta status banner |
| `HealthBadge` | HealthBadge | (none) | System health indicator |
| `AuthScreen` | AuthScreen | onAuthenticated | Login screen (wallet + passkey) |
| `AddKeyModal` | AddKeyModal | isOpen, onClose, onSave, initialData | Key entry modal |
| `VaultSection` | VaultSection | items, total, searchQuery, onAdd, onDelete, onDecrypt, isLoading | Vault list |
| `ActivitySection` | ActivitySection | (none) | Usage metrics |
| `AgentsSection` | AgentsSection | (none) | Agent registry |
| `EphemeralWalletsSection` | EphemeralWalletsSection | (none) | Temp wallets |
| `SharingSection` | SharingSection | addr: string | Key sharing |
| `SessionsSection` | SessionsSection | onLogout | Session management |
| `SettingsSection` | SettingsSection | addr: string | Settings |
| `DeveloperSection` | DeveloperSection | (none) | Dev tools |
| `DocsSection` | DocsSection | (none) | Documentation |

### Hooks (web-v3)

```ts
interface VaultListResponse { items: VaultItem[] }
interface VaultDeleteResponse { success: boolean }
interface VaultDecryptResponse { value: string }

const VAULT_KEYS = { list: ['vault', 'list'], item: (id: string) => ['vault', 'item', id], allTypes: ['vault', 'types'] }

function useVaultList(searchQuery?: string, selectedType?: string)
  -> useQuery<VaultItem[]> result (staleTime: 5s, gcTime: 300s)

function useVaultItem(id: string)
  -> useQuery<VaultDecryptResponse> (enabled: !!id, staleTime: 10s)

function useVaultDelete()
  -> useMutation<string, void> (invalidates list + allTypes on success)

function useVaultAdd()
  -> useMutation<Omit<VaultItem, 'id'>, VaultItem> (invalidates list + allTypes on success)
```

### lib/ (web-v3) — All Files

#### auth.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `API_BASE` | string | `'http://localhost:8000'` |
| `getToken` | `() -> string | null` | Read token from localStorage |
| `setToken` | `(token: string) -> void` | Write token + push to extension |
| `clearAuth` | `() -> void` | Clear token + wallet from localStorage |
| `isAuthenticated` | `() -> boolean` | Check if token exists |
| `getWalletAddress` | `() -> string | null` | Read wallet address |
| `setWalletAddress` | `(addr: string) -> void` | Write wallet address |
| `addAuth` | `(token: string, wallet?: string) -> void` | Set token + wallet + notify |
| `getAuth` | `() -> { token; walletAddress } | null` | Get auth state |
| `notifyAuthChanged` | `() -> void` | Dispatch ks-auth-changed event |
| `pushTokenToExtension` | `(token: string) -> void` | Send KS_TOKEN_REGISTER |
| `clearTokenInExtension` | `() -> void` | Send KS_TOKEN_CLEAR |
| `pingExtension` | `() -> Promise<{ installed; hasToken }>` | Ping extension |
| `apiFetch` | `(path, options?) -> Response` | Authenticated fetch |
| `fetchChallenge` | `() -> Promise<{ challenge; nonce }>` | Wallet challenge |
| `walletLogin` | `(walletAddress, signatureBytes, challenge, passphrase) -> Promise<{ token; userId }>` | Wallet login |
| `setPasskeyTrust` | `(userId, passphrase) -> void` | Store passkey trust |
| `getPasskeyTrust` | `() -> { userId; passphrase } | null` | Get passkey trust |
| `clearPasskeyTrust` | `() -> void` | Clear passkey trust |
| `passkeyLogin` | `() -> Promise<{ token; userId }>` | Passkey login flow |
| `registerPasskey` | `(name: string) -> Promise<{ credentialId; name }>` | Register new passkey |
| `listPasskeys` | `() -> Promise<Array<{ id; name; createdAt }>>` | List credentials |
| `deletePasskey` | `(credId: string) -> Promise<void>` | Delete credential |

#### api.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `DeleteAccountReport` | interface | vault_keys, agents, usage, passkeys, x402_claims, shares, sessions |
| `fetchDeleteAccountChallenge` | `() -> Promise<{ challenge; nonce }>` | Account deletion challenge |
| `deleteAccount` | `(input: DeleteAccountInput) -> Promise<{ ok; report }>` | Delete account |
| `ShareRow` | interface | id, owner_id, recipient_id, key_name, expires_at, created_at |
| `GrantShareInput` | interface | key_name, recipient_user_id, expires_at? |
| `grantShare` | `(input) -> Promise<{ ok; share; status }>` | Grant sharing |
| `listIncomingShares` | `() -> ShareRow[]` | Incoming shares |
| `listOutgoingShares` | `() -> ShareRow[]` | Outgoing shares |
| `revokeShare` | `(shareId) -> Promise<void>` | Revoke share |
| `BuildOpenTxBody` | interface | ownerPubkey, streamPda, bump, usdcAta, maxTotalMicroUsdc, costPerUnitMicroUsdc?, maxRateUsdPerMinBits?, settlementIntervalSecsOverride? |
| `buildOpenStreamTx` | `(streamId, body) -> Promise<BuildTxResponse>` | Build open TX |
| `BuildWithdrawTxBody` | interface | ownerPubkey, streamPda, streamAta, ownerAta, withdrawAmountMicroUsdc |
| `buildWithdrawTx` | `(streamId, body) -> Promise<BuildTxResponse>` | Build withdraw TX |
| `recordMppTxSignature` | `(streamId, txSignature) -> Promise<void>` | Record MPP signature |

#### solana.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `SOLANA_CONFIG` | object | rpcUrl, programId, streamProgramId |
| `_deriveStreamPda` | `(streamId, ownerPubkey) -> [PublicKey, bump]` | Derive stream PDA |
| `_deriveStreamAta` | `(ownerPubkey, streamPda) -> PublicKey` | Derive stream ATA |
| `_deriveOwnerAta` | `(ownerPubkey) -> PublicKey` | Derive owner ATA |
| `deriveMppPda` | `(ownerPubkey, streamId) -> [PublicKey, number]` | MPP PDA derivation |
| `_buildOpenStreamInstruction` | `(body) -> TransactionInstruction` | Build open instruction |
| `_buildWithdrawInstruction` | `(body) -> TransactionInstruction` | Build withdraw instruction |
| `_buildClaimInstruction` | `(streamId, amount) -> TransactionInstruction` | Build claim instruction |
| `buildOpenStreamTx` | `(body) -> Promise<Transaction>` | Build full open TX |
| `buildWithdrawTx` | `(body) -> Promise<Transaction>` | Build full withdraw TX |
| `buildClaimTx` | `(streamId, amount) -> Promise<Transaction>` | Build claim TX |

#### vault-key.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `VAULT_SEED` | string | `'vault'` |
| `VAULT_ITEM_SEED` | string | `'vault-item'` |
| `_deriveVaultPda` | `(walletAddress) -> [PublicKey, number]` | Derive vault PDA |
| `_deriveVaultItemPda` | `(vaultPda, name) -> [PublicKey, number]` | Derive vault item PDA |

#### x402-trust.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `X402_TRUST_KEY` | string | `'ks_x402_trust'` |
| `trustClaim` | `(claim: { owner; streamId; amount; sig; ts }) -> void` | Store trust claim |
| `getTrustClaim` | `() -> { owner; streamId; amount; sig; ts } | null` | Get trust claim |
| `clearTrustClaim` | `() -> void` | Clear trust claim |
| `verifyTrustClaim` | `(claim) -> boolean` | Verify claim signature |

#### key-detector.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `DETECTED_KEYS_KEY` | string | `'ks_detected_keys'` |
| `KEY_PATTERNS` | `{ key; pattern }[]` | OpenAI, Anthropic, Groq, Helius patterns |
| `detectKeys` | `(content: string) -> DetectedKey[]` | Scan content for keys |
| `isKeyDetected` | `(key: string) -> boolean` | Check if key detected |
| `clearDetectedKeys` | `() -> void` | Clear detection cache |

#### time.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `nowMs` | `() -> number` | Current timestamp ms |
| `formatDuration` | `(ms: number) -> string` | Human-readable duration |
| `formatTimestamp` | `(ts: number) -> string` | Formatted timestamp |

#### preferences.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `getPreference` | `<T>(key, defaultVal) -> T` | Get preference |
| `setPreference` | `<T>(key, value: T) -> void` | Set preference |
| `clearPreferences` | `() -> void` | Clear all preferences |

#### sentry.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `SENTRY_DSN` | string | Sentry DSN |
| `Sentry` | object | Initialized Sentry instance |

#### version.ts

| Export | Signature | Description |
|--------|-----------|-------------|
| `VERSION` | string | `'v1.0.0'` |

---

## 5. Section-by-Section Feature Comparison

### Section Types (all versions)

```ts
type Section = 'vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs';
```

### 1. Vault Section

| Property | web (v1) | web-v2 (v2) | web-v3 (v3) |
|----------|----------|-------------|-------------|
| Title | "Vault Management" | Same | Same |
| Subtitle | "Encrypted secrets - AES-256-GCM at rest" | Same | Same |
| Component | VaultSection (inline) | VaultSection | VaultSection (features/vault/) |
| Data Source | useState | useState + fetch | useVaultList (React Query) |
| Search | query param `?q=` | query param `?q=` | query param `?q=` |
| Type Filter | All Items / api_key / password / note / env / ssh_key | Same | Same |
| Operations | Add, Delete, Decrypt | Same | Same |
| Key Types | API key, Password, Note, Env, SSH key | Same | VaultItemType = 'api_key' \| 'password' \| 'note' \| 'env' \| 'ssh_key' |

### 2. Activity Section

| Property | web | web-v2 | web-v3 |
|----------|-----|--------|--------|
| Title | "Activity & Billing" | Same | Same |
| Metrics | Proxy calls, usage, balance | Same | Same |
| Component | ActivitySection | ActivitySection | ActivitySection |

### 3. Agents Section

| Property | web | web-v2 | web-v3 |
|----------|-----|--------|--------|
| Title | "Agent Registry" | Same | Same |
| Subtitle | "ed25519 agent identities and embedded wallets" | Same | Same |
| Features | Agent list, key binding | Same | AgentsSection + EphemeralWalletsSection |

### 4. Sharing Section

| Property | web | web-v2 | web-v3 |
|----------|-----|--------|--------|
| Title | "Key Sharing" | Same | Same |
| Subtitle | "Re-encrypted access for authorized recipients" | Same | Same |
| API | grantShare, listIncomingShares, listOutgoingShares, revokeShare | Same | Same |

### 5. Sessions Section

| Property | web | web-v2 | web-v3 |
|----------|-----|--------|--------|
| Title | "Sessions" | Same | Same |
| Subtitle | "Active auth sessions across devices" | Same | Same |
| Props | (none) | (none) | onLogout |

### 6. Settings Section

| Property | web | web-v2 | web-v3 |
|----------|-----|--------|--------|
| Title | "Settings" | Same | Same |
| Subtitle | "Account, security, and preferences" | Same | Same |
| Props | (none) | addr: string | addr: string |

### 7. Developer Section

| Property | web | web-v2 | web-v3 |
|----------|-----|--------|--------|
| Title | "Developer" | Same | Same |
| Subtitle | "API tokens, SDK snippets, and endpoint reference" | Same | Same |
| Features | Token display, SDK code, endpoints | Same | Same |

### 8. Docs Section

| Property | web | web-v2 | web-v3 |
|----------|-----|--------|--------|
| Title | "Documentation" | Same | Same |
| Subtitle | "Architecture, integration guides, and specs" | Same | Same |
| Content | AGENTS.md + architecture docs | Same | Same |

---

## 6. API Endpoints Reference

### Auth Endpoints

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/auth/logout` | Logout current session | - | 200 |
| GET | `/auth/wallet-challenge` | Get wallet challenge | - | `{ challenge, nonce }` |
| POST | `/auth/wallet-login` | Wallet sign-in | `{ walletAddress, signature, challenge, passphrase }` | `{ token, userId }` |
| GET | `/auth/passkey/auth-options?user_id=` | Passkey options | - | Auth options object |
| POST | `/auth/passkey/auth-verify?user_id=&passphrase=` | Passkey verify | `{ credential }` | `{ token, userId }` |
| GET | `/auth/passkey/register-options` | Registration options | - | Registration options |
| POST | `/auth/passkey/register-verify` | Register passkey | `{ credential, name }` | `{ credentialId, name }` |
| GET | `/auth/passkey/list` | List passkeys | - | `{ credentials: [{ id, name, createdAt }] }` |
| DELETE | `/auth/passkey/{cred_id}` | Delete passkey | - | 200 |
| POST | `/auth/delete-account-challenge` | Account deletion challenge | - | `{ challenge, nonce }` |
| POST | `/auth/delete-account` | Delete account | `{ confirmation, walletAddress?, signature?, challenge? }` | `{ ok, report }` |

### Vault Endpoints

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| GET | `/api/vault/list?q=&type=` | List vault items | query: `q`, `type` | `VaultItem[]` |
| POST | `/api/vault/add` | Add item | `VaultItem` | `VaultItem` |
| DELETE | `/api/vault/{id}` | Delete item | - | `{ success }` |
| GET | `/api/vault/{id}/decrypt` | Decrypt item | - | `{ value }` |

### Sharing Endpoints

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/share/grant` | Grant share | `{ key_name, recipient_user_id, expires_at? }` | `{ ok, share, status }` |
| GET | `/share/incoming` | Incoming shares | - | `{ shares: ShareRow[] }` |
| GET | `/share/outgoing` | Outgoing shares | - | `{ shares: ShareRow[] }` |
| DELETE | `/share/{share_id}` | Revoke share | - | 200 |

### MPP (Micro-Payment Protocol) Endpoints

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|--------------|----------|
| POST | `/mpp/streams/{id}/build-open-tx` | Build open TX | `{ ownerPubkey, streamPda, bump, usdcAta, ... }` | `BuildTxResponse` |
| POST | `/mpp/streams/{id}/build-withdraw-tx` | Build withdraw TX | `{ ownerPubkey, streamPda, streamAta, ownerAta, withdrawAmountMicroUsdc }` | `BuildTxResponse` |
| POST | `/mpp/streams/{id}/record-tx` | Record TX signature | `{ tx_signature }` | 200 |

---

## 7. Solana Integration Reference

### PDA Derivation

```ts
// Vault PDA
function deriveVaultPda(walletAddress): [PublicKey, number]
  seed: VAULT_SEED = 'vault'

// Vault Item PDA
function deriveVaultItemPda(vaultPda, name): [PublicKey, number]
  seed: VAULT_ITEM_SEED = 'vault-item'

// Stream PDA
function deriveStreamPda(streamId, ownerPubkey): [PublicKey, number]

// Account addresses
function deriveStreamAta(ownerPubkey, streamPda): PublicKey
function deriveOwnerAta(ownerPubkey): PublicKey
function deriveMppPda(ownerPubkey, streamId): [PublicKey, number]
```

### Transaction Building

```ts
// Open stream transaction
function buildOpenStreamTx(body: BuildOpenTxBody): Promise<Transaction>

// Withdraw transaction
function buildWithdrawTx(body: BuildWithdrawTxBody): Promise<Transaction>

// Claim transaction
function buildClaimTx(streamId, amount): Promise<Transaction>
```

### Solana Configuration (web-v3)

```ts
const SOLANA_CONFIG = {
  rpcUrl: string,       // Solana RPC endpoint
  programId: PublicKey, // KeyShield program
  streamProgramId: PublicKey, // MPP stream program
}
```

---

## 8. Extension Architecture

### Message Types

| Type | Direction | Payload | Purpose |
|------|-----------|---------|---------|
| `KS_TOKEN_REGISTER` | web -> extension | `{ token, user }` | Register auth token |
| `KS_TOKEN_CLEAR` | web -> extension | - | Clear token in extension |
| `KS_PING` | web -> extension | - | Check extension presence + token status |
| `KS_DETECTED_KEYS` | extension -> web | `{ keys: DetectedKey[] }` | Report detected API keys |

### background.js (Service Worker)

```ts
onMessage(message): void
  // KS_TOKEN_REGISTER -> store.token, store.user
  // KS_TOKEN_CLEAR -> clear token from service worker
  // KS_PING -> respond with { installed: true, hasToken: true/false }

// Key detection via injected content script
detectKeysInPage(page: Page): Promise<DetectedKey[]>
  // Injects key-detector script into page
  // Reads content from DOM elements
  // Returns DetectedKey[]

injectKeyDetector(): void
  // Injects key detector logic into the page

// Vault operations
addVaultItem(item: VaultItem): Promise<void>
deleteVaultItem(id: string): Promise<void>
```

### content.js (Content Script)

```ts
CONTENT_SCRIPT_KEY = 'ks-content-script'

detectKeys(content: string): DetectedKey[]
  // Scans DOM text content for key patterns (OpenAI, Anthropic, Groq, etc.)

notifyBackground(keys: DetectedKey[]): void
  // Sends detected keys to background via chrome.runtime.sendMessage

injectDetector(): void
  // Injects the detector into the page

// Key pattern matching
// OpenAI: sk-proj-... | sk-org-...
// Anthropic: sk-ant-api03-...
// Groq: gsk_xxx
// Helius: (generic alphanumeric)
```

### X402 Interceptor

The X402 interceptor (in `lib/x402-trust.ts`) handles payment claims for API access:

```ts
const X402_TRUST_KEY = 'ks_x402_trust'  // localStorage key

trustClaim(claim: { owner; streamId; amount; sig; ts })
  // Stores claim in localStorage under X402_TRUST_KEY

getTrustClaim(): { owner; streamId; amount; sig; ts } | null
  // Retrieves the stored claim

verifyTrustClaim(claim): boolean
  // Verifies the signature on the claim

clearTrustClaim()
  // Removes the claim from localStorage
```

---

*Document generated from KeyShield source code.*

