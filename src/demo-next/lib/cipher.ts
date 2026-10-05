/**
 * Local AES-256-GCM ciphertext. IndexedDB first; memory / localStorage
 * hold ciphertext only. Plaintext is never written to localStorage.
 */

import { b64urlToBytes, bytesToB64url, zeroize } from './bytes';

const DB = 'ks-demo-vault';
const STORE = 'ciphers';
const IV_BYTES = 12;
const LS_PREFIX = 'ks.cipher.';

export interface StoredCipher {
  id: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

const mem = new Map<string, StoredCipher>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function writeFallback(row: StoredCipher): void {
  mem.set(row.id, row);
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LS_PREFIX + row.id, JSON.stringify(row));
}

function readFallback(id: string): StoredCipher | null {
  const hit = mem.get(id);
  if (hit) return hit;
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LS_PREFIX + id);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as StoredCipher;
    if (!row?.iv || !row?.ciphertext) return null;
    mem.set(id, row);
    return row;
  } catch {
    return null;
  }
}

export async function encryptToStore(sessionKey: CryptoKey, id: string, plaintext: string): Promise<void> {
  const data = new TextEncoder().encode(plaintext);
  try {
    await encryptToStoreBytes(sessionKey, id, data);
  } finally {
    zeroize(data);
  }
}

export async function encryptToStoreBytes(
  sessionKey: CryptoKey,
  id: string,
  plaintext: Uint8Array,
): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, plaintext));
  const row: StoredCipher = {
    id,
    iv: bytesToB64url(iv),
    ciphertext: bytesToB64url(ct),
    updatedAt: Date.now(),
  };
  if (!hasIndexedDb()) {
    writeFallback(row);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function decryptFromStoreBytes(sessionKey: CryptoKey, id: string): Promise<Uint8Array | null> {
  let row: StoredCipher | undefined;
  if (hasIndexedDb()) {
    const db = await openDb();
    row = await new Promise<StoredCipher | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredCipher | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
  } else {
    row = readFallback(id) ?? undefined;
  }
  if (!row) return null;
  const iv = b64urlToBytes(row.iv);
  const ct = b64urlToBytes(row.ciphertext);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, ct));
}

export async function decryptFromStore(sessionKey: CryptoKey, id: string): Promise<string | null> {
  const bytes = await decryptFromStoreBytes(sessionKey, id);
  if (!bytes) return null;
  const text = new TextDecoder().decode(bytes);
  zeroize(bytes);
  return text;
}

export function assertNoPlaintextLocalStorage(sample: string): boolean {
  if (typeof localStorage === 'undefined' || !sample) return true;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const v = localStorage.getItem(k) || '';
    if (v.includes(sample)) return false;
  }
  return true;
}
