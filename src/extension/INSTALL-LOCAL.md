# KeyShield extension 1.2.5 · latest — local Load unpacked

Do not paste HTML into zsh. Do not run `eval`. Do not run `$(...)`.

`toolbar: ok 1.2.5` in the old print is a **next-step line**, not the Chrome card.
Leftover `patch-leftover-bridge.py` writes **1.2.4** onto every folder it finds,
including `src/extension`. Load unpacked then stays **1.2.4**. Reload is not enough.

Paste this from any directory (works from `~`). No `cd`. No `git pull`.
It writes **1.2.5** back onto the product folder only, then prints every KeyShield
folder so you do not Load unpacked leftover.

```
python3 - <<'PY'
from pathlib import Path
import json, os, sys

MAC = Path("/Users/aileen/Downloads/privacy_hack/keyshield")
WANT = "1.2.5"
NAME = "KeyShield — Sovereign Vault"
cands = [Path(os.environ["KS_ROOT"])] if os.environ.get("KS_ROOT") else []
cands += [MAC, Path.cwd(), Path.home() / "Downloads" / "privacy_hack" / "keyshield"]
root = next((p for p in cands if (p / "src/extension/manifest.json").is_file()), None)
if root is None:
    sys.stderr.write("NO CLONE at %s\n" % MAC)
    raise SystemExit(1)
ext = (root / "src/extension").resolve()
man_path = ext / "manifest.json"
m = json.loads(man_path.read_text())
was = str(m.get("version") or "")
action = m.get("action") if isinstance(m.get("action"), dict) else {}
hosts = list(m.get("host_permissions") or []) + list(m.get("optional_host_permissions") or [])
need = was != WANT or action.get("default_popup") != "popup.html" or "<all_urls>" not in hosts
if need:
    m["name"] = NAME
    m["version"] = WANT
    action["default_popup"] = "popup.html"
    action["default_title"] = NAME
    m["action"] = action
    m.setdefault("host_permissions", [])
    if "<all_urls>" not in m["host_permissions"]:
        m["host_permissions"].insert(0, "<all_urls>")
    man_path.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    m = json.loads(man_path.read_text())
print(m['name'])
print(m['version'])
print(os.path.abspath(str(ext)))
popup = ((m.get("action") or {}).get("default_popup") or "MISSING")
hosts = list(m.get("host_permissions") or []) + list(m.get("optional_host_permissions") or [])
urls = "<all_urls>" if "<all_urls>" in hosts else "missing <all_urls>"
print(popup)
print(urls)
ver = str(m.get("version") or "")
if ver == WANT and popup == "popup.html" and urls == "<all_urls>":
    print("READY 1.2.5")
elif ver == "1.2.4":
    print("LEFTOVER 1.2.4 — do not Load unpacked this folder")
else:
    print("NOT READY")
if need:
    print("restored", was, "->", WANT, ext)
else:
    print("already", WANT)
print("LOAD UNPACKED ONLY", ext)
print("next: chrome://extensions → Remove every KeyShield card → Load unpacked ONLY the folder above")
print("if Chrome card still says 1.2.4 you loaded leftover — Remove that card too")
print("do not run patch-leftover-bridge.py on src/extension")
if ver == WANT:
    print("toolbar then: ok 1.2.5 <all_urls>")
    print("latest then: 1.2.5 · latest")
    print("sign-in: https://app.ks.aileena.xyz/?ext=1&demo=shop")
PY
```

Must print `1.2.5` on line 2 and `READY 1.2.5`. Then:

1. Open `chrome://extensions`
2. Developer mode ON
3. Remove **every** KeyShield card (the 1.2.4 card too — Reload is not enough)
4. Load unpacked → **only** `/Users/aileen/Downloads/privacy_hack/keyshield/src/extension`
5. Chrome card must read **1.2.5**. If it still says **1.2.4**, you loaded leftover.
6. Toolbar first line: `ok 1.2.5 <all_urls>`. Next line: `1.2.5 · latest`
7. Sign in once at `https://app.ks.aileena.xyz/?ext=1&demo=shop`

Do **not** run leftover `patch-leftover-bridge.py` on this folder. That writes 1.2.4.

After a later pull:

```
python3 /Users/aileen/Downloads/privacy_hack/keyshield/scripts/mac_ready.py
```

Local fill fixture (Vite `node dev.cjs` on `:5173`):

```
http://127.0.0.1:5173/nvidia-fill-demo.html
http://127.0.0.1:5173/kilo-byok-fill-demo.html
```
