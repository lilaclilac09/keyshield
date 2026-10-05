# Untracked and generated (not edited)

Reported from the `/workspace` checkout. **These files were not staged, deleted, or rewritten.**

## Pre-existing workspace differences (preserve)

| Path | Status | Notes |
|---|---|---|
| `src/web/dist/index.html` | modified, unstaged | Generated web build output. Directory-level only; not re-parsed. |
| `src/web/tsconfig.tsbuildinfo` | modified, unstaged | TS incremental build artifact. |
| `src/backend/.coverage` | untracked | Coverage output. Excluded from deep traversal. |
| `src/sdk/packages/cli/dist/` | untracked | Generated CLI dist. Directory-level only. |

## Generated directories present on disk (not deleted)

Recorded at directory level only: `node_modules/`, `target/`, `dist/`, `build/`, `coverage/`, `.venv/`, `__pycache__/`.

No symbolic links were found among git-tracked files. None were followed outside the repository.

## Safe env template names only

From tracked `.env.example` (values not copied): `SERVER_SECRET`, `KS_INTERNAL_SECRET`, `DATABASE_URL`, `REDIS_URL`, `KS_KEYSHIELD_PROGRAM_ID`, `KS_USDC_MINT`, `KS_MPP_SETTLER_PUBKEY`, `KS_MPP_SETTLER_KEY`, `KS_PLATFORM_USDC_ATA`, `KS_SOLANA_RPC_URL`, `KS_X402_BASE_RPC_URL`, `KS_X402_RECEIVER_ADDRESS`, `KS_X402_VERIFY_REQUIRED`, `HELIUS_API_KEY`, `KEYSHIELD_API_URL`, `KEYSHIELD_PROGRAM_ID`, `KEYSHIELD_SOLANA_CLUSTER`, `KEYSHIELD_SYNC_URL`, `GF_SECURITY_ADMIN_PASSWORD`.
