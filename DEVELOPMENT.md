# Running keyshield locally

## One command

```bash
bash scripts/dev.sh
```

This starts:

- **Python control plane** on `:8001` (uvicorn auto-reload)
- **Rust hot-path proxy** on `:8000` (release build, fronts everything)
- **Frontend** on `:5173` (Vite dev with HMR)

Output is interleaved with `[py]` / `[rs]` / `[fe]` prefixes. `Ctrl-C` stops
everything cleanly. First run builds the Rust release binary (~30s) and
runs `npm ci` in `frontend/` (~30s); subsequent runs start in <2s.

Open **http://localhost:5173** — that's the dashboard / Chrome extension
popup. It talks to `:8000` (Rust); Rust handles `/proxy/*` directly and
reverse-proxies everything else (passkey, vault, billing, agents, usage)
to Python on `:8001`. See [`proxy-rs/ADR-002-architecture.md`](proxy-rs/ADR-002-architecture.md).

## First-time setup

```bash
# Python venv (one-time)
cd v2-mvp
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd ..

# Rust toolchain (if not already)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node 20+ + npm (assume installed)

# Now you can run:
bash scripts/dev.sh
```

## Variants

```bash
# Skip Rust — frontend talks to Python directly (debug Python only)
bash scripts/dev.sh --no-rust

# Run just one piece in foreground (separate terminals):
cd v2-mvp && .venv/bin/uvicorn src.server:app --port 8001 --reload
KS_BIND=127.0.0.1:8000 PYTHON_BACKEND_URL=http://127.0.0.1:8001 \
  cargo run --release --manifest-path proxy-rs/Cargo.toml --bin ks-proxy
cd frontend && npm run dev -- --port 5173
```

## Test posture

| Scope | Command | What it verifies |
|---|---|---|
| Rust unit + integration | `cargo test --workspace --manifest-path proxy-rs/Cargo.toml` | 78 tests across 5 crates: vault decrypt, session pool, cache TTL, upstream auth, Helius dispatch, proxy handlers, batch, fallthrough, stealth |
| Solana program | `cargo test -p keyshield` | Mollusk unit tests for the on-chain program |
| TypeScript workspaces | `npm test` | agent-sdk, cli, goat-wallet, sync-worker, mobile |
| Frontend typecheck + build | `cd frontend && npx tsc --noEmit && npm run build` | dashboard / Chrome extension builds clean |
| Rust ↔ Python byte parity | `bash proxy-rs/scripts/run_oracle_diff.sh` | 12 fixtures: real Python `:8001` vs real Rust `:8000` byte-equal |

CI runs all of these on every PR (`.github/workflows/{test,node-tests,sync-worker-deploy}.yml`).

**Not yet covered:** end-to-end "user clicks a button" tests. Listed as next
deliverable in `proxy-rs/specs/SPEC-WRITING-GUIDE.md` ("Test like a user"
section).

## Known gotchas

- **Passkey requires a real domain or `127.0.0.1`** — `localhost` doesn't
  work in Chrome's passkey API. The dev script binds `127.0.0.1` for this
  reason. If you change it, passkeys silently break.
- **Port conflicts** — `dev.sh` kills any process holding `:8000`/`:8001`/`:5173`
  before starting. If you have other dev servers running on those ports they
  WILL be killed.
- **Vault state persists** — `v2-mvp/vault/` and `v2-mvp/sessions.db` are not
  reset between runs. To start fresh: `rm -rf v2-mvp/vault v2-mvp/*.db`.
- **`cargo build --release`** is slow first time (~30s on M-series Mac, ~2min
  on slow machines). Subsequent runs use cached artifacts.

## Productionizing

`scripts/dev.sh` is for local dev. Production is Stage-2 work, not yet built:
- TLS termination on Rust (rustls + ACME, see https_proxy article pattern)
- Single-binary packaging or Docker compose
- Real x402 payment verification (Python's [server.py:1067](v2-mvp/src/server.py#L1067) is currently TODO)
- Stealth mode is implemented (`KS_STEALTH=1`) but not yet wired into deploy
- See [`proxy-rs/ADR-002-architecture.md`](proxy-rs/ADR-002-architecture.md) "What's NOT this decision" section
