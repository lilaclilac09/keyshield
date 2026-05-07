# KeyShield Frontend

Vault dashboard + Chrome extension. Single source of code, two delivery modes.

> **For agents (Claude / Codex / Cursor / etc) picking this up cold:**
> Branch `refactor/clean-multi-type-vault` is the working version. `main` is an older "cyberpunk" theme — don't run that one.

---

## Run it locally (3 commands)

```bash
git fetch origin
git checkout refactor/clean-multi-type-vault    # the good one
cd frontend && npm install && npm run dev
```

Frontend boots at `http://localhost:3000` (or 3001/3002 if 3000 is taken).

You also need the backend running on `:8000`:

```bash
# from the repo root, in another terminal
cd v2-mvp
python3.14 -m venv .venv 2>/dev/null || true
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn src.server:app --port 8000 --reload
```

---

## What this codebase is

```
frontend/
├── App.tsx                     ← 275 lines: sidebar + section router only
├── index.tsx                   ← React mount
├── index.html                  ← Tailwind CDN + entry
├── types.ts                    ← VaultItem + 5 secret payload types
├── manifest.json               ← also serves as Chrome extension manifest
├── background.js / content.js  ← extension scripts (auto-detect API keys)
│
├── components/
│   ├── AuthScreen.tsx          ← wallet connect + Face ID for trusted devices
│   ├── WalletConnector.tsx     ← signs 2 messages: challenge + vault-key derivation
│   ├── SolanaProvider.tsx      ← Phantom / Solflare / Burner adapters
│   ├── AddKeyModal.tsx         ← 5 type tabs: api_key / password / note / env / ssh_key
│   ├── VaultItemCard.tsx       ← per-type body sub-components
│   ├── ProviderIcons.tsx       ← OpenAI / Helius / etc logos
│   │
│   ├── sections/               ← one file per dashboard panel
│   │   ├── VaultSection.tsx
│   │   ├── ActivitySection.tsx ← billing + usage + proxy call log
│   │   ├── AgentsSection.tsx   ← ed25519 keypair generator + register
│   │   ├── SharingSection.tsx
│   │   ├── SessionsSection.tsx
│   │   ├── SettingsSection.tsx ← identity / devices / prefs / extension / data + 1Password compare
│   │   ├── DeveloperSection.tsx
│   │   └── DocsSection.tsx
│   │
│   └── ui/                     ← shared primitives
│       ├── StatCard.tsx
│       ├── Placeholder.tsx
│       ├── CopyButton.tsx       (also exports useCopyable hook)
│       └── CodeBlock.tsx
│
├── hooks/
│   └── useVaults.ts            ← /manage/list /store /decrypt /secret CRUD
│
└── lib/
    ├── auth.ts                 ← session token + passkey + extension bridge
    ├── vault-key.ts            ← deterministic passphrase from wallet sig
    ├── time.ts                 ← relTime
    └── preferences.ts          ← user prefs in localStorage
```

---

## Two consumer modes (this is the whole point)

```
┌── Human user ──────────────────────────────────────────────┐
│                                                              │
│  Browser ──▶ /auth/wallet-login ──▶ session token            │
│                                                              │
│  Dashboard:                                                  │
│   • Vault: store API keys / passwords / notes / env / SSH    │
│   • Reveal locally with Face ID / wallet sig                 │
│   • Activity: every proxy call, cost, latency                │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌── Agent / CI / bot ────────────────────────────────────────┐
│                                                              │
│  Agent ──▶ http://localhost:8000/proxy/openai/v1/chat/...    │
│            Authorization: Bearer <ks_token>                  │
│                                                              │
│  Backend internally:                                         │
│    1. Verify token                                           │
│    2. AES-decrypt user's stored OpenAI key with passphrase   │
│    3. Inject into upstream request                           │
│    4. Forward to api.openai.com                              │
│                                                              │
│  Agent never sees the raw key. Server logs the call          │
│  (provider, latency, cost, key_type).                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Vault item types

All five live in the same `/manage/list` and `/manage/decrypt/{id}` endpoints. Type is encoded in the slug prefix:

| Type | Slug prefix | Decrypted value |
|---|---|---|
| `api_key`  | (none — slug = upstream id like `openai`) | plain string |
| `password` | `pw__`   | JSON `{ username, password, url, notes }` |
| `note`     | `note__` | JSON `{ title, content }` |
| `env`      | `env__`  | JSON `{ vars: [{key, value}], notes }` |
| `ssh_key`  | `ssh__`  | JSON `{ publicKey, privateKey, passphrase, comment }` |

Backend allowlist for slugs: `UPSTREAMS` dict (api keys) + `ALLOWED_USER_PREFIXES` tuple (`pw__`, `note__`, `env__`, `ssh__`). See `v2-mvp/src/server.py`.

---

## Branch layout

```
main                                     ← old "cyberpunk" theme (Jan 2026) — don't ship
refactor/clean-multi-type-vault          ← THIS — wallet+passkey, 5 types, modular
```

Use `git log --oneline -5` to see what's where.

---

## Common tasks

```bash
# type-check (no errors expected)
npx tsc --noEmit

# build for production
npm run build

# build as Chrome extension
# In Chrome: chrome://extensions → Developer mode → Load unpacked → select /frontend
```

---

## Backend pairing

The frontend calls `http://localhost:8000` by default. Override with `KEYSHIELD_API_URL` env var or set `API_BASE` in `lib/auth.ts`.

CORS is open for ports 3000–3005 + 5173–5175 by default (see `v2-mvp/src/server.py`).
