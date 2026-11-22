# Mobile ciphertext sync boundary

This is a nonshipping RN scaffold, not a restored extension or native app.
`MobileSyncBoundary` is the only newly wired runtime. AuthService, LocalVault,
ExtensionSession, sync-auth, useVaultFlow, session countdown, mnemonic, platform
and conflict imports elsewhere still refer to the deleted extension-sync package.
The existing restore/auth test suites consequently cannot load. No credential
collection, decryption, popup, broker, plaintext state or disk storage was added.

Call `pull(id)` before a mutation. Only a successful GET or actual 404 establishes
a base. Unknown, 304 and network failure never mean `none`; unknown mutations
fail locally with `UnknownRevision` (zero requests). Known-base mutations make
one request, without retry or merge. The boundary updates its ciphertext cache
and revision only after a successful response. Callers must likewise wait for
success before replacing their own plaintext or persistent cache, and retain
unsaved input on rejection. Entry removal supplies newly encrypted ciphertext
to `push`; `remove` deletes the whole vault. Neither method decrypts anything.

Daily/recovery paired writes and deletes are unsupported. `pushPair` and
`removePair` reject with `PairedSyncUnsupported` before either request; there is
no best-effort recovery fallback and no compensating/revert write. The missing
legacy dual-write hook must not be reconnected to independent writes.

Run the boundary tests with `npm test --prefix src/mobile -- src/sync`.
Run all mobile tests with `npm test --prefix src/mobile`; the two unrelated
missing-package suites remain blocked. Run `node_modules/.bin/tsx
scripts/mobile-sync-rollout.mts` from the repository root for isolated loopback
workers. The script resolves Miniflare/esbuild through the worker's Wrangler
dependency, creates detached old/new worker worktrees and persistent evidence
under `~/keyshield-mobile-rollout`, and never uses deployed services or real
auth. Optional port overrides: `KS_MOBILE_OLD_PORT`, `KS_MOBILE_CAS_PORT`.

Rollout labels distinguish observed real-worker/new-client requests, simulated
historical headerless HTTP (not an old app build), and missing RN/Hermes builds.
On an old worker the header is ignored for native-style requests: acceptance
does not imply stale-write protection. Browser preflight blocks the new header.
Do not roll back a CAS worker to an unconditional writer to restore old clients.
