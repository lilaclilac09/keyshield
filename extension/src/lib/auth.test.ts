import { describe, it, expect, vi } from 'vitest';
import { AuthService, type CredentialsProvider } from './auth';

function mockCredentials(overrides: Partial<CredentialsProvider> = {}): CredentialsProvider {
  return {
    create: vi.fn(async () => ({ id: 'new-cred-id' } as any)),
    get: vi.fn(async () => ({ id: 'cred-id' } as any)),
    hasPublicKeyCredential: true,
    ...overrides,
  };
}

describe('AuthService.registerPasskey', () => {
  it('returns success with the new credential id', async () => {
    const auth = new AuthService({ credentials: mockCredentials() });
    const r = await auth.registerPasskey({
      userId: new Uint8Array([1, 2, 3]),
      userName: 'alice@example.com',
    });
    expect(r).toEqual({ success: true, credentialId: 'new-cred-id' });
  });

  it('passes an ES256 + RS256 pubKeyCredParams payload and platform authenticator', async () => {
    const creds = mockCredentials();
    const auth = new AuthService({
      credentials: creds,
      rpName: 'KeyShield Test',
    });
    await auth.registerPasskey({ userId: new Uint8Array(16), userName: 'u' });

    const call = (creds.create as any).mock.calls[0][0];
    expect(call.publicKey.rp.name).toBe('KeyShield Test');
    expect(call.publicKey.authenticatorSelection.authenticatorAttachment).toBe('platform');
    expect(call.publicKey.authenticatorSelection.residentKey).toBe('required');
    expect(call.publicKey.authenticatorSelection.userVerification).toBe('required');
    expect(call.publicKey.pubKeyCredParams).toEqual([
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ]);
    expect(call.publicKey.challenge).toBeInstanceOf(Uint8Array);
    expect(call.publicKey.challenge.length).toBe(32);
  });

  it('reports WebAuthn unavailability without calling create', async () => {
    const creds = mockCredentials({ hasPublicKeyCredential: false });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.registerPasskey({
      userId: new Uint8Array(8),
      userName: 'u',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not supported/i);
    expect(creds.create).not.toHaveBeenCalled();
  });

  it('surfaces the cancellation case when create() returns null', async () => {
    const creds = mockCredentials({ create: vi.fn(async () => null) });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.registerPasskey({
      userId: new Uint8Array(8),
      userName: 'u',
    });
    expect(r).toEqual({ success: false, error: 'Registration cancelled' });
  });

  it('surfaces thrown errors', async () => {
    const creds = mockCredentials({
      create: vi.fn(async () => {
        throw new Error('platform said no');
      }),
    });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.registerPasskey({
      userId: new Uint8Array(8),
      userName: 'u',
    });
    expect(r).toEqual({ success: false, error: 'platform said no' });
  });
});

describe('AuthService.authenticateWithWebAuthn', () => {
  it('returns success with the credential id', async () => {
    const auth = new AuthService({ credentials: mockCredentials() });
    const r = await auth.authenticateWithWebAuthn();
    expect(r).toEqual({ success: true, credentialId: 'cred-id' });
  });

  it('forwards allowCredentials when provided', async () => {
    const creds = mockCredentials();
    const auth = new AuthService({ credentials: creds });
    const allowed = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
    await auth.authenticateWithWebAuthn(allowed);
    const call = (creds.get as any).mock.calls[0][0];
    expect(call.publicKey.allowCredentials).toHaveLength(2);
    expect(call.publicKey.allowCredentials[0].type).toBe('public-key');
    expect(call.publicKey.allowCredentials[0].id).toBe(allowed[0]);
    expect(call.publicKey.userVerification).toBe('required');
  });

  it('treats null credential as cancellation', async () => {
    const creds = mockCredentials({ get: vi.fn(async () => null) });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.authenticateWithWebAuthn();
    expect(r).toEqual({ success: false, error: 'Authentication cancelled' });
  });

  it('reports WebAuthn unavailability', async () => {
    const auth = new AuthService({
      credentials: mockCredentials({ hasPublicKeyCredential: false }),
    });
    const r = await auth.authenticateWithWebAuthn();
    expect(r.success).toBe(false);
  });
});

describe('AuthService.isWebAuthnAvailable', () => {
  it('delegates to the provider', () => {
    expect(new AuthService({ credentials: mockCredentials() }).isWebAuthnAvailable()).toBe(true);
    expect(
      new AuthService({
        credentials: mockCredentials({ hasPublicKeyCredential: false }),
      }).isWebAuthnAvailable(),
    ).toBe(false);
  });
});
