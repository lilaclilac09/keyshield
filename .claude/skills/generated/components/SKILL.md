---
name: components
description: "Skill for the Components area of keyshield. 83 symbols across 27 files."
---

# Components

83 symbols | 27 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how formatBarRemaining, formatToastRemaining, AddPasskeyBanner work
- Modifying components-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/web/components/X402TrustManager.tsx` | authHeaders, fetchTrustList, serverAddTrust, serverRemoveTrust, serverToggleTrust (+7) |
| `src/web/components/ReportPage.tsx` | fmt, fmtDate, EmptyRow, Th, Td (+7) |
| `src/web/components/OcrScanner.tsx` | runScan, runFileScan, handleFileChange, maskKey, OcrScanner (+1) |
| `src/web/components/VaultItemCard.tsx` | VaultItemCard, copyToClipboard, Field, startTimer, clearReveal (+1) |
| `src/web/components/AuditRetentionSettings.tsx` | getAuditStats, AuditRetentionSettings, reload, handleSave, handlePurge |
| `src/web/lib/auth.ts` | describeApiNetError, fetchChallenge, walletLogin, setToken, setWalletAddress |
| `src/web/lib/ocr-service.ts` | initialize, extractTextFromImage, captureScreenAndDetectKeys, extractFromImageFile |
| `src/mobile/src/components/SessionExpiryToast.tsx` | SessionExpiryToast, dismiss, renew |
| `src/web/lib/audit-retention.ts` | getPolicy, setPolicy, purgeAuditLog |
| `src/mobile/src/components/ConflictDialog.tsx` | ConflictDialog, setAll, toggleReveal |

## Entry Points

Start here when exploring this area:

- **`formatBarRemaining`** (Function) — `src/mobile/src/components/sessionFormat.ts:3`
- **`formatToastRemaining`** (Function) — `src/mobile/src/components/sessionFormat.ts:15`
- **`AddPasskeyBanner`** (Function) — `src/mobile/src/components/AddPasskeyBanner.tsx:14`
- **`LostDeviceDialog`** (Function) — `src/mobile/src/components/LostDeviceDialog.tsx:10`
- **`SessionBar`** (Function) — `src/mobile/src/components/SessionBar.tsx:12`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `formatBarRemaining` | Function | `src/mobile/src/components/sessionFormat.ts` | 3 |
| `formatToastRemaining` | Function | `src/mobile/src/components/sessionFormat.ts` | 15 |
| `AddPasskeyBanner` | Function | `src/mobile/src/components/AddPasskeyBanner.tsx` | 14 |
| `LostDeviceDialog` | Function | `src/mobile/src/components/LostDeviceDialog.tsx` | 10 |
| `SessionBar` | Function | `src/mobile/src/components/SessionBar.tsx` | 12 |
| `SessionExpiryToast` | Function | `src/mobile/src/components/SessionExpiryToast.tsx` | 11 |
| `AppShell` | Function | `src/mobile/src/screens/AppShell.tsx` | 45 |
| `RecoveryPhraseScreen` | Function | `src/mobile/src/screens/RecoveryPhraseScreen.tsx` | 18 |
| `RestoreScreen` | Function | `src/mobile/src/screens/RestoreScreen.tsx` | 19 |
| `UnlockScreen` | Function | `src/mobile/src/screens/UnlockScreen.tsx` | 21 |
| `UpgradeScreen` | Function | `src/mobile/src/screens/UpgradeScreen.tsx` | 9 |
| `X402TrustManager` | Function | `src/web/components/X402TrustManager.tsx` | 114 |
| `load` | Function | `src/web/components/X402TrustManager.tsx` | 125 |
| `handleAdd` | Function | `src/web/components/X402TrustManager.tsx` | 146 |
| `handleRemove` | Function | `src/web/components/X402TrustManager.tsx` | 168 |
| `handleToggle` | Function | `src/web/components/X402TrustManager.tsx` | 185 |
| `getPolicy` | Function | `src/web/lib/audit-retention.ts` | 26 |
| `setPolicy` | Function | `src/web/lib/audit-retention.ts` | 42 |
| `purgeAuditLog` | Function | `src/web/lib/audit-retention.ts` | 61 |
| `AuditRetentionSettings` | Function | `src/web/components/AuditRetentionSettings.tsx` | 46 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleFaceID → _hasChromeRuntime` | cross_community | 6 |
| `X402TrustManager → GetToken` | cross_community | 6 |
| `SettingsSection → DescribeApiNetError` | cross_community | 5 |
| `HandleRegister → DescribeApiNetError` | cross_community | 5 |
| `SharingSection → DescribeApiNetError` | cross_community | 5 |
| `MainContent → _hasChromeRuntime` | cross_community | 5 |
| `MainContent → GetToken` | cross_community | 5 |
| `MainContent → DescribeApiNetError` | cross_community | 5 |
| `Submit → DescribeApiNetError` | cross_community | 5 |
| `HandleFileChange → Initialize` | intra_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sections | 6 calls |
| Cluster_332 | 2 calls |
| Hooks | 2 calls |
| Cluster_321 | 1 calls |
| Screens | 1 calls |

## How to Explore

1. `context({name: "formatBarRemaining"})` — see callers and callees
2. `query({search_query: "components"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
