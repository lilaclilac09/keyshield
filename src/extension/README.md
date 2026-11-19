# KeyShield extension

**Extension-only device-local storage.** No account, dashboard connection, sync, or server fallback. Shared human/agent vault interoperability is **UNVERIFIED**: no approved local call path exists for another surface to use a saved item without exporting the key/root.

Load this folder unpacked in Chromium. For Firefox, package a copy using `manifest.firefox.json` as `manifest.json`. Safari packaging: [SAFARI.md](SAFARI.md).

1. Open a supported provider dashboard. Click **Find keys on this page**, then approve that provider's optional site permission.
2. Inspect masked candidates. Create/unlock the local vault with a passphrase of at least 12 characters. Select one candidate and click **Save** separately.
3. A duplicate needs **Already saved — Update label?** confirmation; only its label changes. Decline or close discards candidates, with no queue.
4. Focus an input on the **same saved origin**, then click **Fill into this page**. AWS pairs are saved together but cannot fill a single input.
5. Lock explicitly or let the idle timer lock (60 seconds by default; 1–3600 seconds configurable for the current background session). Worker shutdown also locks. There is no recovery for a forgotten passphrase.

## Supported boundary

- Supported origins are defined in `lib/policy.js`: OpenAI, Anthropic, Stripe, GitHub (settings paths only), and AWS console. No subdomain wildcard; HTTPS exact-origin matching. Chromium site permissions are origin-wide, while GitHub's settings-path restriction is additionally enforced by policy.
- The extension only inspects visible input values (not password/hidden fields) and visible text in code/pre/output elements after Find. It ignores masked values. Detection is heuristic, not proof of credential validity; it does not validate against providers.
- No automatic page scanning, observers, clipboard access, arbitrary-site fill, dashboard messages, remote requests, or externally connectable interface. Page content never leaves the device; only candidate records cross the isolated-world/extension boundary.
- Provider pages are untrusted. Candidates exist only in popup memory until Save. The service worker accepts messages only from its own exact `popup.html` URL and extension ID, never from page scripts or external extensions. On upgrade, legacy extension storage outside `vault` and `auditLog` is removed.
- Internal message types: `FIND` → candidates/provider/preview/value plus origin and tabId; `UNLOCK {passphrase}`; `LOCK`; `IDLE {seconds}`; `LIST` → metadata only; `SAVE {candidate,origin,tabId,label,confirmDuplicate}`; `DECLINE {provider}`; `FILL {id}`. Responses are `{ok:true,...}` or `{ok:false,error}`. This is an internal consent UI interface, **not** a shared-vault API.
- Save and fill fail closed when locked/unavailable. Save rechecks permission, current tab and origin. Fill rechecks permission and origin and writes only the currently focused editable input in the top frame; the injected function checks origin again. A site receiving an explicitly filled key can read that input: fill grants that site access to that key.
- Trust includes the browser, extension code, local OS and user passphrase. This does not protect an unlocked compromised browser/OS, and does not isolate plaintext from the explicitly selected destination site.

## Local record format (version 1)

Only `chrome.storage.local` is persistent; no root or derived key is stored there or exported. Records are not compatible with other KeyShield vault formats.

- Storage key `vault`: `{version:1, iterations:310000, salt:number[16], iv:number[12], ciphertext:number[]}`. Byte arrays are JSON arrays of unsigned bytes.
- Passphrase UTF-8 → PBKDF2 with the random 128-bit salt, SHA-256, 310,000 iterations, 512 derived bits. First 32 bytes → nonextractable AES-256-GCM key. Last 32 bytes → nonextractable HMAC-SHA-256 key (domain separation by disjoint KDF output halves).
- AES-GCM uses a new random 96-bit IV on every write, default 128-bit authentication tag, no additional authenticated data. WebCrypto ciphertext layout is encrypted bytes followed by the 16-byte tag. Salt and IV are public; all entry data is encrypted. Wrong passphrases or authentication failure leave the vault locked.
- Decrypted payload: JSON array of `{id,provider,origin,value,preview,label,fingerprint}`. `id` is a random UUID; `origin` is the capture page's exact HTTPS origin. Preview is bullets plus last four characters. AWS `value` is a JSON string `{accessKeyId,secretAccessKey}` when exactly one component of each kind occurs. All these fields, including fingerprints, are encrypted at rest.
- Fingerprint: HMAC-SHA-256 over UTF-8 of the exact value string; serialized as comma-separated decimal bytes. Duplicates are global within this local vault, regardless of capture origin; confirmation changes only the original label, never the value or origin.
- Storage key `auditLog`: last 500 entries, `{action:'saved'|'declined'|'filled', provider:string, origin:string, time:ISO8601-string}`. Metadata only, no values, previews, labels, fingerprints, or page text. Closing without Decline writes nothing.
- Derived keys and decrypted entries are held in service-worker memory only. Idle timeout drops references; it does not claim secure memory erasure from a managed runtime. Configured timeout resets to 60 seconds on worker restart.

## Synthetic checks

`npx vitest run`

`npx playwright test --config tests/extension-playwright.config.ts`

Browser tests serve copied FAKE-marked fixtures over local HTTPS on port 8443, with host-resolver rules mapping the mock origins' standard HTTPS port to that listener. They generate a test-only adapter/allowlist in ignored `dist/extension-acceptance`. Production regexes and manifests never enable the synthetic domain. Most browser cases use a test-only pregranted host manifest; the missing-permission case uses the optional-only manifest. Unit tests exercise optional permission request/denial on Find; native permission-dialog acceptance is not automated. The real popup is rendered in a separate unfocused extension window because toolbar popups are not Playwright Page targets. Request counts and screenshots are recorded; no provider networks are contacted. Shared human/agent vault interoperability remains **UNVERIFIED**.
