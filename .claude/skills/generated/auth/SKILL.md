---
name: auth
description: "Skill for the Auth area of keyshield. 94 symbols across 8 files."
---

# Auth

94 symbols | 8 files | Cohesion: 83%

## When to Use

- Working with code in `packages/`
- Understanding how create_token, get, verify_token work
- Modifying auth-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/shared/src/auth/index.ts` | getWin, get, detectWallets, getAvailableWallets, getConnectedWallet (+22) |
| `packages/shared/src/auth/auth-pathA.ts` | setToken, getWalletAddress, getExtensionId, hasChromeRuntime, pushTokenToExtension (+17) |
| `src/backend/auth/session.py` | _server_secret, _encrypt, _decrypt, _make_token_payload, _sign_token (+12) |
| `packages/shared/src/auth/index.js` | getWin, get, detectWallets, getAvailableWallets, getConnectedWallet (+8) |
| `src/backend/auth/passkey.py` | _db, _init_db, _b64url_bytes, registration_verify, authentication_verify (+6) |
| `packages/shared/src/lib/vault-session.ts` | lockVault, getDecryptedKey |
| `packages/shared/src/lib/sync-auth.ts` | prfSalt |
| `packages/shared/src/hooks/use-vaults.ts` | decryptItem |

## Entry Points

Start here when exploring this area:

- **`create_token`** (Function) — `src/backend/auth/session.py:118`
- **`get`** (Function) — `src/backend/auth/session.py:149`
- **`verify_token`** (Function) — `src/backend/auth/session.py:208`
- **`registration_verify`** (Function) — `src/backend/auth/passkey.py:133`
- **`authentication_verify`** (Function) — `src/backend/auth/passkey.py:190`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `create_token` | Function | `src/backend/auth/session.py` | 118 |
| `get` | Function | `src/backend/auth/session.py` | 149 |
| `verify_token` | Function | `src/backend/auth/session.py` | 208 |
| `registration_verify` | Function | `src/backend/auth/passkey.py` | 133 |
| `authentication_verify` | Function | `src/backend/auth/passkey.py` | 190 |
| `list_credentials` | Function | `src/backend/auth/passkey.py` | 231 |
| `delete_credential` | Function | `src/backend/auth/passkey.py` | 240 |
| `setToken` | Function | `packages/shared/src/auth/auth-pathA.ts` | 44 |
| `getWalletAddress` | Function | `packages/shared/src/auth/auth-pathA.ts` | 60 |
| `pushTokenToExtension` | Function | `packages/shared/src/auth/auth-pathA.ts` | 88 |
| `clearTokenInExtension` | Function | `packages/shared/src/auth/auth-pathA.ts` | 99 |
| `pingExtension` | Function | `packages/shared/src/auth/auth-pathA.ts` | 108 |
| `clearAuth` | Function | `packages/shared/src/auth/auth-pathA.ts` | 49 |
| `notifyAuthChanged` | Function | `packages/shared/src/auth/auth-pathA.ts` | 70 |
| `apiFetch` | Function | `packages/shared/src/auth/auth-pathA.ts` | 129 |
| `clearPasskeyTrust` | Function | `packages/shared/src/auth/auth-pathA.ts` | 203 |
| `listPasskeys` | Function | `packages/shared/src/auth/auth-pathA.ts` | 395 |
| `deletePasskey` | Function | `packages/shared/src/auth/auth-pathA.ts` | 402 |
| `lockVault` | Function | `packages/shared/src/lib/vault-session.ts` | 47 |
| `getPasskeyTrust` | Function | `packages/shared/src/auth/auth-pathA.ts` | 197 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RegisterPasskey → HasChromeRuntime` | cross_community | 5 |
| `RegisterPasskey → GetExtensionId` | cross_community | 5 |
| `RequestVaultUnlock → BytesToHex` | cross_community | 4 |
| `RegisterPasskey → LockVault` | cross_community | 4 |
| `Verify_token → _server_secret` | intra_community | 4 |
| `RegisterPasskey → GetToken` | cross_community | 3 |
| `RegisterPasskey → ClearPasskeyTrust` | cross_community | 3 |
| `RegisterPasskey → NotifyAuthChanged` | cross_community | 3 |
| `Create_token → _server_secret` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_114 | 2 calls |
| Hooks | 1 calls |
| Cluster_110 | 1 calls |

## How to Explore

1. `context({name: "create_token"})` — see callers and callees
2. `query({search_query: "auth"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
