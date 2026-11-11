# KeyShield Safari Extension (macOS / iOS wrapper)

Safari does not load unpacked `manifest.json` directly. You must wrap
`src/extension/` into an Xcode Safari Web Extension App.

## Prerequisites

- macOS with Xcode 15+
- Xcode command-line tools selected:
  `sudo xcode-select -s /Applications/Xcode.app`
- Xcode license accepted:
  `sudo xcodebuild -license accept`
- Apple Developer signing identity (free account works for local device runs)

## Build the Safari wrapper

From repo root:

```bash
npm run extension:build-safari
```

This generates:

- `src/extension/safari-wrapper/KeyShield/KeyShield.xcodeproj`

## Install / enable in Safari

1. Open the generated project:
   `open src/extension/safari-wrapper/KeyShield/KeyShield.xcodeproj`
2. In Xcode, set **Signing Team** for both targets:
   - KeyShield (app)
   - KeyShield Extension
3. Run the app target once.
4. Safari → **Settings** → **Extensions** → enable **KeyShield**.
5. For first-run website access prompts, choose **Allow on Every Website**
   (or per-site, if you prefer stricter behavior).

## Quick manual test (Safari + system-style API prompt)

1. Open `https://app.ks.aileena.xyz/?ext=1&demo=shop` and sign in.
2. Open a page containing an API-key-shaped value on a supported host.
3. Confirm KeyShield shows an in-page approval card with:
   - `Use once`
   - `Always allow`
   - `Not now`
4. Click **Use once**:
   - The detected key should save once and show saved status.
5. Trigger detection again on the same host and click **Always allow**:
   - Future detections on that host auto-save without re-prompting.

## Limitations

- Wrapper generation requires macOS + Xcode (`xcrun safari-web-extension-converter`).
- Re-run `npm run extension:build-safari` after changing files in
  `src/extension/`.
- iOS Safari testing requires the wrapped app installed on a device/simulator;
  enable extension in iOS Settings → Safari → Extensions.
- Signing/provisioning remains a local Xcode step and cannot be completed from
  Linux CI.
