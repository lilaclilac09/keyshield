---
name: sections
description: "Skill for the Sections area of keyshield. 108 symbols across 36 files."
---

# Sections

108 symbols | 36 files | Cohesion: 74%

## When to Use

- Working with code in `src/`
- Understanding how getPrefs, setPrefs, AddKeyModal work
- Modifying sections-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/web/components/sections/DeviceVaultSection.tsx` | GettingStartedGuide, dismiss, enroll, submit, remove (+9) |
| `src/web/lib/auth.ts` | clearAuth, notifyAuthChanged, apiFetch, clearPasskeyTrust, deletePasskey (+9) |
| `src/web/lib/api.ts` | fetchDeleteAccountChallenge, deleteAccount, grantShare, listIncomingShares, listOutgoingShares (+4) |
| `src/web/components/sections/AgentsSection.tsx` | CopyButton, AgentsSection, handleRevoke, _b58Encode, _toB64 (+3) |
| `src/web/components/sections/SettingsSection.tsx` | SettingsSection, updatePref, handleDelete, handleForgetDevice, handleDeleteAccount (+2) |
| `src/web/components/sections/SessionsSection.tsx` | revokeCurrent, maskIp, fmtCountdown, SessionsSection, load (+1) |
| `src/web/lib/vault-session.ts` | getCachedVaultId, addEntry, removeEntry, mutate, lockVault (+1) |
| `src/web/components/sections/SharingSection.tsx` | SharingSection, refresh, submit, handleRevoke |
| `src/web/App.tsx` | MainContent, App, handleLogout |
| `src/web/components/sections/ActivitySection.tsx` | ActivitySection, refresh, handleTopup |

## Entry Points

Start here when exploring this area:

- **`getPrefs`** (Function) — `src/web/lib/preferences.ts:12`
- **`setPrefs`** (Function) — `src/web/lib/preferences.ts:17`
- **`AddKeyModal`** (Function) — `src/web/components/AddKeyModal.tsx:28`
- **`BetaBanner`** (Function) — `src/web/components/BetaBanner.tsx:7`
- **`HealthBadge`** (Function) — `src/web/components/HealthBadge.tsx:5`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `PasskeyAlreadyEnrolledError` | Class | `src/web/lib/auth.ts` | 78 |
| `getPrefs` | Function | `src/web/lib/preferences.ts` | 12 |
| `setPrefs` | Function | `src/web/lib/preferences.ts` | 17 |
| `AddKeyModal` | Function | `src/web/components/AddKeyModal.tsx` | 28 |
| `BetaBanner` | Function | `src/web/components/BetaBanner.tsx` | 7 |
| `HealthBadge` | Function | `src/web/components/HealthBadge.tsx` | 5 |
| `probe` | Function | `src/web/components/HealthBadge.tsx` | 11 |
| `SolanaProvider` | Function | `src/web/components/SolanaProvider.tsx` | 10 |
| `ActivitySection` | Function | `src/web/components/sections/ActivitySection.tsx` | 39 |
| `AgentsSection` | Function | `src/web/components/sections/AgentsSection.tsx` | 24 |
| `handleRevoke` | Function | `src/web/components/sections/AgentsSection.tsx` | 73 |
| `DeveloperSection` | Function | `src/web/components/sections/DeveloperSection.tsx` | 8 |
| `DocsSection` | Function | `src/web/components/sections/DocsSection.tsx` | 9 |
| `EphemeralWalletsSection` | Function | `src/web/components/sections/EphemeralWalletsSection.tsx` | 8 |
| `load` | Function | `src/web/components/sections/EphemeralWalletsSection.tsx` | 16 |
| `handleCreate` | Function | `src/web/components/sections/EphemeralWalletsSection.tsx` | 19 |
| `SettingsSection` | Function | `src/web/components/sections/SettingsSection.tsx` | 14 |
| `updatePref` | Function | `src/web/components/sections/SettingsSection.tsx` | 32 |
| `SharingSection` | Function | `src/web/components/sections/SharingSection.tsx` | 11 |
| `VaultSection` | Function | `src/web/components/sections/VaultSection.tsx` | 11 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `SettingsSection → _hasChromeRuntime` | cross_community | 9 |
| `SessionsSection → _hasChromeRuntime` | cross_community | 8 |
| `ActivitySection → _hasChromeRuntime` | cross_community | 8 |
| `AgentsSection → _hasChromeRuntime` | cross_community | 8 |
| `EphemeralWalletsSection → _hasChromeRuntime` | cross_community | 8 |
| `SettingsSection → HasChromeRuntime` | cross_community | 7 |
| `SettingsSection → GetExtensionId` | cross_community | 7 |
| `HandleTopup → _hasChromeRuntime` | cross_community | 7 |
| `OnRotate → _hasChromeRuntime` | cross_community | 6 |
| `SessionsSection → HasChromeRuntime` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Components | 9 calls |
| Hooks | 8 calls |
| Cluster_321 | 5 calls |
| Cluster_333 | 4 calls |
| Ui | 2 calls |
| Cluster_332 | 1 calls |
| Cluster_328 | 1 calls |

## How to Explore

1. `context({name: "getPrefs"})` — see callers and callees
2. `query({search_query: "sections"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
