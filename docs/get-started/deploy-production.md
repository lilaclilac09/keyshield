# Deploying KeyShield to production

> One-page reference for the four production tiers. Last verified
> 2026-05-10. If you're trying to run the stack locally, use
> [`Makefile.docker`](../../Makefile.docker) instead — that's
> dev-convenience; this page is the real deploy.

## Topology

| Tier | URL | Platform | Source dir | Config file |
|---|---|---|---|---|
| Landing | `https://ks.aileena.xyz` | Vercel | `landing/` | [`landing/vercel.json`](../../landing/vercel.json) |
| App (dashboard) | `https://app.ks.aileena.xyz` | Vercel | `src/web/` | (currently no `vercel.json` in `src/web/` — see Tier 2) |
| Sync Worker (vault storage) | `https://keyshield-sync.<account>.workers.dev` | Cloudflare | `src/infra/sync-worker/` | [`src/infra/sync-worker/wrangler.toml`](../../src/infra/sync-worker/wrangler.toml) |
| API (Python business logic) | `https://api.ks.aileena.xyz` | Railway | repo root | [`railway.json`](../../railway.json) + [`Dockerfile.python`](../../Dockerfile.python) |

> **Layout note (2026-05-10):** the previous `src/web-v2/` was archived
> to `src/_archive/web-v2/` and the dashboard at `dashboard/` was
> renamed to `src/web/`. Refs below that say "src/web-v2" in older
> Vercel project settings should be re-pointed at `src/web`. The Path A
> Device Vault UI components are still in the archive — they haven't
> been ported into the new `src/web/` yet.

```
                      ┌───────────────────────────────┐
   ks.aileena.xyz ──▶ │ Vercel — landing/             │ static
                      └───────────────────────────────┘
                      ┌───────────────────────────────┐
app.ks.aileena.xyz ─▶ │ Vercel — src/web/             │ Vite SPA
                      │   ↓ KEYSHIELD_API_URL          │
                      │   ↓ KEYSHIELD_SYNC_URL         │
                      └───────────────────────────────┘
                      ┌───────────────────────────────┐
api.ks.aileena.xyz ─▶ │ Railway — Dockerfile.python   │ FastAPI
                      │   /proxy/*    /agents/*       │ stateless w.r.t.
                      │   /mpp/*      /auth/*         │ upstream API keys
                      │   /vault-share/*               │
                      └───────────────────────────────┘
                      ┌───────────────────────────────┐
   *.workers.dev   ─▶ │ Cloudflare — sync-worker      │ R2-backed,
                      │   /vault/:id (CAS)            │ zero-knowledge
                      │   /auth/{register,exchange}   │
                      └───────────────────────────────┘
```

---

## Tier 1 — Landing (Vercel)

**One-time setup**:

1. In the Vercel dashboard, **Add New Project** → import this repo.
2. Set **Root Directory** to `landing`. Framework: leave on auto.
3. Add custom domain `ks.aileena.xyz`. Vercel guides you through the
   DNS A/CNAME record on your registrar.

**Per-deploy**: nothing. Vercel auto-deploys on push to `main`.

**Env**: none — pure static HTML.

---

## Tier 2 — App / dashboard (Vercel)

**One-time setup**:

1. **Add New Project** → same repo, separate Vercel project.
2. **Root Directory**: `src/web`.
3. **Framework**: Vite. Build command `npm run build`, install command
   `npm install`, output `dist`, SPA rewrite (`/(.*) → /index.html`).
   No `vercel.json` ships in `src/web/` yet — set these in the Vercel
   UI, or commit one mirroring the archived `src/_archive/web-v2/vercel.json`.
4. Custom domain `app.ks.aileena.xyz`.
5. Project **Settings → Environment Variables** (Production scope):

   | Variable | Value |
   |---|---|
   | `KEYSHIELD_API_URL` | `https://api.ks.aileena.xyz` |
   | `KEYSHIELD_SYNC_URL` | `https://keyshield-sync.<account>.workers.dev` |
   | `KEYSHIELD_PROGRAM_ID` | `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` (devnet today) |
   | `KEYSHIELD_SOLANA_CLUSTER` | `devnet` |

   These are **build-time** in Vite — Vercel re-runs the build when you
   change them, so a redeploy is required. They get baked into the JS
   bundle.

**Per-deploy**: nothing. Auto-deploys on push to `main` since `src/web`
is in the workspace.

**Pending (2026-05-10)**: the Path A Device Vault UI lives in
`src/_archive/web-v2/components/sections/DeviceVaultSection.tsx`
(archived during the dashboard rename). Until that flow is reintegrated
into `src/web/`, on-chain wallet sign-off has to happen via
`scripts/pay.sh --build-tx-only` + a wallet that can wrap the returned
ix payload. See [device-vault-ui.md](./device-vault-ui.md).

---

## Tier 3 — Sync Worker (Cloudflare)

**One-time setup** — see also [`src/infra/sync-worker/DEPLOY.md`](../../src/infra/sync-worker/DEPLOY.md):

1. From `src/infra/sync-worker/`:
   ```bash
   npm install
   npx wrangler login
   npx wrangler r2 bucket create keyshield-vaults
   npx wrangler r2 bucket create keyshield-vaults-preview
   npx wrangler r2 bucket create keyshield-registry
   npx wrangler r2 bucket create keyshield-registry-preview
   ```
2. Set the JWT secret (don't commit it):
   ```bash
   npx wrangler secret put JWT_SECRET
   # paste a long random string — `openssl rand -base64 48`
   ```
3. Deploy:
   ```bash
   npx wrangler deploy
   ```
4. The Worker is now at
   `https://keyshield-sync.<your-account>.workers.dev`. Plug that URL
   into the Vercel env var `KEYSHIELD_SYNC_URL`.

**Per-deploy**: `npx wrangler deploy` from `src/infra/sync-worker/`. Add
to CI later via `cloudflare/wrangler-action`.

**Env / secrets** (Worker side):

| Where | Name | Notes |
|---|---|---|
| `wrangler.toml` `[vars]` | `JWT_ISSUER` | `keyshield-sync` |
| `wrangler.toml` `[vars]` | `MAX_VAULT_BYTES` | `65536` |
| `wrangler secret` | `JWT_SECRET` | long random — never commit |

---

## Tier 4 — API / Python (Railway)

**One-time setup**:

1. **Create Project** in Railway → import GitHub repo.
2. Railway auto-detects [`railway.json`](../../railway.json) at the
   repo root and uses [`Dockerfile.python`](../../Dockerfile.python) to
   build (no Nixpacks needed).
3. Custom domain `api.ks.aileena.xyz` (Railway docs: Settings →
   Networking → Custom Domain).
4. Service **Variables**:

   | Required | |
   |---|---|
   | `SERVER_SECRET` | 32+ byte random — `openssl rand -hex 32` |
   | `KS_INTERNAL_SECRET` | 32+ byte random |
   | `DATABASE_URL` | Railway-provisioned Postgres (Add Plugin → PostgreSQL → auto-injects) |
   | `REDIS_URL` | Railway-provisioned Redis (Add Plugin → Redis) |

   | Solana / on-chain | |
   |---|---|
   | `KS_KEYSHIELD_PROGRAM_ID` | `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` |
   | `KS_USDC_MINT` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (devnet) |
   | `KS_SOLANA_RPC_URL` | `https://api.devnet.solana.com` |
   | `KS_MPP_SETTLER_PUBKEY` | settler wallet pubkey (base58) |
   | `KS_MPP_SETTLER_KEY` | settler keypair (64-byte ed25519 base58) — use Railway Secret |
   | `KS_PLATFORM_USDC_ATA` | settler's USDC ATA pubkey |

   | Upstream proxies | |
   |---|---|
   | `HELIUS_API_KEY` | Helius RPC key |
   | `KS_X402_BASE_RPC_URL` | `https://mainnet.base.org` |
   | `KS_X402_RECEIVER_ADDRESS` | your Base USDC receiver |

5. CORS — make sure the Python app trusts `https://app.ks.aileena.xyz`
   so the Vercel frontend can hit it. The current FastAPI app reads
   `ALLOWED_ORIGINS` (csv) — add it as a Railway variable.

**Per-deploy**: Railway auto-deploys on push to `main`. The healthcheck
hits `/health` (set in `railway.json`); a non-200 reverts to the
previous build.

---

## DNS (Vercel domain registrar or wherever `aileena.xyz` lives)

| Subdomain | Type | Target |
|---|---|---|
| `ks` | CNAME | `cname.vercel-dns.com.` (Vercel landing project) |
| `app.ks` | CNAME | `cname.vercel-dns.com.` (Vercel web-v2 project — Vercel will pick which based on domain config) |
| `api.ks` | CNAME | `<service>.up.railway.app.` (Railway gives you the value) |

The Sync Worker uses Cloudflare's free `*.workers.dev` subdomain by
default. If you want it on a custom domain (e.g.
`sync.ks.aileena.xyz`), add a Worker route in the CF dashboard and
update `KEYSHIELD_SYNC_URL` accordingly.

---

## Smoke test after first deploy

```bash
# all four endpoints should respond
curl -fsS https://ks.aileena.xyz | head -1                    # landing
curl -fsS https://app.ks.aileena.xyz | head -1                # web-v2 SPA
curl -fsS https://api.ks.aileena.xyz/health                   # python
curl -fsS https://keyshield-sync.<account>.workers.dev/health # CF worker

# end-to-end: open https://app.ks.aileena.xyz, sign in, click "Device
# Vault", enroll a passkey, add a key, run "Use" — green proxied badge
# means the full chain (Vercel → Railway → upstream + Vercel → CF
# Worker) is live.
```

---

## What's NOT this stack

- **Postgres / Redis** — provisioned by Railway as Plugins, no separate
  service to deploy.
- **Solana program** — already deployed to devnet (slot 461190304+).
  Mainnet promotion is a separate `solana program deploy --upgrade`
  using the existing keypair.
- **Browser extension (`src/web/`)** — not a deploy target. Built
  separately via [`src/scripts/build-firefox.sh`](../../src/scripts/build-firefox.sh)
  / Chrome web store packaging.
- **Docker compose** ([`docker-compose.yml`](../../docker-compose.yml))
  — local dev convenience only; not used in prod. Railway uses
  `Dockerfile.python` directly; Vercel doesn't use Docker at all.
