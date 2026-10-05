---
name: extension
description: "Skill for the Extension area of keyshield. 58 symbols across 3 files."
---

# Extension

58 symbols | 3 files | Cohesion: 92%

## When to Use

- Working with code in `src/`
- Understanding how _b64uEnc, _b64uDec, _getVaultKeyBytes work
- Modifying extension-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/extension/content.js` | dismissThisDomain, isOnDomain, scan, handleMatch, injectStyleOnce (+17) |
| `src/extension/background.js` | _b64uEnc, _b64uDec, _getVaultKeyBytes, _upstreamForDomain, _decryptCipher (+15) |
| `src/extension/popup.js` | $, saveSettings, refreshFingerprint, setBackupStatus, _ts (+11) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `_b64uEnc` | Function | `src/extension/background.js` | 38 |
| `_b64uDec` | Function | `src/extension/background.js` | 41 |
| `_getVaultKeyBytes` | Function | `src/extension/background.js` | 51 |
| `_upstreamForDomain` | Function | `src/extension/background.js` | 79 |
| `_decryptCipher` | Function | `src/extension/background.js` | 93 |
| `getKeysForDomain` | Function | `src/extension/background.js` | 101 |
| `getApiBase` | Function | `src/extension/background.js` | 155 |
| `getStoredToken` | Function | `src/extension/background.js` | 189 |
| `clearStoredToken` | Function | `src/extension/background.js` | 198 |
| `directStore` | Function | `src/extension/background.js` | 218 |
| `_vaultFingerprint` | Function | `src/extension/background.js` | 278 |
| `exportVault` | Function | `src/extension/background.js` | 286 |
| `importVault` | Function | `src/extension/background.js` | 325 |
| `dismissThisDomain` | Function | `src/extension/content.js` | 161 |
| `isOnDomain` | Function | `src/extension/content.js` | 175 |
| `scan` | Function | `src/extension/content.js` | 181 |
| `handleMatch` | Function | `src/extension/content.js` | 208 |
| `injectStyleOnce` | Function | `src/extension/content.js` | 221 |
| `maskKey` | Function | `src/extension/content.js` | 244 |
| `buildPanel` | Function | `src/extension/content.js` | 246 |

## How to Explore

1. `context({name: "_b64uEnc"})` — see callers and callees
2. `query({search_query: "extension"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
