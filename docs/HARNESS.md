# KeyShield agent harness — where the human goes

How coding agents work on this repo, what stops them breaking it, and where
Aileen's review is required. Applies Birgitta Böckeler's harness engineering
article (martinfowler.com), section **"The role of the human"**, to KeyShield.

## 1. Why

Paraphrasing Böckeler's three paragraphs:

- **Humans carry an implicit harness.** We have absorbed conventions, felt the
  cognitive pain of complexity, and know our name is on the commit. We hold
  organisational alignment: what the team wants, which debt is tolerated for
  business reasons, what "good" looks like here. And we work *"in small steps
  and at our human pace"*, which gives that experience room to kick in.
- **A coding agent has none of this.** No social accountability, no
  "aesthetic disgust at a 300-line function", no instinct that "we don't do it
  that way here", no organisational memory. It cannot tell a load-bearing
  convention from a habit, or a technically correct fix from one the team wants.
- **A harness externalises that experience** as guides, sensors and
  self-correction loops, but only partly, and it is expensive, so prioritise.
  *"A good harness should not necessarily aim to fully eliminate human input,
  but to direct it to where our input is most important."*

Aileen's note: the point is *small steps at human pace*. Slowness is what gives
experience a chance to surface. An agent that writes hundreds of lines in one go
removes that gap, so the gap has to be rebuilt on purpose: small PRs, a
propose-only flow (as in Machina) where each proposed action is a pause for the
human, and nothing merged without her.

## 2. Load-bearing conventions (do not break)

These are KeyShield's "we don't do it that way here". Each is checked against
code at `6a391dd`.

| Convention | Where it lives | Guarded by |
|---|---|---|
| **Login is wallet + passkey in one card. No username/password form in the UI.** | `src/web/components/AuthScreen.tsx` (`data-testid="auth-card"`, `passkey-signin`, `passkey-signup`, `<WalletConnector`) | `tests/password_login.test.ts` (asserts no `type="password"`, no `password-login`) |
| **Extension autofill and API-key auto-detect / vault save must never regress.** Kilo BYOK provider-aware fill, Helius "Saved N" store. | `src/extension/content.js` (`ksIsKiloFillHost`, `ksIsKiloByokPath`), `src/extension/background.js` (Helius hosts + key patterns), `src/web/lib/fill-domain.ts` | `tests/fill_domain.test.ts`, `tests/ext_detect.test.ts`, `tests/ext_detect_count.test.ts`, `tests/ext_autostore.test.ts`, `tests/ext_helius_store.test.ts` + browser video |
| **Passkey routes keep their shape.** `register-options/verify`, `signup-options/verify`, `auth-options/verify`, `list` under `/auth/passkey/`. | `src/backend/routes/auth.py` (L330–488), `src/backend/auth/passkey.py` | `test_passkey_login.py`, `test_passkey_signup.py`, `test_passkey_register_then_login.py`, `test_plans.py` |
| **`KS_DEMO_MODE` never runs in production.** `is_production()` fails closed: any `RAILWAY_ENVIRONMENT_NAME` outside the allow-list (`development, dev, staging, preview, test, local, pr-*`) counts as prod; `KS_ENV=production` opts in. App refuses to boot; `/health` returns 503. | `src/backend/demo.py` (`is_production`, `assert_safe_for_env`), `src/backend/app.py:34`, `src/backend/routes/health.py`, `src/backend/mpp/owner_submit.py` (local-ledger only when demo on and no on-chain config) | `test_security_residuals.py`, `test_passkey_signup.py::test_demo_mode_refused_in_production`, `test_demo_session.py` |
| **Production data lives on a volume: `KS_DATA_DIR=/data` on Railway.** Without it, Railway's ephemeral disk loses registered passkeys on redeploy. | `src/backend/db_paths.py`, `src/backend/auth/passkey.py::_default_db_path` (`KS_DB_PATH` > `KS_DATA_DIR` > legacy `./keyshield.db`) | none automated; operator checklist |
| **Signup rate limit keys on the rightmost `X-Forwarded-For` hop** (the one the edge proxy adds). Leftmost is client-controlled. 10/min, 50/day per IP. | `src/backend/auth/ratelimit.py` (`client_ip`, `signup_limiter`), used at `routes/auth.py:399` | `test_passkey_signup.py::test_signup_options_burst_is_rate_limited`, `::test_signup_limiter_daily_cap_and_spoofed_xff` |
| **Never hit production for tests.** `keyshield-production.up.railway.app`, `app.ks.aileena.xyz`, `aileena.xyz` are off limits unless Aileen says so. Use local (`node dev.cjs`: `:8001` / `:8000` / `:5173`) or preview. | this doc; local stack in `AGENTS.md` (Cursor Cloud section), `DEVELOPMENT.md` | process rule only |
| **No Chinese (Han) characters in any tracked file**, UI or docs. | whole repo | `tests/no_cjk.test.ts` |
| **Never echo secrets.** Not `GITHUB_TOKEN`, not upstream keys, not owner keystores. Upstream keys stay client-encrypted or are used once by the proxy and never persisted. | `AGENTS.md` §1, `src/backend/demo.py` (`demo_status` "never includes keys") | process rule only |

If a change seems to need breaking one of these, stop and ask. Do not "fix" it.

## 3. Guides (feedforward)

What an agent reads or follows *before* it writes code.

- **Workflow: inspect → plan → patch → self-check.** Read the code path first,
  state the plan, write the smallest diff that fixes the root cause, then run
  the sensors in §4.
- **No redesign, no parallel systems.** Extend the existing module; do not add
  a second auth path, a second limiter, a second store. If an issue is owned by
  another agent's open PR, do not open a competing one.
- **Every result reports:** files changed, root cause, runtime path (which
  route / component / script actually runs), and checks run with their output.
  "Verified" needs evidence: test output, a screenshot for UI, a video for a flow.
- **Graph before edit.** `CLAUDE.md` requires GitNexus `impact` before editing a
  symbol and `detect_changes` before committing; `risk: UNKNOWN` is not "safe".
- **Local stack.** `node dev.cjs` (see `DEVELOPMENT.md`, `AGENTS.md` Cursor
  Cloud section). Operator facts: `docs/OPERATOR-RUNBOOK.md`.
- **Conventions table above** is the shortlist of "we don't do it that way here".

## 4. Sensors (feedback)

What tells an agent it got something wrong. CI jobs as defined in
`.github/workflows/` at `6a391dd`:

| Job (workflow) | Runs | Guards | Must pass? |
|---|---|---|---|
| **Lint** (`python.yml`) | `ruff check .` + `ruff format --check .` in `src/backend`, ruff `0.16.10` | Python style, unused imports, format drift | yes |
| **Test (Python 3.10/3.11/3.12)** (`python.yml`) | `pytest tests/` in `src/backend` with coverage | all backend behaviour incl. passkey, plans, demo guard, limiter | yes |
| **Python backend smoke + pytest** (`node-tests.yml`) | app import boots; `pytest src/backend/tests/ -x` | app wiring, route registration | yes |
| **Frontend typecheck + build** (`node-tests.yml`) | `tsc --noEmit`, `npm run build` in `src/web` | TS errors, Vite + extension build | **no** (`continue-on-error: true`) |
| **Workspaces typecheck + test** (`node-tests.yml`) | workspace typecheck; `npm test` | SDK / CLI / sync-worker | typecheck yes; tests **no** |
| **MPP Stages 3–4 harness** (`node-tests.yml`) | `npm run test:fault`, `npm run live:e2e:dry` | proxy fault injection, e2e dry run | yes |
| **sync-worker** (`sync-worker-deploy.yml`) | typecheck + vitest-pool-workers | Cloudflare vault worker | yes (deploy job separate) |
| **Test** (`test.yml`) | Rust unit/invariant tests, Solana program build, surfpool integration | on-chain program, proxy-rs | integration is warn-only |
| **Devnet pipeline / UAT** | manual dispatch / no-op stub | — | n/a |

Local sensors an agent must run itself (not wired into CI today, see §6):

- `TZ=UTC pytest src/backend/tests/` — TZ pinned because vault expiry is read
  as UTC; CI runners are UTC already, laptops in UTC+8 are not.
- `npx vitest run tests/` at the repo root — the frontend/extension suite:
  `password_login.test.ts` (no password form), `fill_domain`, `ext_*`
  (detect, count, autostore, Helius store), `payments_agent_local`,
  `payments_subcent_labels`, `passkey_id`, `no_cjk`.
- `cd src/web && npm run build` — must actually succeed, whatever CI says.
- Key security tests: `test_security_residuals.py` (fail-closed prod
  detection, demo refused in prod, expired challenge purge),
  `test_passkey_signup.py` (credential theft, cross-flow challenge reuse,
  rate limit, spoofed XFF).

## 5. Where human input goes (the gates)

The harness does not try to remove Aileen. It routes her to these points:

1. **Merge is Aileen's call.** Agents open PRs; they do not auto-merge. If any
   hard gate fails, or agents disagree, the most conservative verdict wins.
2. **Browser verification per issue.** Each user-facing fix gets a screenshot
   or video in a real browser against local or preview, one distinct recording
   per issue. A duplicate or unclear video counts as "not verified".
3. **Security review** for anything touching auth, payments / MPP streams,
   owner-only features (server-side auth required, never client-only), rate
   limiting, or the demo/prod guard.
4. **Production config.** Railway env vars, volumes (`KS_DATA_DIR=/data`),
   domains, and secrets are changed by Aileen, not agents.
5. **Keys and wallets.** Vault crypto, extension key detection/storage, owner
   keystore, settler wallets, real-funds paths. Devnet only unless told otherwise.
6. **Small PRs, so review has thinking space.** One issue per PR where
   possible; a PR she cannot read in one sitting is too big. This is the
   "human pace" from §1, rebuilt on purpose.

## 6. Known gaps / sensors to add

Found by QA on `6a391dd` or while writing this doc. Not fixed here.

- **Root vitest suite is not in CI.** `tests/*.test.ts` (incl.
  `password_login.test.ts`, `fill_domain`, `ext_*`) only run locally. Add a
  `npx vitest run tests/` job; it is the main sensor for §2 rows 1–2.
- **Frontend build is non-blocking** (`continue-on-error` on tsc and build).
  A broken extension build can merge green.
- **`TZ=UTC` is not pinned in CI or config.** Pin it in `conftest.py` or the
  workflow so laptop and CI agree.
- **Backend password login still exists.** `POST /auth/login`
  (`routes/auth.py:105`, `test_password_login.py`) stays for SDK/CLI, and its
  docstring says first login for a userId stores the hash. The UI form is gone;
  whether the route should stay is a security-review decision.
- **No sensor for `KS_DATA_DIR` in prod.** Consider a `/health` warning when
  `is_production()` and `KS_DATA_DIR` is unset. `docs/OPERATOR-RUNBOOK.md`
  documents `KS_DB_PATH` defaulting to `/app/data/keyshield.db`, which no longer
  matches `passkey.py`, and does not mention `KS_DATA_DIR`.
- **Rate limiter is in-process** (`ratelimit.py`): a restart clears it and it
  does not share state across replicas. Fine at `numReplicas: 1`
  (`railway.json`); revisit before scaling.
- **Extension popup:** the "Use local dev" control sits in a `hidden` block
  (`popup.html:134`), and the stored dashboard URL stays
  `https://app.ks.aileena.xyz`; Kilo's "0 filled" counter (`popup.html:127`)
  does not update after a fill; a value Chrome restores after F5 does not
  refill on provider switch.
- **Duplicate React key `'helius'`** in
  `src/web/components/sections/DeveloperSection.tsx` around L66 (fallback list
  merged with vault upstreams).
- **QA reused a browser profile and passkey** for the latest regression run; a
  clean-profile run is still owed.

## Chinese summary

A short Chinese summary of this doc is in the description of the PR that added this file, not here:
`tests/no_cjk.test.ts` forbids Han characters in every git-tracked file, and
that rule is itself one of the conventions in §2.
