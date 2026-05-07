import { describe, it, expect, vi } from 'vitest';
import { asyncStorageBackend, type KeyValueStorage } from './asyncStorageBackend';

function memoryAsyncStorage(): KeyValueStorage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async getItem(key) {
      return store.get(key) ?? null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
}

describe('asyncStorageBackend', () => {
  it('round-trips a JSON-shaped value', async () => {
    const inner = memoryAsyncStorage();
    const back = asyncStorageBackend(inner);
    await back.set('a', { hello: 'world', nested: { n: 1 } });
    expect(await back.get('a')).toEqual({ hello: 'world', nested: { n: 1 } });
  });

  it('JSON-stringifies values before passing to the inner storage', async () => {
    const inner = memoryAsyncStorage();
    const back = asyncStorageBackend(inner);
    await back.set('a', [1, 2, 3]);
    // Inner storage should hold the stringified form, not the array.
    expect(inner.store.get('a')).toBe('[1,2,3]');
  });

  it('returns undefined for a missing key', async () => {
    const back = asyncStorageBackend(memoryAsyncStorage());
    expect(await back.get('missing')).toBeUndefined();
  });

  it('returns undefined for a corrupt (non-JSON) entry instead of throwing', async () => {
    const inner = memoryAsyncStorage();
    inner.store.set('a', '{not json');
    const back = asyncStorageBackend(inner);
    expect(await back.get('a')).toBeUndefined();
  });

  it('remove() drops the entry', async () => {
    const inner = memoryAsyncStorage();
    const back = asyncStorageBackend(inner);
    await back.set('a', 1);
    await back.remove('a');
    expect(await back.get('a')).toBeUndefined();
  });

  it('forwards the exact key string to the inner storage (no key mangling)', async () => {
    const inner = memoryAsyncStorage();
    const setSpy = vi.spyOn(inner, 'setItem');
    const back = asyncStorageBackend(inner);
    await back.set('keyshield-sync.vault-cache', { x: 1 });
    expect(setSpy).toHaveBeenCalledWith(
      'keyshield-sync.vault-cache',
      '{"x":1}',
    );
  });
});
