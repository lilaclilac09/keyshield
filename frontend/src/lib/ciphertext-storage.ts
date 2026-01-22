/**
 * Off-Chain Ciphertext Storage
 * 
 * Stores full Lit Protocol ciphertext off-chain (IndexedDB) since it's too large (1-5 KB)
 * for on-chain storage. Only the dataToEncryptHash (32 bytes) is stored on-chain.
 */

const DB_NAME = 'keyshield-ciphertext';
const DB_VERSION = 1;
const STORE_NAME = 'ciphertexts';

/**
 * Initialize IndexedDB for ciphertext storage
 */
async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      }
    };
  });
}

/**
 * Store ciphertext with hash as key
 * @param hash - dataToEncryptHash from Lit Protocol (32 bytes, base64 encoded)
 * @param ciphertext - Full Lit Protocol ciphertext (1-5 KB, base64 string)
 */
export async function storeCiphertext(hash: string, ciphertext: string): Promise<void> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const data = {
      hash,
      ciphertext,
      storedAt: Date.now(),
    };
    
    const request = store.put(data);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve ciphertext by hash
 * @param hash - dataToEncryptHash from Lit Protocol
 * @returns Full ciphertext string or null if not found
 */
export async function getCiphertext(hash: string): Promise<string | null> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(hash);
    
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.ciphertext : null);
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete ciphertext by hash
 * @param hash - dataToEncryptHash from Lit Protocol
 */
export async function deleteCiphertext(hash: string): Promise<void> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(hash);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Convert hash bytes to base64 string for storage key
 */
export function hashToKey(hashBytes: Uint8Array): string {
  // Convert bytes to base64 for use as IndexedDB key
  const binary = String.fromCharCode(...hashBytes);
  return btoa(binary);
}

/**
 * Convert base64 string back to hash bytes
 */
export function keyToHash(key: string): Uint8Array {
  const binary = atob(key);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
