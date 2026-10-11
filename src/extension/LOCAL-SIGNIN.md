# Sign in without editing Downloads

This Cloud / GitHub checkout **cannot** write
`~/Downloads/privacy_hack/keyshield` on your Mac. You do not need that
folder to log in.

## Login now (old 1.1.1 card)

1. Leave the unpacked extension as-is. Do **not** click **Sign in**
   (that tab is `https://keyshield.dev` and has no DNS).
2. In the same Chrome profile, open
   [https://app.ks.aileena.xyz](https://app.ks.aileena.xyz).
3. Wallet or passkey. Open **Home** (or **Developer** → Session token).
4. **Copy token for extension**.
5. KeyShield popup → paste → **Register token**.
6. Badge must leave `no token`.

Do **not** paste `<script>…</script>` into zsh. That is HTML.

## After this branch is on GitHub `main`

`git pull` the repo you use for Load unpacked (or clone fresh). Then
`chrome://extensions` → **Remove** → **Load unpacked** → `src/extension`.
The card must say **1.1.9**. Sign-in then opens
`https://app.ks.aileena.xyz/?ext=1` already logged in when a token is in
the popup or on the hosted site. First visit still needs wallet / passkey
once. After that, opening Sign-in is Home — not AuthScreen.

If `git fetch` fails (`Could not resolve host: github.com`), keep using
the token paste path above. Optional disk patch (only if you want the
new Sign-in button on that Mac clone):

```bash
cd ~/Downloads/privacy_hack/keyshield

python3 - <<'PY'
from pathlib import Path
import re

root = Path.cwd()
if (root / "src/extension/popup.js").exists():
    pass
elif (root / "popup.js").exists() and (root / "../web/index.html").exists():
    root = root.parent.parent
else:
    raise SystemExit("run from ~/Downloads/privacy_hack/keyshield")

HOSTED = "https://app.ks.aileena.xyz"
ext = root / "src/extension"
web = root / "src/web/index.html"

def set_dash(path: Path, quote: str) -> str:
    text = path.read_text()
    new, n = re.subn(
        r"const DEFAULT_DASHBOARD_URL = ['\"][^'\"]+['\"];",
        f"const DEFAULT_DASHBOARD_URL = {quote}{HOSTED}{quote};",
        text,
        count=1,
    )
    if n != 1:
        raise SystemExit(f"DEFAULT_DASHBOARD_URL not found in {path.name}")
    path.write_text(new)
    return [l for l in new.splitlines() if "DEFAULT_DASHBOARD_URL" in l][0]

print("popup", set_dash(ext / "popup.js", '"'))
print("bg   ", set_dash(ext / "background.js", "'"))

cjs = ext / "content.js"
c = cjs.read_text()
if "app.ks.aileena.xyz" not in c:
    needle = "location.hostname === 'keyshield.dev'  || location.hostname.endsWith('.keyshield.dev')"
    if needle not in c:
        needle = "location.hostname === 'keyshield.dev' || location.hostname.endsWith('.keyshield.dev')"
    if needle not in c:
        raise SystemExit("content.js announce block not found")
    c = c.replace(
        needle,
        needle + " ||\n    location.hostname === 'app.ks.aileena.xyz' || location.hostname.endsWith('.aileena.xyz')",
        1,
    )
    cjs.write_text(c)
print("content announce", "app.ks.aileena.xyz" in cjs.read_text())

man = ext / "manifest.json"
m = man.read_text()
m = re.sub(r'"version": "1\.[0-9.]+"', '"version": "1.1.9"', m, count=1)
man.write_text(m)
print("manifest", [l.strip() for l in m.splitlines() if '"version"' in l][0])

html = web.read_text()
marker = "location.replace('https://app.ks.aileena.xyz'"
if marker not in html:
    snippet = """  <script>
    (function () {
      if (/(?:^|[?&])local=1(?:&|$)/.test(location.search)) return;
      var h = location.hostname;
      var p = location.port;
      if ((h !== '127.0.0.1' && h !== 'localhost') || (p && p !== '5173' && p !== '5174')) return;
      location.replace('https://app.ks.aileena.xyz' + location.pathname + location.search + location.hash);
    })();
  </script>
"""
    if "<div id=\"root\"></div>" not in html:
        raise SystemExit("src/web/index.html missing #root")
    html = html.replace("<div id=\"root\"></div>\n", "<div id=\"root\"></div>\n" + snippet, 1)
    web.write_text(html)
print("index.html redirect", marker in web.read_text())
print("ok", HOSTED)
PY
```

Then Remove + Load unpacked. Card **1.1.9**. Sign-in tab must be
`https://app.ks.aileena.xyz/?ext=1`.
