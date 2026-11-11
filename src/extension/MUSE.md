# KeyShield — Muse / browser-agnostic load

Name stays **KeyShield — Sovereign Vault**. Same unpacked folder as Chrome:
`src/extension/`. This is the WebExtensions Community Group (`browser.*`)
build of that extension, not a second product.

## What “Cursor Muse” actually is

**Cursor Muse Wonder** is a Meta coding model inside Cursor. It is not a
browser and it does not host Chrome / Firefox extensions.

**Cursor @Browser** is an isolated agent webview. Cursor staff: it cannot
load unpacked WebExtensions (architectural, not a missing toggle).

So “Muse-version” here means: the smallest path that still talks Path A
vault + proxy **beyond Chrome**, using the standard `browser` namespace
that Firefox, Safari, and Chrome 148+ share.

| Host | Loads this folder? | How |
|---|---|---|
| Chrome / Edge / Brave / Arc | Yes | `chrome://extensions` → Developer mode → **Load unpacked** → `src/extension/` (`manifest.json`, MV3 service worker) |
| Firefox 115+ | Yes | `about:debugging` → This Firefox → **Load Temporary Add-on** → pick **`manifest.muse.json`** (same folder). Temporary add-ons clear when Firefox quits. |
| Safari | Not packaged | Needs an Xcode wrapper; not this slice |
| Cursor Muse (model) | No | Model only. It can *author* the extension; it cannot run it |
| Cursor @Browser | No | Isolated webview, no `chrome.*` / `browser.*` extension APIs |

## Chrome vs Muse/Firefox (honest 1:1)

Same scripts: `background.js`, `content.js`, `session-bridge.js`, `popup.*`.
Same live app: [https://app.ks.aileena.xyz](https://app.ks.aileena.xyz).
Same control plane: `https://keyshield-production.up.railway.app`.
Proxy still receives `X-Upstream-API-Key` per request and does not persist it.

| Surface | Chrome MV3 | Muse / Firefox MV3 |
|---|---|---|
| Toolbar popup | `action.default_popup` | same |
| Detect API keys + Save to vault | content script + `/manage/store` | same |
| Auto-fill empty API boxes | `chrome.scripting` | `browser.scripting` (aliased) |
| Session token | `externally_connectable` **and** session-bridge | session-bridge `postMessage` (`__ks_ext_message`) — Firefox has no `externally_connectable` |
| Path A lite vault key (`KS_VAULT_KEY_REGISTER`) | dashboard `sendMessage(extensionId)` | same postMessage bridge (dashboard hosts only) |
| ZK enroll (`KS_ZK_ENROLL`) | external message | same bridge |
| x402 trust / 402 interceptor | yes | yes |
| `storage.session` pending keys | yes | Firefox 115+ |
| `chrome.action.openPopup` | yes | Firefox 127+; else dashboard tab |
| Fill `chrome-extension://` demo pages | yes | `moz-extension://` too |
| Live app nav (Home, Payments, Agents, …) | stays on the website | same — this is not a dashboard shell |
| WebAuthn / passkey | page on `app.ks.aileena.xyz` | same page; extension never runs PRF itself |

## Path A + proxy

1. Sign in on `https://app.ks.aileena.xyz/?ext=1&demo=shop`.
2. Session-bridge writes `ks_token` into extension storage (and restores it onto the page).
3. Wallet / passkey unlock derives the Path A lite AES key in the page; the
   dashboard posts `{ __ks_ext_message: { type: "KS_VAULT_KEY_REGISTER", keyB64 } }`.
   The bridge forwards that to the background worker. Chrome still also uses
   `externally_connectable` when an extension id is known.
4. Detected keys: ZK mode seals in the worker; otherwise `POST /manage/store`.
5. Agents / SDK keep calling `/proxy/:upstream/...` with `Authorization: Bearer <KS_TOKEN>`.
   The client decrypts locally and sends `X-Upstream-API-Key` once.

## Load — Firefox / any `browser.*` host

1. Clone this repo. No build step.
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
3. Select `src/extension/manifest.muse.json` (must be that file, not the folder).
4. Toolbar card: **KeyShield — Sovereign Vault · 1.2.5**.
5. Open `https://app.ks.aileena.xyz/?ext=1&demo=shop`, sign in once.
6. Popup first green line: `ok 1.2.5 <all_urls>`.

Chromium-family browsers keep using **Load unpacked** on the folder
(`manifest.json`). Do not pick `manifest.muse.json` there — Chrome requires
`background.service_worker`.

`manifest.firefox.json` is the same MV3 package as `manifest.muse.json`
(older docs still name the firefox file).
