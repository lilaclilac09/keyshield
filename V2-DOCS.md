# KeyShield v2 — Current State Reference (Updated 2026-05-09)

> This doc is superseded by AGENTS.md (agent design guide), MIGRATION_CHECKLIST.md (migration history), and integration-log.md (directory restructure).
> Kept here for historical reference.

---

## Current Layout (as of Phase 6, 2026-05-09)

```
keyshield/
├── AGENTS.md                    # Agent design guide (primary docs)
├── MIGRATION_CHECKLIST.md       # Full migration checklist + audit
├── integration-log.md           # SOTA consolidation log
├── ROADMAP.md                   # Current roadmap
├── DEVELOPMENT.md               # Local dev setup
├── USAGE.md                     # How to use everything
├── README.md                    # Project overview
└── TODOS.md                     # Deferred work items

├── landing/                     # Demo page (standalone)
│   ├── index.html               # Single-page demo
│   └── DEMO-SCRIPT.md           # Demo video scripts

├── _archive/                    # Archived extensions (not tracked in git)
│   ├── dropped-extension/       # Agentic extension (X402, Lit, Cloud)
│   └── disabled-extension/      # Disabled Vite-based extension

├── src/
│   ├── backend/                 # Python control plane (active)
│   │   ├── app.py               # FastAPI application factory
│   │   ├── config.py            # Pydantic settings
│   │   ├── errors.py            # Error hierarchy
│   │   ├── keyshield_sdk.py     # KeyShield, AsyncKeyShield, AgentKeyShield
│   │   ├── auth/                # Session + WebAuthn
│   │   ├── routes/              # Route handlers (vault, agents, billing, etc.)
│   │   ├── proxy/               # API router + x402 verify
│   │   ├── billing/             # Usage tracking
│   │   ├── agents/              # Agent CRUD
│   │   ├── sharing/             # Vault shares
│   │   ├── mpp/                 # Payment streams
│   │   ├── trading/             # Trading orchestration
│   │   ├── skills/              # Helius tools
│   │   ├── middleware/          # Auth middleware
│   │   └── tests/               # Python unit tests
│   ├── web/extension/           # Chrome extension (Plasmo)
│   ├── web-v2/                  # Vite-based React app
│   ├── programs/keyshield/      # Solana program
│   ├── proxy/                   # Rust hot-path proxy
│   ├── mobile/                  # React Native
│   ├── sdk/packages/            # SDK packages (agent-sdk, cli, goat-wallet)
│   └── infra/                   # Infrastructure (sync-worker, metrics-ui)

├── tests/                       # E2E tests (Playwright)
├── docs/                        # Documentation hub
└── .github/workflows/           # CI/CD
```

---

## Component Status

| Component | Status | Notes |
|-----------|--------|-------|
| Python control plane (`src/backend/`) | ✅ Active | 43 Python files, all imports working |
| Rust proxy (`src/proxy/`) | ✅ Active | 6 crates, ~78 tests |
| Solana program (`src/programs/keyshield/`) | ✅ Active | Anchor program, 7 instructions |
| Chrome extension (`src/web/extension/`) | ✅ Active | Plasmo-based MV3 |
| Web V2 (`src/web-v2/`) | ✅ Active | Vite 6 + React 19 |
| SDK packages (`src/sdk/packages/`) | ✅ Active | agent-sdk, cli, goat-wallet |
| E2E tests (`tests/e2e/`) | ✅ Active | Playwright |

---

## CI/CD Pipeline (Updated 2026-05-09)

| Workflow | Trigger | What it runs | Status |
|----------|---------|-------------|--------|
| `test.yml` | PR/push to main | Rust Solana + proxy-rs tests (78 tests, 6 crates) | ✅ Fixed rust-proxy→proxy paths |
| `node-tests.yml` | PR/push to main | TS workspaces + web-v2 build | ✅ Fixed web-frontend→web-v2 |
| `python.yml` | Push to src/backend/ | Python lint → test (3 versions) → UAT | ✅ Coverage path fixed |
| `uat.yml` | Schedule/manual | UAT suite with live server | ✅ New |
| `sync-worker-deploy.yml` | PR/push to infra/ | Cloudflare Worker test + deploy | ✅ Solid |
| `python-legacy-tests.yml` | Manual only | Legacy Python tests (disabled) | ⚠️ Stale paths, kept as reference |

---

## What Was Moved (Phase 6)

| Old Path | New Path | Content |
|----------|----------|---------|
| `.dropped-20260427-231054/extension/` | `_archive/dropped-extension/` | Agentic extension source + build |
| `.dropped-20260427-231054/disabled_extension/` | `_archive/disabled-extension/` | Disabled Vite-based extension |
| `landing/DEMO-SCRIPT.md` | `landing/DEMO-SCRIPT.md` | Unchanged (demo script) |
| `landing/index.html` | `landing/index.html` | Unchanged (demo page) |

---

## Superseded Docs

| Doc | What it became | Notes |
|-----|----------------|-------|
| `CLAUDE.md` | Merged into `AGENTS.md` | Was duplicate GitNexus metadata block (43 lines) |
| `MIGRATION_AUDIT.md` | Merged into `MIGRATION_CHECKLIST.md` | Audit details folded into checklist |
| `V2-DOCS.md` | Kept for reference, paths updated | Now points to current paths |

---

## Legacy Paths (No Longer Valid)

| Old Path | Current Location |
|----------|-----------------|
| `v2-mvp/src/` | `src/backend/` |
| `src/rust-proxy/` | `src/proxy/` |
| `src/web-frontend/` | `src/web-v2/` (Vite app) |
| `src/python-legacy/` | Merged into `src/backend/` |
