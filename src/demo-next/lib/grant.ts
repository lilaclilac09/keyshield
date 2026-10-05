/**
 * Ephemeral in-memory grant that feeds the proxy hop.
 *
 * Agent path only. Zero disk. 300s TTL. Timeout or explicit revoke
 * zeroizes the byte slot. Never log the value. JS strings created for
 * `X-Upstream-API-Key` cannot be wiped; the backing Uint8Array is.
 */

import { zeroize } from './bytes';

export const GRANT_TTL_MS = 300_000;

type Slot = { bytes: Uint8Array; expires: number; upstream: string };

const grants = new Map<string, Slot>();
const byUpstream = new Map<string, string>();

function wipe(slot: Slot): void {
  zeroize(slot.bytes);
  slot.expires = 0;
  slot.upstream = '';
}

function sweep(): void {
  const now = Date.now();
  for (const [id, slot] of grants) {
    if (now > slot.expires) revokeGrant(id);
  }
}

export function putGrant(
  id: string,
  plaintext: string,
  ttlOrOpts: number | { ttlMs?: number; upstream?: string } = GRANT_TTL_MS,
): void {
  const opts = typeof ttlOrOpts === 'number' ? { ttlMs: ttlOrOpts } : ttlOrOpts;
  putGrantBytes(id, new TextEncoder().encode(plaintext), opts);
}

export function putGrantBytes(
  id: string,
  bytes: Uint8Array,
  opts?: { ttlMs?: number; upstream?: string },
): void {
  revokeGrant(id);
  const copy = new Uint8Array(bytes);
  const upstream = opts?.upstream || id;
  grants.set(id, {
    bytes: copy,
    expires: Date.now() + (opts?.ttlMs ?? GRANT_TTL_MS),
    upstream,
  });
  byUpstream.set(upstream, id);
}

/** Copy for header inject. Does not consume the slot. Expired → wipe. */
export function peekGrant(id: string): string | null {
  sweep();
  const slot = grants.get(id);
  if (!slot) return null;
  if (Date.now() > slot.expires) {
    revokeGrant(id);
    return null;
  }
  return new TextDecoder().decode(slot.bytes);
}

export function peekGrantByUpstream(upstream: string): string | null {
  sweep();
  const id = byUpstream.get(upstream);
  return id ? peekGrant(id) : null;
}

export function takeGrant(id: string): string | null {
  const value = peekGrant(id);
  revokeGrant(id);
  return value;
}

export function revokeGrant(id: string): void {
  const slot = grants.get(id);
  if (!slot) return;
  if (slot.upstream) byUpstream.delete(slot.upstream);
  wipe(slot);
  grants.delete(id);
}

export function revokeAllGrants(): void {
  for (const id of [...grants.keys()]) revokeGrant(id);
}

export function grantMeta(id: string): { active: boolean; ttlMs: number; upstream: string } {
  sweep();
  const slot = grants.get(id);
  if (!slot) return { active: false, ttlMs: 0, upstream: '' };
  const ttlMs = slot.expires - Date.now();
  if (ttlMs <= 0) {
    revokeGrant(id);
    return { active: false, ttlMs: 0, upstream: '' };
  }
  return { active: true, ttlMs, upstream: slot.upstream };
}

export function listGrantMeta(): Array<{ id: string; ttlMs: number; upstream: string }> {
  sweep();
  const out: Array<{ id: string; ttlMs: number; upstream: string }> = [];
  for (const [id, slot] of grants) {
    const ttlMs = slot.expires - Date.now();
    if (ttlMs > 0) out.push({ id, ttlMs, upstream: slot.upstream });
  }
  return out;
}

/** Attach grant to `/proxy/{upstream}/...` only. Never logs the key. */
export function attachGrantHeader(path: string, headers: Headers): boolean {
  if (headers.has('X-Upstream-API-Key')) return false;
  if (!path.startsWith('/proxy/')) return false;
  const upstream = path.split('/')[2] || '';
  if (!upstream) return false;
  const key = peekGrantByUpstream(upstream);
  if (!key) return false;
  headers.set('X-Upstream-API-Key', key);
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => revokeAllGrants());
}
