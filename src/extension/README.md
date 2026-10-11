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

By default the extension talks to the **OSS-oriented** public defaults in the popup/background sources:

- API base: `https://keyshield-production.up.railway.app` (FastAPI control plane)
- Dashboard: `https://app.ks.aileena.xyz`

`https://keyshield.dev` has **no public DNS**. An older default opened that
host on **→ Sign in to KeyShield**, so the tab could not log in. Existing
installs that still store `keyshield.dev` / `app.keyshield.dev` are rewritten
to `app.ks.aileena.xyz` the next time the popup or background opens Sign-in.

Forks should replace these with **your own** deployment URLs (or use local
dev). Both URLs can be overridden at runtime from the popup's **Settings &
manual token** panel (stored in `chrome.storage.local.ks_api_base` and
`chrome.storage.local.ks_dashboard_url`). The popup also exposes a
**Use local dev** button that flips both back to
`http://127.0.0.1:8001` / `http://127.0.0.1:5173` for working against the
local Vite + FastAPI stack.

Existing installs that were defaulted to old localhost URLs are migrated to
the production defaults the next time the popup or background opens the
dashboard, unless the user explicitly saved a non-production URL (tracked
via `chrome.storage.local.ks_url_pref_pinned`). Dead `keyshield.dev` hosts
are rewritten even if pinned.

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

- **"No token" badge in popup:** Click **→ Sign in to KeyShield**. It opens the configured dashboard (default `https://app.ks.aileena.xyz`) and the content script announces `chrome.runtime.id` there so wallet login can `KS_TOKEN_REGISTER`. For a local stack, open Settings → **Use local dev** first, then Sign in so the tab is `http://127.0.0.1:5173` (passkey needs `127.0.0.1`, not `localhost`). Reload the unpacked extension after this change — old content.js never announced on `*.aileena.xyz`.
- **Sign-in opens a blank `keyshield.dev` tab:** Old builds defaulted to a host with no DNS. Reload the unpacked extension from this folder, then click Sign in again — stored `keyshield.dev` URLs are rewritten to `https://app.ks.aileena.xyz`.
- **Sign-in opens a dead localhost tab:** Old builds defaulted to `http://127.0.0.1:5173`. Open the popup once — unpinned local URLs migrate to production. To keep local, click **Use local dev** (that pins the preference).
- **Backend unreachable:** Confirm the configured API base is reachable. Defaults and local dev fallbacks are listed in `host_permissions` / Firefox `permissions`.
- **Manifest changes:** After editing `manifest.json`, click the **Reload** circle on the extension card in `chrome://extensions/`.
