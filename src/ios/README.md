# KeyShield native iOS tester

Native SwiftUI app, iOS 17+, with no third-party runtime dependencies.

## Private iPhone / TestFlight preparation

Version **0.1.0 (1)** uses bundle ID `xyz.aileena.keyshield.ios`. The checked-in
team is empty. Override `DEVELOPMENT_TEAM` with an `xcodebuild` command-line
setting or a local `-xcconfig` file; do not commit team credentials or signing
assets. The helper below maps the environment variable `TEAM_ID` to that setting.
Device Release uses automatic signing and **no additional entitlements** (no
associated domains, keychain sharing, or passkeys). Simulator entitlements remain
SDK-scoped and are not used on devices.

Unsigned local validation, with no account, provisioning updates, export or upload:

```sh
xcodebuild archive -project src/ios/KeyShield.xcodeproj -scheme KeyShield \
  -configuration Release -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  -archivePath /Users/devin/ks-testflight/KeyShield-unsigned.xcarchive
```

This archive is **not installable or distributable**. Signing-only steps remain:

1. In **Xcode → Settings → Accounts**, sign in to the intended Apple Developer
   Program account. Select the authorized team and allow Xcode to manage its
   signing certificates/profiles. Nothing should be entered into source files.
2. Confirm this bundle ID is available for that team, create the App Store Connect
   app record, and review export compliance, app privacy, and internal tester access.
   Increase `CURRENT_PROJECT_VERSION` before each subsequent uploaded build.
3. From the repository root, create a signed archive **without uploading**:

   ```sh
   TEAM_ID=YOUR_TEAM_ID src/ios/scripts/archive-testflight.sh --archive-only
   ```

   Replace `YOUR_TEAM_ID` with the team's 10-character ID locally. The helper
   defaults to archive-only; it uses `-allowProvisioningUpdates` and may contact
   Apple. `ARCHIVE_PATH` and `EXPORT_PATH` can override output locations; otherwise
   outputs go under `~/ks-testflight/` with a timestamped archive name.
4. **Only after explicit upload authorization**, the following builds a new signed
   archive and invokes `-exportArchive` with `destination=upload`. It **uploads**;
   do not run it during unsigned preparation:

   ```sh
   TEAM_ID=YOUR_TEAM_ID src/ios/scripts/archive-testflight.sh --upload
   ```

   `ExportOptions-TestFlight.plist` uses `app-store-connect`, automatic signing,
   a placeholder team ID, and `testFlightInternalTestingOnly=true`. The helper
   substitutes the team in a temporary private copy, never the tracked template.
   Distribution is **internal testers only**, not external testing or App Store
   release. Wait for processing, resolve Apple's validation/compliance questions,
   and explicitly assign the build to authorized internal testers.

Device Release does not set `SIMULATOR_APPROVAL_DEMO`; every demo integration also
requires `targetEnvironment(simulator)`. `-UITestMode` is compiled only under
`DEBUG`. The production save/rotate synthetic-fixture guards remain enabled:
**real credentials/providers, external agents, live payments, and passkeys remain
unavailable on an iPhone**. No physical-device, Secure Enclave, signing, Apple
validation or TestFlight-delivery claims follow from an unsigned archive or
Simulator test. Verify device-owner authentication and persistence on the intended
iPhone after signing, using disposable synthetic data only.

`ITSAppUsesNonExemptEncryption` is intentionally **unset**. The archive/export
helper does not supply an answer: the account holder must answer App Store
Connect's encryption questionnaire. See [EXPORT_COMPLIANCE.md](EXPORT_COMPLIANCE.md)
for the CryptoKit, CommonCrypto, Security and LocalAuthentication inventory,
Apple's guidance, and the classification questions to confirm. Encryption for
local data protection may still count; this project makes no exemption declaration.
Face ID, launch screen, and iPhone/iPad orientations are explicit. No
`LSApplicationQueriesSchemes` are needed: the app does not call `canOpenURL` to
query other apps.

`PrivacyInfo.xcprivacy` declares only the required-reason API actually used:
UserDefaults **CA92.1**, reading/writing this app's own approval state. Entry/audit
dates use `Date`, not filesystem timestamp APIs; the source does not read file
timestamps, boot time, disk capacity or keyboard dictionaries, so those categories
are not declared. Data stays on device except for user-directed encrypted backup
sharing; there is no tracking or developer-side data collection. Reassess the
manifest and App Store privacy answers if a real transport or SDK is added.

`Assets.xcassets/AppIcon.appiconset` includes all iPhone/iPad slots and an opaque
1024px App Store icon. Regenerate the simple shield/keyhole artwork on macOS with
`swift src/ios/scripts/generate-app-icon.swift`, then run XcodeGen. Test the archive
helper's safety gates with `python3 src/ios/scripts/test-archive-testflight.py`;
these tests substitute a local fake `xcodebuild` and never sign or upload.

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
Keychain access group; no Apple Developer team is needed for the simulator. These
simulator signing settings are never applied to a device build. Do not rebuild this tester with
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
