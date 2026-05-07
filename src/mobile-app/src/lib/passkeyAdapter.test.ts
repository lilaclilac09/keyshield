/**
 * Unit tests for the react-native-passkey ↔ AuthService adapter.
 *
 * We don't run the real react-native-passkey here (it needs the
 * RN runtime); instead, we feed reactNativePasskeyProvider a fake
 * PasskeyImpl that records the request shape and returns a canned
 * response, then assert the round-trip produces the right
 * Credential-shaped output for AuthService to consume.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  reactNativePasskeyProvider,
  type PasskeyImpl,
  type RNPasskeyAuthenticationResult,
  type RNPasskeyRegistrationResult,
} from './passkeyAdapter';

const PRF_FIRST_BYTES = new Uint8Array(32).fill(0xab);
// base64url of 32 0xab bytes — used by the fake to round-trip the PRF.
const PRF_FIRST_B64URL = 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s';

function makeFakePasskey(opts: {
  registrationResult?: Partial<RNPasskeyRegistrationResult>;
  authResult?: Partial<RNPasskeyAuthenticationResult>;
  isSupported?: boolean;
} = {}): PasskeyImpl & {
  createSpy: ReturnType<typeof vi.fn>;
  getSpy: ReturnType<typeof vi.fn>;
} {
  const createSpy = vi.fn(
    async (): Promise<RNPasskeyRegistrationResult> => ({
      id: 'cred-id',
      rawId: 'Y3JlZC1pZA', // base64url of "cred-id"
      type: 'public-key',
      response: {
        clientDataJSON: 'Y2RKU09O',
        attestationObject: 'YXR0',
        transports: ['internal'],
      },
      clientExtensionResults: {
        prf: { results: { first: PRF_FIRST_B64URL } },
      },
      authenticatorAttachment: 'platform',
      ...opts.registrationResult,
    }),
  );
  const getSpy = vi.fn(
    async (): Promise<RNPasskeyAuthenticationResult> => ({
      id: 'cred-id',
      rawId: 'Y3JlZC1pZA',
      type: 'public-key',
      response: {
        clientDataJSON: 'Y2RKU09O',
        authenticatorData: 'YXV0aA',
        signature: 'c2ln',
      },
      clientExtensionResults: {
        prf: { results: { first: PRF_FIRST_B64URL } },
      },
      ...opts.authResult,
    }),
  );
  return {
    isSupported: () => opts.isSupported ?? true,
    create: createSpy,
    get: getSpy,
    createSpy,
    getSpy,
  };
}

describe('reactNativePasskeyProvider', () => {
  it('hasPublicKeyCredential reflects Passkey.isSupported()', () => {
    expect(
      reactNativePasskeyProvider(makeFakePasskey({ isSupported: true }))
        .hasPublicKeyCredential,
    ).toBe(true);
    expect(
      reactNativePasskeyProvider(makeFakePasskey({ isSupported: false }))
        .hasPublicKeyCredential,
    ).toBe(false);
  });
});

describe('reactNativePasskeyProvider.create', () => {
  it('translates browser-shape options into base64url string fields', async () => {
    const fake = makeFakePasskey();
    const provider = reactNativePasskeyProvider(fake);

    const challenge = new Uint8Array(32).fill(0x11);
    const userId = new Uint8Array(16).fill(0x22);

    await provider.create({
      publicKey: {
        challenge,
        rp: { name: 'KeyShield Test', id: 'localhost' },
        user: {
          id: userId,
          name: 'alice@example.com',
          displayName: 'Alice',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_FIRST_BYTES } } },
      },
    } as any);

    expect(fake.createSpy).toHaveBeenCalledOnce();
    const req = fake.createSpy.mock.calls[0][0];
    expect(req.rp).toEqual({ id: 'localhost', name: 'KeyShield Test' });
    expect(req.user.name).toBe('alice@example.com');
    expect(req.user.displayName).toBe('Alice');
    expect(req.pubKeyCredParams).toEqual([
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ]);
    expect(req.timeout).toBe(60000);
    expect(req.authenticatorSelection?.residentKey).toBe('required');
    // challenge + user.id are base64url-encoded strings now.
    expect(typeof req.challenge).toBe('string');
    expect(typeof req.user.id).toBe('string');
    expect(req.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(req.user.id).toMatch(/^[A-Za-z0-9_-]+$/);
    // PRF eval.first is also base64url'd.
    expect(req.extensions?.prf?.eval?.first).toBe(PRF_FIRST_B64URL);
  });

  it('returns a Credential whose getClientExtensionResults() exposes the PRF as an ArrayBuffer', async () => {
    const provider = reactNativePasskeyProvider(makeFakePasskey());
    const cred = await provider.create({
      publicKey: {
        challenge: new Uint8Array(32),
        rp: { name: 'X' },
        user: { id: new Uint8Array(8), name: 'u', displayName: 'u' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
    } as any);

    expect(cred).not.toBeNull();
    const ext = (cred as any).getClientExtensionResults();
    expect(ext.prf?.results?.first).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(ext.prf.results.first)).toEqual(PRF_FIRST_BYTES);
  });

  it('the response.clientDataJSON / .attestationObject come back as ArrayBuffers', async () => {
    const provider = reactNativePasskeyProvider(makeFakePasskey());
    const cred = await provider.create({
      publicKey: {
        challenge: new Uint8Array(32),
        rp: { name: 'X' },
        user: { id: new Uint8Array(8), name: 'u', displayName: 'u' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
    } as any);
    const r = (cred as any).response;
    expect(r.clientDataJSON).toBeInstanceOf(ArrayBuffer);
    expect(r.attestationObject).toBeInstanceOf(ArrayBuffer);
  });

  it('omits the prf extension result when the platform did not include one', async () => {
    const fake = makeFakePasskey({
      registrationResult: { clientExtensionResults: {} },
    });
    const provider = reactNativePasskeyProvider(fake);
    const cred = await provider.create({
      publicKey: {
        challenge: new Uint8Array(32),
        rp: { name: 'X' },
        user: { id: new Uint8Array(8), name: 'u', displayName: 'u' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
    } as any);
    expect((cred as any).getClientExtensionResults()).toEqual({});
  });
});

describe('reactNativePasskeyProvider.get', () => {
  it('translates allowCredentials BufferSource ids into base64url strings', async () => {
    const fake = makeFakePasskey();
    const provider = reactNativePasskeyProvider(fake);
    await provider.get({
      publicKey: {
        challenge: new Uint8Array(32),
        rpId: 'localhost',
        allowCredentials: [
          { id: new Uint8Array([1, 2, 3]), type: 'public-key' },
          { id: new Uint8Array([4, 5, 6]), type: 'public-key' },
        ],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_FIRST_BYTES } } },
      },
    } as any);
    const req = fake.getSpy.mock.calls[0][0];
    expect(req.allowCredentials).toHaveLength(2);
    expect(typeof req.allowCredentials![0].id).toBe('string');
    expect(req.allowCredentials![0].type).toBe('public-key');
    expect(req.userVerification).toBe('required');
    expect(req.extensions?.prf?.eval?.first).toBe(PRF_FIRST_B64URL);
  });

  it('returns a Credential with ArrayBuffer response fields + PRF', async () => {
    const provider = reactNativePasskeyProvider(makeFakePasskey());
    const cred = await provider.get({
      publicKey: {
        challenge: new Uint8Array(32),
      },
    } as any);
    const r = (cred as any).response;
    expect(r.clientDataJSON).toBeInstanceOf(ArrayBuffer);
    expect(r.authenticatorData).toBeInstanceOf(ArrayBuffer);
    expect(r.signature).toBeInstanceOf(ArrayBuffer);
    const ext = (cred as any).getClientExtensionResults();
    expect(ext.prf.results.first).toBeInstanceOf(ArrayBuffer);
  });

  it('userHandle round-trips when present', async () => {
    const fake = makeFakePasskey({
      authResult: {
        id: 'cred-id',
        rawId: 'Y3JlZC1pZA',
        type: 'public-key',
        response: {
          clientDataJSON: 'Y2Rk',
          authenticatorData: 'YXV0aA',
          signature: 'c2ln',
          userHandle: 'dWg', // "uh"
        },
      },
    });
    const provider = reactNativePasskeyProvider(fake);
    const cred = await provider.get({
      publicKey: { challenge: new Uint8Array(32) },
    } as any);
    expect((cred as any).response.userHandle).toBeInstanceOf(ArrayBuffer);
  });

  it('userHandle is null when absent (matches the browser shape)', async () => {
    const provider = reactNativePasskeyProvider(makeFakePasskey());
    const cred = await provider.get({
      publicKey: { challenge: new Uint8Array(32) },
    } as any);
    expect((cred as any).response.userHandle).toBeNull();
  });
});
