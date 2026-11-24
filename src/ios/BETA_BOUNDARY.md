# Device Release beta boundary

Scope: PR [#166](https://github.com/lilaclilac09/keyshield/pull/166), branch
`devin/1795157042-ios-testflight-prep`. Product/configuration sources are unchanged
from `42cb210a399cab77b70970656ffbd4dfa09e07f2`, the source of the existing unsigned
device Release archive. This change adds tests, a read-only binary checker and
this evidence map; it does not change product behavior.

## Meaning of the boundary

Credential **values** must start with the exact `FAKE_KEYSHIELD_NOT_A_KEY::` marker
and pass `KeyDetector`. Recognition of a provider-shaped string alone is not
permission to store it. The marker is a fixture convention, **not** proof that a
marked value cannot contain a real credential. Arbitrary labels and backup
passphrases are not marker-gated: labels are metadata, while passphrases are
transient KDF input, not imported API credentials. Do not treat this as general
secret detection/DLP for arbitrary user text or as protection against a compromised
device, a stolen vault key, or modified application code.

Tests use empty values, `not-a-real-sk-negative-0001`, short lookalikes, full-length
generated shapes for every recognized provider family (OpenAI, Anthropic, Stripe
test/live-like, GitHub, AWS access/secret, Solana and Bearer), and a single-colon
marker lookalike.
They are non-secret negative fixtures. File-byte/key equality is asserted as a
boolean to avoid logging values or vault keys on failure. Backup fixtures are
constructed **in memory** with independently encoded envelopes, PBKDF2-HMAC-SHA256
and AES-GCM, not by changing production validation or persisting a bad source
vault. Synthetic and empty positive controls verify the fixture encoding.

## Input matrix

All test names below are in `KeyShieldTests/CoreTests.swift` unless qualified.
“Verified” identifies the assertion/evidence, not a claim that an OS UI was driven.

| Path | Verified (test / evidence) | Inferred only | Gap / limit |
| --- | --- | --- | --- |
| Onboarding create / cancel | Existing `testExplicitCreationAndCiphertext`; prior [PR #161 journey](https://github.com/lilaclilac09/keyshield/pull/161/files) (`KeyShieldE2EJourneyTests`) | `RootView` confirmation calls `AppModel.create` → `createVault`, which creates an empty encrypted store | No new OS UI run; no credential input here |
| Vault SecureField and explicit Paste → Save | `testBetaImportRejectsUnmarkedValuesWithoutWrites`; existing `testEveryKeyFixtureAndNegative`, `testSyntheticOnlyStorageAndEmptyErrors` | `VaultViews.swift`: keyboard and explicit `UIPasteboard.general.string` feed the same value; UI disables Save without the marker; `AppModel.save` delegates to unconditional `VaultStore.save` guard | Negative OS paste/keyboard UI not driven; label is ordinary metadata, not marker-gated |
| Duplicate reject, Replace and Keep both | `testBetaDuplicateResolutionsRejectUnmarkedValuesWithoutWrites`: all three modes preserve files, key, entries and existing session; existing `testDuplicatesReplaceKeepBothAndRotate`, `testReplacePreservesSeparateLabelAndValueMatches` cover successful and ambiguous matches | All dialog actions re-enter the same guarded `save`; ambiguous matches offer Keep both or Cancel, not a separate writer | No new dialog UI run |
| Rotate shared editor / Paste | `testBetaRotateRejectsUnmarkedValuesWithoutWrites`: target/control metadata, ciphertext files, key and session unchanged; prior PR #161 journey covers valid rotation | `KeyEditorView(rotating:)` → `AppModel.rotate` → unconditional `VaultStore.rotate` guard | No new UI cancellation/authentication check |
| Restore selected document or last exported backup | `testBetaRestoreRejectsNonSyntheticPayloadWithoutWrites`, `testBetaEmptyVaultRestoreRejectsNonSyntheticPayloadWithoutWrites`; single bad entry and mixed valid/bad payloads in both orders; files/key unchanged, existing session preserved | `BackupView` selects a URL only; Confirm → `AppModel.restore` opens security scope, reads Data, calls `BackupService.restore`; validation completes before commit/key save/session revocation | Core verified, OS `.fileImporter(.data)` and file-provider delivery not driven; relies on system picker returning file URLs |
| Wrong/empty passphrase, corrupt and empty backup | Existing `testBackupRoundTripWrongPasswordCorruptionAndEmpty`; `testBetaConstructedBackupAcceptsSyntheticAndEmptyPayloads` positive controls | Passphrase controls are shared between export/restore; failure is caught in `BackupView` | New tests do not type passphrases or verify the displayed error text; passphrase is not an API-key import |
| Missing device key / migrated vault recovery | `testBetaMissingKeyRecoveryRejectsNonSyntheticPayloadWithoutWrites`: no key saved, no unreadable-log archive, no file change; existing `testRestoreRecoversMigratedVaultWithoutDeviceKey`, `testRecoveryArchiveFailurePreservesMissingKeyAndCanBeRetried` cover valid recovery and storage failure | Same restore service, no alternative phrase/private-key importer | Settings is reached after unlock even if refresh fails; no physical Keychain migration test |
| Core restore before vault creation | `testBetaFreshRecoveryRejectsNonSyntheticPayloadWithoutWrites`: no directory or key created | Defense-in-depth core entry point; onboarding itself exposes only Create, not Restore | Not presented as an additional current onboarding UI feature |
| Recovery information / lost-device help / passkey | Source: `RecoveryInfoView` is informational; Settings passkey button is disabled | No recovery-phrase, separate wallet/private-key recovery, passkey registration or account-login form exists in this target; the generic Vault editor still recognizes marked synthetic key shapes | No recovery-phrase functionality claim |
| Custom URL, universal link, document-open, user-activity or web-content input | Static checker verifies no URL/document/activity registrations; source search finds no `onOpenURL`, user-activity handler, web view or URL-opening action; device entitlements remain empty in `project.yml` | No application delegate/scene URL dispatch or associated-domain capability; only the explicit document picker above | Source/bundle audit, not hostile OS dispatch testing |
| Existing encrypted app-container vault / Keychain at launch | Existing encryption/lock tests; source `AppModel.init` → local `ApplicationSupportLocation`, `KeychainVaultKeyStore`, `records` | Existing stored data is trusted to have come through guarded writers; `commit` is a low-level internal primitive called only by create/save/rotate/delete/validated restore | Reads do not revalidate every value's marker; not a tampered/legacy-data migration sanitizer |
| LocalAuthentication, approval decisions, delete, lock, revoke, navigation and payment filters | Existing `testDeviceOnlyApprovalIssuesNoCodeAndRemainsSingleUse`, `testBiometricsMismatchExpiryReplayAndDenial`, `testLockedIdleAndBackground`, `testRotateDeleteRevokeSessions`; `DemoPaymentsTests` | These accept decisions/selections, not credential values; session-code input/Debug request buttons are absent in device Release | Unit authorization uses test doubles, not physical Face ID |
| External-agent/provider ingress, Debug/test modes, optional simulator demo | Static checker confirms absent `UITestMode`, simulator-demo and Debug simulation strings; source gates `#if DEBUG` and `SIMULATOR_APPROVAL_DEMO && targetEnvironment(simulator)` | No listener or external agent transport is wired; pending requests can only be created by excluded demo/Debug producers | Core executor/session APIs remain compiled and are tested defensively below; they are not enabled external endpoints |

All production `commit` callers were text-inspected. Delete cannot introduce a
new value; create writes an empty array; save/rotate guard before mutation;
restore validates every decrypted entry before any persistent write. Low-level
test access via `@testable` is not an exposed import route.

## Outbound matrix

| Path / destination | Verified (test / evidence) | Inferred only | Gap / limit |
| --- | --- | --- | --- |
| Human/agent provider executor → `MockProviderTransport` | `testBetaDisallowedOriginsNeverReachInProcessTransport`: `https://evil.test`, `http://127.0.0.1`, `https://api.openai.com` origins plus scheme/port/user-info/suffix variants never invoke the handler; human and agent entry points covered; exact `.denied` error and unchanged files distinguish pre-transport rejection from mapped `.network` transport failures; `testBetaDefaultProviderTransportIsInProcess` checks the default response | Executor stores a concrete `MockProviderTransport`, not a URLSession abstraction; exact HTTPS host `api.provider.test`, no port/credentials/query/fragment | Spy handler is the requested equivalent **in-process stub**, not a real HTTP server. Tests broaden session policy for evil/loopback so origin rejection cannot be credited only to the session allowlist |
| Mock allowlisted positive control | Same test sends an approved `api.provider.test` request and observes exactly one handler call and 204; existing `testProviderRefusesEveryNonMockHostBeforeTransport` checks default mock success | No DNS, socket, retry or live provider call | Default Policy lists real provider names, but this does not enable them through the harder executor/transport mock gate |
| Reflections, redirects and failures | Existing `testProviderReflectionIsHumanRedactedAndAgentMetadataOnly`, `testProviderRedirectStatusRejected`, `testMockProviderFailureDoesNotRetry`, `testCopyAndProviderAuditOnlyTheirFinalOutcomeOnce` | Redirect Location headers are not followed; agent result is metadata-only | In-process behavior, not live provider integration |
| URLSession/dataTask, NWConnection/Network, sockets | `scripts/check-device-beta-boundary.py`: `nm -u`, `otool -ov`, `strings -a` on device binary and native-source scan | No real session/connection API use found in source; no third-party runtime dependency bundled | Absence of symbols/selectors/strings is corroboration, not a formal proof against dynamic obfuscation or OS-framework internal networking |
| Docs/Developer URLs and examples | Existing `ProxyExampleTests.testEveryExampleUsesOnlyTheAgentPlaceholderWithTheReferenceProxy`; source audit: internal `NavigationLink`, no `Link`/`openURL`, web view or JavaScript engine | `https://keyshield.example/vproxy` is copied/displayed example text; curl/requests/fetch snippets are never executed by the app | User can run copied examples elsewhere; outside native app transport boundary |
| Payments endpoints / facilitator | Existing `DemoPaymentsTests.testStaticLedgerDecodesOnlySyntheticReceiptsAndProofs`, `testRejectsMalformedAndNonSyntheticFixtures`, `testPureDecodingAndGroupingTouchNoTransport` | `api.mpp-provider.test`, `research.provider.test`, `facilitator.provider.test` are embedded display data, not contacted | No wallet signing, payment execution or real account |
| Approved Copy / displayed Reveal | Existing `testClipboardExpiryAndUserTextPreserved`, `testClipboardFailure`, `testSingleUseSecretAuthorizationAndMismatch`; prior PR #161 journey covers normal UI | Copy writes through `SystemPasteboard` with local-only/expiry options; Reveal is local UI; Developer Copy writes only placeholder example text | Clipboard is an intentional user-approved outbound surface; other local apps/user actions are not confined by provider host policy. No new OS clipboard/UI test |
| Backup ShareLink → user-selected OS share destination | Existing backup round-trip/ciphertext tests; source `exportBackup` writes encrypted `.ksbackup` locally before presenting ShareLink | OS may offer Files, AirDrop, Mail, Messages or third-party/cloud providers; destination is chosen by the user, not a provider-transport allowlist | No share sheet exercised; cancellation/external handoff unverified. This is not a no-egress sandbox |
| Activity ShareLink → user-selected OS share destination | Existing `testAuditEncryptedAppendAndFailure`, result-redaction tests; source `exportActivity` JSON-encodes typed audit events (IDs/times/actions/outcomes, not values/tokens) | Export file is metadata JSON with OS file protection, not a portable AES-encrypted activity archive | OS share destinations unrestricted by provider policy; sharing UI unverified |
| URL-capable Foundation file I/O (`Data(contentsOf:)`) | Source audit: vault/audit reads use app-container file URLs; restore uses the selected document or locally exported backup URL | Current UI supplies only file URLs, not entered/network URLs; no other caller of `AppModel.restore(URL, ...)` | That internal URL wrapper does not explicitly check `isFileURL`; the OS picker/file-URL provenance is assumed, not a hostile-provider or arbitrary-URL unit proof |
| Local vault, Keychain, audit, backup/activity files and approval defaults | Source `Cipher.write`, `KeychainVaultKeyStore`, `DefaultsApprovalStateStore`; existing storage/encryption/lockout tests | Local persistence, not native app cloud sync or a transport | OS backup/iCloud/device services are outside this app-level unit/static audit; no claim that the OS never networks |

## Reproduction (shell/headless only)

Use a fresh disposable simulator ID; never open Simulator.app or Xcode:

```sh
xcrun simctl create KeyShield-BetaBoundary-Headless \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-26-5
xcodebuild test -project src/ios/KeyShield.xcodeproj -scheme KeyShield \
  -configuration Release -destination 'id=<fresh-udid>' \
  -parallel-testing-enabled NO -collect-test-diagnostics never \
  CODE_SIGNING_ALLOWED=NO ENABLE_TESTABILITY=YES -only-testing:KeyShieldTests \
  -derivedDataPath /Users/devin/ks-testflight/BetaBoundaryDerivedData \
  -resultBundlePath /Users/devin/ks-testflight/BetaBoundaryUnitTests.xcresult
python3 src/ios/scripts/test-archive-testflight.py
python3 src/ios/scripts/check-device-beta-boundary.py \
  /Users/devin/ks-testflight/KeyShield-unsigned.xcarchive
```

Release unit testing enables internal test visibility, **not** `DEBUG`, app test
mode, the simulator approval demo or an authentication bypass. The unconditional
core guards are the same source compiled for the device; simulator OS behavior
is not physical-device evidence. No XCUITest, secret typing, UI action, account,
provider call, signing or upload is part of these checks.

## Graph and source-audit limits

Bound repository/worktree: `keyshield` (`/Users/devin/repos/keyshield`), refreshed
at `42cb210a399cab77b70970656ffbd4dfa09e07f2` before this edit. Graph contexts for
`VaultStore`, `BackupService`, `ProviderRequestExecutor` and `CoreTests` resolve;
their dispatch/caller bodies were confirmed with `rg` and source reads. Concept
query returned no flows with the known **FTS disabled** warning, so it was not
used as evidence of absence. Test-class upstream impact is **HIGH**, with 18
IMPORTS edges and no affected process records; source/target inspection shows
the edited file is test-only, despite broad graph import associations. This is
not full call-graph clearance.

Repeat the source inventory with:

```sh
rg -n 'TextField|SecureField|UIPasteboard|fileImporter|ShareLink|restore\(|save\(|rotate\(|commit\(' src/ios/KeyShield
rg -n 'URLSession|NSURLSession|NWConnection|import Network|openURL|onOpenURL|onContinueUserActivity|\bLink\s*\(|https?://' src/ios/KeyShield
```
