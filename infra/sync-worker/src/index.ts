/**
 * KeyShield sync worker — public surface.
 *
 *   GET    /vault/:id              → 200 + JSON cipher | 404
 *   PUT    /vault/:id              → 200 ok | 409 stale | 401/403 auth | 413 too large
 *   DELETE /vault/:id              → 204 | 401/403 auth
 *   POST   /auth/register          → 200 ok | 409 already registered | 400 bad payload
 *   POST   /auth/challenge         → 200 { challenge, expiresAt } | 404 not registered
 *   POST   /auth/exchange          → 200 { token, expiresAt } | 401 verify failed
 *   POST   /auth/revoke            → 200 ok | 401 (passkey-bound; this device opts out)
 *   POST   /auth/revoke-challenge  → 200 { challenge, expiresAt } | 404 not registered
 *   POST   /auth/force-revoke      → 200 ok | 401 sig fails | 404 no challenge / no seed pubkey
 *   GET    /health                 → 200
 *
 * Vault routes require `Authorization: Bearer <jwt>` whose `sub` claim
 * equals `:id`. /auth/revoke and /vault/* both consume that JWT.
 *
 * /auth/force-revoke is the seed-bound path: the client signs a fresh
 * server-issued nonce with the Ed25519 key it derived from the
 * 24-word recovery phrase. No passkey or JWT is required, so it works
 * even when the original passkey lives on a lost device.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { ed25519 } from '@noble/curves/ed25519';
import { extractBearer, issueJwt, verifyJwt } from './auth';
import { readVault, writeVault, deleteVault, VaultCipherSchema } from './cas';
import {
  bumpCounter,
  consumeChallenge,
  consumeRevokeChallenge,
  issueChallenge,
  issueRevokeChallenge,
  readRegistration,
  writeRegistrationOnce,
} from './registry';
import { verifyAuthentication, verifyRegistration, bytesToBase64 } from './webauthn';

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded =
    b64url.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (b64url.length % 4)) % 4);
  const s = atob(padded);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

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
  /** Optional Ed25519 public key (base64url, 32 bytes once decoded)
   * derived from the seed via HKDF — see extension-sync's
   * `seed-revoke.ts`. Required to enable /auth/force-revoke later. */
  seedPublicKey: z.string().min(1).optional(),
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

  // Validate the seed pubkey early — base64url + 32-byte length.
  let seedPublicKey: string | undefined;
  if (parsed.data.seedPublicKey) {
    try {
      const bytes = base64UrlToBytes(parsed.data.seedPublicKey);
      if (bytes.length !== 32) {
        return c.json({ error: 'seedPublicKey must decode to 32 bytes' }, 400);
      }
      seedPublicKey = parsed.data.seedPublicKey;
    } catch {
      return c.json({ error: 'seedPublicKey is not valid base64url' }, 400);
    }
  }

  const cred = verification.registrationInfo.credential;
  const ok = await writeRegistrationOnce(c.env.REGISTRY, vaultId, {
    credentialId: cred.id,
    publicKey: bytesToBase64(cred.publicKey),
    counter: cred.counter,
    registeredAt: Date.now(),
    ...(seedPublicKey ? { seedPublicKey } : {}),
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

// --------------------------------------------------------------------
// /auth/revoke — Bearer-gated; deletes THIS vault's passkey
// --------------------------------------------------------------------
//
// Scope: revokes a passkey the user *currently has access to* (i.e.,
// they can authenticate now, hold a JWT, and want to deauthorize this
// device going forward). Useful for "I'm done with this computer".
//
// For the "I lost my phone" case (no JWT, no passkey on this device,
// only the recovery phrase), use /auth/force-revoke below — that
// path is gated on a seed-derived Ed25519 signature instead of a
// JWT so the keep-device doesn't have to reauthenticate first.
const RevokeRequestSchema = z.object({ vaultId: z.string().min(8) });

app.post('/auth/revoke', async (c) => {
  const token = extractBearer(c.req.raw);
  if (!token) return c.json({ error: 'missing bearer token' }, 401);
  let claims;
  try {
    claims = await verifyJwt(token, c.env.JWT_SECRET, c.env.JWT_ISSUER);
  } catch {
    return c.json({ error: 'invalid token' }, 401);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = RevokeRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad payload' }, 400);
  if (parsed.data.vaultId !== claims.sub) {
    return c.json({ error: 'token does not match vault id' }, 403);
  }
  // Delete the registration + any pending challenge. The vault
  // ciphertext is intentionally left alone — revoking the passkey
  // is not the same as deleting the user's data.
  await c.env.REGISTRY.delete(parsed.data.vaultId);
  await c.env.REGISTRY.delete(`${parsed.data.vaultId}-challenge`);
  return c.json({ ok: true });
});

// --------------------------------------------------------------------
// /auth/revoke-challenge + /auth/force-revoke — seed-bound revocation
// --------------------------------------------------------------------
//
// The seed-bound path lets a user with the 24-word recovery phrase
// revoke every passkey registration on a vault, even from a brand-new
// device that never held the original passkey. This is the V1.1
// answer to "I lost my phone": the keep-device restores from phrase,
// hits /auth/force-revoke, and the lost device is locked out of the
// sync backend on its next exchange attempt.
//
// Wire flow:
//   1. POST /auth/revoke-challenge { vaultId } → { challenge, expiresAt }
//   2. Client signs UTF-8(challenge) with the seed-derived Ed25519 key.
//   3. POST /auth/force-revoke { vaultId, challenge, signature } → 200.
//
// `signature` is base64url over the 64 raw signature bytes. The
// server verifies against the `seedPublicKey` stored on the vault's
// registration record. If no seed pubkey was registered (legacy
// records), the call returns 404 with a clear error so clients can
// fall back to the JWT-bound /auth/revoke.

const RevokeChallengeRequestSchema = z.object({
  vaultId: z.string().min(8),
});

app.post('/auth/revoke-challenge', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RevokeChallengeRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad payload' }, 400);
  const reg = await readRegistration(c.env.REGISTRY, parsed.data.vaultId);
  if (!reg) return c.json({ error: 'vault not registered' }, 404);
  if (!reg.seedPublicKey) {
    return c.json(
      { error: 'this vault has no seed-bound revoke key' },
      404,
    );
  }
  const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const record = await issueRevokeChallenge(
    c.env.REGISTRY,
    parsed.data.vaultId,
    random,
  );
  return c.json(record);
});

const ForceRevokeRequestSchema = z.object({
  vaultId: z.string().min(8),
  challenge: z.string().min(1),
  signature: z.string().min(1), // base64url over 64 bytes
});

app.post('/auth/force-revoke', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ForceRevokeRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad payload' }, 400);
  const { vaultId, challenge, signature } = parsed.data;

  const reg = await readRegistration(c.env.REGISTRY, vaultId);
  if (!reg) return c.json({ error: 'vault not registered' }, 404);
  if (!reg.seedPublicKey) {
    return c.json(
      { error: 'this vault has no seed-bound revoke key' },
      404,
    );
  }

  const consumed = await consumeRevokeChallenge(c.env.REGISTRY, vaultId);
  if (!consumed) {
    return c.json(
      { error: 'no active revoke challenge — call /auth/revoke-challenge' },
      401,
    );
  }
  if (consumed.challenge !== challenge) {
    return c.json({ error: 'challenge mismatch' }, 401);
  }

  let sigBytes: Uint8Array;
  let pubKeyBytes: Uint8Array;
  try {
    sigBytes = base64UrlToBytes(signature);
    pubKeyBytes = base64UrlToBytes(reg.seedPublicKey);
  } catch {
    return c.json({ error: 'invalid base64url' }, 400);
  }
  if (sigBytes.length !== 64) {
    return c.json({ error: 'signature must be 64 bytes' }, 400);
  }
  if (pubKeyBytes.length !== 32) {
    return c.json({ error: 'stored seed pubkey is malformed' }, 500);
  }

  const message = new TextEncoder().encode(challenge);
  let verified = false;
  try {
    verified = ed25519.verify(sigBytes, message, pubKeyBytes);
  } catch {
    verified = false;
  }
  if (!verified) {
    return c.json({ error: 'signature did not verify' }, 401);
  }

  // Same effect as /auth/revoke — drop the registration and any
  // outstanding WebAuthn challenge. Vault ciphertext is left alone.
  await c.env.REGISTRY.delete(vaultId);
  await c.env.REGISTRY.delete(`${vaultId}-challenge`);
  return c.json({ ok: true });
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
