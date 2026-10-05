---
name: scripts
description: "Skill for the Scripts area of keyshield. 108 symbols across 17 files."
---

# Scripts

108 symbols | 17 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how parseSseUsageTokens, meteredBodyFromProxy, deriveStreamPda work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/live_e2e_run.ts` | parseSseUsageTokens, meteredBodyFromProxy, deriveStreamPda, readTokenAmount, readSpentTotal (+33) |
| `src/scripts/agent-demo.py` | _b58encode, _generate_keypair, _keypair_from_seed, _sign, _get (+7) |
| `src/scripts/mpp-e2e-devnet.mjs` | step, ok, err, dim, banner (+7) |
| `src/scripts/bootstrap-fresh-agent.mjs` | step, ok, err, dim, banner (+4) |
| `src/sdk/packages/agent-sdk/src/index.ts` | getAgentStatus, recordUsage, settle, close, getUnitsUsed (+1) |
| `scripts/live_e2e_setup.ts` | loadOrCreate, tryAirdrop, operatorChecklist, main |
| `src/proxy/scripts/seed_session_fixtures.py` | _load_session_module, _create_session, _create_expired, main |
| `src/scripts/demo-streaming-payment.ts` | MockClaudeAPI, createMessage, main |
| `src/sdk/packages/agent-sdk/src/client.ts` | getAgentStatus, settlePayment, closePaymentStream |
| `src/proxy/scripts/dump_python_json_fixtures.py` | dump_json_fixtures, dump_cache_key_fixtures, main |

## Entry Points

Start here when exploring this area:

- **`parseSseUsageTokens`** (Function) — `scripts/live_e2e_run.ts:141`
- **`meteredBodyFromProxy`** (Function) — `scripts/live_e2e_run.ts:170`
- **`deriveStreamPda`** (Function) — `scripts/live_e2e_run.ts:184`
- **`readTokenAmount`** (Function) — `scripts/live_e2e_run.ts:192`
- **`readSpentTotal`** (Function) — `scripts/live_e2e_run.ts:196`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `LiveE2EError` | Class | `scripts/live_e2e_run.ts` | 70 |
| `parseSseUsageTokens` | Function | `scripts/live_e2e_run.ts` | 141 |
| `meteredBodyFromProxy` | Function | `scripts/live_e2e_run.ts` | 170 |
| `deriveStreamPda` | Function | `scripts/live_e2e_run.ts` | 184 |
| `readTokenAmount` | Function | `scripts/live_e2e_run.ts` | 192 |
| `readSpentTotal` | Function | `scripts/live_e2e_run.ts` | 196 |
| `signUtf8Ed25519` | Function | `scripts/live_e2e_run.ts` | 207 |
| `main` | Function | `src/scripts/agent-demo.py` | 233 |
| `expectedDebitMicro` | Function | `scripts/live_e2e_run.ts` | 137 |
| `loadFixture` | Function | `scripts/live_e2e_run.ts` | 298 |
| `u16le` | Function | `scripts/live_e2e_run.ts` | 84 |
| `u64le` | Function | `scripts/live_e2e_run.ts` | 90 |
| `sha256` | Function | `scripts/live_e2e_run.ts` | 96 |
| `canonicalPreimage` | Function | `scripts/live_e2e_run.ts` | 100 |
| `artifactHashHex` | Function | `scripts/live_e2e_run.ts` | 120 |
| `settlementBindingHash` | Function | `scripts/live_e2e_run.ts` | 214 |
| `signSettlementBinding` | Function | `scripts/live_e2e_run.ts` | 224 |
| `deriveAta` | Function | `scripts/live_e2e_run.ts` | 177 |
| `deriveVaultPda` | Function | `scripts/live_e2e_run.ts` | 188 |
| `operatorChecklist` | Function | `scripts/live_e2e_setup.ts` | 57 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `PythonParityCheck → U64le` | cross_community | 4 |
| `PythonParityCheck → U16le` | cross_community | 4 |
| `PythonParityCheck → Sha256` | cross_community | 4 |
| `LiveRun → LiveE2EError` | cross_community | 3 |
| `Main → Step` | intra_community | 3 |
| `Main → Err` | intra_community | 3 |
| `Main → Dim` | intra_community | 3 |
| `Main → Init` | cross_community | 3 |
| `Main → GenerateSessionToken` | cross_community | 3 |
| `Main → StoreSession` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_287 | 2 calls |
| Cluster_284 | 1 calls |
| Cluster_286 | 1 calls |

## How to Explore

1. `context({name: "parseSseUsageTokens"})` — see callers and callees
2. `query({search_query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
