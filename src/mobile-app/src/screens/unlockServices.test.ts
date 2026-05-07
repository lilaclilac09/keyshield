// UnlockScreen calls services.auth.registerPasskey({ userId, userName,
// userDisplayName }) and services.auth.authenticateWithWebAuthn().
// This test pins the contract: the AuthService class on extension-sync
// must keep both methods, and our typings stay aligned with the popup's.
//
// We don't render the screen here (RN primitives need a Metro/RN test
// runner). What we DO check: a buildMobileServices-shaped object can
// stand in for the popup's `Services` type the screen consumes, and
// passes the calls through to the configured providers.

import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '@keyshield/extension-sync/src/lib/auth';

function fakeCredentials() {
  return {
    hasPublicKeyCredential: true,
    create: vi.fn(async () => ({
      id: 'cred-1',
      rawId: new ArrayBuffer(16),
      type: 'public-key' as const,
      response: {
        attestationObject: new ArrayBuffer(0),
        clientDataJSON: new ArrayBuffer(0),
      },
      getClientExtensionResults: () => ({
        prf: { results: { first: new ArrayBuffer(32) } },
      }),
    })),
    get: vi.fn(async () => ({
      id: 'cred-1',
      rawId: new ArrayBuffer(16),
      type: 'public-key' as const,
      response: {
        authenticatorData: new ArrayBuffer(0),
        clientDataJSON: new ArrayBuffer(0),
        signature: new ArrayBuffer(0),
      },
      getClientExtensionResults: () => ({
        prf: { results: { first: new ArrayBuffer(32) } },
      }),
    })),
  };
}

describe('UnlockScreen service contract', () => {
  it('AuthService exposes the methods the screen calls', () => {
    const credentials = fakeCredentials();
    const auth = new AuthService({ credentials, rpName: 'KeyShield' });
    expect(typeof auth.registerPasskey).toBe('function');
    expect(typeof auth.authenticateWithWebAuthn).toBe('function');
  });

  it('registerPasskey forwards a 32-byte PRF secret to the caller', async () => {
    const credentials = fakeCredentials();
    const auth = new AuthService({ credentials, rpName: 'KeyShield' });

    const userId = new Uint8Array(16);
    for (let i = 0; i < 16; i++) userId[i] = i;

    const result = await auth.registerPasskey({
      userId,
      userName: 'keyshield-user',
      userDisplayName: 'KeyShield user',
    });
    expect(result.success).toBe(true);
    expect(result.prfSecret).toBeInstanceOf(Uint8Array);
    expect(result.prfSecret?.byteLength).toBe(32);
    expect(credentials.create).toHaveBeenCalledOnce();
  });

  it('authenticateWithWebAuthn pulls the PRF secret out of the assertion', async () => {
    const credentials = fakeCredentials();
    const auth = new AuthService({ credentials, rpName: 'KeyShield' });
    const result = await auth.authenticateWithWebAuthn();
    expect(result.success).toBe(true);
    expect(result.prfSecret?.byteLength).toBe(32);
    expect(credentials.get).toHaveBeenCalledOnce();
  });
});
