/**
 * Adapter from react-native-passkey to the `CredentialsProvider`
 * interface that `extension-sync/src/lib/auth.ts` expects.
 *
 * Bridges two shape mismatches:
 *
 * 1. react-native-passkey returns base64url-encoded JSON
 *    (`PasskeyRegistrationResult` / `PasskeyAuthenticationResult`)
 *    while the AuthService passes the result to its
 *    `credentialToRegistrationJSON` / `credentialToAuthenticationJSON`
 *    helpers, which expect a Web `Credential` shape with
 *    ArrayBuffer fields it can base64url-encode itself. We invert
 *    that — feed AuthService a thin Credential-like wrapper whose
 *    fields are ALREADY ArrayBuffers decoded from the
 *    react-native-passkey strings, and whose
 *    `getClientExtensionResults()` returns the prf bytes shape the
 *    AuthService probes for.
 *
 * 2. The browser's `navigator.credentials.create` accepts a
 *    `CredentialCreationOptions` whose `publicKey.user.id` is a
 *    `BufferSource`. react-native-passkey wants a base64url
 *    string. Convert.
 *
 * The adapter accepts a `passkeyImpl` argument so unit tests can
 * inject a fake. The `defaultPasskeyImpl()` helper lazy-loads
 * `react-native-passkey` so this module can be type-checked and
 * unit-tested without the RN dep installed.
 */

import type { CredentialsProvider } from '@keyshield/extension-sync/src/lib/auth';

// ============================================================
// react-native-passkey shapes (subset we depend on)
// ============================================================

export interface RNPasskeyRegistrationRequest {
  challenge: string; // base64url
  rp: { id?: string; name: string };
  user: {
    id: string; // base64url
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    residentKey?: 'discouraged' | 'preferred' | 'required';
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  timeout?: number;
  extensions?: { prf?: { eval?: { first?: string } } };
}

export interface RNPasskeyAuthenticationRequest {
  challenge: string; // base64url
  rpId?: string;
  allowCredentials?: Array<{ id: string; type: 'public-key' }>;
  userVerification?: 'discouraged' | 'preferred' | 'required';
  timeout?: number;
  extensions?: { prf?: { eval?: { first?: string } } };
}

export interface RNPasskeyRegistrationResult {
  id: string;
  rawId: string; // base64url
  type: 'public-key';
  response: {
    clientDataJSON: string; // base64url
    attestationObject: string; // base64url
    transports?: string[];
  };
  clientExtensionResults?: {
    prf?: { results?: { first?: string /* base64url */ } };
  };
  authenticatorAttachment?: 'platform' | 'cross-platform';
}

export interface RNPasskeyAuthenticationResult {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults?: {
    prf?: { results?: { first?: string } };
  };
  authenticatorAttachment?: 'platform' | 'cross-platform';
}

export interface PasskeyImpl {
  isSupported(): boolean;
  create(req: RNPasskeyRegistrationRequest): Promise<RNPasskeyRegistrationResult>;
  get(req: RNPasskeyAuthenticationRequest): Promise<RNPasskeyAuthenticationResult>;
}

// ============================================================
// base64url helpers
// ============================================================

function base64UrlToBytes(s: string): Uint8Array {
  // Pad to multiple of 4 then translate URL-safe → standard alphabet.
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const std = padded.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(std, 'base64'));
  const bin = atob(std);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function base64UrlToArrayBuffer(s: string): ArrayBuffer {
  const u8 = base64UrlToBytes(s);
  // Slice to detach from any larger pool buffer (matters under
  // Hermes, which may share underlying memory).
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function bufferSourceToBase64Url(b: BufferSource): string {
  const bytes =
    b instanceof Uint8Array
      ? b
      : ArrayBuffer.isView(b)
        ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
        : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = typeof Buffer !== 'undefined'
    ? Buffer.from(bytes).toString('base64')
    : btoa(s);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ============================================================
// Translation
// ============================================================

/**
 * Convert the browser-shape options that AuthService builds into
 * the JSON-string-fields shape that react-native-passkey expects.
 *
 * `publicKey.challenge` arrives as a Uint8Array (or
 * BufferSource); user.id likewise. Encode both to base64url. The
 * extension `prf.eval.first` arrives as a Uint8Array too — encode
 * it to base64url so the platform passes the same bytes back in
 * `clientExtensionResults.prf.results.first`.
 */
function toRegistrationRequest(
  options: CredentialCreationOptions,
): RNPasskeyRegistrationRequest {
  const pk = (options as any).publicKey;
  const prfFirst = pk.extensions?.prf?.eval?.first;
  return {
    challenge: bufferSourceToBase64Url(pk.challenge),
    rp: { name: pk.rp.name, ...(pk.rp.id ? { id: pk.rp.id } : {}) },
    user: {
      id: bufferSourceToBase64Url(pk.user.id),
      name: pk.user.name,
      displayName: pk.user.displayName,
    },
    pubKeyCredParams: pk.pubKeyCredParams,
    ...(pk.authenticatorSelection
      ? { authenticatorSelection: pk.authenticatorSelection }
      : {}),
    ...(pk.timeout != null ? { timeout: pk.timeout } : {}),
    ...(prfFirst
      ? { extensions: { prf: { eval: { first: bufferSourceToBase64Url(prfFirst) } } } }
      : {}),
  };
}

function toAuthenticationRequest(
  options: CredentialRequestOptions,
): RNPasskeyAuthenticationRequest {
  const pk = (options as any).publicKey;
  const prfFirst = pk.extensions?.prf?.eval?.first;
  return {
    challenge: bufferSourceToBase64Url(pk.challenge),
    ...(pk.rpId ? { rpId: pk.rpId } : {}),
    ...(pk.allowCredentials
      ? {
          allowCredentials: (pk.allowCredentials as Array<{
            id: BufferSource;
            type: 'public-key';
          }>).map((c) => ({
            id: bufferSourceToBase64Url(c.id),
            type: 'public-key' as const,
          })),
        }
      : {}),
    ...(pk.userVerification ? { userVerification: pk.userVerification } : {}),
    ...(pk.timeout != null ? { timeout: pk.timeout } : {}),
    ...(prfFirst
      ? { extensions: { prf: { eval: { first: bufferSourceToBase64Url(prfFirst) } } } }
      : {}),
  };
}

/**
 * Wrap a react-native-passkey result in a Credential-shaped object
 * that AuthService's `credentialToRegistrationJSON` /
 * `credentialToAuthenticationJSON` helpers can read. They look at:
 *   - cred.id (string)
 *   - cred.rawId (ArrayBuffer)
 *   - cred.type
 *   - cred.response.{clientDataJSON, attestationObject |
 *     authenticatorData/signature/userHandle} as ArrayBuffer
 *   - cred.getClientExtensionResults() returning
 *     { prf: { results: { first: ArrayBuffer } } }
 *   - cred.authenticatorAttachment (optional)
 */
function fromRegistrationResult(
  r: RNPasskeyRegistrationResult,
): Credential {
  const prfFirstB64 = r.clientExtensionResults?.prf?.results?.first;
  return {
    id: r.id,
    rawId: base64UrlToArrayBuffer(r.rawId),
    type: 'public-key',
    response: {
      clientDataJSON: base64UrlToArrayBuffer(r.response.clientDataJSON),
      attestationObject: base64UrlToArrayBuffer(r.response.attestationObject),
      getTransports: () => r.response.transports ?? [],
    },
    authenticatorAttachment: r.authenticatorAttachment ?? null,
    getClientExtensionResults() {
      if (!prfFirstB64) return {};
      return { prf: { results: { first: base64UrlToArrayBuffer(prfFirstB64) } } };
    },
  } as unknown as Credential;
}

function fromAuthenticationResult(
  r: RNPasskeyAuthenticationResult,
): Credential {
  const prfFirstB64 = r.clientExtensionResults?.prf?.results?.first;
  return {
    id: r.id,
    rawId: base64UrlToArrayBuffer(r.rawId),
    type: 'public-key',
    response: {
      clientDataJSON: base64UrlToArrayBuffer(r.response.clientDataJSON),
      authenticatorData: base64UrlToArrayBuffer(r.response.authenticatorData),
      signature: base64UrlToArrayBuffer(r.response.signature),
      userHandle: r.response.userHandle
        ? base64UrlToArrayBuffer(r.response.userHandle)
        : null,
    },
    authenticatorAttachment: r.authenticatorAttachment ?? null,
    getClientExtensionResults() {
      if (!prfFirstB64) return {};
      return { prf: { results: { first: base64UrlToArrayBuffer(prfFirstB64) } } };
    },
  } as unknown as Credential;
}

// ============================================================
// Public adapter
// ============================================================

export function reactNativePasskeyProvider(
  passkeyImpl: PasskeyImpl,
): CredentialsProvider {
  return {
    hasPublicKeyCredential: passkeyImpl.isSupported(),
    create: async (options) => {
      const req = toRegistrationRequest(options);
      const result = await passkeyImpl.create(req);
      return fromRegistrationResult(result);
    },
    get: async (options) => {
      const req = toAuthenticationRequest(options);
      const result = await passkeyImpl.get(req);
      return fromAuthenticationResult(result);
    },
  };
}

/**
 * Production adapter — lazy-loads `react-native-passkey` so this
 * module can be unit-tested in plain Node by passing a stub
 * `passkeyImpl` to `reactNativePasskeyProvider` directly.
 */
export async function defaultPasskeyImpl(): Promise<PasskeyImpl> {
  const mod: any = await import('react-native-passkey');
  const Passkey = mod.Passkey ?? mod.default?.Passkey ?? mod.default;
  return {
    isSupported: () => Passkey.isSupported(),
    create: (req) => Passkey.create(req),
    get: (req) => Passkey.get(req),
  };
}
