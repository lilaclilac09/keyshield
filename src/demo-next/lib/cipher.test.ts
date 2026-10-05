import assert from 'node:assert/strict';
import { deriveDecryptKey, deriveSessionKey, demoSoftPrf } from './prf';
import {
  assertNoPlaintextLocalStorage,
  decryptFromStore,
  decryptFromStoreBytes,
  encryptToStore,
} from './cipher';
import { zeroize } from './bytes';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  get length(): number {
    return this.store.size;
  }
}

async function main() {
  const ls = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });

  const prf = await demoSoftPrf();
  const key = await deriveSessionKey(prf);
  const decryptOnly = await deriveDecryptKey(prf);
  const secret = 'sk-or-never-store-plain';
  await encryptToStore(key, 'openrouter', secret);
  const round = await decryptFromStore(decryptOnly, 'openrouter');
  assert.equal(round, secret);
  assert.equal(assertNoPlaintextLocalStorage(secret), true, 'plaintext must not land in localStorage');

  const persisted = ls.getItem('ks.cipher.openrouter');
  assert.ok(persisted, 'ciphertext fallback lands in localStorage');
  assert.equal(persisted.includes(secret), false);
  assert.ok(persisted.includes('"iv"'));
  assert.ok(persisted.includes('"ciphertext"'));

  const bytes = await decryptFromStoreBytes(decryptOnly, 'openrouter');
  assert.ok(bytes);
  assert.equal(new TextDecoder().decode(bytes), secret);
  zeroize(bytes);
  assert.ok(bytes.every((b) => b === 0));
  console.log('cipher indexeddb/memory wrap ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
