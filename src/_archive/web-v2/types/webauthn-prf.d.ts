// WebAuthn PRF extension type augmentation.
// Why: TS DOM lib doesn't yet ship the prf extension shape, but real
// browsers (Chrome 116+, Safari 17+) implement it for FIDO2 authenticators.
// See https://w3c.github.io/webauthn/#prf-extension.

export {};

declare global {
  interface AuthenticationExtensionsPRFValues {
    first: BufferSource;
    second?: BufferSource;
  }

  interface AuthenticationExtensionsPRFInputs {
    eval?: AuthenticationExtensionsPRFValues;
    evalByCredential?: Record<string, AuthenticationExtensionsPRFValues>;
  }

  interface AuthenticationExtensionsPRFOutputs {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
      second?: ArrayBuffer;
    };
  }

  interface AuthenticationExtensionsClientInputs {
    prf?: AuthenticationExtensionsPRFInputs;
  }

  interface AuthenticationExtensionsClientOutputs {
    prf?: AuthenticationExtensionsPRFOutputs;
  }
}
