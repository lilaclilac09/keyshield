# Extension integration tutorial (isolated local rehearsal)

This tutorial uses **extension-only device-local storage**. No real credentials,
external provider pages, accounts, clipboard monitoring, or automatic discovery.
Use a dedicated disposable Chromium profile, never your everyday browser profile.

## Mock boundaries — read first

- **Synthetic values:** every fixture key starts with `FAKE_KEYSHIELD_NOT_A_KEY::`.
  Keep the entire marker. These are not production-valid credentials.
- **Local test origins:** `https://dashboard.provider.test`, `https://evil.test`,
  and `https://dashboard.vault.test` are mapped by this browser's resolver rules
  to an ephemeral loopback HTTPS server. They are not external services. The
  self-signed certificate is accepted only in this disposable test browser.
- **Local test policy:** the harness copies runtime files into an ignored, unique
  `dist/extension-acceptance/run-*/` directory and adds the provider `.test` origin
  and synthetic recognizer there. It pregrants that origin in the test manifest;
  this does **not** test native optional-permission prompt acceptance. Production
  policy/recognition and manifests are not modified. Production rejects fixtures.
- **Context-menu hook:** automation makes a real selection, then invokes the exact
  menu callback through generated `__test.select`. Playwright does not operate the
  native right-click menu. A person recording can use the real context menu.
- **Popup automation:** automated tests open the real popup HTML in a separate,
  unfocused extension window; a person uses the extension's toolbar menu.
- **Dashboard-like mock:** `dashboard.vault.test/empty.html` is an empty fixture,
  not the real KeyShield dashboard or Device Vault. Tests seed harmless sentinel
  localStorage/IndexedDB records on it and on the provider page, enumerate both
  origins' stores after Save, and require them to remain unchanged. Observed
  request URLs, headers and bodies must not contain the synthetic key marker.

## Commands

From the repository root, install dependencies once if needed:

```sh
npm ci
npx playwright install chromium
```

Run just the matching tutorial spec (selection and Add key variants):

```sh
npx playwright test --config tests/extension-playwright.config.ts tutorial.pw.ts
```

Run the full extension suite, including the tutorial:

```sh
npx playwright test --config tests/extension-playwright.config.ts
```

For a **screen recording / manual rehearsal**, this single command builds the
isolated unpacked test extension, serves the HTTPS fixtures, launches a fresh
local profile with that extension, and pauses before step 2:

```sh
KEYSHIELD_TUTORIAL_RECORD=1 npx playwright test --config tests/extension-playwright.config.ts tutorial.pw.ts --grep 'KS-TUTORIAL selection' --headed --timeout=0
```

Leave Playwright Inspector paused while you perform the steps manually. Do not
press Resume after changing the vault manually (the automatic test expects a
fresh vault). Ctrl-C ends this run and closes its own browser/server. Profile,
build, and screenshot artifacts remain under its unique `run-*` directory; no
other browser processes or existing extension builds are touched. Every automated
test also uses a fresh `mkdtempSync(.../profile-)` user-data directory.

### Manual recording

A manual fresh-profile launch is an alternative to the Playwright headed command
above. Use the isolated test build, serve the same loopback HTTPS fixtures, and
apply the same `.test` resolver mappings and local test policy. Keep the disposable
profile separate from your everyday browser; the same mock boundaries apply.

## Numbered steps (identical to the E2E `test.step` names)

### 1. Build and load in a dedicated local test profile

Run the recording command above. The runner performs the build and loads the
unpacked extension with `--load-extension` into its new Chromium profile. It opens
`https://dashboard.provider.test/input.html` and the dashboard-like mock tab. The
provider input contains one marked synthetic value. For the toolbar UI, open the
Extensions menu, pin KeyShield if necessary, and open it. Do not visit real sites.

### 2. Create and unlock the extension vault

Enter a disposable passphrase of at least 12 characters (the automated rehearsal
uses `synthetic local passphrase`), then click Unlock. First use creates an empty
encrypted vault. Click Lock, then unlock again with that same passphrase to check
the round trip. Nothing is connected to a dashboard account.

### 3. Submit exactly one synthetic value

Either highlight the input's **ENTIRE fixture value, including its
`FAKE_KEYSHIELD_NOT_A_KEY::` marker**, and right-click **Save
selection to KeyShield**, or open the toolbar popup, manually paste/type that one
synthetic value into **Paste or type one key**, and click **Add key**. The automated
suite covers both alternatives. Neither path scans other page fields. The pending
value exists only in worker memory until a separate Save click; closing discards it.

### 4. Review the masked confirmation and explicitly Save

The vault must still be unlocked. It auto-locks after **60 seconds idle**; a locked
Save or Fill asks you to unlock first and saves nothing. Unlock again if needed
before continuing through steps 4–6.

Check preview `••••AAAA`, provider `openai`, and bound origin
`https://dashboard.provider.test`. Set label `Tutorial synthetic key` and click
**Save** explicitly. A normal production flow may request optional site permission;
this local rehearsal pregrants only its mock provider origin. The test verifies
an encrypted extension record, no marker in persistent extension storage, and
unchanged localStorage/IndexedDB on both mock page origins. Plaintext necessarily
exists in the selected input and in the unlocked worker; it is not persisted there.

### 5. Fill a focused field on the bound origin

Keep the vault unlocked (unlock again if the 60-second idle lock has fired).
Close confirmation if open. On the provider page, clear and focus the input.
Reopen the normal toolbar popup and click **Fill into this page**. The value should
appear only in that focused field. This explicitly gives that page access to the
value; origin binding is not protection against a compromised destination page.

### 6. Observe refusal on another origin

Keep the vault unlocked so this demonstrates origin refusal rather than a lock
refusal; unlock again if the 60-second idle lock has fired.
Close the popup, visit `https://evil.test/input.html`, clear/focus its input, and
reopen the popup. Click Fill. Expect `not a supported provider page` and an empty
input. Full exact origins, including ports, remain bound even though browser
permission match patterns omit ports.

### 7. Lock the extension vault

Click **Lock**. Expect `Vault locked`; listing/using saved keys now requires Unlock.
The encrypted record remains local to this extension profile. Worker shutdown or
the idle timer also locks it; neither is a substitute for this explicit step.

## Separate from shared human/agent / Device Vault — interoperability UNVERIFIED

The extension vault is **separate** from the shared human/agent / Device Vault used
by the dashboard, desktop and iOS surfaces. Saving here does not populate those
surfaces, sync to an account, or make the item available to an agent. No approved
local call path exists for another surface to use this saved item without exporting
the key/root. **Interoperability is UNVERIFIED.** The dashboard-like storage check
above establishes only the mock page-storage boundary, not real shared-vault
integration. See [README.md](README.md) for the cryptographic format and trust boundary.
