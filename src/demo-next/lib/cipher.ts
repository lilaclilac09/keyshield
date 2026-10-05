/**
 * Local AES-256-GCM ciphertext in IndexedDB. Plaintext never written to
 * localStorage. Session key is non-extractable (from PRF HKDF).
 */

import { b64urlToBytes, bytesToB64url } from './bytes';

const DB = 'ks-demo-vault';
const STORE = 'ciphers';
const IV_BYTES = 12;

export interface StoredCipher {
  id: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
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

export async function encryptToStore(sessionKey: CryptoKey, id: string, plaintext: string): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, data));
  data.fill(0);
  const row: StoredCipher = {
    id,
    iv: bytesToB64url(iv),
    ciphertext: bytesToB64url(ct),
    updatedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function decryptFromStore(sessionKey: CryptoKey, id: string): Promise<string | null> {
  const db = await openDb();
  const row = await new Promise<StoredCipher | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredCipher | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!row) return null;
  const iv = b64urlToBytes(row.iv);
  const ct = b64urlToBytes(row.ciphertext);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, ct);
  return new TextDecoder().decode(pt);
}
