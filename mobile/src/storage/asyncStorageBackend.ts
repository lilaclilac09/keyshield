/**
 * AsyncStorage adapter for the LocalVault `StorageBackend` interface.
 *
 * Maps the same get/set/remove surface that `chrome.storage.local`
 * implements in the extension onto React Native's
 * @react-native-async-storage/async-storage. The vault's encrypted
 * payload is JSON-stringified on the way in and parsed on the way
 * out — same shape the extension stores in chrome.storage.
 *
 * The actual AsyncStorage import is loaded lazily so this module
 * can be unit-tested in plain Node by stubbing the `storage` arg.
 */

import type { StorageBackend } from '@keyshield/extension-sync/src/lib/vault';

/** Minimal AsyncStorage shape we depend on — `getItem`, `setItem`,
 *  `removeItem`. Matches @react-native-async-storage/async-storage
 *  but accepts any compatible implementation (in-memory for tests,
 *  Expo SecureStore, etc.). */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function asyncStorageBackend(storage: KeyValueStorage): StorageBackend {
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const raw = await storage.getItem(key);
      if (raw == null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // The extension stores everything we care about as JSON.
        // Anything that doesn't parse is treated as absent — a
        // corrupt entry won't crash the popup.
        return undefined;
      }
    },
    async set(key, value) {
      await storage.setItem(key, JSON.stringify(value));
    },
    async remove(key) {
      await storage.removeItem(key);
    },
  };
}

/**
 * Production adapter — pulls in @react-native-async-storage/async-storage
 * lazily so importers in non-RN contexts (e.g. unit tests, Storybook)
 * don't pay the bundle cost.
 */
export async function defaultAsyncStorageBackend(): Promise<StorageBackend> {
  const mod: any = await import('@react-native-async-storage/async-storage');
  const AsyncStorage = mod.default ?? mod;
  return asyncStorageBackend(AsyncStorage);
}
