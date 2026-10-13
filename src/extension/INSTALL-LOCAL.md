# KeyShield extension 1.2.5 — local Load unpacked

Do not paste HTML into zsh. Do not run `eval`. Do not run `$(...)`.

Print the folder path from the repo root (python3 only):

```
python3 -c "import os; print(os.path.abspath('src/extension'))"
```

Then:

1. Open `chrome://extensions`
2. Developer mode ON
3. Remove every KeyShield card (Reload is not enough)
4. Load unpacked → the folder printed above (`src/extension`)
5. Card must read: **KeyShield — Sovereign Vault** · **1.2.5**
6. Click the toolbar icon. First green line must be exactly `ok 1.2.5 <all_urls>`
7. Saved NVIDIA (`nvapi-`) keys fill empty API Key blanks. No toast. The 🔑 only appears when you hover a blank.

If GitHub DNS fails, use the clone you already have. Do not `git pull` through a broken resolver.

Local fill fixture (Vite `node dev.cjs` on `:5173`):

```
http://127.0.0.1:5173/nvidia-fill-demo.html
```

Popup click must open `popup.html`. Version 1.2.4 leftover stamps still count as detect-ready.
