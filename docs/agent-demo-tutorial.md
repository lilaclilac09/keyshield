# DEMO ONLY: a named local agent and the desktop approval broker

**Not shipped in the DMG. Source checkout only. Synthetic fixture key only.
Loopback mock destination only. No real provider credentials, arbitrary URLs,
command relays, or external agents.** These restrictions apply to every step.

This tutorial targets PR 155's desktop broker, not its separate iOS Simulator
demo. PR 155 (`2970239ce`) integrates the overnight desktop, dashboard, extension,
and iOS changes. The desktop broker is an opt-in development mock: it authenticates
a named local client, queues one fixed operation, and requires a fresh passkey
approval for each use. It creates its own HTTP mock on `127.0.0.1:0`; the agent
cannot select that port or destination. Packaged apps refuse to start the broker.

The developer's `curl` commands below **are** the local agent. There is no
preconfigured offline agent or third-party agent integration to install.

Relevant components:

| File | Role |
| --- | --- |
| `src/desktop/broker.cjs` | Local bearer authentication, request states, fixed `mock.echo`, owned mock listener |
| `src/desktop/main.cjs`, `preload.cjs` | Source-only startup, native pin confirmation, origin/top-frame-checked IPC |
| `src/desktop/registration-observer.cjs`, `approval-passkey.cjs` | Main observes enrollment challenge; verifies and pins the public credential |
| `src/web/lib/auth.ts`, `vault-session.ts` | Real passkey enrollment, PRF vault encryption, memory-only encrypted approval snapshot |
| `src/web/components/sections/AgentApprovalsPanel.tsx` | Register the local agent; approve, deny, or revoke a request |
| `src/backend/auth/passkey.py`, `routes/auth.py` | Local identity registration and passkey verification |
| `src/infra/sync-worker/` | Local ciphertext storage and WebAuthn-to-JWT exchange |
| `src/desktop/e2e/agent-demo-tutorial.spec.cjs` | Automated version of this flow, including the real native dialog |

## Step 1 — DEMO ONLY: prepare the source checkout

Use macOS, Node.js/npm, Python 3.12+, and a PRF-capable passkey authenticator.
Run commands from the repository root. Do not use an installed DMG or an existing
profile containing important keys. Keep ports 8001, 8787 and 8790 free.

```sh
npm ci
npm install --prefix src/desktop
python3 -m venv .venv
.venv/bin/python -m pip install -r src/backend/requirements.txt

export DEMO_RUN="$HOME/.local/state/keyshield-agent-demo-$(date +%s)"
mkdir -p "$DEMO_RUN/api" "$DEMO_RUN/vault"
chmod 700 "$DEMO_RUN"
printf 'Use this same DEMO_RUN in the other terminals: %s\n' "$DEMO_RUN"
```

Use a fresh `DEMO_RUN` for a new enrollment: an existing broker pin cannot be
replaced. Local API/worker signing secrets generated below are disposable local
infrastructure secrets, **not provider keys**. Do not deploy this setup.

## Step 2 — DEMO ONLY: start the real local API

In terminal A, with `DEMO_RUN` set to the path from step 1:

```sh
KS_DATA_DIR="$DEMO_RUN/api" VAULT_DIR="$DEMO_RUN/vault" \
SERVER_SECRET="$(openssl rand -hex 32)" INTERNAL_SECRET="$(openssl rand -hex 32)" \
KS_RP_ID=app.ks.aileena.xyz KS_ORIGIN=https://app.ks.aileena.xyz \
KS_CORS_ORIGINS=https://app.ks.aileena.xyz \
.venv/bin/python -m uvicorn src.backend.app:app --host 127.0.0.1 --port 8001
```

The desktop serves its local renderer under `https://app.ks.aileena.xyz`; that
origin is not evidence of a hosted dashboard request. The RP must match this
renderer origin, **not** the local API hostname.

## Step 3 — DEMO ONLY: start the real local sync worker

In terminal B, with the same `DEMO_RUN`, from the repository root:

```sh
WRANGLER_SEND_METRICS=false npm --prefix src/infra/sync-worker run dev -- \
  --local --ip 127.0.0.1 --port 8787 --persist-to "$DEMO_RUN/worker" \
  --var RP_ID:app.ks.aileena.xyz \
  --var RP_ORIGIN:https://app.ks.aileena.xyz \
  --var "JWT_SECRET:$(openssl rand -hex 32)"
```

Keep `--local`; do not deploy or use `--remote`. R2 data is simulated locally.
In particular, omitting `RP_ORIGIN` can make `/auth/register` return 401 even
though identity registration succeeds. Backend variables are `KS_RP_ID` and
`KS_ORIGIN`; worker variables are `RP_ID` and `RP_ORIGIN`.

In terminal C, verify both local services:

```sh
curl --fail http://127.0.0.1:8001/health
curl --fail http://127.0.0.1:8787/health
```

## Step 4 — DEMO ONLY: build and start the source desktop app

Still in terminal C, with the same `DEMO_RUN`:

```sh
KEYSHIELD_API_URL=http://127.0.0.1:8001 \
KEYSHIELD_PUBLIC_API_BASE=http://127.0.0.1:8001 \
KEYSHIELD_SYNC_URL=http://127.0.0.1:8787 \
npm --prefix src/web run build:vite -- --outDir ../desktop/renderer

KS_DESKTOP_BROKER=1 KS_BROKER_PORT=8790 KS_DESKTOP_LIVE=0 \
KS_DESKTOP_API_URL=http://127.0.0.1:8001 KS_DESKTOP_SYNC_PROXY=0 \
npm --prefix src/desktop start -- --user-data-dir="$DEMO_RUN/profile" \
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'
```

The DNS rule blocks external renderer hosts; bundled dashboard assets are served
by the desktop's local protocol handler. Do not set packaged-mode flags. The log
must report `KeyShield approval broker listening on 127.0.0.1:8790`. This is the
**agent-facing broker** port, not a configurable provider port. Rebuild whenever
changing compiled API/sync URLs; runtime API configuration alone is insufficient.

## Step 5 — DEMO ONLY: enroll, confirm the pin, and save the synthetic entry

1. Create a disposable email account in the local desktop sign-in form, such as
   `demo-agent@example.invalid`, with a new test-only password. Open **Vault**.
2. In **Keychain — paste a key**, paste exactly:
   ```text
   FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
   ```
   Choose **Save**. A locked vault refuses this save; nothing is stored yet.
3. Choose **Unlock or create device vault**, then **Enroll passkey**. Complete
   the real PRF-capable registration ceremony.
4. In the **native** dialog, verify the credential ID and the message
   **Use this passkey for agent approvals on this device?** Choose **Use passkey**
   (Cancel is the default). Complete Touch ID too if macOS offers it. Do not
   alter the app or bypass either confirmation.
5. Allow the separate vault-unlock ceremony to complete. The empty vault says
   **Vault unlocked — no encrypted keys yet**. The Agent approvals panel
   (**Mock provider (test only)**) must no longer say approval is unavailable.
6. Clear the Keychain paste box **without saving it**. Inside the now-unlocked
   Device Vault, choose **Add encrypted key**, leave the provider as **OpenAI**,
   paste the **entire** fixture above into its password field, and choose
   **Encrypt & store**. The modal closes and the encrypted entry appears.
   Only ciphertext goes to the local sync worker.

Use this explicit-provider encrypted-key form, not the Keychain's quick-paste
**Save** / **Save + Call** after unlocking: quick-paste extracts only the
`sk-proj-…` portion, dropping the synthetic marker. The broker correctly refuses
that value with `mock_synthetic_secret_required`. The initial locked Save above
only reveals the existing setup UI; it does not save a key.

In this fresh vault the exact entry ID is `openai`. Another OpenAI entry would
be `openai#2`; those IDs are distinct. Never send a `device:` card ID. Keep the
app open: approval decrypts an in-memory ciphertext snapshot, with no sync fetch
during approval. After a reload/restart, unlock the vault once first. If PRF or
pinning is unavailable, stop; normal vault access is not a substitute for a pin.

## Step 6 — DEMO ONLY: register the named local agent

In the Vault's **Mock provider (test only)** panel, enter `demo-agent` in
**Agent name** and click **Register agent**. Copy its shown-once token with
**Copy token** and copy the displayed broker URL. They are local credentials,
not a provider key. In terminal D, enter those exact values:

```sh
printf 'Broker URL from the panel (http://127.0.0.1:8790): '
IFS= read -r BROKER_URL
printf 'Shown-once local agent token: '
read -rs BROKER_TOKEN
printf '\n'
```

Use only the displayed loopback broker URL, not an arbitrary URL. Do not use
`set -x`, publish the token, or give it to an external agent. Dismiss the token
display in the panel after copying. Registration internally issues
`{agentId, name, token, brokerUrl}`; it is not an unauthenticated HTTP endpoint.
The token authenticates `demo-agent` on local HTTP requests. It cannot approve
its own requests. Agents and their tokens disappear on app restart.

## Step 7 — DEMO ONLY: request the one fixed operation and approve it

In terminal D:

```sh
REQUEST_JSON=$(curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer $BROKER_TOKEN" -H 'Content-Type: application/json' \
  --data '{"operation":"mock.echo","credential":"openai"}' \
  "$BROKER_URL/v1/requests")
printf '%s\n' "$REQUEST_JSON"
REQUEST_ID=$(printf '%s' "$REQUEST_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
```

HTTP **202**, with exactly these fields (ID/expiry here are illustrative):

```json
{"id":"0123456789abcdef0123456789abcdef","status":"pending","operation":"mock.echo","credential":"openai","expires_at":1900000000000}
```

In the panel, check **demo-agent**, entry **openai**, and the fixed operation
**mock.echo**. Click **Approve with passkey** and finish the fresh UV-required
ceremony. Only then does the broker send fixed `POST /v1/mock` with body
`{"input":"keyshield-acceptance"}` to its own loopback mock. It refuses any secret
without the synthetic fixture prefix. Neither the local API nor sync worker
performs the provider dispatch.

Read the result in terminal D; repeat this GET if it is still pending/executing:

```sh
curl --silent --show-error --fail-with-body \
  -H "Authorization: Bearer $BROKER_TOKEN" \
  "$BROKER_URL/v1/requests/$REQUEST_ID"
```

HTTP **200** after approval:

```json
{"id":"0123456789abcdef0123456789abcdef","status":"completed","operation":"mock.echo","credential":"openai","expires_at":1900000000000,"result":{"ok":true,"operation":"mock.echo"}}
```

The agent gets the fixed result, **not** the provider's JSON, key, headers, or
body. This approval is single-use; a new request needs another ceremony.

## Step 8 — DEMO ONLY: deny, expire, or revoke a separate request

Repeat the POST and `REQUEST_ID` extraction from step 7 **for each case**. An
already completed request cannot be changed to denied/revoked.

* Click **Deny**, then the same GET returns HTTP **200**:
  ```json
  {"id":"0123456789abcdef0123456789abcdef","status":"denied","operation":"mock.echo","credential":"openai","expires_at":1900000000000}
  ```
* Leave a new request untouched until its `expires_at` (normally 60 seconds
  after creation). GET returns HTTP **200**:
  ```json
  {"id":"0123456789abcdef0123456789abcdef","status":"expired","operation":"mock.echo","credential":"openai","expires_at":1900000000000}
  ```
* Click **Revoke request**, then GET returns HTTP **200**:
  ```json
  {"id":"0123456789abcdef0123456789abcdef","status":"revoked","operation":"mock.echo","credential":"openai","expires_at":1900000000000}
  ```

These outcomes contain **no `result` and no `error` field**, and do not execute
the mock operation. They do not return null-valued placeholders. Revoking the
**agent** is different: its token immediately loses access, so GET instead
returns HTTP **401** with exactly `{"error":"unauthorized"}`; it cannot read its
revoked requests afterward.

## Step 9 — DEMO ONLY: understand every agent-visible request field

All successful POST/GET views use `Content-Type: application/json`:

| JSON field | Meaning / presence |
| --- | --- |
| `id` | Opaque 32-character lowercase hex request ID; always present |
| `status` | `pending`, briefly `executing`, or terminal `completed`, `denied`, `expired`, `revoked`, `cancelled`, `failed` |
| `operation` | Always `mock.echo` |
| `credential` | Exact entry ID submitted by this agent, e.g. `openai`; no provider fallback |
| `expires_at` | Request deadline as Unix epoch **milliseconds**; remains the original deadline after completion |
| `result` | Present only on success: exactly `{"ok":true,"operation":"mock.echo"}` |
| `error` | On a failed dispatch: fixed `provider_response_rejected` or `redirect_refused`; absent in normal views |

An agent may cancel its own pending request using authenticated
`DELETE /v1/requests/$REQUEST_ID`; HTTP 200 returns the same five base fields with
`status:"cancelled"`. Deleting a non-pending request returns HTTP 409 with
`{"error":"request_not_pending"}`. A nonexistent request, or one owned by another
agent, returns HTTP 404 with `{"error":"not_found"}`. Protocol rejections return
an `error`-only JSON object, not a request view. Unknown POST fields such as
`url`, `headers`, `command`, or `origin` are rejected. Browser `Origin` headers
are refused; use the local terminal client, not browser fetch.

The agent receives **no** agent name/ID in request views, creation/update times,
vault ID/revision, entry labels/domain/expiry metadata, provider destination,
passkey challenges, credential public key, PRF output, synthetic key, or audit
history. The panel's richer metadata is not the agent API. Ordinary HTTP
transport headers (Date, connection/transfer framing) are generated by Node;
no provider headers are forwarded.

## Step 10 — DEMO ONLY: run the automated tutorial and clean up

Quit the manual desktop app and stop the manual API/worker with Ctrl-C first.
After the dependency installation and local renderer build above, run from root:

```sh
npx playwright test --config src/desktop/e2e/playwright.config.cjs \
  src/desktop/e2e/agent-demo-tutorial.spec.cjs
```

The spec starts the **real local API and Wrangler worker** on the same ports
with isolated data, then launches the real source app. It uses Chromium's CDP
CTAP2.1 virtual authenticator with PRF and user verification, not a replacement
`navigator.credentials`, mocked enrollment responses, or prewritten pin. Test-side
`osascript` / System Events locates the Electron process and **clicks the actual
native Use passkey button** after checking the dialog's message. It does not
replace `showMessageBox`, `promptTouchID`, or the confirmer. Allow the test runner
Accessibility/Automation permission in macOS Settings if prompted.

Use a macOS automation host where Touch ID is unavailable (such as a VM); the
test asserts that capability and does not fake it or bypass an available Touch
ID prompt. Physical biometrics are not tested. The test runs actual `curl` as
`demo-agent`, checks exact approve/deny/revoke/expiry fields and HTTP status,
and rejects synthetic key material in every agent response, including headers.
It waits for the normal 60-second expiry, so allow roughly 90 seconds.

Screenshots and private local service logs are written under
`~/.local/state/keyshield-e2e/agent-tutorial-*`; service processes are stopped
on completion. The test requires ports 8001/8787 to be unused. It never runs the
installed-app suite or changes application code. Do not commit generated
renderer output or local account/profile data. After the manual exercise,
quit the app, stop both services, and clear shell credentials:

```sh
unset BROKER_TOKEN BROKER_URL REQUEST_JSON REQUEST_ID
```

Keep or remove your disposable `DEMO_RUN` directory using your normal local-data
cleanup process. Do not reuse this demo as a real-credential or production broker.
