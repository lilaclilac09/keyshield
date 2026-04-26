/**
 * Registration storage — one record per vaultId, kept in the
 * REGISTRY R2 bucket. Each record:
 *
 *   { credentialId, publicKey (CBOR/COSE bytes, base64),
 *     counter, registeredAt, rpId? }
 *
 * Plus a separate set of short-lived challenges keyed
 * `${vaultId}-challenge` so we can reject replays.
 */

import { z } from 'zod';

export const RegistrationRecordSchema = z.object({
  credentialId: z.string().min(1),
  publicKey: z.string().min(1), // base64 of CBOR-encoded COSE key
  counter: z.number().int().nonnegative(),
  registeredAt: z.number().int().nonnegative(),
  /** base64url-encoded Ed25519 public key derived from the seed.
   * Used by /auth/force-revoke to authorize revocation without a
   * passkey. Optional only because pre-V1.1 records didn't have it
   * — new records always set it. */
  seedPublicKey: z.string().min(1).optional(),
});
export type RegistrationRecord = z.infer<typeof RegistrationRecordSchema>;

export const ChallengeRecordSchema = z.object({
  challenge: z.string().min(1), // base64url
  expiresAt: z.number().int().nonnegative(),
});
export type ChallengeRecord = z.infer<typeof ChallengeRecordSchema>;

export const RevokeChallengeRecordSchema = z.object({
  challenge: z.string().min(1), // base64url
  expiresAt: z.number().int().nonnegative(),
});
export type RevokeChallengeRecord = z.infer<typeof RevokeChallengeRecordSchema>;

export async function readRegistration(
  bucket: R2Bucket,
  vaultId: string,
): Promise<RegistrationRecord | null> {
  const obj = await bucket.get(vaultId);
  if (!obj) return null;
  const json = await obj.json().catch(() => null);
  if (!json) return null;
  const parsed = RegistrationRecordSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** First-write-wins. Returns false if a record already exists. */
export async function writeRegistrationOnce(
  bucket: R2Bucket,
  vaultId: string,
  record: RegistrationRecord,
): Promise<boolean> {
  const existing = await readRegistration(bucket, vaultId);
  if (existing) return false;
  await bucket.put(vaultId, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' },
  });
  return true;
}

/** Bump counter after a successful authentication, to track replay. */
export async function bumpCounter(
  bucket: R2Bucket,
  vaultId: string,
  newCounter: number,
): Promise<void> {
  const existing = await readRegistration(bucket, vaultId);
  if (!existing) return;
  await bucket.put(
    vaultId,
    JSON.stringify({ ...existing, counter: newCounter }),
    { httpMetadata: { contentType: 'application/json' } },
  );
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function issueChallenge(
  bucket: R2Bucket,
  vaultId: string,
  random: (n: number) => Uint8Array,
): Promise<ChallengeRecord> {
  const bytes = random(32);
  const challenge = base64Url(bytes);
  const record: ChallengeRecord = {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  await bucket.put(`${vaultId}-challenge`, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' },
  });
  return record;
}

/** Read + delete a challenge in one go (single-use). */
export async function consumeChallenge(
  bucket: R2Bucket,
  vaultId: string,
): Promise<ChallengeRecord | null> {
  const obj = await bucket.get(`${vaultId}-challenge`);
  if (!obj) return null;
  const json = await obj.json().catch(() => null);
  if (!json) return null;
  const parsed = ChallengeRecordSchema.safeParse(json);
  if (!parsed.success) return null;
  await bucket.delete(`${vaultId}-challenge`);
  if (parsed.data.expiresAt < Date.now()) return null;
  return parsed.data;
}

/**
 * Issue a fresh nonce for the seed-bound revoke flow. Stored at a
 * separate key from the WebAuthn challenge so the two flows don't
 * race each other.
 */
export async function issueRevokeChallenge(
  bucket: R2Bucket,
  vaultId: string,
  random: (n: number) => Uint8Array,
): Promise<RevokeChallengeRecord> {
  const bytes = random(32);
  const challenge = base64Url(bytes);
  const record: RevokeChallengeRecord = {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  await bucket.put(`${vaultId}-revoke-challenge`, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' },
  });
  return record;
}

export async function consumeRevokeChallenge(
  bucket: R2Bucket,
  vaultId: string,
): Promise<RevokeChallengeRecord | null> {
  const obj = await bucket.get(`${vaultId}-revoke-challenge`);
  if (!obj) return null;
  const json = await obj.json().catch(() => null);
  if (!json) return null;
  const parsed = RevokeChallengeRecordSchema.safeParse(json);
  if (!parsed.success) return null;
  await bucket.delete(`${vaultId}-revoke-challenge`);
  if (parsed.data.expiresAt < Date.now()) return null;
  return parsed.data;
}

function base64Url(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
