# Running keyshield locally

## One command

```bash
node dev.cjs
```

Starts (cross-platform — works on macOS, Linux, Windows):

- **Python control plane** on `:8001` (uvicorn auto-reload, `src/backend/`)
- **Rust hot-path proxy** on `:8000` (release build, fronts everything)
- **Web frontend** on `:5173` (Vite dev with HMR, `src/web/`)

`Ctrl-C` stops everything cleanly. First run builds the Rust release binary
(~30s) and runs `npm install` in `src/web/` (~30s); subsequent runs start
in <2s.

Open **http://localhost:5173** — that's the dashboard / extension popup.
It talks to `:8000` (Rust); Rust handles `/proxy/*` directly and
reverse-proxies everything else (passkey, vault, billing, agents, usage)
to Python on `:8001`. See [`src/proxy/ADR-002-architecture.md`](src/proxy/ADR-002-architecture.md).

## Run a single service

```bash
node dev.cjs web      # just the frontend
node dev.cjs proxy    # just the Rust proxy
node dev.cjs backend  # just the Python control plane
```

## First-time setup

```bash
# Python venv + deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r src/backend/requirements.txt

# Rust toolchain (if not already)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node 20+ + npm (assume installed)
npm install                    # root + workspaces
cd src/web && npm install      # frontend bundle
```

## GitNexus CLI

There is no global `gitnexus` on macOS PATH. Run from this repo root, not `~`:

```bash
node src/scripts/gitnexus.cjs impact "status_strip" --direction upstream
npm run gitnexus -- detect-changes --scope all
```

Do not paste `<符号>`. `node src/scripts/gitnexus.cjs` from `$HOME` resolves to `/Users/you/src/scripts/gitnexus.cjs`.

## Manual launch (separate terminals)

```bash
# 1. Python
uvicorn src.backend.app:app --host 127.0.0.1 --port 8001 --reload

# 2. Rust proxy
KS_BIND=127.0.0.1:8000 PYTHON_BACKEND_URL=http://127.0.0.1:8001 \
  cargo run --release --manifest-path src/proxy/Cargo.toml --bin ks-proxy

# 3. Web
cd src/web && npm run dev -- --port 5173
```

## Test posture

| Scope | Command |
|---|---|
| Rust unit + integration | `cargo test --workspace --manifest-path src/proxy/Cargo.toml` |
| Solana program | `cargo test -p keyshield` |
| TypeScript workspaces | `npm test` |
| Frontend typecheck + build | `cd src/web && npx tsc --noEmit && npm run build` |
| Python backend | `cd src/backend && pytest` |
| Playwright E2E | `npm run test:e2e` |
| Rust ↔ Python byte parity | `bash src/proxy/scripts/run_oracle_diff.sh` |

CI runs all of these on every PR (`.github/workflows/{python,test,uat,
sync-worker-deploy,devnet-deploy}.yml`).

## Production deploy

No docker-compose. Each tier is on its native PaaS:

- **Landing** (`landing/`) → Vercel
- **Dashboard** (`src/web/`) → Vercel (Vite build)
- **Sync Worker** (`src/infra/sync-worker/`) → Cloudflare (wrangler)
- **API** (`src/backend/`) → Railway (uses `Dockerfile.python` + `railway.json`)

Step-by-step + env matrix + DNS in
[`DEPLOY.md`](DEPLOY.md).

## Known gotchas

- **Passkey requires a real domain or `127.0.0.1`** — `localhost` doesn't
  work in Chrome's passkey API. `dev.cjs` binds `127.0.0.1` for this reason.
- **Port conflicts** — `dev.cjs` doesn't auto-kill processes on `:8000` /
  `:8001` / `:5173`. Free them first if you have other dev servers running.
- **Vault state persists** — `src/backend/vault/` and `src/backend/data/*.db`
  are not reset between runs. To start fresh: `rm -rf src/backend/vault src/backend/data`.
- **`cargo build --release`** is slow first time (~30s on M-series Mac,
  ~2min on slow machines). Subsequent runs use cached artifacts.

## Productionizing

Production work tracked in `src/proxy/specs/`:
- TLS termination on Rust (rustls + ACME) — spec 12
- x402 payment verification — `src/backend/proxy/x402_verify.py` (real
  on-chain verify path; stub fallback for dev)
- Embedded wallet for agents — spec 10
- Stealth mode (`KS_STEALTH=1`) implemented but not yet wired into deploy
- See [`src/proxy/ADR-002-architecture.md`](src/proxy/ADR-002-architecture.md) "What's NOT this decision"
