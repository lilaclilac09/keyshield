# KeyShield desktop (Mac)

Packaging defaults to `renderer-inputs.json`. It fetches the exact integration
commit from origin, verifies its tree, ordered parents, intermediate merges and
input closure, and refuses mismatches. `KS_RENDERER_PIN=/path/to/pin.json` selects
another reviewed pin; `KS_RENDERER_REF`, if set, must match that pin. Renderer
input revisions are included in BUILD-INFO and the DMG provenance sidecar.

An Electron shell that wraps the `src/web` dashboard 1:1 (home, vault,
payments, agents, developer tokens, and the rest). It does not reimplement
vault, billing, MPP, agents, or the proxy. By default it talks to the
hosted control plane; the local Python API (`:8001`) and Rust proxy
(`:8000`) are optional and off unless the matching environment flags are
set.

## Files

| File | What it does |
| --- | --- |
| `main.cjs` | App lifecycle, window, IPC, Touch ID, feedback, launch diagnostics |
| `preload.cjs` | The `window.keyshieldDesktop` bridge (context-isolated, sandboxed) |
| `renderer-server.cjs` | Serves the bundled dashboard over the https intercept |
| `diagnostics.cjs` | Launch log file + captured renderer errors |
| `redaction.js` | Shared main-process and error-screen redactor |
| `startup-policy.cjs` | Packaged startup validation and explicit Touch ID outcomes |
| `request-audit.cjs` | Opt-in, value-free HTTP(S) request shape audit |
| `runtime-preflight.cjs` | Checks a packaged `.app` for its Chromium runtime files |
| `boot.html` | Diagnostics screen shown when the dashboard cannot open |
| `loading.html` | Local navy shield screen shown before the dashboard loads |
| `assets/dmg-background.png` | Finder installer artwork (editable source: adjacent SVG) |
| `assets/app-icon.png` | Transparent 1024px shield master (adjacent SVG); sips + iconutil generate all Mac sizes |
| `scripts/build-renderer.cjs` | Builds `src/web` and verifies the output is complete |
| `scripts/pack-mac.cjs` | Packs `KeyShield.app` (+ zip, and a DMG on macOS) |
| `OPEN-ME.txt` | Install instructions shipped in the zip |

## Build (on a Mac)

```sh
cd src/desktop
npm install
npm run pack        # builds the renderer, packs arm64 + x64, writes release/
```

Output lands in `release/`:

- `KeyShield-mac-arm64.zip` / `KeyShield-mac-x64.zip` — the app
  plus `OPEN-ME.txt`, `BUILD-INFO.txt`
- `KeyShield.dmg` — macOS only; drag the app to `/Applications`
- `BUILD-INFO.txt` — Electron version, git commit, date, renderer asset
  count, preflight report for the build you just made
- `KeyShield.dmg.build-info.json` — full desktop/renderer commit and tree
  SHAs, per-source and whole-checkout dirty flags, and the final DMG SHA-256
  (renderer parent SHAs identify revisions included in integration merges)

Set `KS_DESKTOP_RELEASE_DIR=/absolute/new/output` to keep earlier artifacts intact.
The Mac pack step requires a logged-in Finder session with AppleScript automation
available. It creates a writable HFS+ image, records the background, window bounds
and icon positions in Finder, detaches it, then converts it to compressed UDZO.
Missing Finder metadata fails the build instead of silently shipping an unstyled
image. The hidden `.background/installer.png` and `.DS_Store` are presentation
data, not install helpers. BUILD-INFO and OPEN-ME remain visible below the app.
The SVG uses the shared login shield geometry and app.ks palette; the committed
720×560 PNG needs no image-generation dependency at packaging time.

To build with another reviewed integration pin without switching the desktop
checkout:

```sh
KS_RENDERER_PIN=/absolute/path/to/renderer-inputs.json npm run pack
```

The selected integration commit is fetched from origin and verified against
the pin, built in a detached temporary git worktree with its own dependencies,
and removed afterward. An invalid pin, missing commit or failed build aborts
packaging, never substitutes the current renderer. Build output stays outside
the selected source worktree. Without the override the committed desktop pin
is used; uncommitted changes in the current `src/web` are never substituted.
Source dirty flags include untracked source files but exclude generated web
`dist`; whole-checkout flags also capture edits to shared dependency inputs.
Revisions/dirty flags are captured before the renderer build. The external
`release/BUILD-INFO.txt` receives the final DMG hash after creation. Copies
inside archives point to the detached JSON instead: an image cannot contain
its own final checksum without changing that checksum.

`npm run pack` on Linux produces the zips but no `.dmg` (a Linux-made
`.dmg` is not a launchable Mac app). `npm run verify` syntax-checks every
script in this folder.

## Mac App Store / TestFlight build

On macOS run `npm run pack:mas`. This reuses the DMG renderer pin,
provenance, icon, resources and preflight, but downloads Electron's **MAS**
runtime and builds a universal arm64+x64 app under `release/mas/`.
Without signing inputs it ad-hoc signs the sandboxed app, labels BUILD-INFO
**Local synthetic MAS sandbox check — not App Store signed**, and skips pkg.
`npm run pack` remains the existing unsigned DMG/zip path.

For a distribution pkg, supply all of:

- `KS_MAS_APP_IDENTITY`: installed `Apple Distribution: …` signing identity.
- `KS_MAS_INSTALLER_IDENTITY`: installed `3rd Party Mac Developer Installer: …`
  or `Mac Installer Distribution: …` identity.
- `KS_MAS_PROVISIONING_PROFILE`: path to the distribution `.provisionprofile`,
  embedded by osx-sign; it must authorize `xyz.aileena.keyshield`.
- `KS_MAS_TEAM_ID`: ten-character Apple team id matching that profile.
- `KS_MAS_BUILD_NUMBER`: numeric bundle version, increased for every upload.
- `KS_MAS_NON_EXEMPT_ENCRYPTION`: exactly `true` or `false`. This is the
  owner's legal encryption declaration; signing/pkg refuses to guess it.

Then `npm run pack:mas` signs using `@electron/osx-sign` and creates
`release/mas/KeyShield-mas.pkg` with `productbuild`. No upload is performed;
the owner must review encryption/export compliance, signing and App Store
Connect setup before uploading via Apple's tools for TestFlight. No testers
or public links are created. Real signing/upload cannot be validated without
the owner's identities, profile and App Store Connect access.

Sandbox audit: the shell spawns no external processes and opens no local
listening sockets; `renderer-server.cjs` reads bundled files through Electron's
HTTPS handler. Only outbound network access is entitled. There is no broker
runtime in this desktop checkout; packaging excludes scripts/e2e and asserts
that broker/approval/mock files are absent. MAS disables live/local sync and
external renderer overrides, request-audit file writes, and log path overrides.
Logs use Electron's container-aware logs directory, normally
`~/Library/Containers/xyz.aileena.keyshield/Data/Library/Logs/KeyShield/`.
Reveal-log uses Finder for that owned log; external HTTPS links use Launch
Services. No file-access, server or keychain-group entitlements are requested.
Electron's Mach-port rendezvous needs an application group: the bundle id for
local ad-hoc checks, or `TEAMID.xyz.aileena.keyshield` when signing (authorize it
in the distribution profile). MAS skips Electron's unsupported single-instance
lock API. Helpers inherit the sandbox; no login helper is installed.

### Synthetic-only beta boundary (not a functional private beta yet)

Every MAS build embeds a read-only `Resources/beta-policy.json`. MAS runtime
**or presence** of this file enables the boundary, even if its JSON is invalid
or says false. There is no environment or CLI opt-out. Both the default session
and every newly created session cancel HTTP(S)/WS(S) requests except GET/HEAD
to the exact bundled dashboard origin, which is answered from disk without a
network fallback. Main-process `net.fetch`, `net.request` and global `fetch`
are guarded too. External navigation, popups and `shell.openExternal` are
disabled; the live-dashboard/API-health menu items are omitted. Block logs
contain only `host … blocked`, never paths, queries, bodies or input values.

No synthetic authentication/sync responder is shipped. The pinned renderer
needs `/auth/signup` or `/auth/login`, WebAuthn passkey options/verification,
authenticator PRF output, sync `/auth/register`, `/auth/challenge`,
`/auth/exchange`, and GET/PUT `/vault/:id`. Safely simulating that whole flow
would require a substantial mock and authenticator fixtures, not a small
in-process responder. All these network calls are blocked, so a fresh beta
cannot sign in, enroll/unlock Device Vault, or complete a save. A manually
entered synthetic session token can expose the UI but does not unlock a vault.

The preload exposes `keyshieldDesktop.syntheticOnly` for future renderer
integration; this pinned renderer does **not** consume it. The shell cannot
inspect plaintext inside encrypted vault payloads and cannot prevent typing
a realistic-looking key into renderer memory. Before this can be described
as accepting only synthetic keys, the renderer owner must reject values not
starting with `FAKE_KEYSHIELD_NOT_A_KEY::` in `saveKeyOnDevice` before encryption
and all other key-import/save entry points, and provide a dedicated synthetic
auth/PRF flow. Do not enter real credentials. No successful synthetic save or
real-key rejection is claimed by this build. The existing Playwright Electron
harness also needs inspector/DevTools listeners denied by these unchanged
sandbox entitlements; do not grant server access just for tests.

Local experiment (2026-11-20 UTC): rebased on the branded DMG shell
`31615c89dbc4e56202d0fec8515db0aa7dbea7aa`, with its unmodified renderer pin
`9170938d0f3ab2f1d75b449513344c0a182b8963`. Fresh-container launch displayed
the bundled sign-in page; email sign-in and sign-up with a `.test` identity
failed at the network boundary. Entering a deliberately fake session token
exposed the Vault UI without authenticating or unlocking it. Clicking Save
with `FAKE_KEYSHIELD_NOT_A_KEY::demo` produced “Unrecognized key format”; a
realistic but fake `sk-proj-…` value was recognized, then rejected because the
Device Vault was locked. Neither saved a key. This is **not** a synthetic-key
prefix enforcement result. The renderer still requires the guard described
above. Evidence is stored outside the repo in `~/mas-evidence/rebased-*`:
screenshots, container logs, process/socket snapshots and packet captures.
Process-filtered captures recorded no packets; a simultaneous system-wide
DNS/TCP-SYN capture provides an independent cross-check. These observations
cover the exercised paths, not a proof about every possible future renderer
or Chromium network feature.

## Install

Local synthetic test build — not signed with a Developer ID and not notarized; macOS Gatekeeper protections are left intact.

Mount the DMG, or extract the zip for your Mac, and copy `KeyShield.app` to
`/Applications` using Finder. macOS may refuse to launch this local build.
The package does not modify system security settings or provide a launch
override. Tester distribution requires a Developer ID signed and notarized
build.

## How launch works

1. After preflight succeeds, the shell displays its local navy loading screen.
   The pack script builds the `src/web` dashboard and bundles it as
   `Contents/Resources/renderer/`. The app loads that copy through a
   session-only https intercept for `app.ks.aileena.xyz`, so the window
   works offline. Packaged builds never fall back to hosted dashboard content;
   the explicit `KS_DESKTOP_LIVE=1` renderer selection remains available only
   after the same packaged preflight and bundled-asset checks pass.
2. Launch never prompts for Touch ID. The bridge remains available for explicit
   sensitive actions; unavailable or canceled authorization returns `ok: false`
   with a reason and shell feedback. The current web renderer has no callers.
3. A runtime preflight checks the bundle for its Chromium runtime files
   (main executable, framework binary, ICU data). Preflight failure, invalid
   bundled assets, or an HTTPS-handler installation failure shows a local
   error screen with Quit/Retry. Retry repeats the same startup checks.
4. After the page loads, the main process probes `#root`: if React has
   not mounted anything after ten seconds, the window shows the
   diagnostics screen instead of sitting blank.

## When it does not open

Every launch writes a log to:

```
~/Library/Logs/KeyShield/keyshield-desktop.log
```

If the app shows its diagnostics screen, use **Copy diagnostics** (or
**Reveal launch log** from the Help menu) and send both that text and
`release/BUILD-INFO.txt` with the report. The screen's reason is one of:

- `startup-blocked` — a startup check failed; no dashboard was requested.
- `dashboard-load-failed` — the selected renderer did not load.
- `blank-renderer` — the page loaded but React never mounted; the
  captured renderer errors on the screen name the cause.
- `renderer-crashed` — the Chromium renderer process died.

## Notes for future work

- The preflight encodes the **Electron 33** bundle layout. Upgrading
  Electron means re-verifying the layout expectations in
  `runtime-preflight.cjs` against the new version before shipping.
- The old `entitlements.mac.plist` was removed: it was never passed to
  the packager (the build is unsigned), and entitlements only take effect
  with a Developer ID signature.
- `KS_DESKTOP_LIVE=1` explicitly selects the live site instead of the bundled
  renderer; `KS_DESKTOP_SYNC_PROXY=1` routes the sync host to a local
  `127.0.0.1:8787` worker; `KS_DESKTOP_API_URL` overrides the API base
  the preload bridge reports (HTTPS, or HTTP only on loopback, without URL
  credentials/query/fragment); `KS_DESKTOP_LOG` overrides the log path.

## Local synthetic acceptance tests

With the local Python API running on `127.0.0.1:8001`:

```sh
npm run build:renderer
npm run test:e2e
KS_E2E_APP=/Applications/KeyShield.app/Contents/MacOS/KeyShield npm run test:e2e
```

Tests create random `ks-e2e+…@example.invalid` accounts, use only the marked
FAKE sample envelopes copied from the acceptance fixtures into `e2e/keys.json`,
and never invoke a real provider. `KS_E2E_API` may select another loopback API.
Screenshots go to `~/shots/after-{source,installed}-*.png`; isolated profiles,
redacted logs and request audits go to `~/.local/state/keyshield-e2e/`.
Save tests are ordinary, independent tests: an unlocked save must succeed and
list the key with **every** audited save encrypted, while a fresh, locked email
session must visibly refuse the save and leave the real backend empty. They
fail (without `test.fail`) against a plaintext-first renderer. They print only
request shapes and backend item counts, not values. The unlocked fixture uses
a synthetic PRF credential, in-page passkey-options fixture, and loopback HTTP
sync-worker fixture; it invokes the real UI unlock and client crypto. Encrypted
PUTs reach the local worker fixture over real HTTP and appear in the desktop
audit. Python `/zk/enable`, list, and agent-token requests are not mocked.
Device-only saves must receive a 2xx from the loopback worker and appear as
device-vault cards; legacy server save routes are audited too. Tests also cover
same-provider keys, explicit reveal without diagnostic leakage, and placeholder
Developer snippets after minting a real local agent token. DNS resolution of
external hosts is disabled during Electron tests; bundled dashboard assets are
still served through the desktop's local protocol handler.
The three shared example surfaces are Developer, Docs & Troubleshooting, and
Agent session. Their displayed and copied examples use placeholders. Coverage
also includes first save into an empty vault, encrypted label/expiry persistence
across reload and unlock, and an all-request synthetic-key guard (URLs, bodies,
headers in memory plus every redacted audit record). Save + Call is explicitly
skipped: provider usage/consent is outside this pinned renderer and no external
provider calls are allowed. `KS_E2E_EVIDENCE=/existing/directory/results.txt`
appends redacted per-acceptance-case results, skip reasons and target totals;
it does not include error payloads or credential values.
These tests do not verify authenticator/worker authentication, and
ciphertext-shaped fields alone are not proof of encryption.

`KS_DESKTOP_REQUEST_AUDIT=/existing/directory/requests.jsonl` opts into a
mode-0600 HTTP(S) JSONL audit (off by default). Records contain only method,
redacted route path and field names, plus ciphertext/plaintext/FAKE-presence
booleans. No bodies, query strings, headers or request values are persisted.
`KS_DESKTOP_FORCE_PACKAGED=1`, `KS_DESKTOP_RENDERER_DIR`,
`KS_DESKTOP_FORCE_PREFLIGHT_FAILURE=1` and
`KS_DESKTOP_FORCE_INTERCEPT_FAILURE=1` expose failure cases for testing.
The last two flags only introduce failures, never bypass checks.
