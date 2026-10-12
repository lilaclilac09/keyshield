# 1.1.3 on your Mac — hosted Sign-in + detect + shop

`127.0.0.1:5173` **refused** means Vite is not running. That is why
1.1.3 / a pinned 1.1.9 Sign-in looks dead. Do **not** `git pull` if
github.com will not resolve. Do **not** paste HTML into zsh.

Stay on **KeyShield — Sovereign Vault**. Sign-in must open
`https://app.ks.aileena.xyz/?ext=1&demo=shop`.
If already signed, popup must show **only saved APIs**.

## 0. Try pull, then offline signed-in patch

```bash
cd ~/Downloads/privacy_hack/keyshield
git fetch origin cursor/cursor-api-autofill-b48a
git checkout cursor/cursor-api-autofill-b48a
git pull origin cursor/cursor-api-autofill-b48a
python3 src/extension/patch-signed-popup.py
```

If `github.com` does not resolve, skip git. Run
`python3 src/extension/patch-signed-popup.py` if that file exists, else
paste the python3 block from the agent (it writes `popup.html` with
`id="signed-pane"`, stamps `man["version"] = "1.2.4"`, and injects
`KS-SIGNED-1.2.4`). Then chrome://extensions → **Remove** → **Load unpacked**.

## 1. Patch 1.1.3 → 1.2.4 on disk (python3 only)

```bash
cd ~/Downloads/privacy_hack/keyshield
python3 - <<'PY'
from pathlib import Path
import json, re

root = Path.cwd()
if (root / "src/extension/manifest.json").exists():
    ext = root / "src/extension"
elif (root / "manifest.json").exists() and (root / "popup.js").exists():
    ext = root
else:
    raise SystemExit("cd to ~/Downloads/privacy_hack/keyshield first")

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
print("dash", [l for l in (ext / "popup.js").read_text().splitlines() if "DEFAULT_DASHBOARD_URL" in l][0])
print("auto", "maybeAutoStore" in cjs.read_text())
print("next: chrome://extensions Remove + Load unpacked this folder")
print("then Sign-in must open https://app.ks.aileena.xyz/?ext=1&demo=shop")
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
   toasts and saves. Cursor API Keys: click **Show** so the token is in the DOM.

## 3. What you should see

1. Hosted Sign-in. If this device already has a passkey id: **Sign In as abcd…wxyz**.
2. After login: Home shop card — paste a key (like Cursor API Keys), **Buy $0.10 credit** (balance changes), **RPC speed check**.
3. Detect hangs after login: leave cursor.com / openai.com / openrouter.ai open, click Show if the token is masked, wait for the toast, it saves.

Do not start Vite unless you actually want a local dashboard. Settings → Use local dev only after `curl http://127.0.0.1:5173` works.
