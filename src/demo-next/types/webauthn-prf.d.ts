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
