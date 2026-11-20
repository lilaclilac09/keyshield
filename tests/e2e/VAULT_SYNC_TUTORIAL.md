# Real local Device Vault tutorial E2E

Run from an isolated checkout/worktree with Node 20+, Python 3 and the backend
dependencies installed (`pip install -r src/backend/requirements.txt`). Install
the root npm dependencies, then Chrome/Chromium with PRF-capable CDP support:

```sh
npm install --ignore-scripts --package-lock=false --engine-strict=false
npx playwright install chromium
node scripts/vault-sync-tutorial-e2e.mjs
```

To use an existing Chrome for Testing instead of Playwright's downloaded browser:

```sh
CHROME_BIN=/absolute/path/to/chrome node scripts/vault-sync-tutorial-e2e.mjs
```

The runner refuses occupied ports and starts **real** dashboard (5174), backend
(8002) and local Wrangler/R2 worker (8788). No other running stack is reused or
stopped. It cleans up its own processes even after failure. SQLite/R2 data and
service logs are isolated per run under
`~/.local/state/keyshield-tutorial-e2e/run-*`; remove these directories manually
when no longer needed. No production credentials or cloud bindings are needed.
The runner sets worker `RP_ID=localhost`, `RP_ORIGIN=http://localhost:5174` and
backend `KS_RP_ID`/`KS_ORIGIN` consistently. Wrangler 3's installed runtime uses
compatibility date `2024-12-30` explicitly; production configuration is unchanged.

The test-only Vite config extends the canonical dashboard configuration and
proxies `/__sync` to the real worker. Backend requests go directly to port 8002
(the existing URL validator requires an origin without a path). This avoids editing the
production CORS allowlist just for the isolated port. This is **not** a CORS
acceptance test. It supplies a test-only `process.env` shim so the dashboard's
`typeof process` guard honors the configured URLs rather than falling back to
port 8001. A fail-closed network safety guard aborts any browser request outside
the isolated dashboard/backend origins and fails the test if that happens.
External fonts/stylesheets are deliberately blocked without failing (fallback
fonts are used, so this does not verify hosted typography). Allowed
requests continue normally; no API/sync response is fabricated or fulfilled.
The existing `playwright.config.ts` is reused with `PW_USE_EXTERNAL_SERVER=1`
and `PW_PORT=5174`. The equivalent browser-only command, with that stack already
started, is:

```sh
PW_VAULT_TUTORIAL=1 PW_USE_EXTERNAL_SERVER=1 PW_PORT=5174 npx playwright test tests/e2e/vault-sync-tutorial.spec.ts --workers=1 --retries=0 --reporter=line
```

The explicit `PW_VAULT_TUTORIAL=1` opt-in keeps ordinary mocked E2E suites from
trying to run this scenario without the real local stack. The runner sets it.

## Boundaries and assertions

- **Synthetic data:** a fresh `example.test` email/password and repetitive fake
  OpenAI/Groq/OpenRouter credentials. No existing account/session is seeded.
- **Virtual hardware/user touch:** CDP CTAP2.1 authenticator with resident keys,
  user verification and PRF. Chrome generates credentials, real signatures and
  PRF output. It does not test a physical passkey or a human biometric prompt.
- **Tab-B bridge:** B's `navigator.credentials.get` is forwarded to A's virtual
  authenticator; binary fields are serialized/reconstructed, not fabricated.
  No auth response, crypto operation, vault session or network response is mocked.
- **Real services/crypto:** signup, registration verification, worker enrollment,
  challenge/exchange, AES-GCM encryption/decryption and R2 CAS execute normally.

The UI flow enrolls, saves, unlocks B from A's revision, saves B, rejects stale A
with exactly one 409 PUT and no retry over 6.5 seconds (multiple normal polling
cycles), reloads/unlocks A, sees B's Groq entry, and successfully retries A. It
checks matching stale base headers and the refreshed successful base. Request
privacy checks cover URL, headers and body for **all context requests**; no fake
API key or `/manage/store` request is allowed. This finite observation window
cannot prove the absence of retries scheduled arbitrarily far in the future.

Playwright writes failure traces and conflict/recovered screenshots under its
normal `test-results/` directory. A screenshot is evidence for the synthetic
browser flow only, not physical hardware/platform acceptance.
