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

The extension talks to the KeyShield backend at `http://127.0.0.1:8001` by default. Make sure it's running before installing.

The base URL can be overridden at runtime from the popup (it's stored in `chrome.storage.local.ks_api_base`).

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

- **"No token" badge in popup:** Sign in to the dashboard at `http://127.0.0.1:8001`. The dashboard registers a token with the extension via `chrome.runtime.sendMessage`.
- **Backend unreachable:** Confirm the backend is running on port 8001 and that `http://127.0.0.1:8001/*` is in `host_permissions` (it is, by default).
- **Manifest changes:** After editing `manifest.json`, click the **Reload** circle on the extension card in `chrome://extensions/`.
