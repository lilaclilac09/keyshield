# KeyShield desktop (Mac)

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
| `scripts/build-renderer.cjs` | Builds `src/web` and verifies the output is complete |
| `scripts/pack-mac.cjs` | Packs `KeyShield.app` (+ zip, and a DMG on macOS) |
| `Open-KeyShield.command` | Installs the unsigned app and clears quarantine |
| `OPEN-ME.txt` | Install instructions shipped in the zip |

## Build (on a Mac)

```sh
cd src/desktop
npm install
npm run pack        # builds the renderer, packs arm64 + x64, writes release/
```

Output lands in `release/`:

- `KeyShield-mac-arm64.zip` / `KeyShield-mac-x64.zip` — the installable app
  plus `Open-KeyShield.command`, `OPEN-ME.txt`, `BUILD-INFO.txt`
- `KeyShield.dmg` — macOS only; drag the app to `/Applications`
- `BUILD-INFO.txt` — Electron version, git commit, date, renderer asset
  count, preflight report for the build you just made

`npm run pack` on Linux produces the zips but no `.dmg` (a Linux-made
`.dmg` is not a launchable Mac app). `npm run verify` syntax-checks every
script in this folder.

## Install

1. Unzip the zip for your Mac.
2. **Right-click** `Open-KeyShield.command` → Open. (A plain double-click
   is refused for scripts from a downloaded zip; right-click shows the
   Open button.) The script clears quarantine, copies the app to
   `/Applications`, and opens it.
3. If that is blocked: `xattr -cr /Applications/KeyShield.app && open /Applications/KeyShield.app`

The app is unsigned (no Developer ID, no notarization). Once quarantine
is cleared it launches without any signing — the installer deliberately
does not ad-hoc sign with `--deep`, which is known to break Electron
bundles.

## How launch works

1. The pack script builds the `src/web` dashboard and bundles it as
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
The save test is dynamically expected to fail if the shared web renderer sends
plaintext first. It prints *all* observed save request shapes, not values;
ciphertext-shaped fields alone are not proof of encryption.

`KS_DESKTOP_REQUEST_AUDIT=/existing/directory/requests.jsonl` opts into a
mode-0600 HTTP(S) JSONL audit (off by default). Records contain only method,
redacted route path and field names, plus ciphertext/plaintext/FAKE-presence
booleans. No bodies, query strings, headers or request values are persisted.
`KS_DESKTOP_FORCE_PACKAGED=1`, `KS_DESKTOP_RENDERER_DIR`,
`KS_DESKTOP_FORCE_PREFLIGHT_FAILURE=1` and
`KS_DESKTOP_FORCE_INTERCEPT_FAILURE=1` expose failure cases for testing.
The last two flags only introduce failures, never bypass checks.
