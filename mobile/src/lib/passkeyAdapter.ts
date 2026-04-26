/**
 * Adapter from react-native-passkey to the `CredentialsProvider`
 * interface that `extension-sync/src/lib/auth.ts` expects.
 *
 * STATUS: skeleton. The function signatures match what AuthService
 * needs, but the body throws — wire up react-native-passkey calls
 * before shipping the mobile build. This file exists so the
 * service factory can compile and the rest of the lib code can be
 * unit-tested without the RN runtime.
 *
 * Design:
 *   - registerPasskey → react-native-passkey `Passkey.create()`
 *     with `extensions: { prf: { eval: { first: PRF_SALT } } }`.
 *     Returns the result reshaped into a Credential-like object
 *     that AuthService's `credentialToRegistrationJSON` helper can
 *     read.
 *   - authenticateWithWebAuthn → `Passkey.get()` with the same
 *     extension, similarly reshaped.
 *   - hasPublicKeyCredential → `Passkey.isSupported()`.
 *
 * The PRF result on iOS 18+ is in the credential's
 * `clientExtensionResults.prf.results.first` per the WebAuthn
 * spec; react-native-passkey 3.x exposes it as a base64 string
 * inside `clientExtensionResults`. Decode + wrap so it matches
 * the browser shape.
 */

import type { CredentialsProvider } from '@keyshield/extension-sync/src/lib/auth';

export function reactNativePasskeyProvider(): CredentialsProvider {
  return {
    hasPublicKeyCredential: true, // react-native-passkey is loaded; assume true and let .get() throw if not
    create: async () => {
      throw new Error(
        'reactNativePasskeyProvider.create not implemented yet. ' +
          'Wire up react-native-passkey Passkey.create with the prf ' +
          'extension and reshape the response into a Credential-like ' +
          'object before shipping the mobile build.',
      );
    },
    get: async () => {
      throw new Error(
        'reactNativePasskeyProvider.get not implemented yet. ' +
          'Wire up react-native-passkey Passkey.get with the prf ' +
          'extension and reshape the response into a Credential-like ' +
          'object before shipping the mobile build.',
      );
    },
  };
}
