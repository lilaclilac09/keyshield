# 1.1.3 on your Mac — local detect + auto-save

`git pull` fails (`Could not resolve host: github.com`). This Cloud
agent still cannot write `~/Downloads/privacy_hack/keyshield`.
Stay on **KeyShield — Sovereign Vault**. Do **not** paste HTML
(`<script>…</script>`) into zsh. That is a parse error.

1.1.3 already points at local Vite (`127.0.0.1:5173`) and local API
(`127.0.0.1:8001`). What it is missing: **Allow → auto-save**.

## 1. Start the local stack

From the Downloads repo (or any clone that already has the backend):

```bash
cd ~/Downloads/privacy_hack/keyshield
python3 -m uvicorn src.backend.app:app --host 127.0.0.1 --port 8001
```

In another terminal, if you use the dashboard:

```bash
cd ~/Downloads/privacy_hack/keyshield/src/web
npx vite --host 127.0.0.1 --port 5173
```

`curl http://127.0.0.1:8001/health` must print `{"status":"ok"...}`.

## 2. Patch 1.1.3 → 1.1.9 on disk (python3 only)

Copy **only** the block below into Terminal. Not the HTML demo page.

```bash
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

man_path = ext / "manifest.json"
man = json.loads(man_path.read_text())
man["version"] = "1.1.9"
man.setdefault("optional_host_permissions", [])
if "<all_urls>" not in man["optional_host_permissions"]:
    man["optional_host_permissions"].append("<all_urls>")
man_path.write_text(json.dumps(man, indent=2) + "\n")

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

demo = ext / "detect-demo.html"
demo.write_text("""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>KeyShield detect demo</title></head>
<body style="font-family:sans-serif;background:#0a0d1a;color:#e4e4e7;padding:32px">
<h1>KeyShield detect demo</h1>
<p>Fake OpenAI key. The extension must toast API key detected.</p>
<code>sk-proj-LOCALDETECTDEMOKEY1234567890abcd</code>
</body></html>
""")

print("ok version 1.1.9")
print("extension", ext)
print("demo", demo)
print("next: chrome://extensions Remove + Load unpacked this folder")
print("then: python3 -m http.server 8765 --directory", ext)
print("then: open http://127.0.0.1:8765/detect-demo.html")
PY
```

## 3. Reload the same extension name

1. `chrome://extensions` → **Remove** the 1.1.3 card.
2. **Load unpacked** → the same `src/extension` folder.
3. Card must still say **KeyShield — Sovereign Vault** and now **1.1.9**.
4. Popup → **Use local 5173 / 8001** → **Allow detect + auto-save** → Allow in Chrome.

## 4. Prove detect + store

```bash
cd ~/Downloads/privacy_hack/keyshield/src/extension
python3 -m http.server 8765
```

Chrome tab: `http://127.0.0.1:8765/detect-demo.html`

- Toast **API key detected** must appear.
- Click **Allow auto-save** once (permission).
- Status must be **Saved 1 key**.
- Later keys on that profile auto-save.

```bash
curl -sS -H 'X-Dev-Mode: 1' http://127.0.0.1:8001/manage/vault
```

Must list an `openai` / `sk-proj-LOCALDETECT…` item.

If the toast is missing: reload the demo tab after Allow. Site access
must be **On all sites** on the extension card.
