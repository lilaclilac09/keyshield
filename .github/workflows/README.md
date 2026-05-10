# KeyShield CI/CD — Deploy Contract

Path A architecture: 3 services, 2 deploy targets owned by GitHub Actions, 2 owned by external platforms.

## Workflows

| Workflow | Triggers on paths | Purpose | Deploys? |
|----------|-------------------|---------|----------|
| `sync-worker-deploy.yml` | `src/infra/sync-worker/**` | Test + typecheck + deploy Cloudflare Worker | Yes — `wrangler deploy` on push to main |
| `node-tests.yml` | All pushes/PRs (with per-job filters) | Workspaces test, web-v2 build, Python backend smoke test | No (gate only) |
| `python.yml` | `src/backend/**`, `pyproject.toml`, `conftest.py` | Lint + pytest matrix (3.10/3.11/3.12) + UAT subset | No (gate only) |
| `uat.yml` | `src/backend/**`, `Dockerfile.python`, `docker-compose.yml` | UAT against live FastAPI server + docker-compose smoke test | No (gate only) |
| `test.yml` | All pushes/PRs | Rust unit tests (Mollusk + proxy-rs) + Surfpool integration | No |
| `devnet-deploy.yml` | (manual / scheduled) | Solana program devnet deploy | Yes — Solana devnet |
| `python-legacy-tests.yml` | manual only (`workflow_dispatch`) | Disabled legacy v2-mvp tests | No |

## Who deploys what

- **Cloudflare Worker** (vault storage) — GitHub Actions `sync-worker-deploy.yml` runs `wrangler deploy`.
- **Python FastAPI backend** (proxy + business logic) — Railway watches `main` and auto-builds `Dockerfile.python`. **No GitHub Action deploys this.** GH Actions only gates with smoke tests so PRs fail fast before Railway's build cycle.
- **Web-v2 Vite app** (extension + web UI) — Vercel auto-deploys on push. **No GitHub Action deploys this.** GH Actions only typechecks + builds the Vite bundle to catch breakage early.
- **Solana program** — `devnet-deploy.yml` (manual / scheduled) for devnet; mainnet deploys are out of band.

## Required secrets

| Secret | Used by | Notes |
|--------|---------|-------|
| `CLOUDFLARE_API_TOKEN` | `sync-worker-deploy.yml` | Token with `Workers Scripts: Edit` + R2 read/write |
| `CLOUDFLARE_ACCOUNT_ID` | `sync-worker-deploy.yml` | |
| `CODECOV_TOKEN` | `python.yml`, `uat.yml` (optional) | Coverage upload, `fail_ci_if_error: false` |

`RAILWAY_TOKEN` is **not** consumed by any GitHub Action — Railway has its own GitHub integration.
`VERCEL_TOKEN` is **not** consumed by any GitHub Action — Vercel has its own GitHub integration.

Worker runtime secrets (e.g. `JWT_SECRET`) are set via `wrangler secret put` against the deployed worker, not via GH Actions.

## Path → workflow map (quick lookup)

- `src/infra/sync-worker/**` → `sync-worker-deploy.yml`
- `src/backend/**` → `python.yml`, `uat.yml`, `node-tests.yml` (python-backend job)
- `Dockerfile.python` → `uat.yml`, `node-tests.yml` (python-backend job)
- `src/web-v2/**` → `node-tests.yml` (frontend job)
- `src/sdk/packages/**`, `src/proxy/**` → `node-tests.yml` (workspaces job), `test.yml`
- `programs/keyshield/**` → `test.yml`, `devnet-deploy.yml`
