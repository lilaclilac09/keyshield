/**
 * React Native CryptoBackend adapter.
 *
 * React Native's JS engine doesn't ship Web Crypto. We use
 * `react-native-quick-crypto`, which provides a SubtleCrypto-
 * compatible surface backed by a native (rust/c++) implementation
 * and is fast enough for the vault's HKDF + AES-GCM workload.
 *
 * Like asyncStorageBackend, this module accepts the crypto
 * implementation as a parameter so unit tests can pass Node's
 * `webcrypto` instead of pulling in the RN-only package.
 */

import type { CryptoBackend } from '@keyshield/extension-sync/src/lib/vault';

export interface SubtleCryptoLike {
  subtle: SubtleCrypto;
  getRandomValues: <T extends ArrayBufferView | null>(array: T) => T;
}

export function cryptoBackend(impl: SubtleCryptoLike): CryptoBackend {
  return {
    subtle: impl.subtle,
    getRandomValues: (a) => impl.getRandomValues(a as any) as any,
  };
}

/**
 * Production adapter — lazily imports `react-native-quick-crypto`
 * so this module can be type-checked without the RN dep installed.
 */
export async function defaultQuickCryptoBackend(): Promise<CryptoBackend> {
  const mod: any = await import('react-native-quick-crypto');
  // react-native-quick-crypto installs into globalThis.crypto in
  // its `install()` shim. That keeps the API identical to the web,
  // so we just use the global once installed.
  if (typeof mod.install === 'function') mod.install();
  const c = (globalThis as any).crypto;
  return cryptoBackend(c);
}
