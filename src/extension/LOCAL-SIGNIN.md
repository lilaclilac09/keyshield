# Sign in at https://app.ks.aileena.xyz

The hosted dashboard is **`https://app.ks.aileena.xyz`**.
Not `ks.app.aileena.xyz`. Not `https://keyshield.dev` (no DNS).
`http://127.0.0.1:5173` is only for `node dev.cjs`.

GitHub fetch failing (`Could not resolve host: github.com`) does not
block login. Edit the files already on disk.

## Fastest: no file edit

On the **1.1.1** popup you already have:

1. Open the popup → **Settings & manual token**
2. Dashboard URL = `https://app.ks.aileena.xyz`
3. Backend API base URL = `https://keyshield-production.up.railway.app`
4. **Save settings**
5. **→ Sign in to KeyShield**
6. On that tab: Phantom / wallet or passkey
7. If the badge stays `no token`: dashboard **Developer** → copy token →
   popup **Register token**

`main`'s `content.js` only announces on `keyshield.dev` / `127.0.0.1:5173`.
Hosted login often needs that Register-token fallback unless you run
the patch below.

## Offline patch (no git)

```bash
cd ~/Downloads/privacy_hack/keyshield/src/extension

python3 - <<'PY'
from pathlib import Path

HOSTED = "https://app.ks.aileena.xyz"

popup = Path("popup.js")
p = popup.read_text()
for old in (
    'const DEFAULT_DASHBOARD_URL = "https://keyshield.dev";',
    'const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:5173";',
):
    p = p.replace(old, f'const DEFAULT_DASHBOARD_URL = "{HOSTED}";')
popup.write_text(p)

bg = Path("background.js")
b = bg.read_text()
for old in (
    "const DEFAULT_DASHBOARD_URL = 'https://keyshield.dev';",
    "const DEFAULT_DASHBOARD_URL = 'http://127.0.0.1:5173';",
):
    b = b.replace(old, f"const DEFAULT_DASHBOARD_URL = '{HOSTED}';")
bg.write_text(b)

# main only announces on keyshield.dev / 5173 — add the hosted app
cjs = Path("content.js")
c = cjs.read_text()
needle = "location.hostname === 'keyshield.dev'  || location.hostname.endsWith('.keyshield.dev')"
insert = needle + " ||\n    location.hostname === 'app.ks.aileena.xyz' || location.hostname.endsWith('.aileena.xyz')"
if "app.ks.aileena.xyz" not in c:
    if needle not in c:
        raise SystemExit("content.js announce block not found")
    c = c.replace(needle, insert, 1)
    cjs.write_text(c)

man = Path("manifest.json")
m = man.read_text()
m = m.replace('"version": "1.1.1"', '"version": "1.1.4"', 1)
m = m.replace('"version": "1.1.3"', '"version": "1.1.4"', 1)
man.write_text(m)

print("ok")
print([l for l in popup.read_text().splitlines() if "DEFAULT_DASHBOARD_URL" in l][0])
print("content has app.ks.aileena.xyz:", "app.ks.aileena.xyz" in cjs.read_text())
print([l for l in man.read_text().splitlines() if '"version"' in l][0])
PY
```

Then `chrome://extensions` → **Remove** → **Load unpacked** →
`~/Downloads/privacy_hack/keyshield/src/extension`.
Card **1.1.4**. Sign-in tab **https://app.ks.aileena.xyz**.
