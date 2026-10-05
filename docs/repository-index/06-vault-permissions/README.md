# 06 — Vault, credentials, and permissions

[← repository index](../README.md)

Category purpose: Vault, credentials, and permissions.
Indexed files: **32**.

## Key entrypoints

- [`.github/workflows/sync-worker-deploy.yml`](../../../.github/workflows/sync-worker-deploy.yml) — Device vault, sync ciphertext, or sharing.
- [`docs/technical/SYNC_VAULT_ARCHITECTURE.md`](../../technical/SYNC_VAULT_ARCHITECTURE.md) — Device vault, sync ciphertext, or sharing.
- [`docs/technical/cryptography.md`](../../technical/cryptography.md) — Device vault, sync ciphertext, or sharing.
- [`src/infra/prometheus.yml`](../../../src/infra/prometheus.yml) — Infra worker (vault sync).

## Related modules

02, 03, 05

## Existing documentation and tests

- Docs: [docs/technical/cryptography.md](../../technical/cryptography.md), [docs/technical/SYNC_VAULT_ARCHITECTURE.md](../../technical/SYNC_VAULT_ARCHITECTURE.md)
- Tests: Vault session helpers covered indirectly by demo-session tests (09).

## Uncertainties

Archived Path A UI in `src/_archive/` if tracked — see 90.

Full inventory with type/notes: [FILE_INDEX.md](FILE_INDEX.md).

## File / directory index

| ID | original relative path | purpose | related categories | evidence | verification status |
|---|---|---|---|---|---|
| `KS-06-001` | [`.github/workflows/sync-worker-deploy.yml`](../../../.github/workflows/sync-worker-deploy.yml) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-002` | [`docs/technical/SYNC_VAULT_ARCHITECTURE.md`](../../technical/SYNC_VAULT_ARCHITECTURE.md) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-003` | [`docs/technical/cryptography.md`](../../technical/cryptography.md) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-004` | [`src/backend/routes/vault.py`](../../../src/backend/routes/vault.py) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-005` | [`src/infra/grafana/provisioning/dashboards/dashboard.yml`](../../../src/infra/grafana/provisioning/dashboards/dashboard.yml) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-006` | [`src/infra/grafana/provisioning/dashboards/keyshield.json`](../../../src/infra/grafana/provisioning/dashboards/keyshield.json) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-007` | [`src/infra/grafana/provisioning/datasources/prometheus.yml`](../../../src/infra/grafana/provisioning/datasources/prometheus.yml) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-008` | [`src/infra/metrics-ui/.env.example`](../../../src/infra/metrics-ui/.env.example) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-009` | [`src/infra/metrics-ui/index.html`](../../../src/infra/metrics-ui/index.html) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-010` | [`src/infra/metrics-ui/package.json`](../../../src/infra/metrics-ui/package.json) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-011` | [`src/infra/metrics-ui/src/App.tsx`](../../../src/infra/metrics-ui/src/App.tsx) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-012` | [`src/infra/metrics-ui/src/main.tsx`](../../../src/infra/metrics-ui/src/main.tsx) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-013` | [`src/infra/metrics-ui/src/parse.ts`](../../../src/infra/metrics-ui/src/parse.ts) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-014` | [`src/infra/metrics-ui/tsconfig.json`](../../../src/infra/metrics-ui/tsconfig.json) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-015` | [`src/infra/metrics-ui/vite.config.ts`](../../../src/infra/metrics-ui/vite.config.ts) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-016` | [`src/infra/prometheus.yml`](../../../src/infra/prometheus.yml) | Infra worker (vault sync). | 10 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-017` | [`src/infra/sync-worker/DEPLOY.md`](../../../src/infra/sync-worker/DEPLOY.md) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-018` | [`src/infra/sync-worker/package.json`](../../../src/infra/sync-worker/package.json) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-019` | [`src/infra/sync-worker/src/auth.ts`](../../../src/infra/sync-worker/src/auth.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-020` | [`src/infra/sync-worker/src/cas.ts`](../../../src/infra/sync-worker/src/cas.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-021` | [`src/infra/sync-worker/src/index.ts`](../../../src/infra/sync-worker/src/index.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-022` | [`src/infra/sync-worker/src/registry.ts`](../../../src/infra/sync-worker/src/registry.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-023` | [`src/infra/sync-worker/src/webauthn.ts`](../../../src/infra/sync-worker/src/webauthn.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-024` | [`src/infra/sync-worker/tsconfig.json`](../../../src/infra/sync-worker/tsconfig.json) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-025` | [`src/infra/sync-worker/vitest.config.ts`](../../../src/infra/sync-worker/vitest.config.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-026` | [`src/infra/sync-worker/wrangler.toml`](../../../src/infra/sync-worker/wrangler.toml) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-027` | [`src/web/components/sections/SharingSection.tsx`](../../../src/web/components/sections/SharingSection.tsx) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-028` | [`src/web/lib/sync-auth.ts`](../../../src/web/lib/sync-auth.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-029` | [`src/web/lib/sync.ts`](../../../src/web/lib/sync.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-030` | [`src/web/lib/vault-key.ts`](../../../src/web/lib/vault-key.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-031` | [`src/web/lib/vault-session.ts`](../../../src/web/lib/vault-session.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-06-032` | [`src/web/lib/vault.ts`](../../../src/web/lib/vault.ts) | Device vault, sync ciphertext, or sharing. | 02, 03, 05 | path + filename (static) | statically inspected; runtime status not verified |
