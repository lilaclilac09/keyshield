/**
 * Ephemeral in-memory grant. Zero disk. 300s TTL. Explicit revoke zeroizes.
 * Used when an agent — not a human — needs the decrypted credential injected
 * into the proxy hop. Never log the value.
 */

const TTL_MS = 300_000;

type Slot = { bytes: Uint8Array; expires: number };

const grants = new Map<string, Slot>();

function wipe(slot: Slot): void {
  slot.bytes.fill(0);
  slot.expires = 0;
}

export function putGrant(id: string, plaintext: string, ttlMs = TTL_MS): void {
  revokeGrant(id);
  grants.set(id, { bytes: new TextEncoder().encode(plaintext), expires: Date.now() + ttlMs });
}

export function takeGrant(id: string): string | null {
  const slot = grants.get(id);
  if (!slot) return null;
  if (Date.now() > slot.expires) {
    wipe(slot);
    grants.delete(id);
    return null;
  }
  const value = new TextDecoder().decode(slot.bytes);
  return value;
}

export function revokeGrant(id: string): void {
  const slot = grants.get(id);
  if (!slot) return;
  wipe(slot);
  grants.delete(id);
}

export function revokeAllGrants(): void {
  for (const id of [...grants.keys()]) revokeGrant(id);
}

export function grantMeta(id: string): { active: boolean; ttlMs: number } {
  const slot = grants.get(id);
  if (!slot) return { active: false, ttlMs: 0 };
  const ttlMs = slot.expires - Date.now();
  if (ttlMs <= 0) {
    revokeGrant(id);
    return { active: false, ttlMs: 0 };
  }
  return { active: true, ttlMs };
}
