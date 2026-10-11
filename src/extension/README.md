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

Sign-in default is the hosted dashboard:

- API base: `https://keyshield-production.up.railway.app`
- Dashboard: `https://app.ks.aileena.xyz` (not `ks.app.aileena.xyz`)

`https://keyshield.dev` has **no public DNS** and is rewritten to
`app.ks.aileena.xyz`. Local Vite is popup **Use local dev**
(`http://127.0.0.1:8001` / `http://127.0.0.1:5173`).

If GitHub DNS fails, **do not** edit `~/Downloads/…` unless you want
the new Sign-in button. Login works without that folder: open
`https://app.ks.aileena.xyz`, copy the session token, popup
**Register token**. See `LOCAL-SIGNIN.md`.
If Chrome cannot Reload: **Remove** then **Load unpacked** from this
folder.

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

- **"No token" badge in popup:** Open `https://app.ks.aileena.xyz` yourself (skip Sign-in on v1.1.1). Wallet / passkey. Copy token → **Register token**.
- **Sign-in opens a blank `keyshield.dev` tab:** That is GitHub `main` 1.1.1. Do not edit Downloads. Use the token paste path. After this PR is on `main`, Load unpacked **1.1.7**.
- **Chrome "Reload" does nothing / is missing:** Remove the card, then Load unpacked from the same path. The Source line must still be this folder.
- **Want local Vite instead:** popup **Use local dev** (`http://127.0.0.1:5173`) after `node dev.cjs`.
- **Backend unreachable:** Confirm the configured API base is reachable. Defaults and local dev fallbacks are listed in `host_permissions` / Firefox `permissions`.
- **Manifest changes:** After editing `manifest.json`, try the **Reload** circle. If Chrome will not reload, Remove then Load unpacked.
