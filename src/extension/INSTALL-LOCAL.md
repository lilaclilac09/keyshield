# KeyShield extension 1.2.5 · latest — local Load unpacked

Do not paste HTML into zsh. Do not run `eval`. Do not run `$(...)`.

Seeing **KeyShield — Sovereign Vault / 1.2.5** on the Chrome card is not enough.
The old cwd-relative one-liner fails from `$HOME` (`FileNotFoundError`).
Reload is not enough if a leftover 1.2.4 card is still loaded.

Paste this from any directory (works from `~`). No `cd`. No `git pull`.

```
python3 - <<'PY'
from pathlib import Path
import json, os, sys

MAC = Path("/Users/aileen/Downloads/privacy_hack/keyshield")
cands = [Path(os.environ["KS_ROOT"])] if os.environ.get("KS_ROOT") else []
cands += [MAC, Path.cwd(), Path.home() / "Downloads" / "privacy_hack" / "keyshield"]
root = next((p for p in cands if (p / "src/extension/manifest.json").is_file()), None)
if root is None:
    sys.stderr.write("NO CLONE at %s\n" % MAC)
    raise SystemExit(1)
ext = (root / "src/extension").resolve()
m = json.loads((ext / "manifest.json").read_text())
print(m['name'])
print(m['version'])
print(os.path.abspath(str(ext)))
popup = ((m.get("action") or {}).get("default_popup") or "MISSING")
hosts = list(m.get("host_permissions") or []) + list(m.get("optional_host_permissions") or [])
urls = "<all_urls>" if "<all_urls>" in hosts else "missing <all_urls>"
print(popup)
print(urls)
ver = str(m.get("version") or "")
if ver == "1.2.5" and popup == "popup.html" and urls == "<all_urls>":
    print("READY 1.2.5")
elif ver == "1.2.4":
    print("LEFTOVER 1.2.4 — Remove every card, Load unpacked 1.2.5")
else:
    print("NOT READY")
print("next: chrome://extensions → Remove every KeyShield card → Load unpacked the folder above")
print("toolbar: ok 1.2.5 <all_urls>")
print("latest: 1.2.5 · latest")
print("sign-in: https://app.ks.aileena.xyz/?ext=1&demo=shop")
PY
```

Must print:

```
KeyShield — Sovereign Vault
1.2.5
/Users/aileen/Downloads/privacy_hack/keyshield/src/extension
popup.html
<all_urls>
READY 1.2.5
```

If GitHub DNS fails, skip `git pull` and use the clone you already have after it contains 1.2.5.

After a later pull you can also run the same check as a file (still from any cwd):

```
python3 /Users/aileen/Downloads/privacy_hack/keyshield/scripts/mac_ready.py
```

Then:

1. Open `chrome://extensions`
2. Developer mode ON
3. Remove every KeyShield card (1.2.4 and 1.2.5 — Reload is not enough)
4. Load unpacked → the folder printed above
5. Card must read: **KeyShield — Sovereign Vault** · **1.2.5**
6. Click the toolbar icon. First green line must be exactly `ok 1.2.5 <all_urls>`. Next line: `1.2.5 · latest`
7. Sign in once (hosted tab session, or passkey). Detect + auto-save stay on. Empty API Key blanks fill silently.

Local fill fixture (Vite `node dev.cjs` on `:5173`):

```
http://127.0.0.1:5173/nvidia-fill-demo.html
http://127.0.0.1:5173/kilo-byok-fill-demo.html
```

Popup click must open `popup.html`. A leftover 1.2.4 stamp that still has `<all_urls>` is detect-ready, but it is not latest — Remove + Load unpacked 1.2.5.
