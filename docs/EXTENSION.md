# KeyShield Browser Extension

One-click capture: visit any provider dashboard, see the key, click "Save to
vault." The key never lands in a screenshot, a doc, or your clipboard history.

## 1. Install (unpacked, dev)

```bash
# 1. Build / open the extension folder
git checkout feat/frontend-wallet-mpp
# nothing to compile — the extension scripts are vanilla JS / MV3
ls frontend/{manifest.json,content.js,background.js}

# 2. Load it
#   Chrome → chrome://extensions → toggle "Developer mode"
#   → "Load unpacked" → pick the repo's frontend/ directory.
```

You should see `KeyShield — Sovereign Vault` appear in the toolbar.

## 2. Log in (so saves go to your vault, not the fallback dashboard tab)

Sign-in lives in the dashboard, not the popup, because login uses a Solana
wallet signature.

```bash
# In another terminal, with the backend running on :8000
cd frontend && npm install && npm run dev
# → http://localhost:3000
```

In the dashboard:

1. Connect a wallet (Phantom / Solflare / burner).
2. Sign the two prompts (challenge + vault-key derivation).
3. The dashboard sends `KS_TOKEN_REGISTER` to the extension via
   `externally_connectable`. The extension stores `ks_token` in
   `chrome.storage.local`.

Verify with the popup or DevTools:

```js
chrome.storage.local.get(['ks_token', 'ks_user'], console.log)
// → { ks_token: "ey…", ks_user: { id, wallet, … } }
```

### Pointing the extension at staging or prod

The extension reads `ks_api_base` and `ks_dashboard_url` from
`chrome.storage.local` (defaults: `http://localhost:8000` and `:3000`).
Set them once and you can reuse the same unpacked install everywhere:

```js
chrome.storage.local.set({
  ks_api_base:      'https://api.keyshield.dev',
  ks_dashboard_url: 'https://app.keyshield.dev',
})
```

(`manifest.json` already lists `https://api.keyshield.dev/*` and
`https://*.keyshield.dev/*` in `host_permissions`, so no extra prompts.)

## 3. Auto-detect demo

Open `https://platform.openai.com/api-keys` while logged in.

1. Click "Create new secret key" (or click "Reveal" on an existing one).
2. The KeyShield content script (`frontend/content.js`) sees the
   `sk-proj-…` / `sk-svcacct-…` / `sk-admin-…` / legacy `sk-…` token in either
   the page text or an input value.
3. Because `platform.openai.com` is in the OpenAI provider's domain list,
   the toast shows a green `✓ MATCH` "HIGH confidence" badge.
4. Click **Save to vault as openai**.

What happens behind the scenes:

```
content.js  ──sendMessage({type:'SAVE_KEY', payload})──▶  background.js
                                                          │
                                                          ▼
                              POST /manage/store {upstream:'openai', apiKey}
                              Authorization: Bearer ks_token
                                                          │
                              ┌───────────────────────────┴──────────────┐
                              ▼                                          ▼
                          200 OK                                       401 / network
                              │                                          │
                              ▼                                          ▼
            chrome.notifications "Saved openai key to KeyShield"   open dashboard tab
            sendResponse({ok:true})                                with prefilled URL
                              │
                              ▼
            content.js shows green in-page toast,
            auto-closes after 2.2 s
```

The raw key is in memory only inside the service worker for the duration of
the POST. It is then encrypted on the server with your wallet-derived
passphrase and never logged in plaintext.

## 4. Hide it on a noisy domain

If a tutorial site, a search-results page, or your own dashboard keeps
triggering the toast, click the small "Hide for this domain" link at the
bottom of the toast. The hostname is appended to
`chrome.storage.local.dismissed_domains` and `scan()` early-returns on
subsequent loads. You can clear the list any time:

```js
chrome.storage.local.remove('dismissed_domains')
```

## 5. Provider coverage (today)

| Provider | Pattern(s)                              | On-domain only? |
|---|---|---|
| OpenAI | `sk-proj-…`, `sk-svcacct-…`, `sk-admin-…`, `sk-…` ≥40 | no |
| Anthropic Claude | `sk-ant-api…` | no |
| Groq | `gsk_…` ≥40 | no |
| Mistral AI | 32-char alnum | yes |
| Cohere | 40-char alnum | yes |
| Helius RPC | `helius_auth_…`, UUID | yes |
| 0x Protocol | 36-char | yes |
| Alchemy | 32-char alnum | yes |

Patterns and `requiresDomain` flags live in `frontend/content.js` →
`PROVIDERS`. To add a provider, add a row, make sure the slug is in
`v2-mvp/src/server.py` `UPSTREAMS`, and reload the extension.

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Toast says "Sign in to KeyShield first" | No `ks_token` in storage | Open the dashboard at `:3000` and connect your wallet |
| Toast says "Session expired" | 401 from the backend | Re-sign in; the extension auto-clears the stale token |
| Toast says "Backend unreachable" | `apiBase` not running / wrong URL | Start `uvicorn src.server:app --port 8000` or update `ks_api_base` |
| No toast on a provider page | Pattern didn't match (e.g. key was masked) | Click "Reveal", or copy the key to focus a `<input>` |
| OS notification shows "icon not found" | No `icon.png` shipped yet | Cosmetic only. Add `icon.png` to manifest later. |
</content>
</invoke>