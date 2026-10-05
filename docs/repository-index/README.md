# KeyShield repository index

Numbered category indexes. **Original files stay in place.** These folders only link.

- Scan scope: git-tracked files in `lilaclilac09/keyshield`
- Scan timestamp (UTC): `2026-10-05T12:02:02Z`
- Source SHA: `f4f33c227fed591f30a3e3438dbb9337aa4dc9db`
- Tracked files indexed: **727**
- Excluded from deep traversal: `.git/`, `node_modules/`, `target/`, `dist/`, `build/`, `coverage/`, virtualenvs. Those directories were not deleted.
- IDs: `KS-<category>-<nnn>` assigned in path-sorted order per category. Do not renumber when sorting changes.

## Category navigation

| ID | Folder | Purpose | Files |
|---|---|---|---:|
| 00 | [00-overview/](00-overview/README.md) | Overview and architecture | 7 |
| 01 | [01-product/](01-product/README.md) | Product specifications and documentation | 26 |
| 02 | [02-frontend/](02-frontend/README.md) | Frontend, pages, and components | 101 |
| 03 | [03-backend-proxy/](03-backend-proxy/README.md) | Backend, APIs, and proxy | 110 |
| 04 | [04-sdk/](04-sdk/README.md) | SDKs and integration examples | 156 |
| 05 | [05-wallet-auth/](05-wallet-auth/README.md) | Wallet, authentication, and sessions | 15 |
| 06 | [06-vault-permissions/](06-vault-permissions/README.md) | Vault, credentials, and permissions | 32 |
| 07 | [07-onchain-settlement/](07-onchain-settlement/README.md) | On-chain programs, balances, and settlement | 37 |
| 08 | [08-data-schema/](08-data-schema/README.md) | Data, schemas, and migrations | 0 |
| 09 | [09-tests-security/](09-tests-security/README.md) | Tests, security, and verification | 77 |
| 10 | [10-deployment-operations/](10-deployment-operations/README.md) | Deployment, operations, and scripts | 63 |
| 11 | [11-demo-assets/](11-demo-assets/README.md) | Demos, recordings, and visual assets | 51 |
| 12 | [12-reviewer-evidence/](12-reviewer-evidence/README.md) | Reviewer materials and evidence | 6 |
| 90 | [90-review-needed/](90-review-needed/README.md) | Unclear purpose, historical candidates, and review items | 46 |

## Main entrypoints

| Area | Path |
|---|---|
| Product README (how to use + agent register) | [README.md](../../README.md) |
| Reviewer companion | [keyshield.md](../../keyshield.md) |
| Local stack | [dev.cjs](../../dev.cjs) · [DEVELOPMENT.md](../../DEVELOPMENT.md) |
| Vault UI | [src/web/](../../src/web/) |
| Wallet / session | [src/web/components/WalletConnector.tsx](../../src/web/components/WalletConnector.tsx) · [src/backend/routes/auth.py](../../src/backend/routes/auth.py) |
| Vault / sync | [src/web/lib/vault.ts](../../src/web/lib/vault.ts) · [src/infra/sync-worker/](../../src/infra/sync-worker/) |
| Control plane | [src/backend/app.py](../../src/backend/app.py) |
| Rust proxy | [src/proxy/](../../src/proxy/) |
| Python SDK | [packages/sdk-py/](../../packages/sdk-py/) |
| Settlement | [src/programs/keyshield/](../../src/programs/keyshield/) · [src/backend/mpp/](../../src/backend/mpp/) |
| Tests | [tests/](../../tests/) · [src/backend/tests/](../../src/backend/tests/) |
| Deploy | [DEPLOY.md](../../DEPLOY.md) · [railway.json](../../railway.json) · `.github/workflows/` |
| Agent design | [AGENTS.md](../../AGENTS.md) |
| API reference | [docs/API.md](../API.md) |
| Docs hub | [docs/README.md](../README.md) |

## Unresolved questions

See [90-review-needed](90-review-needed/README.md) and [REVIEW_NEEDED.md](REVIEW_NEEDED.md).

## Maintenance

See [MAINTENANCE.md](MAINTENANCE.md). Future original-file moves need Aileena’s approval and a separate PR. This index must not be treated as a license to relocate source.
