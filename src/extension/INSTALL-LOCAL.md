# KeyShield extension 1.2.5 · latest — local Load unpacked

Do not paste HTML into zsh. Do not run `eval`. Do not run `$(...)`.

If your print still says **1.2.4**, that folder is leftover. Reload is not enough.

From this Mac clone:

```
cd /Users/aileen/Downloads/privacy_hack/keyshield
git pull origin main
python3 -c "import json, os; m=json.load(open('src/extension/manifest.json')); print(m['name']); print(m['version']); print(os.path.abspath('src/extension'))"
```

Must print exactly:

```
KeyShield — Sovereign Vault
1.2.5
/Users/aileen/Downloads/privacy_hack/keyshield/src/extension
```

If GitHub DNS fails, skip `git pull` and use the clone you already have after it contains 1.2.5.

Then:

1. Open `chrome://extensions`
2. Developer mode ON
3. Remove every KeyShield card (Reload is not enough)
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
