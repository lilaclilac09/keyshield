# Self-host KeyShield

> Run KeyShield on **your own** Cloudflare account, **your own**
> Python API host (Railway is the reference), and **your own**
> Solana program ID. Three deploys, all reproducible from the
> command line. Budget about an hour the first time.

## What you'll have at the end

- A Cloudflare Worker at
  `https://keyshield-sync.<your-account>.workers.dev` with two
  R2 buckets backing it. Handles vault **storage** (Path A —
  zero-knowledge ciphertext sync).
- A Python FastAPI service deployed on Railway (or any Docker
  host) handling vault **usage** (proxy, billing, agents,
  sharing) at e.g. `https://api.ks.aileena.xyz`.
- A KeyShield Solana program deployed on devnet (or mainnet) at
  a program ID you own.
- A web-v2 dashboard build that points at all three, ready to
  ship to users (e.g. `https://app.ks.aileena.xyz`).

---

## Prerequisites

- **A Cloudflare account.** Free plan is enough to start.
  [Sign up](https://dash.cloudflare.com/sign-up).
- **The Wrangler CLI**, installed via the workspace:
  ```bash
  npx wrangler --version  # 3.99+
  ```
- **A Railway account** (or any Docker host that can run
  `Dockerfile.python`). [Sign up](https://railway.app).
- **The Solana CLI 2.1+**:
  ```bash
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
  solana --version
  ```
- **Rust + cargo-build-sbf** (installs platform tools on first
  run):
  ```bash
  cargo-build-sbf --version
  ```
- **A funded Solana keypair**:
  ```bash
  solana-keygen new --outfile ~/.config/solana/id.json
  solana config set --keypair ~/.config/solana/id.json
  solana config set --url devnet
  solana airdrop 2
  ```
- **A Helius API key** (recommended for deployment; the public RPC
  rate-limits during the program upload). Free tier is enough.
  [Get one](https://helius.dev).

---

## Step 1 — Authenticate Wrangler with Cloudflare

```bash
npx wrangler login
```

Wrangler opens a browser tab. Approve.

**Verify:**

```bash
npx wrangler whoami
# email: you@example.com
# account: 1234abcd...
```

Note your **account ID** — you'll need it for CI later.

---

## Step 2 — Deploy the Cloudflare Worker (vault storage)

### 2a. Create the R2 buckets

The worker needs two buckets: `keyshield-vaults` (cipher) and
`keyshield-registry` (passkey records + nonces).

```bash
cd src/infra/sync-worker
npx wrangler r2 bucket create keyshield-vaults
npx wrangler r2 bucket create keyshield-vaults-preview
npx wrangler r2 bucket create keyshield-registry
npx wrangler r2 bucket create keyshield-registry-preview
```

The `-preview` variants are used by `wrangler dev` so local
testing doesn't pollute production data.

**Verify:**

```bash
npx wrangler r2 bucket list
# All four bucket names show up.
```

### 2b. Set the JWT secret

This is what the worker signs short-lived bearer tokens with.
Generate something long and random:

```bash
openssl rand -hex 32 | npx wrangler secret put JWT_SECRET
```

**Don't** put `JWT_SECRET` in `wrangler.toml` — that file is
checked in. Secrets live in Cloudflare's encrypted store.

### 2c. Set RP_ID and RP_ORIGIN

These bind the WebAuthn passkeys to your domain. **Changing them
later breaks every existing user's passkey** because browsers
refuse assertions whose RP ID doesn't match.

```bash
echo "your-app.com" | npx wrangler secret put RP_ID
echo "https://your-app.com" | npx wrangler secret put RP_ORIGIN
```

For the `*.workers.dev` URL specifically:

```bash
echo "keyshield-sync.<your-account>.workers.dev" | npx wrangler secret put RP_ID
echo "https://keyshield-sync.<your-account>.workers.dev" | npx wrangler secret put RP_ORIGIN
```

### 2d. Deploy

```bash
npx wrangler deploy
```

Wrangler builds, uploads, and prints the deployed URL.

**Verify:**

```bash
curl https://keyshield-sync.<your-account>.workers.dev/health
# {"status":"ok"}
```

Also smoke-test that the auth routes are wired up:

```bash
curl -s -X POST https://keyshield-sync.<your-account>.workers.dev/auth/challenge \
  -H 'Content-Type: application/json' \
  -d '{"vaultId":"00000000000000000000"}'
# {"error":"vault not registered"}    ← expected
```

---

## Step 3 — Deploy the Python API (vault usage)

The Python service is what handles `/proxy/*`, `/billing/*`,
`/agents/*`, `/share/*`, `/usage/*`, `/mpp/*`, and the mobile
`/auth/passkey/*` routes. It is **stateless** with respect to
upstream API keys — clients send the decrypted key on each
request as `X-Upstream-API-Key`.

### 3a. Build the image

```bash
docker build -f Dockerfile.python -t keyshield-api .
```

### 3b. Deploy on Railway (reference)

Create a new Railway service backed by this repo and select
`Dockerfile.python` as the builder. Set these environment
variables in the Railway dashboard:

| Variable | Value | Purpose |
|---|---|---|
| `PORT` | `8080` (Railway sets this automatically; the Dockerfile binds to it) | HTTP listener |
| `KS_CORS_ORIGINS` | `https://app.ks.aileena.xyz,https://ks.aileena.xyz` | Comma-separated allowlist for browser callers |
| `SERVER_SECRET` | output of `openssl rand -hex 32` | Internal session signing key |
| `KS_INTERNAL_SECRET` | output of `openssl rand -hex 32` | Firewall token between web-v2 / extension and the API |

Optional but useful:

| Variable | Default | Purpose |
|---|---|---|
| `LOGLEVEL` | `INFO` | `DEBUG` for verbose logs |
| `KS_DATABASE_URL` | sqlite (in container) | Postgres URL for production billing/agents persistence |

After the first deploy, set a custom domain in the Railway
dashboard (e.g. `api.ks.aileena.xyz`) and copy that hostname for
Step 5.

**Verify:**

```bash
curl https://<your-railway-domain>/health
# {"status":"ok"}
```

### 3c. (Optional) Self-host the Python API somewhere else

Any Docker host works — Fly.io, Render, Cloud Run, your own
Hetzner box. The container exposes port `$PORT` and reads the
same env vars listed above.

---

## Step 4 — Deploy the Solana program

Full walkthrough lives in
[programs/keyshield/DEPLOY-ON-CHAIN.md](../../programs/keyshield/DEPLOY-ON-CHAIN.md).
Condensed version:

### 4a. Build

```bash
cd ../..  # back to repo root
cargo-build-sbf --manifest-path programs/keyshield/Cargo.toml
```

**Verify:** `target/deploy/keyshield.so` exists, ~62 KB stripped.

### 4b. (Optional) Use Helius for the upload

If you have a Helius key:

```bash
export HELIUS_API_KEY=your-key
solana config set --url "https://devnet.helius-rpc.com/?api-key=$HELIUS_API_KEY"
```

### 4c. Deploy

```bash
solana program deploy target/deploy/keyshield.so
```

The output ends with:

```
Program Id: 7xxx...your-new-program-id...xxx
```

**Save that program ID.**

**Verify:**

```bash
solana program show <YOUR_PROGRAM_ID>
# Authority: <your wallet>
# Last Deployed In Slot: ...
```

---

## Step 5 — Wire it all together (web-v2 dashboard)

In your web-v2 deployment (or
[frontend integration](./frontend-integration.md)), set these env
vars at build time:

```bash
# Where the Cloudflare sync-worker is deployed (vault storage, Path A)
KEYSHIELD_SYNC_URL=https://keyshield-sync.<your-account>.workers.dev
# (Vite-style alias — same value)
VITE_KEYSHIELD_SYNC_URL=https://keyshield-sync.<your-account>.workers.dev

# Where the Python API is deployed (vault usage — proxy, billing, agents)
KEYSHIELD_API_URL=https://api.ks.aileena.xyz
# (or a Railway *.up.railway.app domain if you haven't set a custom one)

# Solana program ID (deploy your own or use the shared one for testing)
KEYSHIELD_PROGRAM_ID=7xxx...your-program-id...xxx

# Solana RPC for top-ups, MPP, etc.
VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
```

Build and host:

```bash
cd src/web-v2
npm install
npm run build
# Outputs to dist/
```

Deploy `dist/` to Vercel, Netlify, or any static host. The
reference setup uses Vercel with the project building
`src/web-v2/`.

**Verify:**

- Open the deployed dashboard.
- "Create vault with Face ID" prompts for a passkey (Path A
  unlock).
- After saving the recovery phrase, the dashboard unlocks and
  shows an empty key list.
- A `PUT https://keyshield-sync.<account>.workers.dev/vault/...`
  shows up in the Network tab returning 200 (vault storage).
- Calling a stored upstream (e.g. OpenAI) issues a
  `POST https://api.ks.aileena.xyz/proxy/openai/...` with an
  `X-Upstream-API-Key` header (vault usage).

---

## Step 6 — Set up CI deploy (optional but recommended)

The repo ships a GitHub Action that auto-deploys the worker on
every merge to `main`. To enable it:

### 6a. Add repo secrets

In your GitHub repo settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN` — create at
  [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
  with "Workers Scripts: Edit" + "Workers R2 Storage: Edit"
  permissions.
- `CLOUDFLARE_ACCOUNT_ID` — the ID from `wrangler whoami`.

### 6b. Push to main

The workflow at `.github/workflows/sync-worker-deploy.yml` runs:

- On every PR touching `infra/sync-worker/**` → tests + typecheck.
- On every push to `main` → tests + typecheck + `wrangler deploy`.

**Verify:** push a no-op change, watch the Actions tab.

Railway has its own auto-deploy from the connected Git remote;
no extra GitHub Action is required for the Python API unless you
want CI tests to gate it.

---

## Operational tasks

### Rotating `JWT_SECRET`

```bash
openssl rand -hex 32 | npx wrangler secret put JWT_SECRET
```

In-flight tokens become invalid; users re-authenticate. No data
loss.

### Rotating `RP_ID` / `RP_ORIGIN`

Don't, unless you're migrating to a new domain. Every passkey is
bound to the old RP ID and will refuse to authenticate against
the new one. If you must:

1. Add the new origin alongside the old one (currently requires a
   code change in `webauthn.ts`).
2. Have users re-register passkeys at the new origin.
3. After migration, drop the old origin.

### Tearing down

```bash
cd src/infra/sync-worker
npx wrangler delete                        # removes the worker
npx wrangler r2 bucket delete keyshield-vaults
npx wrangler r2 bucket delete keyshield-vaults-preview
npx wrangler r2 bucket delete keyshield-registry
npx wrangler r2 bucket delete keyshield-registry-preview
```

Solana programs can't be deleted, only **closed** (and the rent
recovered) by the upgrade authority:

```bash
solana program close <YOUR_PROGRAM_ID> --bypass-warning
```

---

## Cost expectations

For a hobby deployment (~10 active users):

- **Cloudflare Workers** — free plan covers 100k requests/day.
  Each user does maybe 50 sync requests/day → free tier holds.
- **Cloudflare R2** — free up to 10 GB. Vaults are ~3 KB each
  ciphertext; 10k users fits in 30 MB.
- **Railway** — Hobby plan ($5/mo) covers a small Python service
  with ample headroom. Production traffic should move to a
  Pro plan.
- **Helius** — free tier is 100k credits/month, plenty for a
  small popup.
- **Solana** — devnet is free. Mainnet rent for the program
  account is ~1 SOL one-time at deploy time.

For ~10k active users: stay on Cloudflare free tier, upgrade
Helius to Developer ($49/mo), bump Railway to Pro.

---

## Troubleshooting

- **`wrangler deploy` fails with "binding R2 bucket not found"**
  → you didn't create the bucket name in `wrangler.toml`. Re-run
  step 2a with the exact names from `wrangler.toml`.
- **`solana program deploy` hangs at "Sending transaction…"** →
  the public RPC is rate-limiting. Switch to Helius (step 4b).
- **Worker returns 500 on `/auth/register`** → `RP_ID` or
  `RP_ORIGIN` doesn't match the popup's URL. Check the deployed
  worker's secrets (`npx wrangler secret list`).
- **CI deploy fails with 401** → `CLOUDFLARE_API_TOKEN` is missing
  the "Workers Scripts: Edit" permission. Re-create the token
  with both scopes selected.
- **Python API returns 403 on `/proxy/*`** → `KS_CORS_ORIGINS`
  doesn't include your dashboard origin, or the `X-Upstream-API-Key`
  header is missing from the request.

## Next steps

- [Frontend integration](./frontend-integration.md) — embed the
  dashboard in your own app (with both `KEYSHIELD_SYNC_URL` and
  `KEYSHIELD_API_URL` wired up).
- [DEPLOY-ON-CHAIN.md](../../programs/keyshield/DEPLOY-ON-CHAIN.md)
  — full Solana deploy with multisig authority + verifiable build.
- [DEPLOY.md](../../infra/sync-worker/DEPLOY.md) — full Worker
  deploy guide with RP rotation and JWT-secret rotation in detail.
