/**
 * Compare-and-set logic for vault writes.
 *
 * The contract: a PUT /vault/:id only succeeds if the incoming
 * `updatedAt` is strictly greater than what's already stored. This
 * gives us optimistic concurrency without a database — two devices
 * editing the same vault at the same wall-clock millisecond will see
 * one push fail with 409, prompting a pull-merge-retry on the client.
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

/**
 * Read whatever is currently in R2 for a vault ID. Returns null if
 * absent OR if the stored bytes are corrupt (we treat corrupt = absent
 * for write purposes, so a CAS push will succeed and overwrite).
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
): Promise<{ cipher: VaultCipher | null; etag: string | null }> {
  const obj = await bucket.get(vaultId);
  if (!obj) return { cipher: null, etag: null };
  try {
    const json = await obj.json();
    const parsed = VaultCipherSchema.safeParse(json);
    return {
      cipher: parsed.success ? parsed.data : null,
      etag: obj.etag,
    };
  } catch {
    return { cipher: null, etag: obj.etag };
  }
}

/**
 * Try to write `cipher` for `vaultId`. Returns true on success, false
 * if the existing stored cipher's updatedAt is >= cipher.updatedAt.
 *
 * Note: R2 doesn't have native CAS. The race window between
 * read-then-write is small — milliseconds — but two concurrent writes
 * to the same vault could in principle both succeed. The on-chain
 * `updatedAt` ordering still gives us last-write-wins, just not strict
 * linearizability. For Path A this is acceptable: any "loss" still
 * leaves the user with a consistent ciphertext that the next pull
 * will reflect.
 */
export async function writeVault(
  bucket: R2Bucket,
  vaultId: string,
  cipher: VaultCipher,
): Promise<boolean> {
  const existing = await readVault(bucket, vaultId);
  if (existing && existing.updatedAt >= cipher.updatedAt) {
    return false;
  }
  await bucket.put(vaultId, JSON.stringify(cipher), {
    httpMetadata: { contentType: 'application/json' },
  });
  return true;
}

export async function deleteVault(
  bucket: R2Bucket,
  vaultId: string,
): Promise<void> {
  await bucket.delete(vaultId);
}
