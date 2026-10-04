---
name: hooks
description: "Skill for the Hooks area of keyshield. 31 symbols across 8 files."
---

# Hooks

31 symbols | 8 files | Cohesion: 83%

## When to Use

- Working with code in `src/`
- Understanding how useVaults, refresh, unlock work
- Modifying hooks-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/web/hooks/useVaults.ts` | useVaults, refresh, unlock, handler, addItem (+4) |
| `packages/shared/src/hooks/use-vaults.ts` | useVaults, refresh, unlock, handler, addItem (+3) |
| `packages/shared/src/lib/vault-session.ts` | isVaultUnlocked, listEntries, addEntry, removeEntry, mutate |
| `src/web/lib/auth.ts` | getToken, isAuthenticated, proxyFetch |
| `packages/shared/src/lib/vault.ts` | encryptVault, bytesToB64url |
| `src/web/lib/vault-session.ts` | isVaultUnlocked, getDecryptedKey |
| `src/web/components/sections/DeviceVaultSection.tsx` | run |
| `src/web/types.ts` | inferType |

## Entry Points

Start here when exploring this area:

- **`useVaults`** (Function) — `packages/shared/src/hooks/use-vaults.ts:64`
- **`refresh`** (Function) — `packages/shared/src/hooks/use-vaults.ts:70`
- **`unlock`** (Function) — `packages/shared/src/hooks/use-vaults.ts:80`
- **`handler`** (Function) — `packages/shared/src/hooks/use-vaults.ts:99`
- **`addItem`** (Function) — `packages/shared/src/hooks/use-vaults.ts:115`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useVaults` | Function | `packages/shared/src/hooks/use-vaults.ts` | 64 |
| `refresh` | Function | `packages/shared/src/hooks/use-vaults.ts` | 70 |
| `unlock` | Function | `packages/shared/src/hooks/use-vaults.ts` | 80 |
| `handler` | Function | `packages/shared/src/hooks/use-vaults.ts` | 99 |
| `addItem` | Function | `packages/shared/src/hooks/use-vaults.ts` | 115 |
| `deleteItem` | Function | `packages/shared/src/hooks/use-vaults.ts` | 130 |
| `isVaultUnlocked` | Function | `packages/shared/src/lib/vault-session.ts` | 43 |
| `listEntries` | Function | `packages/shared/src/lib/vault-session.ts` | 118 |
| `addEntry` | Function | `packages/shared/src/lib/vault-session.ts` | 127 |
| `removeEntry` | Function | `packages/shared/src/lib/vault-session.ts` | 133 |
| `encryptVault` | Function | `packages/shared/src/lib/vault.ts` | 82 |
| `useVaults` | Function | `src/web/hooks/useVaults.ts` | 64 |
| `refresh` | Function | `src/web/hooks/useVaults.ts` | 70 |
| `unlock` | Function | `src/web/hooks/useVaults.ts` | 80 |
| `handler` | Function | `src/web/hooks/useVaults.ts` | 99 |
| `addItem` | Function | `src/web/hooks/useVaults.ts` | 115 |
| `deleteItem` | Function | `src/web/hooks/useVaults.ts` | 130 |
| `isVaultUnlocked` | Function | `src/web/lib/vault-session.ts` | 90 |
| `decryptItem` | Function | `src/web/hooks/useVaults.ts` | 143 |
| `getToken` | Function | `src/web/lib/auth.ts` | 92 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `X402TrustManager → GetToken` | cross_community | 6 |
| `SettingsSection → GetToken` | cross_community | 5 |
| `HandleRegister → GetToken` | cross_community | 5 |
| `SharingSection → GetToken` | cross_community | 5 |
| `MainContent → GetToken` | cross_community | 5 |
| `AddItem → BytesToB64url` | intra_community | 5 |
| `AddItem → BytesToB64url` | cross_community | 5 |
| `DeleteItem → BytesToB64url` | intra_community | 5 |
| `DeleteItem → BytesToB64url` | cross_community | 5 |
| `Submit → GetToken` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sections | 4 calls |
| Components | 1 calls |

## How to Explore

1. `context({name: "useVaults"})` — see callers and callees
2. `query({search_query: "hooks"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
