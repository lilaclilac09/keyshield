# KeyShield — Demo Recording Script

> Recording time: ~3-5 minutes
> Tool: QuickTime Player (Cmd+Shift+5) or OBS or Loom
> Resolution: 1920x1080 recommended

---

## Pre-recording Setup

```bash
# Terminal 1: Start backend
cd ~/Downloads/privacy_hack/keyshield
python3 -m uvicorn src.backend.app:app --port 8000 --reload

# Terminal 2: Start frontend
cd ~/Downloads/privacy_hack/keyshield/src/web
npx vite --port 5173
```

Open browser to **http://localhost:5173**

---

## Scene 1: Login (0:00 – 0:20)

**What to show:** The auth screen and wallet connection flow.

1. Open http://localhost:5173 — the auth screen loads
2. Click **"Select Wallet"** (or the Phantom / Solflare button)
3. Approve the wallet connection in your wallet extension
4. You're now in the dashboard

**Narration idea:**
> "KeyShield is a zero-trust API key vault. Let's walk through the full flow — from storing a key to using it live."

---

## Scene 2: Vault — Store an API Key (0:20 – 1:00)

**What to show:** Adding a new API key via the web dashboard.

1. You're on the **Vault** tab (default after login)
2. Click the **"+ Add"** button in the header
3. In the modal:
   - Name: `My Helius Key`
   - Value: `test-helius-key-demo` (or a real key if you want live calls)
   - Domain: `helius.dev`
   - Notes: `Demo key for hackathon`
4. Click **Save**
5. The new entry appears in the vault list
6. Click the **eye icon** to decrypt and reveal the key (shows it's stored encrypted)

**Narration idea:**
> "Keys are encrypted client-side with AES-256-GCM before being stored. The server never sees plaintext."

---

## Scene 3: Device Vault — Extension Bridge (1:00 – 1:40)

**What to show:** How extension-stored keys appear in the dashboard.

1. Click **"Device Vault"** in the sidebar
2. You'll see the Device Vault section with two areas:
   - **Top**: Client-encrypted vault entries (from WebAuthn/passkey flow)
   - **Bottom**: Extension-stored keys (bridged from `/manage/vault`)
3. If you previously stored keys via the extension, they appear here
4. To simulate: use curl to store a test key:

```bash
curl --noproxy '*' -X POST http://localhost:8000/manage/store \
  -H "Content-Type: application/json" \
  -d '{"upstream":"helius","key":"demo-helius-key-12345"}'
```

5. Refresh the Device Vault page — the key appears under "Extension-Stored Keys"

**Narration idea:**
> "Keys detected by our browser extension are automatically synced to the dashboard. You can see and use them without re-entering."

---

## Scene 4: Use a Key — Helius RPC Call (1:40 – 2:20)

**What to show:** Making a live API call through the proxy.

1. Still on **Device Vault**, find the Helius entry
2. Click **"Use"** to expand the action panel
3. The panel shows a pre-configured Helius `getSlot` RPC call
4. Click **"Run"** (or equivalent button)
5. The response appears — showing the current Solana slot number
6. Point out: the API key was decrypted client-side, sent in `X-Upstream-API-Key` header, used once, never stored server-side

**Narration idea (if key is not real):**
> "In production, this would return the live Solana slot. The key is decrypted on your device, injected into the request header, and the proxy forwards it — never persisting the plaintext."

**Alternative — use curl to demo proxy:**

```bash
# Store a key first
curl --noproxy '*' -X POST http://localhost:8000/manage/store \
  -H "Content-Type: application/json" \
  -d '{"upstream":"helius","key":"YOUR_REAL_HELIUS_KEY"}'

# Call through proxy (simulating what the dashboard does)
curl --noproxy '*' -X POST http://localhost:8000/proxy/helius/ \
  -H "X-Upstream-API-Key: YOUR_REAL_HELIUS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}'
```

---

## Scene 5: X402 Trust Domains (2:20 – 3:00)

**What to show:** Auto-payment configuration for micropayments.

1. Click **"X402 Trust"** in the sidebar
2. The Trust Manager loads — shows any existing trusted domains
3. Click **"Add Domain"**
4. Enter:
   - Domain: `api.example.com`
   - Max auto-pay: `$1.00`
5. Click **Add** — domain appears in the list with a toggle
6. Toggle the domain on/off to show enable/disable
7. Click the **X** to remove a domain

**Narration idea:**
> "x402 is the HTTP payment protocol. When a proxied API returns 402 Payment Required, KeyShield can auto-pay from your wallet if the domain is trusted and under your threshold."

---

## Scene 6: Architecture Overview (3:00 – 3:30)

**What to show:** Quick tour of other sections.

1. Click **"Activity"** — shows proxy call logs and billing
2. Click **"Agents"** — shows registered AI agents with ed25519 keys
3. Click **"Developer"** — shows API tokens and SDK snippets
4. Click **"Docs"** — shows architecture documentation

**Narration idea:**
> "The dashboard gives you full visibility: activity logs, agent management, developer tools, and comprehensive docs — all in one place."

---

## Scene 7: Closing (3:30 – 3:45)

**What to say:**
> "KeyShield: your API keys never leave your device unencrypted. Store once, use everywhere, pay with x402 micropayments. Zero-trust by design."

---

## Pro Tips for Recording

- **Browser**: Use Chrome/Brave in incognito for a clean look
- **Font size**: Zoom browser to 110-125% so text is readable
- **Terminal**: If showing curl commands, use a large font (18pt+)
- **Wallet**: Have Phantom or Solflare installed and ready
- **Speed**: Don't rush — pause 1-2 seconds at each screen so viewers can read
- **Errors**: If something fails, that's OK — just explain what would happen and move on

## Quick Curl Cheat Sheet

```bash
# Health check
curl --noproxy '*' http://localhost:8000/health

# Store a key
curl --noproxy '*' -X POST http://localhost:8000/manage/store \
  -H "Content-Type: application/json" \
  -d '{"upstream":"helius","key":"your-key-here"}'

# List stored keys
curl --noproxy '*' http://localhost:8000/manage/vault

# Proxy a Helius call
curl --noproxy '*' -X POST http://localhost:8000/proxy/helius/ \
  -H "X-Upstream-API-Key: your-key-here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}'

# Add x402 trust domain
curl --noproxy '*' -X POST http://localhost:8000/x402/trust \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"domain":"api.example.com","max_micro":1000000,"daily_cap":10000000,"enabled":1}'

# List trusted domains
curl --noproxy '*' http://localhost:8000/x402/trust \
  -H "Authorization: Bearer test-token"
```
