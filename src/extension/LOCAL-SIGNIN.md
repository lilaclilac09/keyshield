# Local unpacked still opens keyshield.dev

Chrome loaded the files that are **on disk in the folder you picked**.
`main` still has:

```js
const DEFAULT_DASHBOARD_URL = "https://keyshield.dev";
```

and `manifest.json` `"version": "1.1.1"`.

That matches the screenshot: card **1.1.1**, tab **keyshield.dev**.
Remove + Load unpacked from that same folder cannot change the URL.
It only reloads those old files.

## Check

After Load unpacked, the extension card and the popup line must say **v1.1.3**.
If they still say **1.1.1**, you did not load this source.

Pick **`src/extension`** — the folder that contains only:

- `manifest.json`
- `popup.js`
- `popup.html`
- `background.js`
- `content.js`

If the picker also shows `backend/`, `railway.json`, or a nested `src/`,
you selected the wrong parent.

## Fastest local edit (no branch switch)

On the machine that has the unpacked folder, edit these two files
**in that folder**, then Remove + Load unpacked again.

`popup.js` and `background.js` — replace the dashboard default:

```js
const DEFAULT_DASHBOARD_URL = "https://keyshield.dev";
```

with:

```js
const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:5173";
```

and in `manifest.json` set `"version": "1.1.3"` so the card proves the new files loaded.

Then run `node dev.cjs` and Sign-in. The tab must be `http://127.0.0.1:5173`.

## Or pull the branch that already has the fix

```bash
cd ~/Downloads/privacy_hack/keyshield
git fetch origin cursor/ext-signin-url-readme-b48a
git checkout cursor/ext-signin-url-readme-b48a
```

`chrome://extensions` → **Remove** KeyShield → **Load unpacked** →
`~/Downloads/privacy_hack/keyshield/src/extension`.
Card must show **1.1.3**. Popup must show
`v1.1.3 · Sign-in opens http://127.0.0.1:5173`.
