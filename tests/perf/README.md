# Local dashboard before/after journey

This harness uses only local real API/worker services and synthetic email accounts,
passkeys and keys. It never presses **Call**, **Save + Call**, or payment controls.
Browser requests outside loopback are blocked; the Python API has a socket/DNS
loopback-only guard. No HARs/traces/storage exports or service logs are generated.
App-owned local test databases naturally contain synthetic session state; do not
commit or share them. Only numeric request metadata is retained in results.
Recording-only CSS masks even the truncated session-token preview on BEFORE's
Home card as `[REDACTED]`, without changing its layout or app behavior.

## One-time setup (from repository root)

Node 24, Python 3 with venv support, and ffmpeg are required. Ports 5173, 8001,
and 8787 must be free. Root npm lockfile is currently out of sync; use the command
below without changing it. Both UIs use the **same installed dependencies**.

```sh
git fetch origin
git worktree add ../keyshield-before 9c0070ca31a3c4ad3f27ba1046febb4a6e2b1116
git worktree add ../keyshield-after adb3334823f51076105a9bfdb19042c4b867493b
npm install --package-lock=false --ignore-scripts --no-audit --no-fund
ln -s "$PWD/node_modules" ../keyshield-before/node_modules
ln -s "$PWD/node_modules" ../keyshield-after/node_modules
python3 -m venv /home/ubuntu/perf-venv
/home/ubuntu/perf-venv/bin/pip install -r src/backend/requirements.txt
npx playwright install chromium
(cd ../keyshield-before && npm run build:vite --workspace=keyshield-web-v2)
(cd ../keyshield-after && npm run build:vite --workspace=keyshield-web-v2)
```

`build:vite` produces production bundles. `build:web` currently fails existing
TypeScript BufferSource errors on **both** measured revisions; no source fixes
are made by this benchmark. Neither measured source tree is modified by the harness.
Vite updates ignored/tracked dist artifacts during the explicit setup build.

## Run

```sh
node --test tests/perf/metrics.test.mjs
/home/ubuntu/perf-venv/bin/python tests/perf/offline-api.test.py
PW_USE_EXTERNAL_SERVER=1 PERF_OUT=/home/ubuntu/perf-out \
  node tests/perf/dashboard-journey.mjs
```

The script starts/stops preview, backend and worker itself. Five fresh runs per
revision execute strictly B,A,B,A,…; worker/API binaries always come from BEFORE.
Each run uses a new Chromium process/profile and a fresh state directory.
The backend is extracted with `git archive` into each run's state directory:
several modules ignore `KS_DATA_DIR` and use source-relative database paths, so
environment overrides alone do not provide isolation. No DB files are tracked
in that backend snapshot. This uses unchanged backend code, not mocked routes.
Reusing an existing run state directory **fails**, rather than silently using warm state.
To repeat, use a new `PERF_OUT` directory (do not delete evidence to rerun).
Optional overrides: `PERF_BEFORE`, `PERF_AFTER` (worktree paths), `PERF_PYTHON`,
`PERF_ITERATIONS` (keep ≥5 for comparison), `PERF_OUT`.

Outputs: `results.json`, `results.md`, all run videos/screenshots and local test
state, plus median-total representative `before.webm`, `after.webm`, `before.mp4`,
`after.mp4`, `before.png`, `after.png`. Results/videos/state must stay uncommitted.
No HARs are produced. Errors are fail-fast; already completed runs remain in JSON.

## Journey and interpretation

Both journeys use visible button names and placeholders. Email signup works on
both when **explicitly enrolling** a PRF passkey, rather than directly unlocking
without one. Passkey-only signup was probed and its credential did not return PRF.

* BEFORE: signup → Home → sidebar Vault → Add Secret → fill fake key → Save
  Secret (locked-vault gate) → Unlock or create device vault → Enroll passkey →
  Save Secret again → listed.
* AFTER: signup → Home → Open or create vault → Unlock or create device vault →
  Enroll passkey → Add Secret → fill fake key → Save Secret → listed.

AFTER exposes setup without a failed save; BEFORE does not. The key must be
entered earlier in BEFORE, so compare totals as well as per-step attribution.
Enrollment is done only by the app's WebAuthn UI; no token/storage seeding or
API stubbing. Passkey confirmations are simulated by a fresh CDP authenticator,
reported separately from clicks/fields/navigation; add them for a gesture total.
The automation has no human think time or OS biometric prompt delay.

Wall time ends at the asserted visible done-state. Page-load DCL/load use
Navigation Timing; LCP is the buffered initial candidate before first input.
Network bytes/counts are attributed to requests **started** in each step;
summed request time clips all overlapping intervals to the step. `busyMs` is
their union. `criticalPathMs` is an **observed network-span proxy** (first start
to last completion, clipped to the step), not a proven causal dependency path.
Encoded transfer bytes are CDP loadingFinished values, not decoded resource size.
JS transfer bytes include scripts over the entire journey. Blocked/failed requests
are counted with zero bytes. Browser cache is cold; server/OS file cache is not
flushed. Runs alternate to reduce ordering bias.

Every metric reports median and min/max independently. A median difference
within the larger observed run-to-run range, or overlapping ranges, is called
**no measurable improvement**. Five samples cannot establish statistical causality.
