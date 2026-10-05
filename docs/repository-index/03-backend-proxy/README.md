# 03 — Backend, APIs, and proxy

[← repository index](../README.md)

Category purpose: Backend, APIs, and proxy.
Indexed files: **110**.

## Key entrypoints

- [`proxy-helius/README.md`](../../../proxy-helius/README.md) — Control-plane API or hot-path proxy.
- [`src/backend/README.md`](../../../src/backend/README.md) — Control-plane API or hot-path proxy.
- [`src/backend/__init__.py`](../../../src/backend/__init__.py) — Control-plane API or hot-path proxy.
- [`src/backend/app.py`](../../../src/backend/app.py) — Control-plane API or hot-path proxy.
- [`src/backend/config.py`](../../../src/backend/config.py) — Control-plane API or hot-path proxy.
- [`src/backend/db_paths.py`](../../../src/backend/db_paths.py) — Control-plane API or hot-path proxy.
- [`src/backend/errors.py`](../../../src/backend/errors.py) — Control-plane API or hot-path proxy.
- [`src/backend/requirements.txt`](../../../src/backend/requirements.txt) — Control-plane API or hot-path proxy.

## Related modules

05, 06, 07, 04

## Existing documentation and tests

- Docs: [docs/API.md](../../API.md)
- Tests: [src/backend/tests/](../../../src/backend/tests/) (09)

## Uncertainties

`src/proxy` is a separate Cargo workspace from the on-chain crate.

Full inventory with type/notes: [FILE_INDEX.md](FILE_INDEX.md).

## File / directory index

| ID | original relative path | purpose | related categories | evidence | verification status |
|---|---|---|---|---|---|
| `KS-03-001` | [`proxy-helius/README.md`](../../../proxy-helius/README.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-002` | [`proxy-helius/crates/ks-helius/Cargo.toml`](../../../proxy-helius/crates/ks-helius/Cargo.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-003` | [`proxy-helius/crates/ks-helius/src/cache/disk.rs`](../../../proxy-helius/crates/ks-helius/src/cache/disk.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-004` | [`proxy-helius/crates/ks-helius/src/cache/key.rs`](../../../proxy-helius/crates/ks-helius/src/cache/key.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-005` | [`proxy-helius/crates/ks-helius/src/cache/mod.rs`](../../../proxy-helius/crates/ks-helius/src/cache/mod.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-006` | [`proxy-helius/crates/ks-helius/src/error.rs`](../../../proxy-helius/crates/ks-helius/src/error.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-007` | [`proxy-helius/crates/ks-helius/src/lib.rs`](../../../proxy-helius/crates/ks-helius/src/lib.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-008` | [`proxy-helius/crates/ks-helius/src/scout.rs`](../../../proxy-helius/crates/ks-helius/src/scout.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-009` | [`proxy-helius/crates/ks-helius/src/types.rs`](../../../proxy-helius/crates/ks-helius/src/types.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-010` | [`src/backend/README.md`](../../../src/backend/README.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-011` | [`src/backend/__init__.py`](../../../src/backend/__init__.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-012` | [`src/backend/agents/__init__.py`](../../../src/backend/agents/__init__.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-013` | [`src/backend/agents/agent_wallet.py`](../../../src/backend/agents/agent_wallet.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-014` | [`src/backend/agents/agents.py`](../../../src/backend/agents/agents.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-015` | [`src/backend/agents/server_wallet.py`](../../../src/backend/agents/server_wallet.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-016` | [`src/backend/app.py`](../../../src/backend/app.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-017` | [`src/backend/billing/__init__.py`](../../../src/backend/billing/__init__.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-018` | [`src/backend/billing/billing_solana.py`](../../../src/backend/billing/billing_solana.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-019` | [`src/backend/billing/mpp.py`](../../../src/backend/billing/mpp.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-020` | [`src/backend/billing/shares.py`](../../../src/backend/billing/shares.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-021` | [`src/backend/billing/usage.py`](../../../src/backend/billing/usage.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-022` | [`src/backend/config.py`](../../../src/backend/config.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-023` | [`src/backend/db_paths.py`](../../../src/backend/db_paths.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-024` | [`src/backend/errors.py`](../../../src/backend/errors.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-025` | [`src/backend/middleware/__init__.py`](../../../src/backend/middleware/__init__.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-026` | [`src/backend/middleware/auth.py`](../../../src/backend/middleware/auth.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-027` | [`src/backend/proxy/__init__.py`](../../../src/backend/proxy/__init__.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-028` | [`src/backend/proxy/api_router.py`](../../../src/backend/proxy/api_router.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-029` | [`src/backend/proxy/keychain.py`](../../../src/backend/proxy/keychain.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-030` | [`src/backend/proxy/metrics.py`](../../../src/backend/proxy/metrics.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-031` | [`src/backend/proxy/openrouter_interface.py`](../../../src/backend/proxy/openrouter_interface.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-032` | [`src/backend/proxy/velocity.py`](../../../src/backend/proxy/velocity.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-033` | [`src/backend/proxy/x402_interceptor.py`](../../../src/backend/proxy/x402_interceptor.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-034` | [`src/backend/proxy/x402_verify.py`](../../../src/backend/proxy/x402_verify.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-035` | [`src/backend/requirements.txt`](../../../src/backend/requirements.txt) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-036` | [`src/backend/routes/__init__.py`](../../../src/backend/routes/__init__.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-037` | [`src/backend/routes/agents.py`](../../../src/backend/routes/agents.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-038` | [`src/backend/routes/auth.py`](../../../src/backend/routes/auth.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-039` | [`src/backend/routes/billing.py`](../../../src/backend/routes/billing.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-040` | [`src/backend/routes/health.py`](../../../src/backend/routes/health.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-041` | [`src/backend/routes/keychain.py`](../../../src/backend/routes/keychain.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-042` | [`src/backend/routes/mpp.py`](../../../src/backend/routes/mpp.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-043` | [`src/backend/routes/proxy.py`](../../../src/backend/routes/proxy.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-044` | [`src/backend/routes/sharing.py`](../../../src/backend/routes/sharing.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-045` | [`src/backend/routes/x402.py`](../../../src/backend/routes/x402.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-046` | [`src/backend/ruff.toml`](../../../src/backend/ruff.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-047` | [`src/backend/sharing/__init__.py`](../../../src/backend/sharing/__init__.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-048` | [`src/backend/sharing/sharing.py`](../../../src/backend/sharing/sharing.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-049` | [`src/backend/skills/helius_laserstream.py`](../../../src/backend/skills/helius_laserstream.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-050` | [`src/backend/skills/helius_skill.py`](../../../src/backend/skills/helius_skill.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-051` | [`src/backend/skills/helius_ws.py`](../../../src/backend/skills/helius_ws.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-052` | [`src/backend/trading/__init__.py`](../../../src/backend/trading/__init__.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-053` | [`src/backend/trading/analysis.py`](../../../src/backend/trading/analysis.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-054` | [`src/backend/trading/execution.py`](../../../src/backend/trading/execution.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-055` | [`src/backend/trading/market_data.py`](../../../src/backend/trading/market_data.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-056` | [`src/backend/trading/models.py`](../../../src/backend/trading/models.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-057` | [`src/backend/trading/orchestrator.py`](../../../src/backend/trading/orchestrator.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-058` | [`src/backend/trading/risk.py`](../../../src/backend/trading/risk.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-059` | [`src/proxy/Cargo.lock`](../../../src/proxy/Cargo.lock) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-060` | [`src/proxy/Cargo.toml`](../../../src/proxy/Cargo.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-061` | [`src/proxy/README.md`](../../../src/proxy/README.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-062` | [`src/proxy/crates/ks-cache/Cargo.toml`](../../../src/proxy/crates/ks-cache/Cargo.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-063` | [`src/proxy/crates/ks-cache/src/lib.rs`](../../../src/proxy/crates/ks-cache/src/lib.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-064` | [`src/proxy/crates/ks-helius/Cargo.toml`](../../../src/proxy/crates/ks-helius/Cargo.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-065` | [`src/proxy/crates/ks-helius/src/lib.rs`](../../../src/proxy/crates/ks-helius/src/lib.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-066` | [`src/proxy/crates/ks-proxy/Cargo.toml`](../../../src/proxy/crates/ks-proxy/Cargo.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-067` | [`src/proxy/crates/ks-proxy/src/acme.rs`](../../../src/proxy/crates/ks-proxy/src/acme.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-068` | [`src/proxy/crates/ks-proxy/src/bridge.rs`](../../../src/proxy/crates/ks-proxy/src/bridge.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-069` | [`src/proxy/crates/ks-proxy/src/handlers.rs`](../../../src/proxy/crates/ks-proxy/src/handlers.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-070` | [`src/proxy/crates/ks-proxy/src/lib.rs`](../../../src/proxy/crates/ks-proxy/src/lib.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-071` | [`src/proxy/crates/ks-proxy/src/main.rs`](../../../src/proxy/crates/ks-proxy/src/main.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-072` | [`src/proxy/crates/ks-proxy/src/metrics.rs`](../../../src/proxy/crates/ks-proxy/src/metrics.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-073` | [`src/proxy/crates/ks-proxy/src/stealth.rs`](../../../src/proxy/crates/ks-proxy/src/stealth.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-074` | [`src/proxy/crates/ks-proxy/src/tls.rs`](../../../src/proxy/crates/ks-proxy/src/tls.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-075` | [`src/proxy/crates/ks-proxy/src/usage.rs`](../../../src/proxy/crates/ks-proxy/src/usage.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-076` | [`src/proxy/crates/ks-session/Cargo.toml`](../../../src/proxy/crates/ks-session/Cargo.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-077` | [`src/proxy/crates/ks-session/src/lib.rs`](../../../src/proxy/crates/ks-session/src/lib.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-078` | [`src/proxy/crates/ks-upstream/Cargo.toml`](../../../src/proxy/crates/ks-upstream/Cargo.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-079` | [`src/proxy/crates/ks-upstream/src/lib.rs`](../../../src/proxy/crates/ks-upstream/src/lib.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-080` | [`src/proxy/crates/ks-vault/Cargo.toml`](../../../src/proxy/crates/ks-vault/Cargo.toml) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-081` | [`src/proxy/crates/ks-vault/src/lib.rs`](../../../src/proxy/crates/ks-vault/src/lib.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-082` | [`src/proxy/crates/ks-vault/src/sqlite.rs`](../../../src/proxy/crates/ks-vault/src/sqlite.rs) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-083` | [`src/proxy/scripts/dump_python_json_fixtures.py`](../../../src/proxy/scripts/dump_python_json_fixtures.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-084` | [`src/proxy/scripts/dump_usage_fixtures.py`](../../../src/proxy/scripts/dump_usage_fixtures.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-085` | [`src/proxy/scripts/run_oracle_diff.sh`](../../../src/proxy/scripts/run_oracle_diff.sh) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-086` | [`src/proxy/scripts/seed_proxy_fixtures.py`](../../../src/proxy/scripts/seed_proxy_fixtures.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-087` | [`src/proxy/scripts/seed_session_fixtures.py`](../../../src/proxy/scripts/seed_session_fixtures.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-088` | [`src/proxy/scripts/seed_vault_fixtures.py`](../../../src/proxy/scripts/seed_vault_fixtures.py) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-089` | [`src/proxy/specs/00-overview.md`](../../../src/proxy/specs/00-overview.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-090` | [`src/proxy/specs/01-vault-format.md`](../../../src/proxy/specs/01-vault-format.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-091` | [`src/proxy/specs/02-session-format.md`](../../../src/proxy/specs/02-session-format.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-092` | [`src/proxy/specs/03-cache-policy.md`](../../../src/proxy/specs/03-cache-policy.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-093` | [`src/proxy/specs/04-upstream-auth.md`](../../../src/proxy/specs/04-upstream-auth.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-094` | [`src/proxy/specs/05-helius-routing.md`](../../../src/proxy/specs/05-helius-routing.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-095` | [`src/proxy/specs/06-batch.md`](../../../src/proxy/specs/06-batch.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-096` | [`src/proxy/specs/07-bridge.md`](../../../src/proxy/specs/07-bridge.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-097` | [`src/proxy/specs/08-python-compat.md`](../../../src/proxy/specs/08-python-compat.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-098` | [`src/proxy/specs/09-helius-client.md`](../../../src/proxy/specs/09-helius-client.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-099` | [`src/proxy/specs/09-method-list.md`](../../../src/proxy/specs/09-method-list.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-100` | [`src/proxy/specs/10-embedded-wallet.md`](../../../src/proxy/specs/10-embedded-wallet.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-101` | [`src/proxy/specs/11-user-interactions.md`](../../../src/proxy/specs/11-user-interactions.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-102` | [`src/proxy/specs/12-tls-stealth.md`](../../../src/proxy/specs/12-tls-stealth.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-103` | [`src/proxy/specs/13-agent-access.md`](../../../src/proxy/specs/13-agent-access.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-104` | [`src/proxy/specs/14-dashboard-onchain-signer.md`](../../../src/proxy/specs/14-dashboard-onchain-signer.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-105` | [`src/proxy/specs/15-mpp-stream-lifecycle.md`](../../../src/proxy/specs/15-mpp-stream-lifecycle.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-106` | [`src/proxy/specs/16-path-a-device-vault.md`](../../../src/proxy/specs/16-path-a-device-vault.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-107` | [`src/proxy/specs/17-agent-permissions.md`](../../../src/proxy/specs/17-agent-permissions.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-108` | [`src/proxy/specs/18-audit-log-retention.md`](../../../src/proxy/specs/18-audit-log-retention.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-109` | [`src/proxy/specs/ADR-008-ci-devnet-pipeline.md`](../../../src/proxy/specs/ADR-008-ci-devnet-pipeline.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-03-110` | [`src/proxy/specs/SPEC-WRITING-GUIDE.md`](../../../src/proxy/specs/SPEC-WRITING-GUIDE.md) | Control-plane API or hot-path proxy. | 06, 07 | path + filename (static) | statically inspected; runtime status not verified |
