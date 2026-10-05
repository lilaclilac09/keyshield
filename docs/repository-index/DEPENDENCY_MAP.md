# Dependency map

Source SHA `f4f33c227fed591f30a3e3438dbb9337aa4dc9db`. Evidence labels: manifest / import / config / source / documentation / unknown.

Relationships below are **statically inspected; runtime status not verified.**
Local code is not evidence that a surface is deployed.

| Relationship | Evidence | Notes |
|---|---|---|
| npm workspaces: `packages/shared`, `src/sdk/packages/{agent-sdk,cli,goat-wallet}`, `src/infra/sync-worker`, `src/web` | manifest (`package.json`) | Root `npm run build` walks workspaces. |
| Cargo workspace members `src/programs/keyshield`; `src/proxy` excluded (own workspace) | manifest (`Cargo.toml`) | Avoids multiple-workspace-root error. |
| `src/web` → `src/backend` via `API_BASE` / `apiFetch` | source (`src/web/lib/auth.ts`, `src/web/lib/api.ts`) | Dashboard calls FastAPI. |
| Wallet connect → vault passphrase → session | source (`src/web/components/WalletConnector.tsx`, `src/backend/routes/auth.py`) | Passkey / wallet login. |
| Vault ciphertext → Cloudflare sync-worker | source + documentation (`src/infra/sync-worker/`, `docs/technical/SYNC_VAULT_ARCHITECTURE.md`) | Server stores ciphertext only. |
| Owner session → `/agents/register` → agent challenge/login → `/proxy/:upstream` | source (`src/backend/routes/agents.py`, `src/backend/routes/auth.py`) | Off-chain agent identity. |
| Universal Vault → `GrantAgentAccess` → `OpenStream` → meter → `MppSettle` | source (`src/web/lib/mpp-wallet-open.ts`, `scripts/live_e2e_run.ts`, `src/programs/keyshield`) | Paid stream order. |
| Python SDK `keyshield` / `AgentKeyShield` → FastAPI | import (`packages/sdk-py/keyshield/__init__.py`) | `agent_register` uses `pubkeyB58`; login aliases accept `agentPubkey`. |
| MCP server → `KS_TOKEN` | documentation (`packages/mcp-server/README.md`) | Manifest env only; no secret values copied here. |
| Tests → modules: `tests/bankrun_security.test.ts`, `tests/fuzz_invariants.rs`, `tests/proxy_fault_injection.test.ts`, `src/backend/tests/` | source | Four-stage matrix in `keyshield.md`. |
| CI → `python.yml`, `node-tests.yml`, `test.yml` | config (`.github/workflows/`) | Required Actions. Vercel landing/web may rate-limit. |
| Railway / Vercel deploy files | config (`railway.json`, `src/web/vercel.json`, `sites/landing`) | Paths referenced by deploy; not modified by this index. |
| Instruction builders → program id | source (`src/backend/mpp/mpp_onchain.py`, `src/web/lib/api.ts`) | `KS_KEYSHIELD_PROGRAM_ID` / dashboard build-tx routes. |
| Fulfillment artifact → `mpp_settle` | source (`src/backend/mpp/`, `scripts/live_e2e_run.ts`) | 32-byte hash required; Stage 3 asserts no settle on 502. |
| Billing / budget | source (`src/backend/billing/`, `src/web/components/sections/ActivitySection.tsx`) | Usage + top-up routes. Runtime balances not verified here. |
| Submodules | unknown | `git submodule status` empty. |

Multiple implementations (Path A vault in archive vs `src/web`, `packages/sdk-py` vs `src/backend/keyshield_sdk.py`) are listed separately. Do not merge or delete them from this map.
