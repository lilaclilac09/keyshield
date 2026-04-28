# Get started with KeyShield

KeyShield is a passkey-gated, end-to-end-encrypted vault for API keys —
synced across every device that has your passkey, with a 24-word
recovery phrase as the offline backup. It runs as a browser popup
today and a React Native app shortly.

This section gets you from zero to a working setup. Pick the page
that matches what you're trying to do:

| If you want to … | Read |
|---|---|
| **Inject vault keys into an agent process** from the terminal (`keyshield run -- python my-agent.py`) | [CLI](./cli.md) |
| **Run the popup locally** to develop, contribute a fix, or just see it work | [Local development](./local-development.md) |
| **Use KeyShield from your own frontend** (read keys, build the popup into your app) | [Frontend integration](./frontend-integration.md) |
| **Operate your own deployment** (your Cloudflare account, your Solana program ID) | [Self-host](./self-host.md) |

---

## How the pieces fit together

```
┌──────────────────────────┐         ┌────────────────────────┐
│  Browser popup           │         │  Cloudflare Worker      │
│  (extension-sync/)       │ ──────► │  (infra/sync-worker/)   │
│  WebAuthn PRF →          │  HTTPS  │   /auth/* + /vault/:id  │
│  AES-256-GCM in browser  │         │   stores ciphertext in  │
└──────────────────────────┘         │   R2; never sees keys   │
            │                         └────────────────────────┘
            │ Solana RPC (Helius)
            ▼
┌──────────────────────────┐
│  KeyShield program       │
│  (programs/keyshield/)   │
│  agent_grants[32] +      │
│  policy_rules[64]        │
└──────────────────────────┘
```

Three moving parts:

- **Popup** — runs in the user's browser. Encrypts the vault,
  derives a stable vault ID from the WebAuthn PRF output, and
  pushes ciphertext to the worker.
- **Worker** — a Cloudflare Worker on top of two R2 buckets.
  Authenticates writes via WebAuthn assertion → short-lived JWT.
  Stores ciphertext keyed by vault ID. Cannot decrypt.
- **Solana program** — manages per-device session grants
  (`grant_agent_access`, `revoke_all_agents`, etc.) for AI agents
  acting on the user's behalf. Optional; the popup vault works
  without it.

You don't have to run all three to get started. The pages below
say which parts each path needs.

---

## Prerequisites (everyone)

- **Node.js 20+** (the sync-worker test runner needs Node 20).
  Verify with `node --version`.
- **npm 10+**. The repo uses npm workspaces; `pnpm` / `yarn` will
  work but aren't tested.
- **A modern browser with WebAuthn PRF support**: Safari 17+,
  Chrome 116+, Firefox 119+. Older browsers hit the
  `unsupportedPlatform` screen and stop.
- **Git**, **a terminal**, and a checkout of the repo:
  ```bash
  git clone https://github.com/lilaclilac09/keyshield.git
  cd keyshield
  npm install
  ```

Path-specific prerequisites (a Cloudflare account, the Solana CLI,
Xcode for iOS) are listed in the page that needs them.

---

## When something goes wrong

- **Popup gets stuck on "Loading…"** → open the browser console.
  `[KeyShield] VITE_KEYSHIELD_SYNC_URL not set — using in-memory
  sync` is harmless; anything else is your error.
- **`unsupportedPlatform` screen** → your browser doesn't expose
  the WebAuthn PRF extension. Upgrade or switch browsers; there's
  no fallback.
- **Tests fail with "Isolated storage failed"** → the workerd test
  pool didn't reset between tests. `npm test --workspace=@keyshield/sync-worker`
  re-runs cleanly from scratch.

For deeper debugging, [SYNC_VAULT_ARCHITECTURE.md](../technical/SYNC_VAULT_ARCHITECTURE.md)
documents the V1.1 design end-to-end.
