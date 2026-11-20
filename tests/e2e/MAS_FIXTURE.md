# Offline MAS renderer profile

No prior MAS flag existed in the desktop or Vite configuration. The explicit
build-time flag is `VITE_KEYSHIELD_RENDERER_PROFILE=mas-fixture`; unset means
`standard`. Unknown values fail the build. There is no runtime switch.

```sh
# From src/web, using separate output directories:
npm run build:vite -- --outDir /absolute/path/to/standard
VITE_KEYSHIELD_RENDERER_PROFILE=mas-fixture npm run build:vite -- --outDir /absolute/path/to/mas-fixture
# From the repository root, after committing the pin:
node scripts/check-renderer-profile-builds.mjs /absolute/path/to/standard /absolute/path/to/mas-fixture
CHROME_BIN=/path/to/chrome node scripts/verify-mas-fixture-browser.mjs /absolute/path/to/mas-fixture /absolute/path/to/screenshots
```

Both outputs include `renderer-profile.json` with the build's Git HEAD. Build
from the final committed source: the packager must compare that SHA to its pin.
`check-mas-fixture-dist.mjs DIST [PIN_SHA]` is also a standalone content/marker
check; it defaults to the current HEAD. Standard HTML and ordinary app startup
are unchanged. Only the MAS build replaces the HTML entry, disables the public
directory, and uses a small independent DOM root with system fonts. Neither
React's global delegated input/paste events nor the ordinary dashboard is loaded.

The fixture refuses to open unless the baked profile is `mas-fixture` and the
desktop preload provides **boolean** `window.keyshieldDesktop.syntheticOnly ===
true`. This branch does not add that preload: it is the MAS host's responsibility.
The browser check explicitly simulates only that handshake. Missing handshake
and wrong profile render a refusal, never the ordinary UI.

Input audit: the only controls in the fixture entry are three buttons: Lock,
Unlock fixture vault, and the one Demo key selection. There are no
inputs, textareas, editable elements, forms, file imports, credential parsers,
paste listeners/handlers, drag/drop handlers, clipboard reads, auth/passkey or
sync calls. Runtime code imports only its fixture module. CSP denies connections,
frames, forms, fonts and external resources; only bundled script and local styles
are allowed. The only key-like value is prefixed `FAKE_KEYSHIELD_NOT_A_KEY::`.

The exact pair is label `Demo key`, value `FAKE_KEYSHIELD_NOT_A_KEY::demo`.
The `ks-mas-fixture:v1` namespace stores only a versioned AES-GCM envelope
(`version, locked, iv, ciphertext`). A bundled **public** seed derives the key
with HKDF: this demonstrates lock mechanics only, **not real protection**.
Lock re-encrypts with an authenticated locked marker and clears the in-memory
key/entry. Unlock re-derives, decrypts, and validates the exact pair. Reload does
not rewrite stored state. Unknown versions, corruption, failed decryption,
non-exact pairs, and unavailable persistence fail closed with a visible rejection
and no entry. No real account or provider credential is ever accepted.

Unit tests cover refusal, persisted/empty/corrupt/error states, input/network
surface audit and marker generation. The independent browser check serves only
the built bundle on port 5177, logs **all** browser requests to `requests.json`,
blocks off-bundle traffic, asserts zero credential fields and zero paste listeners,
and really quits/relaunches Chrome with the same persistent profile. It takes
refusal, selected, locked and reopened screenshots. It uses no backend or worker.
