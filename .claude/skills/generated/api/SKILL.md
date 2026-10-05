---
name: api
description: "Skill for the Api area of keyshield. 77 symbols across 14 files."
---

# Api

77 symbols | 14 files | Cohesion: 86%

## When to Use

- Working with code in `packages/`
- Understanding how getVaultList, updateVaultKey, getAgentsList work
- Modifying api-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/shared/src/api/index.js` | getToken, request, getVaultList, updateVaultKey, getAgentsList (+28) |
| `packages/shared/src/api/index.ts` | getToken, request, getVaultList, updateVaultKey, getAgentsList (+25) |
| `packages/shared/src/hooks/use-mpp.js` | queryFn, mutationFn |
| `packages/shared/src/hooks/use-mpp.ts` | queryFn, mutationFn |
| `packages/shared/src/hooks/use-agents.js` | mutationFn |
| `packages/shared/src/hooks/use-billing.js` | queryFn |
| `packages/shared/src/hooks/use-sessions.js` | mutationFn |
| `packages/shared/src/hooks/use-sharing.js` | mutationFn |
| `packages/shared/src/hooks/use-agents.ts` | mutationFn |
| `packages/shared/src/hooks/use-billing.ts` | queryFn |

## Entry Points

Start here when exploring this area:

- **`getVaultList`** (Function) — `packages/shared/src/api/index.js:35`
- **`updateVaultKey`** (Function) — `packages/shared/src/api/index.js:50`
- **`getAgentsList`** (Function) — `packages/shared/src/api/index.js:57`
- **`registerAgent`** (Function) — `packages/shared/src/api/index.js:60`
- **`revokeAgent`** (Function) — `packages/shared/src/api/index.js:66`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getVaultList` | Function | `packages/shared/src/api/index.js` | 35 |
| `updateVaultKey` | Function | `packages/shared/src/api/index.js` | 50 |
| `getAgentsList` | Function | `packages/shared/src/api/index.js` | 57 |
| `registerAgent` | Function | `packages/shared/src/api/index.js` | 60 |
| `revokeAgent` | Function | `packages/shared/src/api/index.js` | 66 |
| `getAgentWallets` | Function | `packages/shared/src/api/index.js` | 69 |
| `getMppStreams` | Function | `packages/shared/src/api/index.js` | 73 |
| `getMppUsage` | Function | `packages/shared/src/api/index.js` | 94 |
| `getBillingInfo` | Function | `packages/shared/src/api/index.js` | 98 |
| `getUsageHistory` | Function | `packages/shared/src/api/index.js` | 101 |
| `getShares` | Function | `packages/shared/src/api/index.js` | 105 |
| `grantShare` | Function | `packages/shared/src/api/index.js` | 108 |
| `revokeShare` | Function | `packages/shared/src/api/index.js` | 114 |
| `getSessions` | Function | `packages/shared/src/api/index.js` | 118 |
| `revokeSession` | Function | `packages/shared/src/api/index.js` | 121 |
| `postAuthWalletChallenge` | Function | `packages/shared/src/api/index.js` | 125 |
| `postAuthWalletVerify` | Function | `packages/shared/src/api/index.js` | 128 |
| `postAuthPasskeyRegisterStart` | Function | `packages/shared/src/api/index.js` | 134 |
| `postAuthPasskeyRegisterFinish` | Function | `packages/shared/src/api/index.js` | 137 |
| `postAuthPasskeyAuthStart` | Function | `packages/shared/src/api/index.js` | 143 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `MutationFn → GetToken` | cross_community | 4 |
| `MutationFn → GetToken` | cross_community | 4 |
| `MutationFn → GetToken` | cross_community | 4 |
| `MutationFn → GetToken` | cross_community | 4 |

## How to Explore

1. `context({name: "getVaultList"})` — see callers and callees
2. `query({search_query: "api"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
