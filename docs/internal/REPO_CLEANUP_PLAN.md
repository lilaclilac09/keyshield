# Repo Editorial Pass — KeyShield

**Goal: not a system refactor — a repo editorial pass.**

## Three objectives (stay focused on these)

1. A stranger understands the main product in 30 seconds
2. The root directory looks like a product, not a mental scratch pad
3. Main product / supporting libraries / historical artifacts are clearly separated

---

## Root directory problem map

Root directory had 46 entries, including 13 bare `.md` files. Categories:

| Type | Items |
|---|---|
| Must stay at root | README.md, DEVELOPMENT.md, DEPLOY.md, CHANGELOG.md, AGENTS.md, package.json, Cargo.toml, Makefile |
| Tool config (dotfiles, no visual noise) | .claude, .gstack, .gitnexus, .github, .gitignore, .gitattributes, .vercelignore, .env.example |
| Should not be at root — project management | ROADMAP.md, STATUS.md, TODOS.md |
| Should not be at root — migration history | MIGRATION_AUDIT.md, MIGRATION_CHECKLIST.md, V2-DOCS.md |
| Should not be at root — demo/usage | DEMO_SCRIPT.md, USAGE.md |
| Historical artifact directories | v2-mvp/ |
| Inconsistent naming | proxy-rs/ (language), python-sdk/ (language+artifact), landing/ (orphan marketing site) |

---

## Root directory target state (light version — do this first)

```
README.md
DEVELOPMENT.md
DEPLOY.md
CHANGELOG.md
AGENTS.md
LICENSE
package.json
Cargo.toml
Cargo.lock
Makefile
dev.cjs
conftest.py
playwright.config.ts
tsconfig.base.json
railway.json
.env.example
docs/
src/
packages/
proxy-rs/       ← keep for now, rename in Phase 3
python-sdk/     ← keep for now, rename in Phase 4
landing/        ← keep for now, rename in Phase 3
tooling/
scripts/
tests/
archive/
```

---

## Execution plan

### Phase 1 — Root doc demotion (zero risk, pure git mv)

Move to `docs/internal/`:

```bash
# Project management
mv ROADMAP.md        docs/internal/roadmap.md
mv STATUS.md         docs/internal/status.md
mv TODOS.md          docs/internal/todos.md

# Migration history
mv MIGRATION_AUDIT.md     docs/internal/migration-audit.md
mv MIGRATION_CHECKLIST.md docs/internal/migration-checklist.md
mv V2-DOCS.md             docs/internal/v2-docs.md

# Demo/usage
mv DEMO_SCRIPT.md    docs/internal/demo-script.md
mv USAGE.md          docs/internal/usage.md
```

**Commit:**
```
chore: move project status and migration docs out of root into docs/internal
```

---

### Phase 2 — Archive historical directories (zero risk)

`v2-mvp/` contains only two test files (`test_account_deletion.py`, `test_sharing.py`):

```bash
mkdir -p archive/v2-mvp
mv v2-mvp/tests archive/v2-mvp/tests
rmdir v2-mvp
```

`.keyshield-demo/` contains demo wallet state JSON — not a product asset:

```bash
mv .keyshield-demo archive/keyshield-demo
```

Move landing demo script:

```bash
mv landing/DEMO-SCRIPT.md docs/internal/demo-script-landing.md
```

**Commit:**
```
chore: archive legacy v2 tests and demo artifacts
```

---

### Phase 3 — Directory renaming (separate PR — needs reference updates)

**Problem:** naming dimensions are mixed — `proxy-rs` by language, `src/backend` by role, `landing` by marketing role, all at the same hierarchy level.

**Light version (recommended first):**

```bash
mv proxy-rs   proxy
mv python-sdk sdk-python
mv landing    marketing-landing
```

⚠️ Before renaming `proxy-rs`:
- `proxy-rs/crates/ks-helius` is an independent Rust crate with its own Cargo.toml
- Root `Cargo.toml` `exclude` list doesn't include it — verify path is correct after rename
- Check if CI workflows have hardcoded `proxy-rs` paths

**More formal version (if time allows):**

```bash
mkdir -p services packages/sdk-py sites
mv proxy-rs   services/proxy-helius
mv python-sdk packages/sdk-py
mv landing    sites/landing
```

Note: `python-sdk/pyproject.toml` package paths need updating after move; PyPI CI also needs to sync.

**Commit messages (separate commits per rename for easy revert):**
```
refactor: rename proxy-rs to proxy
refactor: rename python-sdk to sdk-python
refactor: move landing into marketing-landing
```

---

### Phase 4 — docs/ layer completion

`docs/` already has `architecture/`, `get-started/`, `pitch/`, `technical/`, `zh/`. Add `internal/` to complete the structure:

```
docs/
  architecture/       ← system architecture (existing)
  get-started/        ← quickstart (existing)
  technical/          ← deep technical docs (existing)
  pitch/              ← pitch deck (existing)
  internal/           ← new: project management, migration history
  USAGE.md            ← moved from root in Phase 1
```

**Commit:**
```
docs: organize documentation with internal section
```

---

### Phase 5 — Per-directory short READMEs

Low cost, high quality signal. One-liner per major directory:

- `src/web/README.md` — web ui for vault, sessions, delegated access
- `src/backend/README.md` — control plane api for secrets, session minting, policy
- `src/proxy/README.md` — hot-path rust proxy for upstream calls with scoped tokens
- `proxy-rs/README.md` — helius-specific rust proxy crate
- `packages/shared/README.md` — shared types, constants, utilities
- `python-sdk/README.md` — python sdk (existing, keep as-is)
- `landing/README.md` — marketing site
- `docs/README.md` — documentation index

**Commit:**
```
docs: add short readmes for core directories
```

---

### Phase 6 — README rewrite

New README: 4 screens, then stop.

**Screen 1** — 10-second product understanding
```
# KeyShield
Zero-trust API credential gateway — agents call upstream services
with scoped session tokens, never raw provider keys.
[diagram]
```

**Screen 2** — 30-second quickstart
```bash
# 5 steps: start backend → start web → store key → mint token → call proxy
```

**Screen 3** — Core model (3 lines)
```
human stores raw secrets in vault
agent receives scoped session token (short-lived, provider-specific)
proxy fans out to upstream, raw key decrypted in-memory for one hop only
```

**Screen 4** — Repo map + links

All long-form content (production URLs, architecture details, deployment, extension usage, Helius fast path) moves to `docs/` links.

**Commit:**
```
docs: rewrite root readme around core security model and quickstart
```

---

## Git execution order

```
branch: cleanup/repo-clarity

commit 1  chore: move project status and migration docs out of root into docs/internal
commit 2  chore: archive legacy v2 tests and demo artifacts
commit 3  docs: add short readmes for core directories
commit 4  docs: rewrite root readme around core security model and quickstart
commit 5  docs: organize documentation with internal section

--- separate PR ---
commit 6  refactor: rename proxy-rs to proxy
commit 7  refactor: rename python-sdk to sdk-python
commit 8  refactor: move landing into marketing-landing
commit 9  chore: update build paths and ci references after directory rename
```

Phases 1–5: one PR (pure moves, zero logic changes).
Phases 6–9: separate PR (involves build paths, needs CI validation).

---

## Post-commit regression checklist (8 items)

```
[ ] Root directory is cleaner
[ ] npm run dev:web still starts
[ ] npm run dev:api still starts
[ ] .env.example is at root
[ ] packages/shared paths are intact
[ ] src/backend python import paths are not broken
[ ] README paths and commands are still accurate
[ ] package.json workspaces config is still valid
```

---

## Do NOT touch

This pass is structural editing only. Leave these alone:

- Auth logic, session token behavior
- Proxy routing and provider adapters
- Database schema and migration files
- SDK API surface
- Deployment config (railway.json, vercel.json)
- Cargo workspace members (unless Phase 3 rename)
- `.github/workflows/` content (unless Phase 3 rename breaks paths)

---

## Decision rule

> Would a first-time contributor genuinely need to see this at the top level?

If the answer is not a firm "yes" — move it.
