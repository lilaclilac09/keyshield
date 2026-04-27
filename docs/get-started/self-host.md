# Self-host KeyShield

> Run KeyShield on **your own** Cloudflare account and **your own**
> Solana program ID. Two deploys, both reproducible from the
> command line. Budget about an hour the first time.

## What you'll have at the end

- A Cloudflare Worker at
  `https://keyshield-sync.<your-account>.workers.dev` with two
  R2 buckets backing it.
- A KeyShield Solana program deployed on devnet (or mainnet) at
  a program ID you own.
- A popup config that points at both, ready to ship to users.

---

## Prerequisites

- **A Cloudflare account.** Free plan is enough to start.
  [Sign up](https://dash.cloudflare.com/sign-up).
- **The Wrangler CLI**, installed via the workspace:
  ```bash
  npx wrangler --version  # 3.99+
  ```
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

## Step 2 — Deploy the Cloudflare Worker

### 2a. Create the R2 buckets

The worker needs two buckets: `keyshield-vaults` (cipher) and
`keyshield-registry` (passkey records + nonces).

```bash
cd infra/sync-worker
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

## Step 3 — Deploy the Solana program

Full walkthrough lives in
[programs/keyshield/DEPLOY-ON-CHAIN.md](../../programs/keyshield/DEPLOY-ON-CHAIN.md).
Condensed version:

### 3a. Build

```bash
cd ../..  # back to repo root
cargo-build-sbf --manifest-path programs/keyshield/Cargo.toml
```

**Verify:** `target/deploy/keyshield.so` exists, ~62 KB stripped.

### 3b. (Optional) Use Helius for the upload

If you have a Helius key:

```bash
export HELIUS_API_KEY=your-key
solana config set --url "https://devnet.helius-rpc.com/?api-key=$HELIUS_API_KEY"
```

### 3c. Deploy

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

## Step 4 — Wire it all together

In your popup deployment (or
[frontend integration](./frontend-integration.md)):

```bash
VITE_KEYSHIELD_SYNC_URL=https://keyshield-sync.<your-account>.workers.dev
VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
VITE_KEYSHIELD_PROGRAM_ID=7xxx...your-program-id...xxx
```

Build the popup and host it wherever you serve static assets:

```bash
cd extension-sync
npm run build
# Outputs to dist/
```

**Verify:**

- Open the deployed popup.
- "Create vault with Face ID" prompts for a passkey.
- After saving the recovery phrase, the popup unlocks and shows
  an empty key list.
- A `PUT https://keyshield-sync.<account>.workers.dev/vault/...`
  shows up in the Network tab returning 200.

---

## Step 5 — Set up CI deploy (optional but recommended)

The repo ships a GitHub Action that auto-deploys the worker on
every merge to `main`. To enable it:

### 5a. Add repo secrets

In your GitHub repo settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN` — create at
  [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
  with "Workers Scripts: Edit" + "Workers R2 Storage: Edit"
  permissions.
- `CLOUDFLARE_ACCOUNT_ID` — the ID from `wrangler whoami`.

### 5b. Push to main

The workflow at `.github/workflows/sync-worker-deploy.yml` runs:

- On every PR touching `infra/sync-worker/**` → tests + typecheck.
- On every push to `main` → tests + typecheck + `wrangler deploy`.

**Verify:** push a no-op change, watch the Actions tab.

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
cd infra/sync-worker
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
- **Helius** — free tier is 100k credits/month, plenty for a
  small popup.
- **Solana** — devnet is free. Mainnet rent for the program
  account is ~1 SOL one-time at deploy time.

For ~10k active users: stay on Cloudflare free tier, upgrade
Helius to Developer ($49/mo).

---

## Troubleshooting

- **`wrangler deploy` fails with "binding R2 bucket not found"**
  → you didn't create the bucket name in `wrangler.toml`. Re-run
  step 2a with the exact names from `wrangler.toml`.
- **`solana program deploy` hangs at "Sending transaction…"** →
  the public RPC is rate-limiting. Switch to Helius (step 3b).
- **Worker returns 500 on `/auth/register`** → `RP_ID` or
  `RP_ORIGIN` doesn't match the popup's URL. Check the deployed
  worker's secrets (`npx wrangler secret list`).
- **CI deploy fails with 401** → `CLOUDFLARE_API_TOKEN` is missing
  the "Workers Scripts: Edit" permission. Re-create the token
  with both scopes selected.

## Next steps

- [Frontend integration](./frontend-integration.md) — embed the
  popup in your own app.
- [DEPLOY-ON-CHAIN.md](../../programs/keyshield/DEPLOY-ON-CHAIN.md)
  — full Solana deploy with multisig authority + verifiable build.
- [DEPLOY.md](../../infra/sync-worker/DEPLOY.md) — full Worker
  deploy guide with RP rotation and JWT-secret rotation in detail.
