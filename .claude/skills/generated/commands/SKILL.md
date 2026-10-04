---
name: commands
description: "Skill for the Commands area of keyshield. 43 symbols across 17 files."
---

# Commands

43 symbols | 17 files | Cohesion: 74%

## When to Use

- Working with code in `src/`
- Understanding how runAgentList, fmtTime, truncatePubkey work
- Modifying commands-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/sdk/packages/cli/src/lib/source.ts` | makeV2Source, list, getAll, describe, list (+4) |
| `src/sdk/packages/cli/src/commands/agent.ts` | clientFromSession, runAgentList, fmtTime, truncatePubkey, runAgentRevoke (+1) |
| `src/sdk/packages/cli/src/lib/v2-client.ts` | V2Client, logout, listKeys, login, storeKey |
| `src/sdk/packages/cli/src/lib/session-store.ts` | loadSession, clearSession, defaultSessionPath, saveSession |
| `src/sdk/packages/cli/src/commands/run.ts` | envify, runRun, forwardSignal |
| `src/sdk/packages/cli/src/lib/env-file.ts` | parseEnvFile, parseValue |
| `src/sdk/packages/cli/src/lib/gitignore.ts` | inspectGitignore, ensureGitignoresEnv |
| `src/sdk/packages/cli/src/lib/load-env.ts` | resolveEnvPath, loadEnv |
| `src/sdk/packages/cli/src/commands/store.ts` | readStdin, runStore |
| `src/sdk/packages/cli/src/commands/delete.ts` | runDelete |

## Entry Points

Start here when exploring this area:

- **`runAgentList`** (Function) — `src/sdk/packages/cli/src/commands/agent.ts:37`
- **`fmtTime`** (Function) — `src/sdk/packages/cli/src/commands/agent.ts:55`
- **`truncatePubkey`** (Function) — `src/sdk/packages/cli/src/commands/agent.ts:60`
- **`runAgentRevoke`** (Function) — `src/sdk/packages/cli/src/commands/agent.ts:80`
- **`runAgentRegister`** (Function) — `src/sdk/packages/cli/src/commands/agent.ts:134`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `V2Client` | Class | `src/sdk/packages/cli/src/lib/v2-client.ts` | 40 |
| `runAgentList` | Function | `src/sdk/packages/cli/src/commands/agent.ts` | 37 |
| `fmtTime` | Function | `src/sdk/packages/cli/src/commands/agent.ts` | 55 |
| `truncatePubkey` | Function | `src/sdk/packages/cli/src/commands/agent.ts` | 60 |
| `runAgentRevoke` | Function | `src/sdk/packages/cli/src/commands/agent.ts` | 80 |
| `runAgentRegister` | Function | `src/sdk/packages/cli/src/commands/agent.ts` | 134 |
| `runDelete` | Function | `src/sdk/packages/cli/src/commands/delete.ts` | 13 |
| `runLogout` | Function | `src/sdk/packages/cli/src/commands/logout.ts` | 3 |
| `loadSession` | Function | `src/sdk/packages/cli/src/lib/session-store.ts` | 38 |
| `clearSession` | Function | `src/sdk/packages/cli/src/lib/session-store.ts` | 72 |
| `runDoctor` | Function | `src/sdk/packages/cli/src/commands/doctor.ts` | 23 |
| `runStatus` | Function | `src/sdk/packages/cli/src/commands/status.ts` | 4 |
| `parseEnvFile` | Function | `src/sdk/packages/cli/src/lib/env-file.ts` | 28 |
| `inspectGitignore` | Function | `src/sdk/packages/cli/src/lib/gitignore.ts` | 24 |
| `ensureGitignoresEnv` | Function | `src/sdk/packages/cli/src/lib/gitignore.ts` | 52 |
| `resolveEnvPath` | Function | `src/sdk/packages/cli/src/lib/load-env.ts` | 26 |
| `loadEnv` | Function | `src/sdk/packages/cli/src/lib/load-env.ts` | 33 |
| `runGet` | Function | `src/sdk/packages/cli/src/commands/get.ts` | 7 |
| `runList` | Function | `src/sdk/packages/cli/src/commands/list.ts` | 8 |
| `resolveSource` | Function | `src/sdk/packages/cli/src/lib/source.ts` | 33 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Get → ParseValue` | cross_community | 4 |
| `RunLogin → FetchImpl` | cross_community | 4 |
| `RunRun → DefaultSessionPath` | cross_community | 4 |
| `RunRun → V2Client` | cross_community | 4 |
| `RunStore → FetchImpl` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_305 | 5 calls |

## How to Explore

1. `context({name: "runAgentList"})` — see callers and callees
2. `query({search_query: "commands"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
