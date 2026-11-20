# Renderer acceptance with a separately pinned sync worker

Renderer base: PR #154 (`9170938d0f3ab2f1d75b449513344c0a182b8963`).
The worker is deliberately not ported into this branch. Use a separate detached
worktree at PR #156 (`9c0070ca31a3c4ad3f27ba1046febb4a6e2b1116`):

```sh
git worktree add --detach ../keyshield-mac-worker 9c0070ca31a3c4ad3f27ba1046febb4a6e2b1116
KS_ACCEPTANCE_WORKER_ROOT="$(realpath ../keyshield-mac-worker)" \
CHROME_BIN=/path/to/google-chrome node scripts/vault-sync-tutorial-e2e.mjs
```

Install the repository's Node dependencies, its Python backend dependencies,
and Chrome supporting CDP PRF virtual authenticators first. The harness checks
that ports 5176 (dashboard), 8004 (backend), and 8790 (worker) are unused, runs
the real services with fresh state under `~/.local/state/keyshield-mac-renderer-e2e`,
sets RP_ORIGIN to `http://localhost:5176`, and tears them down afterwards. It
does not use or stop the preview on 5175. Installed Wrangler 3 uses compatibility
date 2024-12-30 for this local harness only; production configuration is unchanged.

The tutorial test uses synthetic data, CDP virtual WebAuthn hardware/touch, and
a bridge forwarding tab B's `navigator.credentials.get` to tab A. All registration,
challenge verification, encryption/decryption, storage and CAS responses are real.
The test-only Vite config shims environment access and proxies to the local worker;
it does not mock responses. Unexpected destinations fail closed; external fonts
and stylesheets are blocked, so this is not a typography acceptance test.

Checks: Home CTA to create/unlock, locked save retaining input without a PUT,
ciphertext-only PUT shape, request/console privacy, headerless HTTP 428 update
message, exactly one stale HTTP 409 without retries over 6.5 seconds, followed by
reload/unlock and successful explicit retry. Screenshots check default token
privacy and contain no password; the retained synthetic input is cleared only
after asserting retention, before capturing the conflict state. Browser traces
are disabled to avoid storing sign-in credentials.

The companion PR #154 failure-state spec intentionally mocks API/sync responses
for network, 503, 400, 401, 403, 409 and 413 failures; it is not evidence of a real
worker outage. Boundaries are annotated in both specs. Pass `--grep novice` to
the harness to run only the real-service tutorial. Screenshots are in the
Playwright `test-results` directory.
