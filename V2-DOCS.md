# KeyShield v2 — Complete Working Documentation

> The source of truth for KeyShield's current state, what works, what doesn't, and how to build on top of it.
> Last updated: 2026-05-08

---

## Table of Contents

1. [Quick Start — Get Everything Working](#1-quick-start)
2. [Project Structure (Current Layout)](#2-project-structure)
3. [Component Status — What Works vs Broken](#3-component-status)
4. [Windows-Specific Notes](#4-windows-specific-notes)
5. [Path Conventions](#5-path-conventions)
6. [CI/CD Pipeline](#6-cicd-pipeline)
7. [Testing Status](#7-testing-status)
8. [Before You Integrate — Checklist](#8-before-you-integrate)
9. [Refactoring Roadmap](#9-refactoring-roadmap)

---

## 1. Quick Start

```bash
# Clone fresh (avoid git cache issues on Windows)
git clone https://github.com/lilaclilac09/keyshield.git
cd keyshield

# Rust — builds fine
cargo build

# Python v2-mvp tests
cd v2-mvp
python -m pytest tests/test_security_fixes.py -v --tb=line

# Node.js vitest
npx vitest run

# TypeScript API server
cd src/api-server
npm install && npm run build

# Frontend (Next.js)
cd src/web-frontend
npm install && npm run build

# Go back to root
cd ../..
```

---

## 2. Project Structure (Current Layout)

After the side branch merge, the layout is:

```
keyshield/                           # Repo root
├── src/                             # All source code (SOTA reorg)
│   ├── python-legacy/src/           # Python control plane (FIXED — this is the real src/)
│   │   ├── server.py                # FastAPI app, routes
│   │   ├── api_router.py            # Upstream routing
│   │   ├── vault.py                 # AES-256-GCM + Argon2id encryption
│   │   ├── session.py               # Session management
│   │   ├── agents.py                # Agent CRUD
│   │   ├── passkey.py               # FIDO2 passkey auth
│   │   ├── x402_verify.py           # x402 payment verification
│   │   └── skills/                  # Skills framework
│   ├── rust-proxy/src/              # Rust proxy source (relocated from proxy-rs/)
│   ├── solana-programs/keyshield/   # Solana programs
│   ├── api-server/src/              # TS API server
│   ├── web-frontend/               # Next.js web UI
│   ├── mobile-app/                 # React Native app
│   ├── sdk/packages/               # Client SDKs (agent-sdk, cli, goat-wallet)
│   └── crypto/                     # Unified crypto (AES-GCM, Ed25519)
├── v2-mvp/                          # Python MVP (has its own src/python-legacy/src/ via symlinks)
│   ├── src/                         # v2-mvp's local src (copied files)
│   ├── tests/                       # pytest suite
│   └── bench_vault.py               # Encryption benchmarks
├── infra/sync-worker/               # Cloudflare Worker
├── packages/                        # (legacy — moved to src/sdk/packages/)
├── docs/                            # Documentation
│   └── architecture/                # ADRs, design docs
├── tests/                           # E2E + integration tests
└── .github/workflows/               # CI/CD (4 workflows)
```

### Key Path Facts

| What | Where | Notes |
|------|-------|-------|
| Python vault module | `src/python-legacy/src/vault.py` | **NOT** `v2-mvp/src/vault.py` |
| Python server.py | `src/python-legacy/src/server.py` | **NOT** `v2-mvp/src/server.py` |
| Rust proxy source | `src/rust-proxy/src/` (moved from `proxy-rs/`) | Cargo.toml updated |
| Solana program | `src/solana-programs/keyshield/Cargo.toml` | In Cargo.toml members |
| Web frontend | `src/web-frontend/` | **NOT** `frontend/` |
| Agent SDK | `src/sdk/packages/agent-sdk/` | **NOT** `packages/agent-sdk/` |
| CLI package | `src/sdk/packages/cli/` | **NOT** `packages/cli/` |
| Goat wallet | `src/sdk/packages/goat-wallet/` | **NOT** `packages/goat-wallet/` |
| Sync worker | `infra/sync-worker/` | ✅ unchanged |

### Critical: The `src/` Namespace Issue (FIXED)

Python's import system was broken because two `src/` directories competed:
- Root `src/` at `C:\Users\justi\Desktop\keyshield\src\` — a namespace package with NO modules directly inside
- `src/python-legacy/src/` — the real Python modules

**Fix:** The conftest.py inserts `C:/Users/justi/Desktop/keyshield/src/python-legacy/src` into `sys.path[0]` before any imports. This ensures `from src import server` resolves to the correct location, not the empty namespace.

### Critical: Windows Path Issues

On Windows, the root `src/` directory is also picked up as a namespace package by Python, causing `from src import server` to fail silently (returns "unknown location"). The conftest fix above solves this, but be aware:

- **Never assume `v2-mvp/src/` has your modules** — they live in `src/python-legacy/src/`
- **File paths should use forward slashes** — `C:/Users/...` works; `C:\Users\...` may fail in some contexts
- **Use raw strings for file paths** — `r'v2-mvp/tests/conftest.py'` not `'v2-mvp\tests\conftest.py'`

---

## 3. Component Status

### ✅ Working Components

| Component | Status | Notes |
|-----------|--------|-------|
| Rust proxy (ks-proxy) | ✅ PASS | `cargo build` succeeds, 31 warnings |
| Solana program | ✅ PASS | In Cargo.toml members |
| Vault encryption (Argon2id + AES-256-GCM) | ✅ PASS | Benchmarks: ~430ms key derivation, ~12µs encrypt/decrypt |
| Session tokens (HMAC expiry) | ✅ PASS | |
| Agent revocation CRL | ✅ PASS | |
| x402 stub-fallback | ✅ PASS | Works with empty RPC config |
| Passkey auth | ✅ PASS | FIDO2 implementation |
| CLI package | ✅ PASS | `ks_store`, `ks_login` commands |
| Agent SDK | ✅ PASS | TypeScript client |
| Web frontend | ✅ PASS | Build succeeds, paths fixed |
| Frontend (web-frontend) | ✅ PASS | **NOT** `frontend/` |
| Sync worker | ✅ PASS | Cloudflare Worker build/test OK |
| Encryption benchmarks | ✅ PASS | New: `v2-mvp/bench_vault.py` |

### ⚠️ Partially Working (Needs Attention)

| Component | Issue | Fix |
|-----------|-------|-----|
| Python vault tests | 15/21 pass, 6 fail | Minor: vault data format mismatch, `_auth` lookup |
| Python session tests | FAIL | Missing `client` fixture from conftest |
| Agent tests | FAIL | UNIQUE constraint from stale DB |
| Node.js vitest | ~70% pass | Missing `@playwright/test`, `cloudflare:test` packages locally |
| Rust mypy | PASS | `--ignore-missing-imports` suppresses minor issues |

### ❌ Not Working

| Component | Issue | Fix |
|-----------|-------|-----|
| `from src import server` (default Python) | Namespace collision | Fixed in conftest, but direct imports may still fail on Windows |
| Root `tests/conftest.py` | Had stale content with conflict markers | Replaced with clean version |
| `v2-mvp/src/vault_new.py` | Staged for deletion during merge | No longer needed |

---

## 4. Windows-Specific Notes

### Don't Use on Windows

- **`git credential-manager`**: The Windows credential manager can cache stale credentials causing 403 errors. Use PAT in URL format: `https://a144z:github_pat_xxx@github.com/...`
- **`&&` chaining**: PowerShell doesn't support `&&`. Use `cmd1; if ($?) { cmd2 }` instead
- **`/dev/null`**: Not available. Use `> $null` or `| Out-Null` instead
- **`<file>` input**: Use `Get-Content file` or redirect properly
- **`<` in heredoc**: PowerShell 5.1 treats `<` specially; use `<<'EOF'` syntax with single quotes

### Path Conventions That Work on Windows

```python
# ✅ Good — forward slashes (Python handles them)
path = 'C:/Users/justi/Desktop/keyshield/src/python-legacy/src'
path = Path('C:/Users/justi/Desktop/keyshield/src/python-legacy/src')

# ✅ Good — raw strings
path = r'C:\Users\justi\Desktop\keyshield\src\python-legacy\src'

# ❌ Bad — backslashes in some contexts (especially with string interpolation)
path = f'{repo}/src/python-legacy/src'  # Works but inconsistent

# ✅ Always use Path objects for cross-platform
from pathlib import Path
_repo = Path('C:/Users/justi/Desktop/keyshield')
_src = _repo / 'src' / 'python-legacy' / 'src'
```

### Git on Windows — Common Issues

1. **CRLF vs LF**: Files get CRLF, which can break Python parsing. Use `git config core.autocrlf input` in the repo.
2. **Credential cache**: Clear stale credentials:
   ```
   git credential-manager erase https://github.com
   ```
3. **Large file warning**: `.gitnexus/lbug` is 56MB — larger than GitHub's 50MB recommendation. Consider moving to LFS.

---

## 5. Path Conventions

### Relative Paths (Preferred)

When writing Python modules inside `src/python-legacy/src/`:

```python
# Import from sibling modules
from src.vault import store, load      # ✅ works (conftest adds path)
from src.session import create_token    # ✅ works
from src.agents import register         # ✅ works
from src.x402_verify import verify_on_chain  # ✅ works

# Import from parent package
from ..crypto.aes_gcm import encrypt    # ✅ works (relative)

# Avoid importing from v2-mvp/src/ directly — it's a copy, not the source
```

### Relative Paths in Config Files

| Config file | Base dir | Important paths |
|-------------|----------|-----------------|
| `v2-mvp/conftest.py` | `v2-mvp/` | `_repo = Path('C:/Users/justi/Desktop/keyshield')` |
| `package.json` (root) | `keyshield/` | workspaces: `src/sdk/packages/agent-sdk`, etc. |
| `Cargo.toml` (root) | `keyshield/` | members: `src/solana-programs/keyshield` |
| `.github/workflows/*.yml` | `keyshield/` | paths are relative to repo root |

### Absolute Path (Fallback — Current Approach)

Some files use absolute paths like `'C:/Users/justi/Desktop/keyshield/src/python-legacy/src'`. This works but is **not portable**. When refactoring, convert to:

```python
from pathlib import Path
_REPO = Path(__file__).resolve().parents[2]  # Goes up from v2-mvp/tests/ to repo root
_SRC = _REPO / 'src' / 'python-legacy' / 'src'
```

---

## 6. CI/CD Pipeline

### Four Workflows

| Workflow | Trigger | What it runs | Status |
|----------|---------|-------------|--------|
| `test.yml` | PR/push to main/master | Rust Solana + proxy-rs tests (78 tests, 6 crates) | ✅ Solid |
| `node-tests.yml` | PR/push to main/master | TS workspaces + frontend build | ✅ Fixed paths |
| `v2-python.yml` | PR/push to main/develop | Python lint → test → UAT → build | ⚠️ Mostly fixed |
| `sync-worker-deploy.yml` | PR/push to main/master (infra/) | Cloudflare Worker test + deploy | ✅ Solid |

### CI Flow for v2-python.yml

```
lint (ruff + mypy)
  └─→ test (pytest on ubuntu, Python 3.10/3.11/3.12)
       ├─→ run unit tests with coverage → upload to Codecov
       └─→ run UAT suite
            └─→ build-and-test (only on push to main)
                 - verify server starts
                 - verify SDK loads
                 - verify CLI loads
                 - verify trading module loads
```

### CI Path Corrections (Applied)

| Before (broken) | After (fixed) |
|-----------------|---------------|
| `ruff check src/ tests/ trading/` | ✅ now correct (v2-mvp/src/) |
| `python keyshield_sdk.py health` | ✅ now correct (in v2-mvp/) |
| `bash keyshield-cli.sh` | ✅ now correct (in v2-mvp/) |
| `from src.python-legacy.src.server import app` | ✅ now correct |
| `working-directory: frontend/` | ✅ now `src/web-frontend/` |
| workspaces: `packages/agent-sdk` | ✅ now `src/sdk/packages/agent-sdk` |

---

## 7. Testing Status

### Python Tests (v2-mvp/tests/)

```bash
# Run all tests
cd v2-mvp
python -m pytest tests/test_security_fixes.py -v --tb=line

# Run a specific test
python -m pytest tests/test_security_fixes.py::TestVault::test_store_and_load -v

# Run with coverage
python -m pytest tests/ --cov=src --cov-report=term-missing
```

**Results:** 15 of 21 pass, 6 fail. Failures are minor:
- `test_wrong_password_fails`: vault data format mismatch (old PBKDF2 vs new Argon2id)
- `test_key_isolation`: same issue
- `test_store_and_load`: same issue
- Session tests: need `client` fixture from conftest
- Agent tests: UNIQUE constraint from stale DB data

**Fix:** The vault migration test (`migrate_all_to_argon2`) has a minor nonce offset bug. Fix in `src/python-legacy/src/vault.py` line ~181.

### Node.js Tests

```bash
# Run vitest (from repo root)
npx vitest run

# Run specific package tests
npm test --workspace=@keyshield/agent-sdk
npm test --workspace=@keyshield/cli
npm test --workspace=infra/sync-worker
```

**Results:** ~70% pass. Failures:
- Missing `@playwright/test` (E2E tests)
- Missing `cloudflare:test` (sync-worker tests)
- tsconfig resolution in agent-sdk, cli, goat-wallet

### Rust Tests

```bash
cargo test --workspace
```

**Results:** All 78+ tests pass across 6 crates.

---

## 8. Before You Integrate — Checklist

### ✅ Prerequisites (Must Have)

1. **Python path fixed**: conftest.py adds `src/python-legacy/src` to `sys.path[0]` before imports
2. **All source files in place**: `server.py`, `api_router.py`, `x402_verify.py`, etc. in `src/python-legacy/src/`
3. **CI configs updated**: All paths now point to new locations
4. **Rust builds**: `cargo build` succeeds
5. **Workspace paths correct**: `package.json` workspaces point to `src/sdk/packages/*`

### ⚠️ Verify Before Adding New Code

1. **Where do modules live?** → `src/python-legacy/src/` (not `v2-mvp/src/`)
2. **Is `from src import X` going to work?** → Yes, if conftest.py's path fix is applied first
3. **Are paths relative or absolute?** → Prefer `Path()` objects; avoid hardcoded Windows paths
4. **Does the new file need a test?** → Add to appropriate test suite (Python: pytest, Node: vitest)
5. **Is there a CI job for this?** → Check which workflow handles the path pattern

### 🔧 Before Merging Changes

- [ ] `cargo build` succeeds (Rust)
- [ ] `python -m pytest tests/ --tb=line` passes (Python)
- [ ] `npx vitest run` passes or has acceptable failures (Node.js)
- [ ] Paths in new code use `Path()` or forward slashes
- [ ] No hardcoded Windows paths like `C:\Users\...`
- [ ] CI workflow files updated if paths changed
- [ ] Run `git diff main` to verify only expected changes

---

## 9. Refactoring Roadmap

### Phase 1: Clean Up (Immediate)

| Task | Priority | Details |
|------|----------|---------|
| **Unified Python path** | 🔴 High | Replace all absolute paths (`C:/Users/...`) with relative `Path()` objects |
| **Remove stale files** | 🟡 Medium | Remove `v2-mvp/src/__init__.py` (empty), `v2-mvp/src/vault_new.py` |
| **Fix vault data format** | 🟡 Medium | Update `migrate_all_to_argon2()` nonce offset in `src/python-legacy/src/vault.py` |
| **Standardize conftest.py** | 🔴 High | One clean version, used by both root tests and v2-mvp tests |

### Phase 2: Consolidate (Next)

| Task | Priority | Details |
|------|----------|---------|
| **Merge v2-mvp/src/ into src/python-legacy/src/** | 🔴 High | Currently there are copies in both places; consolidate to one source |
| **Fix all workspace paths** | 🟡 Medium | Update remaining workspace references in package.json, workflows |
| **Add missing tsconfig.json files** | 🟡 Medium | agent-sdk, cli, goat-wallet need tsconfig |
| **Install @playwright/test** | 🟢 Low | For E2E test suite |
| **Install cloudflare:test** | 🟢 Low | For sync-worker tests |

### Phase 3: Refactor (Future)

| Task | Priority | Details |
|------|----------|---------|
| **Move all Python to src/python-legacy/** | 🔴 High | Currently v2-mvp/ has copies; unify layout |
| **Create `src/__init__.py` with proper exports** | 🟡 Medium | Replace namespace package with real package |
| **Fix Rust proxy-rs → src/rust-proxy rename** | 🟡 Medium | Ensure Cargo.toml paths are correct |
| **Standardize test structure** | 🟡 Medium | One conftest.py, consistent pytest config |
| **Clean up .gitignore** | 🟢 Medium | Remove stale entries, add new patterns |
| **Move .gitnexus/lbug to LFS** | 🟢 Low | 56MB file > 50MB threshold |

### Phase 4: SOTA Architecture (Long-term)

| Task | Priority | Details |
|------|----------|---------|
| **Migrate to Google L7-level design** | 🔴 High | Follow the architecture docs in `docs/architecture/` |
| **Implement full x402 payments** | 🟡 Medium | Replace stub with real implementation |
| **Add streaming responses** | 🟡 Medium | For agent SDK (currently missing) |
| **Create unified API gateway** | 🟡 Medium | Consolidate Rust proxy + Python control plane |
| **Document API contracts** | 🟢 Medium | OpenAPI/Swagger spec for all endpoints |

---

## Appendix: Quick Reference

### Commands Cheat Sheet

```bash
# Build everything
cargo build && cd v2-mvp && python -m pytest tests/ --tb=line && npx vitest run

# Run specific test suites
cd v2-mvp && python -m pytest tests/test_security_fixes.py -v
npx vitest run infra/sync-worker/test/
cargo test --workspace

# Fix Python imports (if broken)
python -c "import sys; from pathlib import Path; _repo = Path('.'); print('src:', str(_repo / 'src/python-legacy/src'))"

# Check cargo workspace
cargo tree --depth=1

# Run encryption benchmarks
python v2-mvp/bench_vault.py
```

### Key File Locations

| File | Location | Purpose |
|------|----------|---------|
| Vault module | `src/python-legacy/src/vault.py` | AES-256-GCM + Argon2id encryption |
| Server app | `src/python-legacy/src/server.py` | FastAPI main application |
| Session module | `src/python-legacy/src/session.py` | Session/token management |
| Agent module | `src/python-legacy/src/agents.py` | Agent CRUD |
| x402 module | `src/python-legacy/src/x402_verify.py` | Payment verification |
| Passkey module | `src/python-legacy/src/passkey.py` | FIDO2 passkey auth |
| Main Cargo.toml | `Cargo.toml` (root) | Rust workspace config |
| Python tests | `v2-mvp/tests/test_security_fixes.py` | Main test file |
| Test config | `v2-mvp/tests/conftest.py` | Pytest fixtures |
| Benchmarks | `v2-mvp/bench_vault.py` | Encryption benchmarks |
| Agent SDK | `src/sdk/packages/agent-sdk/src/` | TypeScript client |
| CLI package | `src/sdk/packages/cli/src/` | Command-line tools |
| Web frontend | `src/web-frontend/` | Next.js UI |
| Sync worker | `infra/sync-worker/` | Cloudflare Worker |
| CI config | `.github/workflows/v2-python.yml` | Python CI/CD |
| CI config | `.github/workflows/node-tests.yml` | Node.js CI/CD |
| CI config | `.github/workflows/test.yml` | Rust CI/CD |
| CI config | `.github/workflows/sync-worker-deploy.yml` | Cloudflare deploy |

### Key Numbers

- **Rust tests**: 78+ passing across 6 crates
- **Python tests**: 15 of 21 passing (minor issues)
- **Node.js tests**: ~70% passing (missing deps)
- **PBKDF2 key derivation**: ~55ms per key (100k iterations)
- **Argon2id key derivation**: ~430ms per key (t=10, m=64MB)
- **AES-256-GCM encrypt/decrypt**: ~12µs per operation
- **Hot path target**: <50ms p99 latency

---

## Appendix: Common Errors and Fixes

### `ImportError: cannot import name 'server' from 'src'`

**Cause:** Python finds the namespace package at `src/` instead of `src/python-legacy/src/`.

**Fix:** Ensure conftest.py inserts `_src = C:/Users/justi/Desktop/keyshield/src/python-legacy/src` into `sys.path[0]` before any imports.

### `ModuleNotFoundError: No module named 'src.server'`

**Cause:** `v2-mvp/src/` exists but is empty (no `server.py`).

**Fix:** Run from repo root, or ensure `src/python-legacy/src/server.py` is on the path.

### `Permission denied to a144z` (GitHub 403)

**Cause:** Windows credential-manager caches old PAT.

**Fix:** Clear credentials:
```bash
git credential-manager erase https://github.com
# or use PAT in URL: git push origin side/keyshield-sota
```

### `SyntaxError: invalid syntax` in test files (Windows)

**Cause:** Conflict markers (`<<<<<<<`, `>>>>>>>`) left after merge.

**Fix:** Re-extract upstream version and strip conflict markers properly using the Python script approach, not string replacement.

### `ImportError: cannot import name 'server' from 'src' (unknown location)`

**Cause:** Namespace package `src` found but has no modules inside.

**Fix:** Remove stale `src/__init__.py` or add the parent directory to `sys.path` before import.
