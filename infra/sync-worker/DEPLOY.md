# Deploying KeyShield sync-worker to Cloudflare

The sync-worker stores end-to-end-encrypted vault ciphertext keyed
by a passkey-derived ID. It runs as a single Cloudflare Worker
backed by two R2 buckets and one secret.

This document walks through deploying it the first time and
rotating secrets later. It assumes you have a Cloudflare account
and have run `wrangler login` at least once on this machine.

## 0. One-time prerequisites

```bash
npm install -g wrangler   # already in this repo's devDependencies — skip if you ran `npm install`
wrangler login            # opens browser, store token in ~/.wrangler/config
wrangler whoami           # confirms the right account
```

## 1. Create the R2 buckets

The worker uses two buckets:
- `keyshield-vaults`   — encrypted ciphertext keyed by vault ID
- `keyshield-registry` — passkey publicKey + counter + single-use challenge per vault

```bash
cd infra/sync-worker
wrangler r2 bucket create keyshield-vaults
wrangler r2 bucket create keyshield-registry
```

If you want a separate preview environment for `wrangler dev`:

```bash
wrangler r2 bucket create keyshield-vaults-preview
wrangler r2 bucket create keyshield-registry-preview
```

(`wrangler.toml` already references the `-preview` names; the worker
will fail to start in preview mode if they don't exist.)

## 2. Set the secrets

Three values must be set as Worker secrets in production. NEVER
commit these to git.

```bash
# 32+ random bytes for HS256 JWT signing.
openssl rand -hex 32 | wrangler secret put JWT_SECRET

# The relying-party ID and origin the popup sends to the worker.
# Must match what extension-sync's wiring.ts puts in
# `VITE_KEYSHIELD_SYNC_URL` plus the apex domain of the extension's
# WebAuthn registration.
echo -n "keyshield.dev" | wrangler secret put RP_ID
echo -n "https://keyshield.dev" | wrangler secret put RP_ORIGIN
```

The non-secret env vars (`JWT_ISSUER`, `MAX_VAULT_BYTES`) live in
`wrangler.toml` — change them there if you need different defaults.

## 3. Deploy

```bash
wrangler deploy
```

This publishes the worker to your account at the URL printed in
the output (something like
`https://keyshield-sync.<account>.workers.dev`). To attach a
custom domain later:

```bash
wrangler route add "sync.keyshield.dev/*" keyshield-sync
```

(or do it through the Cloudflare dashboard).

## 4. Smoke test

```bash
# Health check — should print {"status":"ok"}.
curl -s https://keyshield-sync.<account>.workers.dev/health

# A real vault round-trip needs a JWT, which needs a registered
# passkey. The shortest path to verify auth + storage end-to-end is
# to point the popup at the deployed worker and run the first-run
# flow:
cd extension-sync
VITE_KEYSHIELD_SYNC_URL=https://keyshield-sync.<account>.workers.dev npx vite dev
```

Open the popup, click "Create vault with Face ID", confirm a
passkey gets registered, and write down the 24-word mnemonic the
screen displays. Then in a private window, click "I have a
recovery phrase" and paste the words — the vault should decrypt.

## 5. Rotating the JWT secret

JWTs are short-lived (15 minutes by default) so a rotation is
essentially free — every existing token expires within the
rotation window.

```bash
openssl rand -hex 32 | wrangler secret put JWT_SECRET
wrangler deploy   # picks up the new secret
```

After deploy, every active popup will see a 401 on the next
`/vault/*` call and trigger its built-in
`refreshToken()` retry, which calls `/auth/exchange` with a fresh
WebAuthn assertion and gets a new JWT.

## 6. Rotating RP_ID / RP_ORIGIN

These are baked into every WebAuthn registration. **Changing them
breaks every existing user's passkey** because the browser refuses
assertions whose RP ID doesn't match what the credential was
created with. Don't do this lightly.

If you genuinely need to migrate domains:

1. Add the new domain as an additional accepted origin via
   `RP_ORIGIN` (it can be a JSON-array string the worker parses;
   you'll need a code change for that — V1.2).
2. Have users re-register passkeys at the new origin.
3. After everyone has migrated, drop the old origin.

## 7. Tearing down

```bash
wrangler delete keyshield-sync
wrangler r2 bucket delete keyshield-vaults --yes
wrangler r2 bucket delete keyshield-registry --yes
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `wrangler deploy` errors with `Wrangler couldn't find your account` | not logged in | `wrangler login` |
| First /auth/register returns 500 | RP_ID / RP_ORIGIN mismatch | confirm they match exactly what the popup ships in `VITE_KEYSHIELD_SYNC_URL` |
| Every /auth/exchange returns 401 | challenge expired or replayed | popups must call /auth/challenge → /auth/exchange in the same flow within 5 minutes |
| /vault/:id always 401 | JWT signing key drift | confirm the popup's JWT, decoded, has `iss` matching `JWT_ISSUER` in `wrangler.toml` |
| 13 KB stack overflow when calling `cargo build-sbf` for the unrelated Rust program | not a sync-worker issue | unrelated — see `programs/keyshield/` notes |

## Cost expectations

R2: storage is $0.015/GB-month after 10 GB free tier. A typical
vault is ~2 KB of ciphertext + ~200 B of registration record, so
**500,000 users would fit in the free tier**. Class A operations
(PUTs) are 1 M/month free; Class B (GETs) 10 M/month free. A user
making 20 vault edits per day uses ~600 PUTs and ~1200 GETs/month,
so the free tier supports roughly 1500 active users on PUTs.

Workers: the free plan is 100 K requests/day. A daily-active user
making one open + a few edits + a few session-renewal calls is
~10–20 requests, so the free tier supports roughly 5–10 K daily
actives.

Beyond that you'd move to Workers Paid ($5/month for 10 M requests
+ 30 GB R2 storage included), which fits a real product easily.
