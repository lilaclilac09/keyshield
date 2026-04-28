import { describe, it, expect, vi } from 'vitest';
import { AuthService, PRF_SALT, type CredentialsProvider } from './auth';

/** A 32-byte canned PRF output we'll pretend the platform returned. */
const FAKE_PRF = new Uint8Array(32).fill(0x42);

function mockCredentials(opts: {
  prfBytes?: Uint8Array;
  createImpl?: (o: any) => Promise<Credential | null>;
  getImpl?: (o: any) => Promise<Credential | null>;
  hasPublicKeyCredential?: boolean;
} = {}): CredentialsProvider {
  // The conversion helpers expect a real-shape credential — rawId,
  // response.clientDataJSON, response.attestationObject (for create)
  // / authenticatorData + signature (for get). Stub them with empty
  // ArrayBuffers; the tests don't check the b64 content, only that
  // the right calls happened.
  const empty = new ArrayBuffer(0);
  const buildRegisterCredential = (id: string) =>
    ({
      id,
      rawId: empty,
      type: 'public-key' as const,
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: empty,
        attestationObject: empty,
        getTransports: () => [],
      },
      getClientExtensionResults: () =>
        opts.prfBytes
          ? { prf: { results: { first: opts.prfBytes.buffer } } }
          : {},
    } as unknown as Credential);

  const buildAuthCredential = (id: string) =>
    ({
      id,
      rawId: empty,
      type: 'public-key' as const,
      response: {
        clientDataJSON: empty,
        authenticatorData: empty,
        signature: empty,
        userHandle: null,
      },
      getClientExtensionResults: () =>
        opts.prfBytes
          ? { prf: { results: { first: opts.prfBytes.buffer } } }
          : {},
    } as unknown as Credential);

  return {
    create: opts.createImpl ?? (async () => buildRegisterCredential('new-cred-id')),
    get: opts.getImpl ?? (async () => buildAuthCredential('cred-id')),
    hasPublicKeyCredential: opts.hasPublicKeyCredential ?? true,
  };
}

describe('AuthService.registerPasskey (PRF)', () => {
  it('passes the prf extension and PRF_SALT in the create call', async () => {
    const creds = mockCredentials({ prfBytes: FAKE_PRF });
    const spy = vi.spyOn(creds, 'create');
    const auth = new AuthService({ credentials: creds });
    await auth.registerPasskey({
      userId: new Uint8Array(16),
      userName: 'alice',
    });
    const call = spy.mock.calls[0][0] as any;
    expect(call.publicKey.extensions.prf.eval.first).toBe(PRF_SALT);
  });

  it('returns prfSecret when the platform includes one', async () => {
    const creds = mockCredentials({ prfBytes: FAKE_PRF });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.registerPasskey({
      userId: new Uint8Array(16),
      userName: 'alice',
    });
    expect(r.success).toBe(true);
    expect(r.prfSecret).toBeInstanceOf(Uint8Array);
    expect(Array.from(r.prfSecret!)).toEqual(Array.from(FAKE_PRF));
  });

  it('still succeeds when the platform omits PRF on registration', async () => {
    const creds = mockCredentials({ prfBytes: undefined });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.registerPasskey({
      userId: new Uint8Array(16),
      userName: 'alice',
    });
    expect(r.success).toBe(true);
    expect(r.prfSecret).toBeUndefined();
  });
});

describe('AuthService.authenticateWithWebAuthn (PRF)', () => {
  it('returns prfSecret when the platform includes one', async () => {
    const creds = mockCredentials({ prfBytes: FAKE_PRF });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.authenticateWithWebAuthn();
    expect(r.success).toBe(true);
    expect(r.prfSecret).toBeInstanceOf(Uint8Array);
    expect(r.prfSecret!.length).toBe(32);
  });

  it('FAILS hard when the platform omits PRF on authenticate', async () => {
    const creds = mockCredentials({ prfBytes: undefined });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.authenticateWithWebAuthn();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/PRF/);
  });

  it('treats null credential as cancellation', async () => {
    const creds = mockCredentials({ getImpl: async () => null });
    const auth = new AuthService({ credentials: creds });
    const r = await auth.authenticateWithWebAuthn();
    expect(r).toEqual({ success: false, error: 'Authentication cancelled' });
  });

  it('forwards allowCredentials when provided', async () => {
    const creds = mockCredentials({ prfBytes: FAKE_PRF });
    const spy = vi.spyOn(creds, 'get');
    const auth = new AuthService({ credentials: creds });
    const allowed = [new Uint8Array([1, 2, 3])];
    await auth.authenticateWithWebAuthn(allowed);
    const call = spy.mock.calls[0][0] as any;
    expect(call.publicKey.allowCredentials[0].id).toBe(allowed[0]);
    expect(call.publicKey.extensions.prf.eval.first).toBe(PRF_SALT);
  });

  it('reports WebAuthn unavailability without calling get', async () => {
    const creds = mockCredentials({ hasPublicKeyCredential: false });
    const spy = vi.spyOn(creds, 'get');
    const auth = new AuthService({ credentials: creds });
    const r = await auth.authenticateWithWebAuthn();
    expect(r.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
