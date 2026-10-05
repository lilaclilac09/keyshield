# Directory map

Actual top-level git-tracked layout. Generated directories (`node_modules`, `target`, `dist`) are excluded from deep traversal and are not deleted.

| Directory | Tracked files | Purpose |
|---|---:|---|
| `src` | 454 | Application source: web, backend, proxy, programs, extension, infra. |
| `packages` | 121 | Published/workspace packages (Python SDK, MCP, shared TS). |
| `docs` | 38 | Operator, API, architecture, evidence, and demo docs. |
| `.claude` | 29 | Agent skills (including GitNexus). |
| `scripts` | 13 | Record-demo, live e2e, program upgrade helpers. |
| `proxy-helius` | 11 | Helius-specific Rust proxy crate. |
| `tests` | 10 | Repo-root harnesses (bankrun, fault injection, zk-vault ix). |
| `tooling` | 8 | Internal tooling. |
| `.github` | 7 | GitHub Actions workflows. |
| `archive` | 4 | Historical / archived trees. Do not treat as live product. |
| `sites` | 4 | Marketing landing. |
| `.gstack` | 3 | QA report leftovers. |
| `.env.example` | 1 | See category indexes. |
| `.gitattributes` | 1 | See category indexes. |
| `.gitignore` | 1 | See category indexes. |
| `.gitnexus` | 1 | See category indexes. |
| `.vercelignore` | 1 | See category indexes. |
| `AGENTS.md` | 1 | See category indexes. |
| `CHANGELOG.md` | 1 | See category indexes. |
| `CLAUDE.md` | 1 | See category indexes. |
| `Cargo.lock` | 1 | See category indexes. |
| `Cargo.toml` | 1 | See category indexes. |
| `DEPLOY.md` | 1 | See category indexes. |
| `DEVELOPMENT.md` | 1 | See category indexes. |
| `Dockerfile.python` | 1 | See category indexes. |
| `Makefile` | 1 | See category indexes. |
| `README.md` | 1 | See category indexes. |
| `SPEC.md` | 1 | See category indexes. |
| `conftest.py` | 1 | See category indexes. |
| `dev.cjs` | 1 | See category indexes. |
| `keyshield.md` | 1 | See category indexes. |
| `package-lock.json` | 1 | See category indexes. |
| `package.json` | 1 | See category indexes. |
| `playwright.config.ts` | 1 | See category indexes. |
| `railway.json` | 1 | See category indexes. |
| `tsconfig.base.json` | 1 | See category indexes. |
| `vitest.config.ts` | 1 | See category indexes. |

## Notable subtrees

| Path | Purpose |
|---|---|
| `src/web/` | Vault dashboard (Vite). |
| `src/backend/` | FastAPI control plane. |
| `src/proxy/` | Rust hot-path proxy workspace. |
| `src/programs/` | Pinocchio on-chain program. |
| `src/extension/` | Browser extension. |
| `src/infra/` | Cloudflare sync-worker. |
| `src/sdk/` | TS SDK / CLI / goat-wallet. |
| `src/demo-next/` | Next.js demo surface. |

## Generated directories (directory-level only)

Present on the workspace disk. Not deep-walked. Not deleted.

| Path | Purpose |
|---|---|
| `node_modules/` | npm install output |
| `target/` | Cargo build output |
| `dist/` | Frontend / CLI bundles |
| `build/` | Tooling build output |
| `coverage/` | Test coverage |
| `.venv/` | Python virtualenv |
| `__pycache__/` | Python bytecode |

Untracked report: [UNTRACKED.md](UNTRACKED.md).
