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

The Release simulator app is ad-hoc signed with Xcode's **Sign to Run Locally**
identity (`-`). Simulator-only entitlements provide an application identifier and
Keychain access group; no Apple Developer team is needed for the simulator. Device
signing settings are unchanged. Do not rebuild this tester with
`CODE_SIGNING_ALLOWED=NO`: the previous unsigned archive lacked these entitlements
and Keychain vault creation failed with OSStatus -34018. Release never substitutes
an in-memory key store or authentication stub.

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
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO build
ditto -c -k --keepParent ~/ks-dd/Build/Products/Release-iphonesimulator/KeyShield.app \
  ~/KeyShield-iOS-Simulator.zip
```

For a clean install, create a fresh simulator rather than reusing a previous
vault. Launch normally, confirm **Create vault**, then import and save a synthetic
fixture using **Add key**, for example
`FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`.
Terminate and relaunch the app: it must start locked
with the saved vault still present. Unlock and each reveal require device-owner
authentication. On the simulator, enroll Face ID under **Features > Face ID >
Enrolled**, allow the app's Face ID permission, and choose **Matching Face** while
each authentication prompt is visible. Enrollment and matching can also be sent
headlessly (replace `booted` with the simulator UDID when several are running):

```sh
xcrun simctl spawn booted notifyutil \
  -s com.apple.BiometricKit.enrollmentChanged 1 \
  -p com.apple.BiometricKit.enrollmentChanged
# Run once for the unlock prompt, and again for the reveal approval prompt:
xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit_Sim.pearl.match
```

These simulator events exercise the normal LocalAuthentication path; they do not
verify physical Face ID or Secure Enclave behavior. No test launch arguments are
needed. The Release-only UI smoke test
`testReleaseSignedZipPersistsVaultAndRequiresFaceID` expects a fresh simulator with
Face ID enrolled and supplies matching-face events from the test runner, not the
app. When checking a packaged artifact, point the generated `.xctestrun` file's
`UITargetAppPath` and app dependency at the app extracted from that exact zip and
use `xcodebuild test-without-building`; do not silently reinstall a different
build. The usual Debug tests still use their isolated harness.

## Simulator-only per-use approval demo

Build the separate tester scheme; the ordinary Release and all device builds
exclude the demo:

```sh
xcodebuild -project src/ios/KeyShield.xcodeproj -scheme KeyShieldSimulatorTester \
  -configuration SimulatorRelease -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ~/ks-demo-dd build
ditto -c -k --keepParent ~/ks-demo-dd/Build/Products/SimulatorRelease-iphonesimulator/KeyShield.app \
  ~/KeyShield-iOS-Simulator-Approval-Demo.zip
```

Install this zip using the commands above, substituting its name. Create or
unlock the vault and go to **Agents → Enable demo and prepare fixture**. This
saves one fixed synthetic entry without replacing any existing entry. Choose
**Request mock operation** to review the named agent, entry and fixed
`POST api.provider.test/v1/mock` operation. To approve, tap **Approve with Face ID
/ passcode** and complete the OS prompt using the steps above. The app sends only
`Approved` to the in-process agent; Deny or cancel sends nothing. Request again
to see a fresh OS prompt. This mock does not use the network, issue a token, or
write to the clipboard. Locking the vault turns the demo off.

To run the UI test on a fresh, Face ID–enrolled simulator, use
`-scheme KeyShieldSimulatorTester -configuration SimulatorRelease
-only-testing:KeyShieldUITests/KeyShieldUITests/testSimulatorDemoRequiresFreshFaceIDAndSendsNoReceiptOnDeny`
with the `xcodebuild test` command above, without `CODE_SIGNING_ALLOWED=NO`.

Only synthetic `FAKE_KEYSHIELD_NOT_A_KEY::` fixture envelopes can be stored. Provider calls are simulated in process for `api.provider.test` only; no URLSession or socket transport exists in the executor. All other hosts are refused. Agent results contain only status, outcome, byte count, and correlation ID, never provider bodies or headers. Human responses are redacted. No pasteboard observation or automatic import occurs.

Debug builds alone support `-UITestMode`: an isolated temporary vault, in-memory key and lockout stores, and a device-authentication stub. Each process starts empty. The original agent-token simulation button is also compiled only in Debug. Release ignores that argument and contains none of the harness. Outside Debug test mode, unlock/approval uses LocalAuthentication device-owner authentication (Face ID or device passcode); the encryption key is device-only Keychain data. Session-code approval is disabled in the UI until secure out-of-band issuance exists; no code is generated or shown by the UI. Passkeys, cloud sync, phrase recovery, remote device revocation, and agent transport are explicitly unavailable.

Keep encrypted backups and their passphrases safe. Restore replaces entries after authentication and revokes in-memory agent sessions. Recovery screens explain the local-only limitations rather than promising companion-app capabilities.

## Payments demo ledger

Home → **Payments** opens a read-only ledger, not another tab. It starts empty and
truthfully records no payments. **Show demo receipts** opts into bundled Swift
JSON examples, grouped Human / Agent then full `DEMO_` wallet, with MPP and x402
receipt details. Every example is marked DEMO, uses `.test` hosts and fictional
`DEMO_USDC`, and disappears when the toggle is off or the screen is recreated.
Nothing is written to the vault or audit log; there is no payment transport.

The separate signed simulator artifact is `KeyShield-iOS-Simulator-Payments.zip`;
install it using the same instructions above. The original simulator zip is not
replaced. Debug unit/UI tests cover validation, the empty default, opt-in,
receipt detail, and opt-out. `testReleasePaymentsZipSmoke` exercises that flow
without flags on a fresh simulator; point its runner's `UITargetAppPath` and
matching dependent product path at the extracted zip, not a rebuilt app.

Web features still absent natively include live account/payment history,
billing and usage totals, wallet connections/signing, MPP open/meter/capture/close/
withdraw, top-ups and purchases, x402 probes/auto-pay, explorer navigation, and
receipt download/print. No native screen offers pay, retry, top-up, or connect.

## Needs a person

- Choose an Apple Developer team and configure signing/provisioning before installing on a physical device or distributing through TestFlight. An unsigned device build only checks compilation.
- Configure a real associated domain, entitlements, and the domain's Apple App Site Association file before implementing and enabling passkeys. The disabled passkey row does not provide authentication.
- Check real Face ID and device-passcode authentication on a signed physical-device build; the UI-test stub does not verify either.
- Deliberately review and lift the synthetic-only guard before real use: storage currently accepts only `FAKE_KEYSHIELD_NOT_A_KEY::` envelopes, and provider calls are in-process mocks for `api.provider.test` only. Do not import production credentials into this tester or silently remove either restriction. A real network transport would require a separate security review.
