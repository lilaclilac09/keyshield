/**
 * KeyShield sync worker — public surface.
 *
 *   GET    /vault/:id          → 200 + JSON cipher | 404
 *   PUT    /vault/:id          → 200 ok | 409 stale | 401/403 auth | 413 too large
 *   DELETE /vault/:id          → 204 | 401/403 auth
 *   POST   /auth/register      → 200 ok | 409 already registered | 400 bad payload
 *   POST   /auth/challenge     → 200 { challenge, expiresAt } | 404 not registered
 *   POST   /auth/exchange      → 200 { token, expiresAt } | 401 verify failed
 *   GET    /health             → 200
 *
 * Vault routes require `Authorization: Bearer <jwt>` whose `sub` claim
 * equals `:id`. The /auth/* routes are public — they are the path by
 * which a client gets that JWT in the first place.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { extractBearer, issueJwt, verifyJwt } from './auth';
import { readVault, writeVault, deleteVault, VaultCipherSchema } from './cas';
import {
  bumpCounter,
  consumeChallenge,
  issueChallenge,
  readRegistration,
  writeRegistrationOnce,
} from './registry';
import { verifyAuthentication, verifyRegistration, bytesToBase64 } from './webauthn';

export interface Env {
  VAULTS: R2Bucket;
  REGISTRY: R2Bucket;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  MAX_VAULT_BYTES: string;
  RP_ID?: string;
  RP_ORIGIN?: string;
}

const app = new Hono<{ Bindings: Env }>();

// --------------------------------------------------------------------
// /vault/* — gated on Bearer JWT whose sub claim matches :id
// --------------------------------------------------------------------

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
    return c.json({ error: `body too large (${body.length} > ${max})` }, 413);
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
  if (!ok) return c.json({ error: 'stale write — pull and retry' }, 409);
  return c.json({ ok: true });
});

app.delete('/vault/:id', async (c) => {
  await deleteVault(c.env.VAULTS, c.req.param('id'));
  return new Response(null, { status: 204 });
});

// --------------------------------------------------------------------
// /auth/* — WebAuthn challenge → JWT exchange flow
// --------------------------------------------------------------------

const RegisterRequestSchema = z.object({
  vaultId: z.string().min(8),
  // Raw RegistrationResponseJSON shape from @simplewebauthn/browser.
  attestation: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }).passthrough(),
    clientExtensionResults: z.any().optional(),
    authenticatorAttachment: z.string().optional(),
  }).passthrough(),
  expectedChallenge: z.string().min(1),
});

app.post('/auth/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad payload', issues: parsed.error.issues }, 400);
  const { vaultId, attestation, expectedChallenge } = parsed.data;

  const ctx = {
    expectedRPID: c.env.RP_ID ?? 'localhost',
    expectedOrigin: c.env.RP_ORIGIN ?? 'http://localhost',
  };

  let verification;
  try {
    verification = await verifyRegistration(attestation as any, expectedChallenge, ctx);
  } catch (e: any) {
    return c.json({ error: `registration verification failed: ${e?.message ?? e}` }, 401);
  }
  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'registration not verified' }, 401);
  }

  const cred = verification.registrationInfo.credential;
  const ok = await writeRegistrationOnce(c.env.REGISTRY, vaultId, {
    credentialId: cred.id,
    publicKey: bytesToBase64(cred.publicKey),
    counter: cred.counter,
    registeredAt: Date.now(),
  });
  if (!ok) return c.json({ error: 'vault already registered' }, 409);
  return c.json({ ok: true });
});

const ChallengeRequestSchema = z.object({ vaultId: z.string().min(8) });

app.post('/auth/challenge', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ChallengeRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad payload' }, 400);
  const { vaultId } = parsed.data;
  const reg = await readRegistration(c.env.REGISTRY, vaultId);
  if (!reg) return c.json({ error: 'vault not registered' }, 404);
  const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const record = await issueChallenge(c.env.REGISTRY, vaultId, random);
  return c.json(record);
});

const ExchangeRequestSchema = z.object({
  vaultId: z.string().min(8),
  // Raw AuthenticationResponseJSON shape from @simplewebauthn/browser.
  assertion: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }).passthrough(),
    clientExtensionResults: z.any().optional(),
  }).passthrough(),
});

app.post('/auth/exchange', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ExchangeRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad payload', issues: parsed.error.issues }, 400);
  const { vaultId, assertion } = parsed.data;

  const reg = await readRegistration(c.env.REGISTRY, vaultId);
  if (!reg) return c.json({ error: 'vault not registered' }, 404);

  const challenge = await consumeChallenge(c.env.REGISTRY, vaultId);
  if (!challenge) {
    return c.json({ error: 'no active challenge — call /auth/challenge first' }, 401);
  }

  const ctx = {
    expectedRPID: c.env.RP_ID ?? 'localhost',
    expectedOrigin: c.env.RP_ORIGIN ?? 'http://localhost',
  };

  let verification;
  try {
    verification = await verifyAuthentication(
      assertion as any,
      challenge.challenge,
      reg.publicKey,
      reg.counter,
      reg.credentialId,
      ctx,
    );
  } catch (e: any) {
    return c.json({ error: `assertion failed: ${e?.message ?? e}` }, 401);
  }
  if (!verification.verified) {
    return c.json({ error: 'assertion not verified' }, 401);
  }

  // Counter must move forward — protects against simple replay.
  const newCounter = verification.authenticationInfo.newCounter;
  if (newCounter <= reg.counter && newCounter !== 0) {
    return c.json({ error: 'counter regression — possible replay' }, 401);
  }
  await bumpCounter(c.env.REGISTRY, vaultId, newCounter);

  const ttlSecs = 900;
  const token = await issueJwt(vaultId, c.env.JWT_SECRET, c.env.JWT_ISSUER, ttlSecs);
  return c.json({
    token,
    expiresAt: Date.now() + ttlSecs * 1000,
  });
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
