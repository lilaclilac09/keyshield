# 1.1.3 on your Mac — hosted Sign-in + detect + shop

`127.0.0.1:5173` **refused** means Vite is not running. That is why
1.1.3 / a pinned 1.1.9 Sign-in looks dead. Do **not** `git pull` if
github.com will not resolve. Do **not** paste HTML into zsh.

Stay on **KeyShield — Sovereign Vault**. Sign-in must open
`https://app.ks.aileena.xyz/?ext=1&demo=shop`.
If already signed, the on-page `#keyshield-status-card` is the only window:
signed + collected + filled · ms. Toolbar click does not open a second popup.

## 0. Try pull, then offline signed-in patch

Do **not** hardcode `~/Downloads/privacy_hack/keyshield`. Home / Docs →
Trouble finds the clone from Chrome internals (`Preferences` unpacked
`path`, Details → Loaded from) plus a home walk.

1. Paste the **find local path** python from the Trouble card.
2. Try pull on `cursor/cursor-api-autofill-b48a`.
3. If `github.com` does not resolve, skip git and run python3.

```bash
# zsh. python not HTML. Do not use eval.
# leftover --find traceback inside eval "$(...)" = parse error near )
python3 src/extension/patch-leftover-bridge.py
# or paste Trouble tab block: python3 - <<'PY' ... PY
```

If `github.com` does not resolve, skip git. Run
`python3 src/extension/patch-leftover-bridge.py` if that file exists, else
`python3 src/extension/patch-signed-popup.py`, else paste Trouble tab →
local stamp (python, not HTML). It restores
`session-bridge.js` at `document_start` on every leftover folder.
Terminal must print `ver 1.2.4` and `session-bridge True`.
Then chrome://extensions → **Remove** → **Load unpacked**.
If already signed, popup is three rows: **N saved** (same as the vault list length, never leftover `0 saved` over listed keys) + **N collected** + `signed-pane` vault list + Sign out; detect on · ok 1.2.4; **N filled · XXms**. Vault page lists the same `/manage/vault` rows. No Settings / Register token / URL fields.
Refresh `https://app.ks.aileena.xyz` so the bridge injects. A leftover
1.2.4 stamp that only has `content.js` on `<all_urls>` (your loaded
`manifest.json` can look “ok” and still miss the bridge) stays `no token`.

## 1. Patch 1.1.3 → 1.2.4 on disk (python3 only)

```bash
# cwd / Chrome internals / home walk — no hardcoded Downloads path
python3 - <<'PY'
from pathlib import Path
import json, re

root = Path.cwd()
if (root / "src/extension/manifest.json").exists():
    ext = root / "src/extension"
elif (root / "manifest.json").exists() and (root / "popup.js").exists():
    ext = root
else:
    raise SystemExit("run find-path from Home / Docs Trouble first")

HOSTED = "https://app.ks.aileena.xyz"
man_path = ext / "manifest.json"
man = json.loads(man_path.read_text())
man["version"] = "1.2.4"
man.setdefault("optional_host_permissions", [])
if "<all_urls>" not in man["optional_host_permissions"]:
    man["optional_host_permissions"].append("<all_urls>")
man.setdefault("host_permissions", [])
if "<all_urls>" not in man["host_permissions"]:
    man["host_permissions"].insert(0, "<all_urls>")
for extra in ("scripting", "tabs"):
    if extra not in man.get("permissions", []):
        man.setdefault("permissions", []).append(extra)
man["content_scripts"] = [
    {
        "matches": [
            "https://app.ks.aileena.xyz/*",
            "https://*.aileena.xyz/*",
            "https://keyshield.dev/*",
            "https://*.keyshield.dev/*",
            "https://*.up.railway.app/*",
            "https://*.vercel.app/*",
            "http://127.0.0.1:5173/*",
            "http://localhost:5173/*",
            "http://127.0.0.1:3000/*",
            "http://localhost:3000/*",
        ],
        "js": ["session-bridge.js"],
        "run_at": "document_start",
    },
    {"matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle", "all_frames": True},
]
bridge = ext / "session-bridge.js"
if (not bridge.is_file()) or ("capturePageToken" not in bridge.read_text(encoding="utf-8")):
    bridge.write_text(
        "(function keyShieldSessionBridge(){function announce(){try{window.postMessage({__ks_ext_announce:chrome.runtime.id},location.origin)}catch(e){}}"
        "function capturePageToken(){try{var t=localStorage.getItem('ks_token')||'';if(t.trim().length<12)return;chrome.storage.local.get(['ks_token'],function(s){if(s&&s.ks_token===t)return;chrome.storage.local.set({ks_token:t,ks_auto_store:true})})}catch(e){}}"
        "announce();capturePageToken();[400,1200,3000,8000].forEach(function(ms){setTimeout(capturePageToken,ms)});"
        "window.addEventListener('ks-auth-changed',capturePageToken);window.addEventListener('storage',capturePageToken);"
        "window.addEventListener('message',function(e){if(e.source!==window||!e.data)return;if(e.data.__ks_ext_request)announce();if(e.data.__ks_page_session||e.data.__ks_auth_changed)capturePageToken()});})();\n"
    )
man_path.write_text(json.dumps(man, indent=2) + "\n")

for name in ("popup.js", "background.js"):
    path = ext / name
    text = path.read_text()
    text = re.sub(
        r"const DEFAULT_DASHBOARD_URL = ['\"][^'\"]+['\"]",
        f'const DEFAULT_DASHBOARD_URL = "{HOSTED}"' if name == "popup.js"
        else f"const DEFAULT_DASHBOARD_URL = '{HOSTED}'",
        text,
        count=1,
    )
    path.write_text(text)

cjs = ext / "content.js"
c = cjs.read_text()
if "function maybeAutoStore" not in c:
    old = "  renderPanel();\n}"
    new = "  renderPanel();\n  if (typeof maybeAutoStore === 'function') maybeAutoStore();\n}"
    if old not in c:
        raise SystemExit("handleMatch renderPanel() not found")
    c = c.replace(old, new, 1)
    c += """

const AUTO_STORE_KEY = 'ks_auto_store';
let autoStoreAllowed = false;
let autoStoreInFlight = false;
function loadAutoStorePref() {
  try {
    chrome.storage.local.get([AUTO_STORE_KEY], (out) => {
      autoStoreAllowed = !!(out && out[AUTO_STORE_KEY]);
      if (autoStoreAllowed && typeof maybeAutoStore === 'function') maybeAutoStore();
    });
  } catch (e) {}
}
function grantAutoStore() {
  autoStoreAllowed = true;
  try { chrome.storage.local.set({ ks_auto_store: true }); } catch (e) {}
  return bulkSave();
}
function maybeAutoStore() {
  if (!autoStoreAllowed || autoStoreInFlight) return;
  const unsaved = Array.from(detectedKeys.values()).filter((v) => v.saved !== true).length;
  if (!unsaved) return;
  autoStoreInFlight = true;
  Promise.resolve(bulkSave()).finally(() => { autoStoreInFlight = false; });
}
loadAutoStorePref();
"""
    cjs.write_text(c)

print("ok 1.2.4", ext)
print("ver", json.loads(man_path.read_text())["version"])
print("session-bridge", any("session-bridge.js" in (row.get("js") or []) for row in json.loads(man_path.read_text()).get("content_scripts") or []))
print("dash", [l for l in (ext / "popup.js").read_text().splitlines() if "DEFAULT_DASHBOARD_URL" in l][0])
print("auto", "maybeAutoStore" in cjs.read_text())
print("next: chrome://extensions Remove + Load unpacked this folder")
print("then Sign-in must open https://app.ks.aileena.xyz/?ext=1&demo=shop")
print("loaded manifest.json must list session-bridge.js — only content.js stays no token")
PY
```

Screen must say `ok 1.2.4` and `DEFAULT_DASHBOARD_URL = "https://app.ks.aileena.xyz"`.

## 2. Reload the same extension name

1. `chrome://extensions` → **Remove** the old card.
2. **Load unpacked** → `src/extension`.
3. Name **KeyShield — Sovereign Vault**, version **1.2.4**.
   Chrome may ask to read all sites — Allow. That is what wires detect.
4. Open the popup. The first green line must be exactly `ok 1.2.4 <all_urls>`.
   If you see `need Remove + Load unpacked`, Chrome ate a Reload — Remove the card and Load unpacked again.
5. Click **Sign in**. It must **not** open `127.0.0.1:5173`. After login the
   scanner stays on: any `sk-proj-` / `sk-or-` / `key_` / `crsr_` / `helius_auth_`
   / Helius dashboard UUID (SOL badge) toasts and saves. Cursor API Keys: click
   **Show** so the token is in the DOM.
   Keep `dashboard.helius.dev` open after Remove + Load unpacked. The new
   background harvests every SOL UUID from that tab and POSTs `/manage/store`
   — do not click Save on the dead toast
   (`Saved 0, 5 failed. Extension messaging error (Error: Extension context invalidated.)`).
   Popup then lists all saved Helius rows. Auto-detect stays on.
   Passkey is only when you paste a key into another site (Cursor API box, fill, reveal).

## 3. What you should see

1. Hosted Sign-in. If this device already has a passkey id: **Sign In as abcd…wxyz**.
2. After login: Home shop card — paste a key (like Cursor API Keys), **Buy $0.10 credit** (balance changes), **RPC speed check**.
3. Detect hangs after login: leave cursor.com / openai.com / openrouter.ai open, click Show if the token is masked, wait for the toast, it saves.

Do not start Vite unless you actually want a local dashboard. Settings → Use local dev only after `curl http://127.0.0.1:5173` works.
