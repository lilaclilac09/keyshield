# 09 — Tests, security, and verification

[← repository index](../README.md)

Category purpose: Tests, security, and verification.
Indexed files: **77**.

## Key entrypoints

- [`conftest.py`](../../../conftest.py) — Automated test or test harness config.
- [`playwright.config.ts`](../../../playwright.config.ts) — Automated test or test harness config.
- [`tests/adversarial_audit.ts`](../../../tests/adversarial_audit.ts) — Automated test or test harness config.
- [`tests/bankrun_security.test.ts`](../../../tests/bankrun_security.test.ts) — Automated test or test harness config.
- [`tests/e2e/key-capture.spec.ts`](../../../tests/e2e/key-capture.spec.ts) — Automated test or test harness config.
- [`tests/e2e/user-flows.spec.ts`](../../../tests/e2e/user-flows.spec.ts) — Automated test or test harness config.
- [`tests/fuzz_invariants.rs`](../../../tests/fuzz_invariants.rs) — Automated test or test harness config.
- [`tests/integration/test_agent_flow.py`](../../../tests/integration/test_agent_flow.py) — Automated test or test harness config.

## Related modules

03, 07, 12

## Existing documentation and tests

- Docs: [keyshield.md](../../../keyshield.md), [docs/REVIEWER_QUICKSTART.md](../../REVIEWER_QUICKSTART.md)
- Tests: This category is the tests.

## Uncertainties

Stage 4 live (`LIVE_E2E=1`) was not run for this index.

Full inventory with type/notes: [FILE_INDEX.md](FILE_INDEX.md).

## File / directory index

| ID | original relative path | purpose | related categories | evidence | verification status |
|---|---|---|---|---|---|
| `KS-09-001` | [`conftest.py`](../../../conftest.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-002` | [`packages/sdk-py/tests/conftest.py`](../../../packages/sdk-py/tests/conftest.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-003` | [`packages/sdk-py/tests/test_agent_client.py`](../../../packages/sdk-py/tests/test_agent_client.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-004` | [`packages/sdk-py/tests/test_async_client.py`](../../../packages/sdk-py/tests/test_async_client.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-005` | [`packages/sdk-py/tests/test_sync_client.py`](../../../packages/sdk-py/tests/test_sync_client.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-006` | [`playwright.config.ts`](../../../playwright.config.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-007` | [`proxy-helius/crates/ks-helius/tests/integration.rs`](../../../proxy-helius/crates/ks-helius/tests/integration.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-008` | [`proxy-helius/crates/ks-helius/tests/unit.rs`](../../../proxy-helius/crates/ks-helius/tests/unit.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-009` | [`src/backend/tests/__init__.py`](../../../src/backend/tests/__init__.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-010` | [`src/backend/tests/conftest.py`](../../../src/backend/tests/conftest.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-011` | [`src/backend/tests/test_agent_register_login.py`](../../../src/backend/tests/test_agent_register_login.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-012` | [`src/backend/tests/test_demo_session.py`](../../../src/backend/tests/test_demo_session.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-013` | [`src/backend/tests/test_keychain.py`](../../../src/backend/tests/test_keychain.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-014` | [`src/backend/tests/test_mpp_adversarial_guards.py`](../../../src/backend/tests/test_mpp_adversarial_guards.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-015` | [`src/backend/tests/test_mpp_autosign_routes.py`](../../../src/backend/tests/test_mpp_autosign_routes.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-016` | [`src/backend/tests/test_mpp_fulfillment.py`](../../../src/backend/tests/test_mpp_fulfillment.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-017` | [`src/backend/tests/test_owner_keystore.py`](../../../src/backend/tests/test_owner_keystore.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-018` | [`src/backend/tests/test_security_fixes.py`](../../../src/backend/tests/test_security_fixes.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-019` | [`src/backend/tests/test_smoke.py`](../../../src/backend/tests/test_smoke.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-020` | [`src/backend/tests/test_ui_api_contracts.py`](../../../src/backend/tests/test_ui_api_contracts.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-021` | [`src/backend/tests/test_vault_routes.py`](../../../src/backend/tests/test_vault_routes.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-022` | [`src/backend/tests/test_velocity.py`](../../../src/backend/tests/test_velocity.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-023` | [`src/infra/sync-worker/test/auth-routes.test.ts`](../../../src/infra/sync-worker/test/auth-routes.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-024` | [`src/infra/sync-worker/test/etag.test.ts`](../../../src/infra/sync-worker/test/etag.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-025` | [`src/infra/sync-worker/test/force-revoke.test.ts`](../../../src/infra/sync-worker/test/force-revoke.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-026` | [`src/infra/sync-worker/test/registry.test.ts`](../../../src/infra/sync-worker/test/registry.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-027` | [`src/infra/sync-worker/test/revoke.test.ts`](../../../src/infra/sync-worker/test/revoke.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-028` | [`src/infra/sync-worker/test/routes.test.ts`](../../../src/infra/sync-worker/test/routes.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-029` | [`src/mobile/src/components/sessionFormat.test.ts`](../../../src/mobile/src/components/sessionFormat.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-030` | [`src/mobile/src/lib/passkeyAdapter.test.ts`](../../../src/mobile/src/lib/passkeyAdapter.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-031` | [`src/mobile/src/screens/restoreValidation.test.ts`](../../../src/mobile/src/screens/restoreValidation.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-032` | [`src/mobile/src/screens/unlockServices.test.ts`](../../../src/mobile/src/screens/unlockServices.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-033` | [`src/mobile/src/screens/vaultListHelpers.test.ts`](../../../src/mobile/src/screens/vaultListHelpers.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-034` | [`src/mobile/src/storage/asyncStorageBackend.test.ts`](../../../src/mobile/src/storage/asyncStorageBackend.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-035` | [`src/programs/keyshield/tests/access_key.rs`](../../../src/programs/keyshield/tests/access_key.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-036` | [`src/programs/keyshield/tests/agent_flow.rs`](../../../src/programs/keyshield/tests/agent_flow.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-037` | [`src/programs/keyshield/tests/bankrun_invariants.rs`](../../../src/programs/keyshield/tests/bankrun_invariants.rs) | Automated test or test harness config. | 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-038` | [`src/programs/keyshield/tests/common/mod.rs`](../../../src/programs/keyshield/tests/common/mod.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-039` | [`src/programs/keyshield/tests/embedded_wallet_layout.rs`](../../../src/programs/keyshield/tests/embedded_wallet_layout.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-040` | [`src/programs/keyshield/tests/embedded_wallet_mollusk.rs`](../../../src/programs/keyshield/tests/embedded_wallet_mollusk.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-041` | [`src/programs/keyshield/tests/share_key.rs`](../../../src/programs/keyshield/tests/share_key.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-042` | [`src/programs/keyshield/tests/store_key.rs`](../../../src/programs/keyshield/tests/store_key.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-043` | [`src/proxy/crates/ks-cache/tests/pycompat.rs`](../../../src/proxy/crates/ks-cache/tests/pycompat.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-044` | [`src/proxy/crates/ks-helius/tests/cache.rs`](../../../src/proxy/crates/ks-helius/tests/cache.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-045` | [`src/proxy/crates/ks-proxy/tests/acme_pebble.rs`](../../../src/proxy/crates/ks-proxy/tests/acme_pebble.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-046` | [`src/proxy/crates/ks-proxy/tests/oracle_diff.rs`](../../../src/proxy/crates/ks-proxy/tests/oracle_diff.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-047` | [`src/proxy/crates/ks-proxy/tests/proxy.rs`](../../../src/proxy/crates/ks-proxy/tests/proxy.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-048` | [`src/proxy/crates/ks-proxy/tests/stealth.rs`](../../../src/proxy/crates/ks-proxy/tests/stealth.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-049` | [`src/proxy/crates/ks-proxy/tests/usage.rs`](../../../src/proxy/crates/ks-proxy/tests/usage.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-050` | [`src/proxy/crates/ks-session/tests/oracle.rs`](../../../src/proxy/crates/ks-session/tests/oracle.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-051` | [`src/proxy/crates/ks-upstream/tests/forward.rs`](../../../src/proxy/crates/ks-upstream/tests/forward.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-052` | [`src/proxy/crates/ks-upstream/tests/helius.rs`](../../../src/proxy/crates/ks-upstream/tests/helius.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-053` | [`src/proxy/crates/ks-vault/tests/oracle.rs`](../../../src/proxy/crates/ks-vault/tests/oracle.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-054` | [`src/proxy/tests/fixtures/cache_keys.json`](../../../src/proxy/tests/fixtures/cache_keys.json) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-055` | [`src/proxy/tests/fixtures/python_json.json`](../../../src/proxy/tests/fixtures/python_json.json) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-056` | [`src/proxy/tests/oracle_diff/harness.py`](../../../src/proxy/tests/oracle_diff/harness.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-057` | [`src/sdk/packages/agent-sdk/src/client.test.ts`](../../../src/sdk/packages/agent-sdk/src/client.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-058` | [`src/sdk/packages/agent-sdk/src/session.test.ts`](../../../src/sdk/packages/agent-sdk/src/session.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-059` | [`src/sdk/packages/agent-sdk/src/smoke.test.ts`](../../../src/sdk/packages/agent-sdk/src/smoke.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-060` | [`src/sdk/packages/cli/test/env-file.test.ts`](../../../src/sdk/packages/cli/test/env-file.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-061` | [`src/sdk/packages/cli/test/gitignore.test.ts`](../../../src/sdk/packages/cli/test/gitignore.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-062` | [`src/sdk/packages/cli/test/load-env.test.ts`](../../../src/sdk/packages/cli/test/load-env.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-063` | [`src/sdk/packages/cli/test/session-store.test.ts`](../../../src/sdk/packages/cli/test/session-store.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-064` | [`src/sdk/packages/cli/test/source.test.ts`](../../../src/sdk/packages/cli/test/source.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-065` | [`src/sdk/packages/cli/test/v2-client.test.ts`](../../../src/sdk/packages/cli/test/v2-client.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-066` | [`src/sdk/packages/goat-wallet/src/priority-fee.test.ts`](../../../src/sdk/packages/goat-wallet/src/priority-fee.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-067` | [`tests/adversarial_audit.ts`](../../../tests/adversarial_audit.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-068` | [`tests/bankrun_security.test.ts`](../../../tests/bankrun_security.test.ts) | Automated test or test harness config. | 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-069` | [`tests/e2e/key-capture.spec.ts`](../../../tests/e2e/key-capture.spec.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-070` | [`tests/e2e/user-flows.spec.ts`](../../../tests/e2e/user-flows.spec.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-071` | [`tests/fuzz_invariants.rs`](../../../tests/fuzz_invariants.rs) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-072` | [`tests/integration/test_agent_flow.py`](../../../tests/integration/test_agent_flow.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-073` | [`tests/live_e2e_vault.test.ts`](../../../tests/live_e2e_vault.test.ts) | Automated test or test harness config. | 07 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-074` | [`tests/proxy_fault_injection.test.ts`](../../../tests/proxy_fault_injection.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-075` | [`tests/proxy_fault_injection_driver.py`](../../../tests/proxy_fault_injection_driver.py) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-076` | [`tests/zk_vault_ix.test.ts`](../../../tests/zk_vault_ix.test.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
| `KS-09-077` | [`vitest.config.ts`](../../../vitest.config.ts) | Automated test or test harness config. | — | path + filename (static) | statically inspected; runtime status not verified |
