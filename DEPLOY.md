# KeyShield Production Deploy — `app.ks.aileena.xyz`

End-to-end deploy of the three services to:

- **Frontend**: `app.ks.aileena.xyz` → Cloudflare Pages
- **Backend**:  `api.ks.aileena.xyz` → Railway (FastAPI)
- **Sync worker**: `sync.ks.aileena.xyz` → Cloudflare Workers

You need:

- Cloudflare account with `aileena.xyz` zone added (≈ free).
- Railway account (≈ $5/mo for the backend container).
- Local installs: `wrangler` (`npm i -g wrangler`), `railway` (`brew install railway`).

---

## 1. Backend → Railway → `api.ks.aileena.xyz`

```bash
# from repo root
railway login                                   # opens browser, one time
railway init                                    # name the project: keyshield-api
railway up                                      # uses railway.json + Dockerfile.python
```

Set production env vars in Railway dashboard (Settings → Variables):

```
KS_CORS_ORIGINS=https://app.ks.aileena.xyz,https://ks.aileena.xyz
KS_RP_ID=ks.aileena.xyz
KS_RP_NAME=KeyShield
KS_RP_ORIGIN=https://app.ks.aileena.xyz
JWT_SECRET=<generate with: openssl rand -hex 32>
PYTHONUNBUFFERED=1
```

Add custom domain in Railway → Settings → Networking → **Generate Domain** then **Add Custom Domain** `api.ks.aileena.xyz`. Railway gives you a CNAME target like `xxx.up.railway.app` — paste that into Cloudflare DNS as:

```
api.ks.aileena.xyz   CNAME   xxx.up.railway.app   (proxied OFF — grey cloud)
```

Verify: `curl https://api.ks.aileena.xyz/health` → `{"status":"ok",...}`

---

## 2. Sync worker → Cloudflare → `sync.ks.aileena.xyz`

```bash
cd src/infra/sync-worker
wrangler login                                  # opens browser, one time
```

Create the R2 buckets (one-time):

```bash
wrangler r2 bucket create keyshield-vaults
wrangler r2 bucket create keyshield-registry
wrangler r2 bucket create keyshield-vaults-preview
wrangler r2 bucket create keyshield-registry-preview
```

Set the JWT secret:

```bash
echo "$(openssl rand -hex 32)" | wrangler secret put JWT_SECRET
```

Deploy:

```bash
wrangler deploy
```

`wrangler.toml` already has `routes = [{ pattern = "sync.ks.aileena.xyz", custom_domain = true }]`, so the first deploy will:

1. Provision the worker
2. Auto-create a custom-domain DNS record at Cloudflare for `sync.ks.aileena.xyz`

Verify: `curl https://sync.ks.aileena.xyz/health` → `{"status":"ok"}`

---

## 3. Frontend → Cloudflare Pages → `app.ks.aileena.xyz`

The build is already wired to bake `https://api.ks.aileena.xyz` and `https://sync.ks.aileena.xyz` into the bundle (see `src/web/.env.production`). Just build + deploy:

```bash
cd src/web
npm install
npm run build                                   # outputs to dist/

# First time: link to a new Pages project
npx wrangler pages project create keyshield-web --production-branch main

# Deploy
npx wrangler pages deploy dist --project-name keyshield-web
```

Wrangler prints a `*.pages.dev` URL on success. Then attach the custom domain:

```bash
npx wrangler pages deployment tail --project-name keyshield-web   # optional
```

Or in the Cloudflare dashboard: Pages → keyshield-web → Custom Domains → **Set up a custom domain** → `app.ks.aileena.xyz`. Cloudflare auto-creates the DNS record.

Verify: open `https://app.ks.aileena.xyz/` in your browser. AuthScreen should render. Connect Wallet → sign → enroll passkey end-to-end should work because `RP_ID=ks.aileena.xyz` is the eTLD+1 of the page origin.

---

## 4. Browser extension → submit to Chrome Web Store

The `src/extension/manifest.json` currently allows `localhost:8001`. For prod usage, edit `host_permissions`:

```json
"host_permissions": [
  "https://api.ks.aileena.xyz/*",
  "https://sync.ks.aileena.xyz/*",
  "<all_urls>"
]
```

Then either:

- Submit to Chrome Web Store (one-time: $5 dev account fee), OR
- Distribute as a `.zip` for power users to load unpacked.

```bash
cd src/extension
zip -r ../keyshield-extension.zip . -x "*.DS_Store"
```

---

## 5. CORS sanity check

After all three are up, confirm cross-origin works:

```bash
curl -i -X OPTIONS \
  -H "Origin: https://app.ks.aileena.xyz" \
  -H "Access-Control-Request-Method: GET" \
  https://api.ks.aileena.xyz/manage/vault
# expect: HTTP/1.1 200 + access-control-allow-origin: https://app.ks.aileena.xyz

curl -i -X OPTIONS \
  -H "Origin: https://app.ks.aileena.xyz" \
  -H "Access-Control-Request-Method: POST" \
  https://sync.ks.aileena.xyz/auth/challenge
# expect: HTTP/1.1 204 + access-control-allow-origin: https://app.ks.aileena.xyz
```

If either returns `Disallowed CORS origin`:

- **Backend**: add the prod origin to `KS_CORS_ORIGINS` env var on Railway, redeploy.
- **Sync worker**: edit the `cors()` block in `src/infra/sync-worker/src/index.ts`, redeploy.

The defaults already include `https://app.ks.aileena.xyz`, so this should pass on first run.

---

## 6. Future re-deploys

```bash
# Backend (after backend code changes)
railway up

# Sync worker (after worker code changes)
cd src/infra/sync-worker && wrangler deploy

# Frontend (after UI changes)
cd src/web && npm run build && \
  npx wrangler pages deploy dist --project-name keyshield-web
```

A simple Make target wrapping all three:

```makefile
deploy:
	railway up
	cd src/infra/sync-worker && wrangler deploy
	cd src/web && npm run build && wrangler pages deploy dist --project-name keyshield-web
```

---

## 7. Domain summary

| Subdomain | Where it lives | DNS record type |
|---|---|---|
| `app.ks.aileena.xyz` | Cloudflare Pages | CNAME (managed by Pages) |
| `api.ks.aileena.xyz` | Railway | CNAME → `xxx.up.railway.app` (grey cloud) |
| `sync.ks.aileena.xyz` | Cloudflare Workers | CNAME (managed by Workers Custom Domains) |

All zone records live on Cloudflare under `aileena.xyz`.

---

## 8. Rollback

- Backend: Railway dashboard → Deployments → click an older deploy → **Redeploy**
- Sync worker: `wrangler rollback` (interactive)
- Frontend: Pages dashboard → Deployments → **Rollback to this deployment**

All three are blue/green by default — rollback is one click.
