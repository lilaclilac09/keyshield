/**
 * ZK mode (zk-v1, docs/zk/ZK-MODE.md): encrypt provider keys on this device
 * so the KeyShield server stores only ciphertext plus a per-key share.
 *
 * root R = HKDF-SHA256(passkey PRF output, info "keyshield/zk/v1/root").
 * It's derived when you unlock the Device Vault, kept in memory only, and
 * handed to the extension (non-extractable there) and, if you choose, to a
 * local `keyshield-proxy` as a ksz1. unlock code. It is never sent to the
 * KeyShield server.
 */
import { apiFetch } from './auth';

const _te = new TextEncoder();
const enc = { encode: (t: string) => copy(_te.encode(t)) };
let _root: Uint8Array | null = null;
const _listeners = new Set<() => void>();

export function b64u(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

export async function deriveZkRoot(prfOutput: ArrayBuffer): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(new ArrayBuffer(0)), info: enc.encode('keyshield/zk/v1/root') },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}

export async function zkRootId(root: Uint8Array): Promise<string> {
  const tag = enc.encode('keyshield/zk/v1/root-id');
  const buf = new Uint8Array(new ArrayBuffer(tag.length + root.length));
  buf.set(tag, 0);
  buf.set(root, tag.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return b64u(digest.slice(0, 18));
}

async function itemKey(root: Uint8Array, share: Uint8Array, itemId: string, upstream: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', copy(root), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: copy(share), info: enc.encode(`keyshield/zk/v1/item:${itemId}:${upstream}`) },
    base,
    256,
  );
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function zkHint(value: string): string {
  const m = /^(sk-proj-|sk-ant-api\d\d-|sk-ant-|sk-or-v1-|sk-|nvapi-|gsk_|ghp_|github_pat_)/.exec(value);
  return m ? m[1].slice(0, 16) : '';
}

export interface ZkStoreBody {
  id: string;
  upstream: string;
  cipher: string;
  iv: string;
  share: string;
  cipher_v: 2;
  hint: string;
  name?: string;
}

export async function sealZk(root: Uint8Array, upstream: string, value: string, name?: string): Promise<ZkStoreBody> {
  const idBytes = crypto.getRandomValues(new Uint8Array(6));
  const id = 'ks_' + Array.from(idBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const share = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await itemKey(root, share, id, upstream);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: copy(iv), additionalData: enc.encode(`${id}|${upstream}`) },
    k,
    enc.encode(value),
  );
  return {
    id, upstream, cipher: b64u(new Uint8Array(ct)), iv: b64u(iv), share: b64u(share),
    cipher_v: 2, hint: zkHint(value), ...(name ? { name } : {}),
  };
}

export async function openZk(
  root: Uint8Array,
  share: Uint8Array,
  item: { id: string; upstream: string; iv: string; cipher: string },
): Promise<string> {
  const k = await itemKey(root, share, item.id, item.upstream);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64u(item.iv), additionalData: enc.encode(`${item.id}|${item.upstream}`) },
    k,
    unb64u(item.cipher),
  );
  return new TextDecoder().decode(pt);
}

export function unlockCode(root: Uint8Array): string {
  return `ksz1.${b64u(root)}`;
}

// ── In-memory root (cleared on lock / reload) ──────────────────────────────

export async function setZkRootFromPrf(prfOutput: ArrayBuffer): Promise<void> {
  _root = await deriveZkRoot(prfOutput);
  _listeners.forEach((fn) => fn());
}

export function getZkRoot(): Uint8Array | null {
  return _root;
}

export function clearZkRoot(): void {
  _root?.fill(0);
  _root = null;
  _listeners.forEach((fn) => fn());
}

export function onZkRootChange(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Server calls ───────────────────────────────────────────────────────────

export interface ZkStatus {
  enabled: boolean;
  root_id: string | null;
  plaintext_items: number;
  zk_items: number;
}

export async function fetchZkStatus(): Promise<ZkStatus | null> {
  const r = await apiFetch('/zk/status');
  if (!r.ok) return null;
  return r.json();
}

export async function enableZk(root: Uint8Array): Promise<string> {
  const rootId = await zkRootId(root);
  const r = await apiFetch('/zk/enable', { method: 'POST', body: JSON.stringify({ root_id: rootId }) });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `enable failed (${r.status})`);
  }
  return rootId;
}

/**
 * Re-save every plaintext key as a ZK row, delete the plaintext row, then
 * purge leftovers server-side. Returns how many keys moved.
 */
export async function migratePlaintextToZk(
  root: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<{ moved: number; failed: number }> {
  const r = await apiFetch('/manage/vault');
  if (!r.ok) throw new Error(`vault list failed (${r.status})`);
  const items = (await r.json()) as Array<{ id: string; upstream: string; name: string; has_plaintext?: boolean; zk?: boolean }>;
  const todo = items.filter((it) => it.has_plaintext && !it.zk);
  let moved = 0;
  let failed = 0;
  for (const it of todo) {
    try {
      const dec = await apiFetch(`/manage/decrypt/${encodeURIComponent(it.id)}`);
      if (!dec.ok) throw new Error(`decrypt ${dec.status}`);
      const { value } = (await dec.json()) as { value: string };
      const body = await sealZk(root, it.upstream, value, it.name);
      const st = await apiFetch('/manage/store', { method: 'POST', body: JSON.stringify(body) });
      if (!st.ok) throw new Error(`store ${st.status}`);
      const del = await apiFetch(`/manage/vault/${encodeURIComponent(it.id)}`, { method: 'DELETE' });
      if (!del.ok) throw new Error(`delete ${del.status}`);
      moved++;
    } catch {
      failed++;
    }
    onProgress?.(moved + failed, todo.length);
  }
  if (failed === 0) await apiFetch('/zk/purge-plaintext', { method: 'POST', body: '{}' });
  return { moved, failed };
}

/** Decrypt one ZK row in this browser (vault unlocked). */
export async function revealZkItem(id: string): Promise<string> {
  const root = getZkRoot();
  if (!root) throw new Error('Unlock Device Vault with your passkey to reveal ZK keys');
  const [itemsRes, shareRes] = await Promise.all([
    apiFetch('/zk/items'),
    apiFetch(`/zk/share/${encodeURIComponent(id)}`),
  ]);
  if (!itemsRes.ok || !shareRes.ok) throw new Error('ZK key unavailable (revoked or deleted)');
  const { items } = (await itemsRes.json()) as { items: Array<{ id: string; upstream: string; iv: string; cipher: string }> };
  const item = items.find((it) => it.id === id);
  if (!item) throw new Error('ZK key not found');
  const { share } = (await shareRes.json()) as { share: string };
  return openZk(root, unb64u(share), item);
}

/** Save a key as a ZK row (ZK mode on, vault unlocked). */
export async function storeZkItem(upstream: string, value: string, name?: string): Promise<void> {
  const root = getZkRoot();
  if (!root) throw new Error('ZK mode is on: unlock Device Vault with your passkey to save keys');
  const body = await sealZk(root, upstream, value, name);
  const r = await apiFetch('/manage/store', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `store failed (${r.status})`);
  }
}
