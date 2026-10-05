# 05 — Wallet, authentication, and sessions

[← repository index](../README.md)

Category purpose: Wallet, authentication, and sessions.
Indexed files: **15**.

## Key entrypoints

- [`src/session.py`](../../../src/session.py) — Wallet, passkey, or session authentication.

## Related modules

02, 03, 06

## Existing documentation and tests

- Docs: [docs/API.md](../../API.md) (Authentication)
- Tests: [src/backend/tests/test_agent_register_login.py](../../../src/backend/tests/test_agent_register_login.py)

## Uncertainties

Session token format in create_token is payload.hmac; docs still mention `ksv2_…` for demo/harness tokens.

Full inventory with type/notes: [FILE_INDEX.md](FILE_INDEX.md).

## File / directory index

| ID | original relative path | purpose | related categories | evidence | verification status |
|---|---|---|---|---|---|
| `KS-05-001` | [`src/backend/auth/__init__.py`](../../../src/backend/auth/__init__.py) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-002` | [`src/backend/auth/passkey.py`](../../../src/backend/auth/passkey.py) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-003` | [`src/backend/auth/session.py`](../../../src/backend/auth/session.py) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-004` | [`src/backend/routes/sessions.py`](../../../src/backend/routes/sessions.py) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-005` | [`src/mobile/src/components/AddPasskeyBanner.tsx`](../../../src/mobile/src/components/AddPasskeyBanner.tsx) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-006` | [`src/mobile/src/components/SessionBar.tsx`](../../../src/mobile/src/components/SessionBar.tsx) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-007` | [`src/mobile/src/components/SessionExpiryToast.tsx`](../../../src/mobile/src/components/SessionExpiryToast.tsx) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-008` | [`src/mobile/src/components/sessionFormat.ts`](../../../src/mobile/src/components/sessionFormat.ts) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-009` | [`src/mobile/src/lib/passkeyAdapter.ts`](../../../src/mobile/src/lib/passkeyAdapter.ts) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-010` | [`src/sdk/packages/agent-sdk/src/session.ts`](../../../src/sdk/packages/agent-sdk/src/session.ts) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-011` | [`src/sdk/packages/cli/src/lib/session-store.ts`](../../../src/sdk/packages/cli/src/lib/session-store.ts) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-012` | [`src/session.py`](../../../src/session.py) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-013` | [`src/web/components/WalletConnector.tsx`](../../../src/web/components/WalletConnector.tsx) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-014` | [`src/web/components/sections/SessionsSection.tsx`](../../../src/web/components/sections/SessionsSection.tsx) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-05-015` | [`src/web/lib/auth.ts`](../../../src/web/lib/auth.ts) | Wallet, passkey, or session authentication. | 02, 03 | path + filename (static) | statically inspected; runtime status not verified |
