# Acceptance audit — 2026-11-22

Scope: all 109 merged PRs returned by GitHub, current README/deployment claims, root ACCEPTANCE.md, AGENTS.md, CLAUDE.md, SPEC.md and applicable repository checks. `git pull` returned `Already up to date.` Open PRs #170 and #172 were not changed. No PR, deployment, production account, provider call or transaction was created.

## Audit table

| Item | Failing rule / source | Resolution |
|---|---|---|
| 108 of 109 merged PR bodies fail the evidence-closer checker; only #171 passes | ACCEPTANCE.md §8, `verification.mdc`: required eight-field closer | Not fixable after merge; recorded every body/check result in the external batch ledger. No historical PR was edited. |
| README has no scoped product status/next action; calls the hosted page a live vault and presents old API observations as current | ACCEPTANCE.md §5, `ship-visible-mvp.mdc` and production-proof rule; §2, `verification.mdc` | Added BLOCKED for full product acceptance, owner J1 verification action, scoped sign-in-page observation and explicitly historical billing/status text. Existing SPEC.md §12 already records no accepted surface. |
| DEPLOY.md predicts authentication/enrollment success from an RP_ID setting | ACCEPTANCE.md §2 and §8, `verification.mdc`: predictions are not verification; forbidden success wording | Replaced the prediction with an explicit deployment/device check and the actual limited public-page observation. |
| Marketing PRs #113/#115 contain no screenshot or interaction embeds; #109 explicitly says no browser verification/screenshots | ACCEPTANCE.md §4, `ui-step-screenshot.mdc`: 390×844 still plus interaction proof | Captured current public marketing menu→FAQ and sign-in empty-form validation, plus actual unpacked extension guest→hosted-sign-in navigation. Historical authenticated Agents/Vault and native flows remain unverified, not repaired by public-page proof. |
| Native delivery/full J1 is not accepted; the reported downloaded Mac app failure remains open | ACCEPTANCE.md §3 and §6; SPEC.md §12 and A3, `debug-repro-loop.mdc` | Preserved the open bug and BLOCKED status; did not invent native or authenticated proof on Linux. |

Observed, no rule covers it: dependency installation reports 112 vulnerabilities (14 low, 62 moderate, 32 high, 4 critical). No package upgrades or lockfile repair were included. The 65 PRs with UI-related file paths are review candidates, not 65 independently proven missing-evidence failures.

## Merged PR batch ledger

External directory: `/home/ubuntu/audit-artifacts/keyshield/`.

- `merged-prs.json`: complete 109-PR enumeration, including PRs merged into stacked branches rather than main.
- `audit_prs.py`, `pr-audit.json`: batch checker and per-PR closer/ancestry/UI-path results. Each `pr-N.json`, `pr-N.md`, `pr-N-files.txt`, `pr-N-acceptance.log` preserves its API body, file list and checker output.
- Checker passes: #171 only. Checker fails: #2, #3, #4, #6, #9, #10, #11, #13, #17, #18, #21, #24, #25, #26, #28, #29, #30, #31, #32, #33, #34, #35, #37, #48, #49, #51, #52, #59, #60, #61, #62, #63, #64, #65, #66, #67, #68, #69, #70, #71, #72, #73, #74, #75, #76, #77, #78, #79, #80, #81, #82, #83, #84, #85, #87, #88, #89, #90, #91, #92, #93, #95, #96, #98, #99, #100, #101, #102, #103, #104, #108, #109, #110, #111, #112, #113, #114, #115, #116, #117, #118, #119, #120, #121, #122, #123, #124, #125, #127, #128, #129, #130, #131, #132, #133, #134, #135, #136, #137, #138, #139, #140, #141, #144, #162, #167, #168, #169.
- 98 merge SHAs are ancestors of `origin/main`. Eleven are not: #17/#18 (base `main`), #75/#80 (base `cursor/mpp-fulfillment-proof-b48a`), #76 (`cursor/scvd-session-desync-b48a`), #77 (`cursor/devnet-live-buy-b48a`), #78 (`cursor/demo-pay-ui-b48a`), #79 (`cursor/review-talk-b48a`), #84 (`cursor/ci-trunk-intro-b48a`), #162 (`devin/1795144024-extension-tutorial-e2e`), #168 (`devin/1795139042-vault-stale-tab-cas`). Objects for #17/#18 were fetched explicitly before the final ancestry result; these are exit 1, not missing-object errors. Non-ancestry alone is not labeled an acceptance violation or proof that equivalent changes are absent.
- Historical bodies such as #52/#92/#103 do contain screenshot/video links. Their existence was not treated as proof of current production behavior or verified 390×844 coverage. No historical artifact links were authenticated/downloaded as an exhaustive historical media review.

## Product observation and visual evidence

Both `https://app.ks.aileena.xyz/` and `https://ks.aileena.xyz/` returned HTTP 200 and rendered in Chromium at 390×844. Pages API returned 404; deployments API was nonempty. These do not prove the authenticated vault or native builds are accepted. The additional `api.ks.aileena.xyz/health` probe failed DNS; this does not establish failure of the actual Railway API used by the application.

Seven 390×844 PNGs and three animated WebPs are outside git:

| Surface | PNGs | Animated WebP | Exercised scope |
|---|---|---|---|
| Public app | `app-initial-390x844.png`, `app-signin-390x844.png` | `app-interaction.webp` | Submit empty sign-in form; required-email error appears. No credential entry or authentication. |
| Public marketing | `marketing-initial-390x844.png`, `marketing-menu-390x844.png`, `marketing-faq-390x844.png` | `marketing-interaction.webp` | Open mobile menu, select FAQ, observe FAQ section. The hero's embedded product simulation is not an actual vault journey. |
| Actual unpacked Chrome extension | `extension-guest-390x844.png`, `extension-signin-target-390x844.png` | `extension-interaction.webp` | Guest popup Sign in opens `https://app.ks.aileena.xyz/?ext=1&demo=shop`. Native toolbar, autofill and save were not verified. |

The app and marketing WebPs contain 29 and 23 frames. The extension WebP is a two-state animated before/after walkthrough from the actual screenshots: the popup closed during navigation, so its continuous-video save failed. It is not presented as a continuous recording. All three captured pages reported zero page errors. Screenshots were inspected; no replacement UI was built.

## Checks and limitations

Existing dependency installation only: external Python venv; `npm install --ignore-scripts --package-lock=false`. The repo requires Node 22, so the initially active Node 24 was replaced with the installed Node 22 for checks. No manifests/locks were changed. Generated tracked Vite output and tsbuildinfo were restored to their pre-audit bytes after checking.

| Command | Actual result |
|---|---|
| `npm ci --ignore-scripts` | Fails EUSAGE: package/lock mismatch, including missing `@vitejs/plugin-react@5.2.0` and `lucide-react@0.562.0`. |
| `npm test` | Pass: workspace suites report 22 + 68 + 6 + 73 = 169 tests. Cloudflare test runtime falls back from its configured compatibility date; no worker production claim. |
| `npm run typecheck` | Pass for workspaces, exit 0. |
| `npm run build:web` | Pass, Vite built in 14.52s. |
| `(cd src/web && npx tsc --noEmit)` | Pass, exit 0. An earlier root-invoked `tsc -p src/web/tsconfig.json` selected a different compiler and failed WebCrypto BufferSource types; the documented workspace invocation is the authoritative check. |
| `python -m pytest -q src/backend/tests/` with external venv and synthetic local configuration | 208 passed, 21 skipped, one Starlette/httpx deprecation warning. |
| `ruff check src/backend`; `ruff format --check src/backend` | `All checks passed!`; `99 files already formatted`. |
| `npx vitest run tests/desktop_mac_app.test.ts tests/human_usable_ux.test.ts tests/no_cjk.test.ts` | 3 files, 24 tests passed. These are source/helper tests, not native Mac acceptance. |
| `npm run test:bankrun`; `npm run test:fault`; `npm run live:e2e:dry` | 4 passed; 4 passed; `DRY-RUN PASS`. Initial combined harness lost Cargo from PATH; the corrected environment ran each stage successfully. No paid provider call or settlement. |
| `npm run test:e2e` | Fails before browser tests: configured `frontend/package.json` does not exist. |
| `cargo test --workspace --manifest-path src/proxy/Cargo.toml` | Reaches proxy integration tests: 2 pass, 12 fail because the fixture loader references absent `v2-mvp/src/vault.py`; earlier crate suites pass. |
| `cargo test -p keyshield` | Fails 3 access-key tests: `[MOLLUSK]: Program file not found: keyshield.so`. No SBF artifact was supplied/built. |
| `bash src/proxy/scripts/run_oracle_diff.sh` | Fails: manifest `src/proxy-rs/Cargo.toml` does not exist. |

Exact output is in the named logs under the external artifact directory. `baseline-inputs.log` establishes that the failing source/config/manifest inputs are identical to `origin/main`; this documentation-only branch does not fix them. Full root Vitest, every SDK/native suite, signed Mac/iOS installation, real passkey/Touch ID, authenticated save/reopen/agent-call, and production deployment-SHA provenance were not verified. Existing SPEC.md current-state results were not relabeled as this audit's results.

## GitNexus

The checkout's preexisting `.gitnexus` index is foreign (`/workspace`). Rebuilt a separate index with `GITNEXUS_STORAGE_PATH=/home/ubuntu/audit-artifacts/keyshield/gitnexus-index`: 14,654 nodes, 36,574 edges, 956 flows. Exact pre-edit file-UID impacts: README.md MEDIUM (37 impacted, six direct documentation links), DEPLOY.md MEDIUM (38 impacted); zero affected processes/modules for these file nodes is not a runtime-safety claim. Name-only queries were ambiguous/UNKNOWN and were not used as an all-clear.

FTS repair was attempted once and failed with HTTP 404 for the LadybugDB FTS extension. Keyword search remains degraded; graph traversal works. No runtime symbol was edited. The pre-commit `detect-changes --scope all` result is retained externally; it must not be treated as a clean graph check if partial/truncated.

## Blockers

| blocked_on | evidence | impact | human_action | not_doing |
|---|---|---|---|---|
| Full J1/native acceptance | SPEC.md §12 open downloaded-Mac-app report; only public guest interactions exercised | Product remains BLOCKED; historical authenticated/native UI gaps remain open | Verify the intended delivered build's J1 with synthetic keys and a mocked provider, including reopen/revocation; capture native proof on the intended device | No redesign, production write, real key, paid call, or change to #170/#172 |
| Reproducible full check setup | npm-ci.log, e2e.log, cargo-proxy.log, cargo-program.log, oracle-diff.log | Lock-synchronized install, default E2E and complete Rust acceptance unavailable | Separately reconcile dependency lock and legacy harness paths, supply the documented SBF toolchain/artifact | No dependency/config/runtime repair in this audit |
| GitNexus keyword search | gitnexus-repair-fts.log: extension download HTTP 404 | Concept query returned no results with a degraded-search warning | Use a compatible GitNexus/FTS distribution before relying on keyword search | No claim that unavailable FTS passed; no deletion of the foreign index |

```txt
root cause: historical merged PR bodies lack the mandatory closer; README and DEPLOY.md overstate current verification; public UI proof does not establish accepted vault/native delivery.
files changed: README.md; DEPLOY.md; notes/acceptance-audit-2026-11-22.md. No runtime code changed.
checks run: all 109 merged-body checkers and merge ancestry; production URL/API probes; workspace tests/typechecks; web build/typecheck; backend pytest/ruff; 24 root helper tests; bankrun/fault/dry-run stages; default E2E and Rust checks with failures recorded; GitNexus exact impacts and pre-commit change detection.
manual QA: inspected 390x844 screenshots and exercised public empty-form validation, mobile marketing menu-to-FAQ navigation and actual unpacked extension guest sign-in navigation; captured PNGs and animated WebPs outside git.
verification: only merged PR 171 passes the closer; 98 merge SHAs are ancestors of origin/main, 11 are not; public app/marketing render, but no authenticated or native acceptance is claimed. Product status BLOCKED.
remaining risks: historical closers cannot be repaired after merge; authenticated/native flows and production provenance remain unverified; lock drift, legacy test paths, absent SBF artifact and unavailable GitNexus FTS remain documented.
manual steps: review this documentation-only branch and external artifacts; verify J1 on the intended delivered build with synthetic credentials and a mocked provider before claiming product acceptance.
safe to merge: yes
```
