# Encryption export-compliance review

**Account-holder decision required.** `ITSAppUsesNonExemptEncryption` is
intentionally absent from `KeyShield/Info.plist`; neither the archive script nor
the export-options template supplies it. App Store Connect must ask the account
holder its encryption questions. This inventory is engineering evidence, not a
legal classification, an exemption declaration, or permission to upload.

Reviewed **2026-11-20** for the native `KeyShield` iOS target and its bundled code
and resources. Simulator/Debug-only and currently UI-unavailable core paths are
listed separately rather than treated as device Release behavior. Other repository
products (web, React Native, Python/Rust services and SDKs) are not bundled into
this target and are outside this inventory.

## Crypto inventory

Paths below are relative to `src/ios/KeyShield/`. All cryptographic algorithms
identified here are implemented by Apple OS frameworks, not by a bundled
third-party cryptography implementation. KeyShield's wrappers, file formats and
operation/session policies are application code; using standard algorithms or OS
APIs does **not by itself decide** their export classification.

| Use and source symbols | Purpose / parameters | Apple OS-provided? / scope |
| --- | --- | --- |
| `Core/Primitives.swift`: `Cipher.seal`, `Cipher.open`, `AES.GCM`, `SymmetricKey`; callers in `Core/VaultStore.swift` (`createVault`, `records`, `commit`, `save`, `rotate`, secret accessors) | AES-256-GCM authenticated encryption/decryption. A 32-byte vault key protects each stored value and the serialized vault records/metadata. CryptoKit supplies nonces and the combined nonce/ciphertext/tag representation. | **Yes — CryptoKit.** App code selects keys, serializes data and invokes the API. Device Release functionality. |
| `Core/AuditLog.swift`: `append`, `events` using `Cipher` | AES-GCM encryption/authentication of each serialized audit event using the vault key; encrypted records are Base64-encoded for line storage. This is not a separate signature or hash-chain algorithm. | **Yes — CryptoKit** via the app's `Cipher` wrapper. Device Release. |
| `Core/BackupService.swift`: `derive`, `CCKeyDerivationPBKDF`, `kCCPBKDF2`, `kCCPRFHmacAlgSHA256` | Password-derived backup key: PBKDF2-HMAC-SHA256, 200,000 iterations, random 16-byte salt, 32-byte derived key. HMAC-SHA256 is used inside this OS KDF, not a separately implemented app HMAC. | **Yes — CommonCrypto.** This is additional crypto beyond CryptoKit; the prior description of the app as using only CryptoKit was incomplete. Device Release. |
| `Core/BackupService.swift`: `export`, `restore` using `Cipher`; `AppModel.swift`: `exportBackup`, `restore` | AES-256-GCM protects the portable backup payload with the derived key. Restore authenticates/decrypts it and re-encrypts imported records with the destination vault key, generating a new vault key if missing. The backup envelope includes the salt and ciphertext. | **Yes — CryptoKit and CommonCrypto**, with application serialization/orchestration. Device Release. |
| `Core/VaultStore.swift`: `fingerprint`, `SHA256.hash` | SHA-256 of an entry value; the first 8 digest bytes form the displayed 16-hex-character fingerprint used in entry metadata. Not encryption and not a digital signature, but still included in the inventory. | **Yes — CryptoKit.** Device Release. |
| `Core/Primitives.swift`: `SecureRandom.bytes`, `SecRandomCopyBytes(kSecRandomDefault, ...)` | OS cryptographic randomness for 32-byte vault keys, 16-byte backup salts and 32-byte session-token material. AES-GCM nonce generation is handled separately by CryptoKit. | **Yes — Security.** Device Release vault/backup paths; session issuance is described below. |
| `Core/Primitives.swift`: `SecureRandom.code`; `Core/ApprovalCenter.swift`: `begin`; `Core/AgentSessions.swift`: `issue` | Rejection-sampled six-digit session approval codes and Base64URL-encoded random session tokens. Approval/session bindings and expiry are application policy, not a custom cipher. | **Yes — Security** for random material. Core implementations are in the target, but production UI does not issue session codes/tokens; Debug simulation can exercise token issuance. Do not infer an active external-agent channel from these symbols. |
| `Core/Primitives.swift`: `KeychainVaultKeyStore`, `SecItemAdd`, `SecItemCopyMatching`, `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | Store/read the vault encryption key as a generic-password Keychain item, available when the device is unlocked and not migratable to another device. | **Yes — Security / system Keychain.** No custom Keychain crypto, keychain-sharing entitlement, explicit Secure Enclave key generation or app-defined asymmetric key pair. Device Release. |
| `Core/Primitives.swift`: `Cipher.write`, `Data.write(options: [.atomic, .completeFileProtection])`; callers in vault/audit/backup and `AppModel.exportActivity` | OS file data protection for vault/audit/backup and exported activity files. `Cipher.write` itself does **not** AES-encrypt its input: vault/audit/backup callers encrypt first; activity export writes metadata JSON protected by the OS file-protection class, not an AES-encrypted portable activity archive. | **Yes — Foundation / iOS Data Protection.** Device Release. This protection can still be relevant to the encryption questionnaire. |
| `AppModel.swift`: `unlock`; `Core/ApprovalCenter.swift`: `DeviceBiometricAuthorizer.approve`, `LAContext.evaluatePolicy(.deviceOwnerAuthentication, ...)` | Device-owner authentication for vault unlock and operation approvals (Face ID or device passcode). Authentication gates access; the app does not implement biometric matching, handle biometric templates or derive the vault key from biometric data. | **Yes — LocalAuthentication.** Device Release; OS implementation details are not an app-implemented cryptographic algorithm or a physical-device verification claim. |
| `SimulatorApprovalDemo.swift`: `SHA256.hash` | Same truncated SHA-256 fingerprint for the optional synthetic agent-demo fixture. | **Yes — CryptoKit**, but the entire file requires `SIMULATOR_APPROVAL_DEMO && targetEnvironment(simulator)` and is excluded from device Release. Debug test-mode key/authentication stores are in-memory/stubbed and introduce no additional crypto algorithm. |

### Bundled-code / dependency check

- Searched native source for `CryptoKit`, `CommonCrypto`, `Security`, `PBKDF2`,
  `AES`, `GCM`, `SHA`, `HMAC`, `HKDF`, `Keychain`, `LocalAuthentication`, random
  generation and their call sites. Read the implementations and callers listed
  above, not just the imports.
- `project.yml` points the application target at `KeyShield/` and declares no
  package dependencies. Generated project package dependency and framework build
  lists are empty; there are no Swift Package manifests/resolution files, CocoaPods
  or Carthage manifests, vendored frameworks/xcframeworks, static archives or
  non-Apple dynamic libraries under `src/ios/`. **No third-party runtime or crypto
  libraries are bundled by this target.** Apple's frameworks and Swift runtime
  libraries are not third-party application libraries.
- The app resource phase contains only the icon asset catalog and privacy
  manifest. JSON fixtures are test-target resources, not third-party executable
  code. Developer examples mentioning Python `requests` or remote SDKs are display
  strings, not imported or linked app dependencies.
- The unsigned device executable's `otool -L` dependencies are Apple system
  frameworks/libraries. No separately bundled cryptography binary was found.
  Recheck the final signed/exported bundle if dependencies or build tooling change.
- `Core/ProviderRequestExecutor.swift` dispatches to concrete in-memory
  `MockProviderTransport.send`; HTTPS URLs are validated as mock metadata, not
  sent through `URLSession` or sockets. No live TLS transport, cloud sync,
  external agent, passkey/WebAuthn implementation, asymmetric signing, proprietary
  cipher or separate non-Apple crypto SDK was found in this target. Base64/hex
  encoding and UUID metadata are not additional encryption algorithms.
- Host-only scripts (archive/export, icon generation and the Python safety tests)
  are outside the app target and are not bundled. They add no app cryptography;
  future Apple code signing/export is a separate distribution step, not an app
  runtime crypto implementation. Unit/UI tests are not shipped in the app.

Useful repeatable shell searches (review callers and project resources too):

```sh
rg -n 'CryptoKit|CommonCrypto|Security|PBKDF2|AES|GCM|SHA|HMAC|HKDF|Keychain|LocalAuthentication|SecRandom|SecItem|completeFileProtection' src/ios/KeyShield
rg -n 'Cipher\.|SecureRandom\.|evaluatePolicy|URLSession|MockProviderTransport' src/ios/KeyShield
rg -n 'packageProductDependencies|PBXFrameworksBuildPhase|PBXResourcesBuildPhase' src/ios/KeyShield.xcodeproj/project.pbxproj
otool -L /Users/devin/ks-testflight/KeyShield-unsigned.xcarchive/Products/Applications/KeyShield.app/KeyShield
```

## Apple's current guidance

Accessed **2026-11-20**. Both pages were reachable; quotations were checked against
Apple's DocC JSON representations of the linked documentation, not a third-party
summary.

1. [Complying with Encryption Export Regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)

   > If your app uses, accesses, contains, implements, or incorporates encryption,
   > this is considered an export of encryption software

   > Typically, the use of encryption that’s built into the operating system—for
   > example, when your app makes HTTPS connections using URLSession—is exempt
   > from export documentation upload requirements, whereas the use of
   > proprietary encryption is not.

   Apple distinguishes documentation exemptions from the absence of encryption.
   It also warns that exempt encryption may still require a year-end U.S.
   self-classification report. TestFlight submission uploads to a U.S. server;
   distribution territories and applicable import rules remain relevant.

2. [ITSAppUsesNonExemptEncryption](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)

   > If you don’t have the ITSAppUsesNonExemptEncryption key in your app’s Info.plist
   > file, App Store Connect walks you through an export compliance questionnaire
   > every time you upload a new version of your app.

   Apple describes `NO` as no encryption or only exempt encryption (including
   linked third-party libraries), and `YES` as non-exempt encryption. This project
   deliberately chooses **neither**. It also supplies no
   `ITSEncryptionExportComplianceCode`; only the account holder can determine
   whether documentation and an Apple-issued code are required.

Apple's linked decision guidance:
[Determine and upload app encryption documentation](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation/).
Consult that current workflow and qualified export-compliance advice when needed.

## Likely category — for the account holder to confirm

The engineering inventory suggests the candidate category **uses/accesses
encryption supplied by Apple's operating system**, with standard AES-GCM,
PBKDF2-HMAC-SHA256, SHA-256, Security/Keychain and OS data protection, rather than
a separately implemented or third-party cryptography library. Apple's wording
above says OS-built-in encryption is *typically* exempt from documentation upload
requirements; it is not a blanket classification of every app using Apple APIs.

This is **not** a “no encryption” app. A vault's encryption for local data
protection, encrypted backup/export, password-based key derivation and OS storage
protection may still count. Synthetic-only credentials, no network, standard
algorithms, authentication-only subfeatures or use of Apple libraries do not by
themselves establish an exemption for the complete application.

The **account holder owns the decision**: review this inventory against the actual
submitted binary, answer App Store Connect's questions, determine the applicable
category, territories, documentation and any reporting obligations, and obtain
advice if uncertain. Leave the key unset until that review; any future metadata
declaration must be an explicit account-holder decision. Reassess after adding
libraries, real networking, passkeys, cloud sync or any cryptographic changes.
