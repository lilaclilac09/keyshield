# Safari wrapper (compilation only)

Requires macOS, Xcode and Node.js. The generator stages only runtime resources, then invokes Apple's converter. The shared origin policy produces the staged manifest. Generated output is not source: the default `src/extension/safari-wrapper/` is ignored, and external output must not be committed.

```sh
SAFARI_PROJECT_ROOT=/tmp/ks-safari bash src/scripts/build-safari.sh
xcodebuild -project /tmp/ks-safari/KeyShield/KeyShield.xcodeproj -scheme 'KeyShield (iOS)' -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/ks-safari/ios-build CODE_SIGNING_ALLOWED=NO build
xcodebuild -project /tmp/ks-safari/KeyShield/KeyShield.xcodeproj -scheme 'KeyShield (macOS)' -configuration Debug -destination 'platform=macOS' -derivedDataPath /tmp/ks-safari/mac-build CODE_SIGNING_ALLOWED=NO build
```

Rerun the generator after runtime changes. `SAFARI_APP_NAME`, `SAFARI_BUNDLE_ID`, and `SAFARI_PROJECT_ROOT` override naming/output. Build with a fresh output root for independent reproducibility; converter `--force` updates an existing wrapper.

Unsigned simulator/macOS compilation does not establish Safari runtime permission, injection, or fill behavior. Enabling an extension on a device requires normal Apple signing and user approval. This extension uses extension-only device-local storage; shared human/agent vault interoperability is UNVERIFIED. See [README.md](README.md) for the security boundary and storage format.
