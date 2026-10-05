# 10 — Deployment, operations, and scripts

[← repository index](../README.md)

Category purpose: Deployment, operations, and scripts.
Indexed files: **63**.

## Key entrypoints

- [`.github/workflows/README.md`](../../../.github/workflows/README.md) — CI, deploy, or operator config.
- [`.github/workflows/devnet-deploy.yml`](../../../.github/workflows/devnet-deploy.yml) — CI, deploy, or operator config.
- [`.github/workflows/node-tests.yml`](../../../.github/workflows/node-tests.yml) — CI, deploy, or operator config.
- [`.github/workflows/python.yml`](../../../.github/workflows/python.yml) — CI, deploy, or operator config.
- [`.github/workflows/test.yml`](../../../.github/workflows/test.yml) — CI, deploy, or operator config.
- [`.github/workflows/uat.yml`](../../../.github/workflows/uat.yml) — CI, deploy, or operator config.
- [`.vercelignore`](../../../.vercelignore) — CI, deploy, or operator config.
- [`DEPLOY.md`](../../../DEPLOY.md) — CI, deploy, or operator config.

## Related modules

00, 03, 02

## Existing documentation and tests

- Docs: [DEPLOY.md](../../../DEPLOY.md), [docs/OPERATOR.md](../../OPERATOR.md)
- Tests: CI workflows in `.github/workflows/`.

## Uncertainties

Vercel landing/web rate-limit and Railway trial/startCommand are operational issues, not index work.

Full inventory with type/notes: [FILE_INDEX.md](FILE_INDEX.md).

## File / directory index

| ID | original relative path | purpose | related categories | evidence | verification status |
|---|---|---|---|---|---|
| `KS-10-001` | [`.github/workflows/README.md`](../../../.github/workflows/README.md) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-002` | [`.github/workflows/devnet-deploy.yml`](../../../.github/workflows/devnet-deploy.yml) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-003` | [`.github/workflows/node-tests.yml`](../../../.github/workflows/node-tests.yml) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-004` | [`.github/workflows/python.yml`](../../../.github/workflows/python.yml) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-005` | [`.github/workflows/test.yml`](../../../.github/workflows/test.yml) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-006` | [`.github/workflows/uat.yml`](../../../.github/workflows/uat.yml) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-007` | [`.vercelignore`](../../../.vercelignore) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-008` | [`DEPLOY.md`](../../../DEPLOY.md) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-009` | [`Dockerfile.python`](../../../Dockerfile.python) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-010` | [`Makefile`](../../../Makefile) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-011` | [`docs/OPERATOR-RUNBOOK.md`](../../OPERATOR-RUNBOOK.md) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-012` | [`docs/OPERATOR.md`](../../OPERATOR.md) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-013` | [`railway.json`](../../../railway.json) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-014` | [`scripts/evidence_onchain_verify.mjs`](../../../scripts/evidence_onchain_verify.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-015` | [`scripts/evidence_stress_local.mjs`](../../../scripts/evidence_stress_local.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-016` | [`scripts/fixtures/devnet-wallets.json`](../../../scripts/fixtures/devnet-wallets.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-017` | [`scripts/set_railway_env.sh`](../../../scripts/set_railway_env.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-018` | [`scripts/zk_vault_ix.ts`](../../../scripts/zk_vault_ix.ts) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-019` | [`sites/landing/vercel.json`](../../../sites/landing/vercel.json) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-020` | [`src/infra/metrics-ui/vercel.json`](../../../src/infra/metrics-ui/vercel.json) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-021` | [`src/scripts/.keyshield-demo/demo-summary.json`](../../../src/scripts/.keyshield-demo/demo-summary.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-022` | [`src/scripts/.keyshield-demo/deployment-status.json`](../../../src/scripts/.keyshield-demo/deployment-status.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-023` | [`src/scripts/.keyshield-demo/devnet-deployment-summary.json`](../../../src/scripts/.keyshield-demo/devnet-deployment-summary.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-024` | [`src/scripts/.keyshield-demo/stored-localhost-1775478889586.json`](../../../src/scripts/.keyshield-demo/stored-localhost-1775478889586.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-025` | [`src/scripts/.keyshield-demo/vault-467af138e4a858fe68368e123ff56733.json`](../../../src/scripts/.keyshield-demo/vault-467af138e4a858fe68368e123ff56733.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-026` | [`src/scripts/agent-demo.py`](../../../src/scripts/agent-demo.py) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-027` | [`src/scripts/bootstrap-fresh-agent.mjs`](../../../src/scripts/bootstrap-fresh-agent.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-028` | [`src/scripts/build-firefox.sh`](../../../src/scripts/build-firefox.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-029` | [`src/scripts/build-safari.sh`](../../../src/scripts/build-safari.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-030` | [`src/scripts/deploy-and-demo.sh`](../../../src/scripts/deploy-and-demo.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-031` | [`src/scripts/deploy-and-test.sh`](../../../src/scripts/deploy-and-test.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-032` | [`src/scripts/deploy-devnet-now.mjs`](../../../src/scripts/deploy-devnet-now.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-033` | [`src/scripts/deploy-localhost.sh`](../../../src/scripts/deploy-localhost.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-034` | [`src/scripts/deploy-simple.sh`](../../../src/scripts/deploy-simple.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-035` | [`src/scripts/deploy.sh`](../../../src/scripts/deploy.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-036` | [`src/scripts/deployment-simulator.mjs`](../../../src/scripts/deployment-simulator.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-037` | [`src/scripts/dev.sh`](../../../src/scripts/dev.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-038` | [`src/scripts/devnet-deployment-guide.mjs`](../../../src/scripts/devnet-deployment-guide.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-039` | [`src/scripts/devnet-e2e.sh`](../../../src/scripts/devnet-e2e.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-040` | [`src/scripts/devnet-setup.sh`](../../../src/scripts/devnet-setup.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-041` | [`src/scripts/full-project-test-report.json`](../../../src/scripts/full-project-test-report.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-042` | [`src/scripts/integration-surfpool.mjs`](../../../src/scripts/integration-surfpool.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-043` | [`src/scripts/integration-surfpool.sh`](../../../src/scripts/integration-surfpool.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-044` | [`src/scripts/mpp-e2e-devnet.mjs`](../../../src/scripts/mpp-e2e-devnet.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-045` | [`src/scripts/mpp-settle-test.py`](../../../src/scripts/mpp-settle-test.py) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-046` | [`src/scripts/pay.sh`](../../../src/scripts/pay.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-047` | [`src/scripts/query-devnet-vault.mjs`](../../../src/scripts/query-devnet-vault.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-048` | [`src/scripts/setup-localnet.mjs`](../../../src/scripts/setup-localnet.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-049` | [`src/scripts/start-localnet.sh`](../../../src/scripts/start-localnet.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-050` | [`src/scripts/store-vault-localhost.mjs`](../../../src/scripts/store-vault-localhost.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-051` | [`src/scripts/test-all-projects.mjs`](../../../src/scripts/test-all-projects.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-052` | [`src/scripts/test-local-wallet.mjs`](../../../src/scripts/test-local-wallet.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-053` | [`src/scripts/test-store-key.mjs`](../../../src/scripts/test-store-key.mjs) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-054` | [`src/scripts/verify-vault.sh`](../../../src/scripts/verify-vault.sh) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-055` | [`src/web/vercel.json`](../../../src/web/vercel.json) | CI, deploy, or operator config. | 00 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-056` | [`tooling/eslint-config/eslint.config.js`](../../../tooling/eslint-config/eslint.config.js) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-057` | [`tooling/eslint-config/package.json`](../../../tooling/eslint-config/package.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-058` | [`tooling/prettier-config/package.json`](../../../tooling/prettier-config/package.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-059` | [`tooling/prettier-config/prettier.config.js`](../../../tooling/prettier-config/prettier.config.js) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-060` | [`tooling/typescript-config/base.json`](../../../tooling/typescript-config/base.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-061` | [`tooling/typescript-config/library.json`](../../../tooling/typescript-config/library.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-062` | [`tooling/typescript-config/package.json`](../../../tooling/typescript-config/package.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-10-063` | [`tooling/typescript-config/react.json`](../../../tooling/typescript-config/react.json) | Operator or maintenance script. | 11 | path + filename (static) | statically inspected; runtime status not verified |
