/**
 * KeyShield sync worker — public surface.
 *
 *   GET    /vault/:id      → 200 + JSON cipher | 404
 *   PUT    /vault/:id      → 200 ok | 409 stale | 401/403 auth | 413 too large
 *   DELETE /vault/:id      → 204 | 401/403 auth
 *
 * All routes require `Authorization: Bearer <jwt>` whose `sub` claim
 * equals `:id`. Step 2 will add the issuance routes (/auth/challenge,
 * /auth/exchange).
 */

import { Hono } from 'hono';
import { extractBearer, verifyJwt } from './auth';
import { readVault, writeVault, deleteVault, VaultCipherSchema } from './cas';

export interface Env {
  VAULTS: R2Bucket;
  REGISTRY: R2Bucket;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  MAX_VAULT_BYTES: string;
}

const app = new Hono<{ Bindings: Env }>();

/** Reject the request unless `Authorization: Bearer <jwt>` is present
 *  AND the JWT's sub claim matches `:id`. */
app.use('/vault/:id', async (c, next) => {
  const id = c.req.param('id');
  const token = extractBearer(c.req.raw);
  if (!token) return c.json({ error: 'missing bearer token' }, 401);
  try {
    const claims = await verifyJwt(token, c.env.JWT_SECRET, c.env.JWT_ISSUER);
    if (claims.sub !== id) {
      return c.json({ error: 'token does not match vault id' }, 403);
    }
  } catch {
    return c.json({ error: 'invalid token' }, 401);
  }
  await next();
});

app.get('/vault/:id', async (c) => {
  const cipher = await readVault(c.env.VAULTS, c.req.param('id'));
  if (!cipher) return c.json({ error: 'not found' }, 404);
  return c.json(cipher);
});

app.put('/vault/:id', async (c) => {
  const max = parseInt(c.env.MAX_VAULT_BYTES, 10);
  const body = await c.req.text();
  if (body.length > max) {
    return c.json(
      { error: `body too large (${body.length} > ${max})` },
      413,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }
  const parsed = VaultCipherSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'invalid cipher shape', issues: parsed.error.issues }, 400);
  }
  const ok = await writeVault(c.env.VAULTS, c.req.param('id'), parsed.data);
  if (!ok) {
    return c.json({ error: 'stale write — pull and retry' }, 409);
  }
  return c.json({ ok: true });
});

app.delete('/vault/:id', async (c) => {
  await deleteVault(c.env.VAULTS, c.req.param('id'));
  return new Response(null, { status: 204 });
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
