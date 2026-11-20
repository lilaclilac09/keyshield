/**
 * Compare-and-set logic for vault writes.
 *
 * Clients must build on the stored revision and win an atomic R2 write.
 *
 * The vault payload itself is opaque to us — we only inspect the
 * `updatedAt` field for ordering. Everything else is end-to-end
 * encrypted ciphertext.
 */

import { z } from 'zod';

export const VaultCipherSchema = z.object({
  version: z.number().int().nonnegative(),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
});
export type VaultCipher = z.infer<typeof VaultCipherSchema>;

const VaultTombstoneSchema = z.object({
  deleted: z.literal(true),
  deletedAt: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
}).strict();

/**
 * Read whatever is currently in R2 for a vault ID. Returns null if
 * absent, tombstoned, OR if the stored bytes are corrupt. Writes distinguish
 * tombstones from corruption and never replace corrupt objects as absent.
 */
export async function readVault(
  bucket: R2Bucket,
  vaultId: string,
): Promise<VaultCipher | null> {
  return (await readVaultWithEtag(bucket, vaultId)).cipher;
}

/**
 * Same as `readVault`, but also surfaces the R2 ETag in the same
 * round trip — used by the GET handler to populate the response's
 * `ETag` header without a second round trip to R2.
 */
export async function readVaultWithEtag(
  bucket: R2Bucket,
  vaultId: string,
): Promise<{ cipher: VaultCipher | null; etag: string | null; tombstone: boolean }> {
  const obj = await bucket.get(vaultId);
  if (!obj) return { cipher: null, etag: null, tombstone: false };
  try {
    const json = await obj.json();
    if (VaultTombstoneSchema.safeParse(json).success) {
      return { cipher: null, etag: obj.etag, tombstone: true };
    }
    const parsed = VaultCipherSchema.safeParse(json);
    return {
      cipher: parsed.success ? parsed.data : null,
      etag: obj.etag,
      tombstone: false,
    };
  } catch {
    return { cipher: null, etag: obj.etag, tombstone: false };
  }
}

/**
 * Returns false on a revision mismatch or a lost conditional-write race.
 */
export async function writeVault(
  bucket: R2Bucket,
  vaultId: string,
  cipher: VaultCipher,
  baseRevision: string,
): Promise<boolean> {
  if (!isVaultBaseRevision(baseRevision)) return false;
  const { cipher: existing, etag, tombstone } = await readVaultWithEtag(bucket, vaultId);
  if (baseRevision === 'none' ? etag !== null && !tombstone : !matchesRevision(existing, baseRevision)) return false;
  if (existing && existing.updatedAt >= cipher.updatedAt) {
    return false;
  }
  const written = await bucket.put(vaultId, JSON.stringify(cipher), {
    httpMetadata: { contentType: 'application/json' },
    onlyIf: etag === null ? { etagDoesNotMatch: '*' } : { etagMatches: etag },
  });
  return written !== null;
}

export function isVaultBaseRevision(base: string | undefined): base is string {
  return base === 'none' || (typeof base === 'string' && /^(0|[1-9]\d*)$/.test(base) && Number.isSafeInteger(Number(base)));
}

function matchesRevision(cipher: VaultCipher | null, base: string): boolean {
  return cipher !== null && cipher.updatedAt === Number(base);
}

/** Whole-vault deletion; single-entry removals use a re-encrypted PUT. */
export async function deleteVault(
  bucket: R2Bucket,
  vaultId: string,
  baseRevision: string,
): Promise<boolean> {
  if (!isVaultBaseRevision(baseRevision)) return false;
  const { cipher, etag, tombstone } = await readVaultWithEtag(bucket, vaultId);
  if (etag === null || tombstone) return true;
  if (!cipher || !matchesRevision(cipher, baseRevision)) return false;
  const written = await bucket.put(vaultId, JSON.stringify({
    deleted: true,
    deletedAt: Date.now(),
    revision: cipher.updatedAt,
  }), {
    httpMetadata: { contentType: 'application/json' },
    onlyIf: { etagMatches: etag },
  });
  return written !== null;
}
