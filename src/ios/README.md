# KeyShield native iOS tester

Native SwiftUI app, iOS 17+, with no third-party runtime dependencies.

## Regenerate the project

From the repository root:

```sh
brew install xcodegen
xcodegen --spec src/ios/project.yml
```

The generated project is checked in alongside `project.yml`. Regenerate after adding files.

## Run unit and UI tests

From the repository root, run both targets (replace the destination with your simulator if needed):

```sh
xcodebuild test -project src/ios/KeyShield.xcodeproj -scheme KeyShield \
  -destination 'id=EDD9B083-63F1-44E6-9A7B-0A6964CC2561' \
  CODE_SIGNING_ALLOWED=NO -resultBundlePath ~/ks-ui.xcresult
```

Use a new result-bundle path for each run. To run just one target, add
`-only-testing:KeyShieldTests` or `-only-testing:KeyShieldUITests`.

## Install the simulator tester

This zip contains a Release simulator app, not an IPA or a device-installable app.
On a Mac with Xcode and a booted iOS 17+ simulator, extract and install it:

An unsigned simulator build can launch onboarding but may fail to create a vault
because Keychain requires application-identifier/keychain-access-groups entitlements
(OSStatus -34018). It never falls back to an in-memory store in Release. Use Debug
UI tests for the isolated harness; a person must provision signing/entitlements
before checking the normal Keychain and real device-authentication flow.

```sh
mkdir -p ~/KeyShield-Simulator
ditto -x -k ~/KeyShield-iOS-Simulator.zip ~/KeyShield-Simulator
xcrun simctl install booted ~/KeyShield-Simulator/KeyShield.app
xcrun simctl launch booted xyz.aileena.keyshield.ios
```

To rebuild and package it from the repository root:

```sh
xcodebuild -project src/ios/KeyShield.xcodeproj -scheme KeyShield \
  -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ~/ks-dd \
  CODE_SIGNING_ALLOWED=NO build
ditto -c -k --keepParent ~/ks-dd/Build/Products/Release-iphonesimulator/KeyShield.app \
  ~/KeyShield-iOS-Simulator.zip
```

Only synthetic `FAKE_KEYSHIELD_NOT_A_KEY::` fixture envelopes can be stored. Provider calls are simulated in process for `api.provider.test` only; no URLSession or socket transport exists in the executor. All other hosts are refused. Agent results contain only status, outcome, byte count, and correlation ID, never provider bodies or headers. Human responses are redacted. No pasteboard observation or automatic import occurs.

Debug builds alone support `-UITestMode`: an isolated temporary vault, in-memory key and lockout stores, and a device-authentication stub. Each process starts empty. The simulation button is also compiled only in Debug. Release ignores that argument and contains none of the harness. Outside Debug test mode, unlock/approval uses LocalAuthentication device-owner authentication (Face ID or device passcode); the encryption key is device-only Keychain data. Session-code approval is disabled in the UI until secure out-of-band issuance exists; no code is generated or shown by the UI. Passkeys, cloud sync, phrase recovery, remote device revocation, and agent transport are explicitly unavailable.

Keep encrypted backups and their passphrases safe. Restore replaces entries after authentication and revokes in-memory agent sessions. Recovery screens explain the local-only limitations rather than promising companion-app capabilities.

## Needs a person

- Choose an Apple Developer team and configure signing/provisioning before installing on a physical device or distributing through TestFlight. An unsigned device build only checks compilation.
- Configure a real associated domain, entitlements, and the domain's Apple App Site Association file before implementing and enabling passkeys. The disabled passkey row does not provide authentication.
- Check real Face ID and device-passcode authentication on a signed physical-device build; the UI-test stub does not verify either.
- Deliberately review and lift the synthetic-only guard before real use: storage currently accepts only `FAKE_KEYSHIELD_NOT_A_KEY::` envelopes, and provider calls are in-process mocks for `api.provider.test` only. Do not import production credentials into this tester or silently remove either restriction. A real network transport would require a separate security review.
