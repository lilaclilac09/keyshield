/**
 * Centralised wiring for the popup.
 *
 * Builds one instance of each library using the real browser backends
 * (chrome.storage.*, navigator.credentials, globalThis.crypto) plus a
 * sync backend so vault contents follow the user across devices.
 *
 * Path A specifics:
 *   - The sync backend URL comes from VITE_KEYSHIELD_SYNC_URL. If
 *     unset (e.g. local dev without a sync server), we fall back to
 *     an in-memory backend so the popup is still demoable — vault
 *     contents will then NOT survive a popup reload.
 *   - The auth token is left undefined until we wire credentialId
 *     → bearer-token issuance. For a self-hosted blob server you'd
 *     plug in an issuance flow here.
 */

import {
  AuthService,
  browserCredentialsProvider,
} from '../lib/auth';
import {
  LocalVault,
  chromeStorageBackend,
  globalCryptoBackend,
} from '../lib/vault';
import {
  ExtensionSession,
  chromeSessionStorageBackend,
} from '../lib/session';
import {
  HttpSyncBackend,
  InMemorySyncBackend,
  type SyncBackend,
} from '../lib/sync';

const SYNC_URL =
  (import.meta as any)?.env?.VITE_KEYSHIELD_SYNC_URL ?? '';

function buildSyncBackend(): SyncBackend {
  if (SYNC_URL && typeof SYNC_URL === 'string') {
    return new HttpSyncBackend({ baseUrl: SYNC_URL });
  }
  // eslint-disable-next-line no-console
  console.info(
    '[KeyShield] VITE_KEYSHIELD_SYNC_URL not set — using in-memory sync. ' +
      'Vault will NOT survive popup reloads. For real cross-device sync, ' +
      'point this at your blob server.',
  );
  return new InMemorySyncBackend();
}

export const services = {
  auth: new AuthService({
    credentials: browserCredentialsProvider(),
    rpName: 'KeyShield',
  }),
  vault: new LocalVault({
    storage: chromeStorageBackend(),
    crypto: globalCryptoBackend(),
  }),
  sync: buildSyncBackend(),
  session: new ExtensionSession({
    storage: chromeSessionStorageBackend(),
  }),
};

export type Services = typeof services;
