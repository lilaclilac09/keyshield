# ADR-008 — CI Devnet pipeline: workflow_dispatch + tag-trigger

> **Status: accepted.** 2026-05-10.
> Decision driver: this session's CI cleanup arc.
> Supersedes: nothing. First time we're encoding the devnet path.

---

## Context

KeyShield ships an on-chain Solana program (`src/programs/keyshield/`)
that gates the agent + MPP + x402 flows. Building the program needs
the Solana CLI's `cargo build-sbf` toolchain (~3min cold install on
ubuntu-latest). Deploying to devnet needs:

- A funded keypair (~2 SOL for the program rent + tx fees).
- A stable program ID (so frontend / backend can hardcode it).
- A way to trigger deploys without manually clicking through the
  GitHub Actions UI every time.

Two failure modes from prior runs we wanted to avoid:

1. **Auto-deploy on every push to main.** Devnet airdrops are
   rate-limited per IP per hour, and `cargo build-sbf` is the slowest
   step in the entire CI suite. Auto-deploy would burn the airdrop
   quota and triple CI time on unrelated PRs.
2. **Manual-only via UI.** Required for the agent-driven workflow:
   "I'm reviewing a PR, I want to test it on devnet" needs a path
   that's scriptable without the GitHub web UI (gh CLI, or a git
   tag push).

---

## Decision

`.github/workflows/devnet-deploy.yml` fires on **two trigger paths**:

```yaml
on:
  workflow_dispatch:           # manual UI / `gh workflow run`
    inputs:
      deploy:
        description: "Deploy to devnet"
        type: choice
        options: [ "false", "true" ]
      run_e2e:
        description: "Run devnet-e2e.sh after deploy"
        type: choice
        options: [ "false", "true" ]
  push:
    tags:
      - "devnet-deploy-*"       # `git tag devnet-deploy-N && git push`
```

The `Deploy to devnet` step is gated by:

```yaml
if: ${{ github.event.inputs.deploy == 'true'
     || startsWith(github.ref, 'refs/tags/devnet-deploy-') }}
```

So:
- `gh workflow run devnet-deploy.yml -f deploy=true` → deploys (manual UI path).
- `git tag devnet-deploy-1 && git push origin devnet-deploy-1` → also deploys (scriptable path).
- Push to main, push to a feature branch, push of any non-`devnet-deploy-*` tag → **does not** deploy.

The deploy step itself reads `SOLANA_DEVNET_KEYPAIR` from secrets,
writes it to `~/.config/solana/id.json` in the runner, and runs
`solana program deploy target/deploy/keyshield.so`.

---

## Consequences

### What this enables

- **Reproducible devnet deploy from any environment** that can git
  push. An agent without GitHub Actions UI access (or `gh` auth) can
  trigger a deploy by pushing a tag — same access control as code
  push.
- **Audit trail.** Every devnet deploy corresponds to a tagged commit.
  `git tag --list 'devnet-deploy-*'` is the deploy history.
- **Manual override stays.** Operators who want the UI can still use
  `Run workflow` → set `deploy=true` manually.

### What this costs

- Two trigger paths means two `if:` conditions to keep in sync as the
  workflow grows. Mitigated by extracting the gate into a single
  composite expression at the start of the workflow if it spreads
  past 2-3 steps.
- Tag-based triggers don't carry workflow inputs, so `run_e2e` is
  forced off on the tag path. Operators who want both deploy + e2e
  must use the UI path.

### Adjacent decisions

- **`Integration (Surfpool)` job in `test.yml` is `continue-on-error`
  at the JOB level.** Solana CLI install + `cargo build-sbf` happens
  in two places now (test.yml and devnet-deploy.yml) — the test.yml
  path is informational (does the program still compile in regular
  CI?), the devnet-deploy.yml path is the actual deploy. If `cargo
  install surfpool --locked` flakes on crates.io, the test workflow
  shouldn't go red (the unit tests in the sister `Unit tests
  (Mollusk + proxy-rs)` job remain must-pass).
- **`Cargo.toml` excludes `src/proxy`.** Root workspace owns only
  `src/programs/keyshield`. `src/proxy/Cargo.toml` is its own
  workspace (6 crates). Without this split, `cargo build-sbf` from
  the repo root errors with "multiple workspace roots in the same
  workspace". See commit 5a2d2aba8.

---

## Verification

A successful run produces this Step Summary block in the run page:

```
| Field | Value |
|---|---|
| .so path | target/deploy/keyshield.so |
| Size | 91048 bytes |
| sha256 | 7a89f5dc001ceb53451326fc7fc63a7f489280ac12eaf45fb13918c028a3cff7 |

Devnet deploy:
| Program ID | DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj |
| Explorer | https://explorer.solana.com/address/DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj?cluster=devnet |
```

The 5-second post-deploy verification (no GH access required):

```bash
node src/scripts/demo-devnet.mjs
```

Should print 5 green sections ending with the Explorer URL.
