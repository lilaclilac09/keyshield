# KeyShield Browser Extension

Auto-detects API keys on any page (OpenAI, Anthropic, Groq, Helius, Alchemy, etc.) and stores them in your encrypted KeyShield vault. Also intercepts HTTP `402 Payment Required` (x402) responses and prompts you to pay.

## Layout

This directory is the **unpacked extension root**. No build step required — all files are plain JS/HTML/JSON, ready to load.

```
src/extension/
├── manifest.json          Chrome MV3 manifest
├── manifest.firefox.json  Firefox MV2 manifest
├── background.js          service worker (key save, x402, audit retention)
├── content.js             content script (key detection, x402 interceptor)
├── popup.html             toolbar popup UI
└── popup.js               popup logic (settings + token status)
```

## Backend

Load unpacked from this folder (no `update_url` in the manifest) so
**source defaults are local**:

- API base: `http://127.0.0.1:8001`
- Dashboard: `http://127.0.0.1:5173`

A packed / store build (has `update_url`) uses production instead:

- API base: `https://keyshield-production.up.railway.app`
- Dashboard: `https://app.ks.aileena.xyz`

`https://keyshield.dev` has **no public DNS**. Stored `keyshield.dev`
URLs are rewritten to the unpacked or packed default.

If Chrome cannot Reload after you edit this folder: **Remove** the
extension, then **Load unpacked** again from the same path (e.g.
`~/Downloads/privacy_hack/keyshield/src/extension`). The card must
show **1.1.3**. **1.1.1** is `main` and still opens `keyshield.dev`.
See `LOCAL-SIGNIN.md`.

Popup **Use production** / **Use local dev** / **Point at remote** pin
`ks_api_base` / `ks_dashboard_url`. Unpacked builds do **not** migrate
`127.0.0.1:5173` away.

## Install — Chrome / Edge / Brave / Arc

1. Open `chrome://extensions/` (or the equivalent on your Chromium browser).
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Select this directory: `src/extension/`.
5. The KeyShield icon appears in the toolbar. Click it to confirm settings.

The extension picks up `manifest.json` automatically.

## Install — Firefox

1. Open `about:debugging`.
2. Click **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on…**
4. Navigate to `src/extension/` and pick **`manifest.firefox.json`**.

Firefox MV2 add-ons loaded this way are removed when the browser closes — that's expected for development.

## How it works

- **Auto-detect:** `content.js` scans visible text and form inputs every 3 seconds (and on copy/input events) for known API key shapes. When a match is found on a known provider domain, a "Save to vault" toast appears.
- **One-click save:** Clicking the toast sends the key to `background.js`, which `POST`s `/manage/store` on the backend. Requires you to be signed in to the KeyShield dashboard (token registered via `externally_connectable`).
- **x402 payments:** Any fetch that returns `402` with `X-Payment-Required: x402` triggers a payment prompt; trusted domains under your threshold can auto-pay.
- **Audit log:** Stored under `chrome.storage.local.ks_audit_log` and purged by age + cap on extension install/update.

## Troubleshooting

- **"No token" badge in popup:** Click **→ Sign in to KeyShield**. Unpacked default is `http://127.0.0.1:5173` (`node dev.cjs`). Hosted: **Use production**. After wallet login the page should `KS_TOKEN_REGISTER`. If the badge stays empty, paste the Developer token into **Register token**.
- **Sign-in opens a blank `keyshield.dev` tab:** That host has no DNS. **Remove** the extension, then **Load unpacked** again from this folder (Reload often does nothing).
- **Chrome "Reload" does nothing / is missing:** Remove the card, then Load unpacked from the same path. The Source line must still be this folder.
- **Sign-in opens localhost but Vite is not running:** start `node dev.cjs`, or click **Use production**.
- **Backend unreachable:** Confirm the configured API base is reachable. Defaults and local dev fallbacks are listed in `host_permissions` / Firefox `permissions`.
- **Manifest changes:** After editing `manifest.json`, try the **Reload** circle. If Chrome will not reload, Remove then Load unpacked.
