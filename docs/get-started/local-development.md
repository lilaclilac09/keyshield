# Local development

> Run the KeyShield popup on your laptop in **under five minutes**.
> No Cloudflare account, no Solana keypair, no Helius API key.
> The local sync worker uses in-process storage; the popup uses
> Solana devnet with the public RPC.

## What you'll have at the end

- The popup running at `http://localhost:5173/` in any
  PRF-capable browser.
- A local sync worker at `http://localhost:8787/` that the popup
  talks to.
- A vault you can create, store keys in, restore from a recovery
  phrase, and force-revoke from another device — fully offline.

---

## Prerequisites

- **Node.js 20+**. Verify with `node --version`.
- **A PRF-capable browser** (Safari 17+, Chrome 116+, Firefox 119+).
- **A repo checkout** with dependencies installed:
  ```bash
  git clone https://github.com/lilaclilac09/keyshield.git
  cd keyshield
  npm install
  ```

Nothing else is required. The Solana program calls are stubbed
in this mode — sessions still work, the chain just doesn't see them.

---

## Step 1 — Start the sync worker

Open a terminal in the repo root and run:

```bash
npm run dev:worker
```

- This is a thin alias for `npx wrangler dev` inside
  `infra/sync-worker/`.
- Wrangler starts a local workerd runtime on
  **`http://localhost:8787`** with two in-memory R2 buckets
  (`VAULTS` and `REGISTRY`).
- The first run downloads workerd; subsequent runs are instant.

**Verify:**

```bash
curl http://localhost:8787/health
# {"status":"ok"}
```

Leave this terminal running.

---

## Step 2 — Start the popup

In a **second terminal**:

```bash
npm run dev:popup
```

- Alias for `npx vite dev` inside `extension-sync/`.
- Vite serves the popup at **`http://localhost:5173`**.
- Hot reload is on; edits to `extension-sync/src/**` show up
  instantly.

By default the popup uses these endpoints:

| Variable | Default | What it does |
|---|---|---|
| `VITE_KEYSHIELD_SYNC_URL` | _(unset → in-memory)_ | Override to point at your local worker |
| `VITE_SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Solana RPC for session grants |
| `VITE_KEYSHIELD_PROGRAM_ID` | `11111111111111111111111111111112` | Placeholder program ID |

To make the popup actually use the local worker:

```bash
# Stop the previous dev:popup, then:
VITE_KEYSHIELD_SYNC_URL=http://localhost:8787 npm run dev:popup
```

**Verify:**

- Browser console shows _no_ `[KeyShield] VITE_KEYSHIELD_SYNC_URL
  not set` warning when you set the variable.
- Popup loads at `http://localhost:5173` and shows the **"Set up
  your vault"** screen.

---

## Step 3 — Create your first vault

In the popup browser tab:

1. Click **"Create vault with Face ID"**.
2. Approve the WebAuthn prompt your browser shows. (On macOS:
   Touch ID. On a Windows laptop with no biometric: a security-key
   PIN.)
3. The popup advances to the **"Save your recovery phrase"**
   screen and shows 24 words.

**Save those 24 words somewhere** — a password manager, a
text file, anywhere. You'll need them for Step 5.

4. Type `I have saved my phrase` into the confirmation box.
5. Click **"Continue to vault"**.

You're now in the unlocked vault list.

**Verify:**

- The popup shows **"Your API keys — 0 stored on this device"**.
- The bottom of the popup shows a green session bar.

---

## Step 4 — Add and reveal a key

1. Click **"+ Add key"**.
2. Type a name (e.g. `openai-prod`), a value (e.g. `sk-test-123`),
   and optionally tags (`prod, ai`). Click **Save**.
3. The key appears in the list as `openai-prod` with the value
   masked.
4. Click **reveal** on the row → the value shows. Click **hide**
   to mask it again.

**Verify:**

- A `PUT http://localhost:8787/vault/<vault-id>` request shows up
  in the popup's Network tab.
- The worker terminal logs `200 OK` on that PUT.
- Reload the popup tab — the key is still there. (Local cache +
  remote ciphertext both kept it.)

---

## Step 5 — Restore from the 24 words on a fresh device

To prove the recovery path works, simulate a "second device":

1. Open a **private / incognito window** in the same browser.
2. Visit `http://localhost:5173`.
3. Click **"I have a recovery phrase"** on the unlock screen.
4. Paste your 24 words.
5. Click **"Restore vault"**.

**Verify:**

- The popup transitions to the unlocked state and shows your
  `openai-prod` key with the same value.
- An amber **"Restored from recovery phrase"** banner appears
  above the session bar with two buttons:
  - **Add passkey** — register a passkey on this device so you
    don't have to retype the phrase next time.
  - **Force-revoke other devices** — drop every existing passkey
    registration on the sync server (use this if a device was
    actually lost).

---

## Step 6 — Run the test suite (optional)

From the repo root:

```bash
npm test
```

You should see ~419 tests pass across six workspaces:

- `@keyshield/agent-sdk` — 24
- `@keyshield/goat-wallet` — 6
- `@keyshield/extension` — 57 (legacy V1)
- `@keyshield/extension-sync` — 219 (popup + lib + hooks)
- `@keyshield/sync-worker` — 59 (workerd-pool integration)
- `@keyshield/mobile` — 56 (RN logic + storage adapters)

Type-check everything:

```bash
npm run typecheck
```

---

## Next steps

- **Customize the popup** — start in
  `extension-sync/src/popup/screens/`. The state machine is in
  `hooks/useVaultFlow.ts`.
- **Wire a real Solana program** — see
  [self-host.md § Deploy the program](./self-host.md#step-3--deploy-the-solana-program).
- **Deploy the worker for real** — see
  [self-host.md § Deploy the worker](./self-host.md#step-2--deploy-the-cloudflare-worker).

## Troubleshooting

- **"VITE_KEYSHIELD_SYNC_URL not set" warning** — expected if you
  didn't set it. Sync runs in-memory; nothing persists across
  popup reloads.
- **WebAuthn prompt never appears** — your browser is too old.
  The popup will show the **"Browser not supported"** upgrade
  screen instead.
- **`npm run dev:worker` exits with `compatibility_date` warning**
  — harmless. Wrangler is telling you the date in `wrangler.toml`
  is newer than the installed runtime.
- **Port 8787 or 5173 in use** — kill the leftover process
  (`lsof -i :8787` to find it) or override
  (`npx wrangler dev --port 8788`).
