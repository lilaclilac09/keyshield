/**
 * Mobile services factory — the React Native equivalent of
 * `extension-sync/src/popup/wiring.ts`.
 *
 * Builds the same `services` object shape the popup expects so the
 * shared `useVaultFlow` hook works unchanged. Differences from the
 * browser wiring:
 *   - `chrome.storage.local` → AsyncStorage via asyncStorageBackend
 *   - `globalThis.crypto`    → react-native-quick-crypto via cryptoBackend
 *   - `navigator.credentials` → react-native-passkey via passkeyAdapter
 *
 * Sync backend + JWT exchange + BearerHolder come straight from
 * `@keyshield/extension-sync` — no fork.
 */

import {
  AuthService,
  type AuthServiceConfig,
} from '@keyshield/extension-sync/src/lib/auth';
import {
  LocalVault,
} from '@keyshield/extension-sync/src/lib/vault';
import {
  ExtensionSession,
  type SessionStorageBackend,
} from '@keyshield/extension-sync/src/lib/session';
import {
  HttpSyncBackend,
  InMemorySyncBackend,
  type SyncBackend,
} from '@keyshield/extension-sync/src/lib/sync';
import {
  BearerHolder,
  SyncAuthClient,
} from '@keyshield/extension-sync/src/lib/sync-auth';

import {
  asyncStorageBackend,
  type KeyValueStorage,
} from '../storage/asyncStorageBackend';
import { cryptoBackend, type SubtleCryptoLike } from '../storage/quickCryptoBackend';

export interface MobileServicesConfig {
  /** AsyncStorage instance (or any KV-shaped storage). */
  asyncStorage: KeyValueStorage;
  /** WebCrypto-compatible implementation (quick-crypto in prod). */
  crypto: SubtleCryptoLike;
  /** WebAuthn provider — react-native-passkey, mocked in tests. */
  credentials: AuthServiceConfig['credentials'];
  /** Sync worker URL. If omitted, falls back to InMemorySyncBackend
   *  (vault won't survive an app restart). */
  syncUrl?: string;
}

export function buildMobileServices(cfg: MobileServicesConfig) {
  // AsyncStorage doubles as both the persistent vault cache AND the
  // session-state store on mobile. (Browser uses two distinct
  // chrome.storage namespaces; AsyncStorage has only one.)
  const storage = asyncStorageBackend(cfg.asyncStorage);
  const sessionStorage: SessionStorageBackend = {
    get: (k) => storage.get(k),
    set: (k, v) => storage.set(k, v),
    remove: (k) => storage.remove(k),
  };
  const crypto = cryptoBackend(cfg.crypto);
  const bearer = new BearerHolder();
  const syncAuth = cfg.syncUrl ? new SyncAuthClient({ baseUrl: cfg.syncUrl }) : null;
  const sync: SyncBackend = cfg.syncUrl
    ? new HttpSyncBackend({
        baseUrl: cfg.syncUrl,
        getToken: () => bearer.getValidToken(),
      })
    : new InMemorySyncBackend();

  return {
    auth: new AuthService({
      credentials: cfg.credentials,
      rpName: 'KeyShield',
    }),
    vault: new LocalVault({ storage, crypto }),
    sync,
    syncAuth,
    bearer,
    session: new ExtensionSession({ storage: sessionStorage }),
  };
}

export type MobileServices = ReturnType<typeof buildMobileServices>;
