/**
 * Centralised wiring for the popup.
 *
 * Builds one instance of each library using the real browser backends
 * (chrome.storage.*, navigator.credentials, globalThis.crypto) so the
 * React components can just import `services` and pull what they need.
 *
 * Kept out of the React tree to make it easier to swap the real
 * backends for mocks during storybook / UI tests.
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

export const services = {
  auth: new AuthService({
    credentials: browserCredentialsProvider(),
    rpName: 'KeyShield',
  }),
  vault: new LocalVault({
    storage: chromeStorageBackend(),
    crypto: globalCryptoBackend(),
  }),
  session: new ExtensionSession({
    storage: chromeSessionStorageBackend(),
  }),
};

export type Services = typeof services;
