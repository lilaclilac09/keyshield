import { describe, it, expect, vi } from 'vitest';
import {
  BearerHolder,
  SyncAuthAlreadyRegistered,
  SyncAuthClient,
} from './sync-auth';
import type {
  AuthResult,
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from './auth';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeRegistration(): RegistrationResponseJSON {
  return {
    id: 'cred-id',
    rawId: 'cred-id',
    type: 'public-key',
    response: { clientDataJSON: 'a', attestationObject: 'b' },
    clientExtensionResults: {},
  };
}

function makeAssertion(): AuthenticationResponseJSON {
  return {
    id: 'cred-id',
    rawId: 'cred-id',
    type: 'public-key',
    response: {
      clientDataJSON: 'a',
      authenticatorData: 'b',
      signature: 'c',
    },
    clientExtensionResults: {},
  };
}

describe('SyncAuthClient.registerVault', () => {
  it('POSTs the attestation + expectedChallenge to /auth/register', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const client = new SyncAuthClient({
      baseUrl: 'https://sync.example/',
      fetchImpl: fetchImpl as any,
    });
    const authResult: AuthResult = {
      success: true,
      credentialId: 'cred-id',
      registrationResponseJSON: makeRegistration(),
      expectedChallenge: 'CHALLENGE_BASE64URL',
    };

    await client.registerVault('vid-12345678', authResult);

    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('https://sync.example/auth/register');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      vaultId: 'vid-12345678',
      attestation: makeRegistration(),
      expectedChallenge: 'CHALLENGE_BASE64URL',
    });
  });

  it('throws SyncAuthAlreadyRegistered on 409', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 409));
    const client = new SyncAuthClient({
      baseUrl: 'https://x',
      fetchImpl: fetchImpl as any,
    });
    await expect(
      client.registerVault('vid-12345678', {
        success: true,
        registrationResponseJSON: makeRegistration(),
        expectedChallenge: 'c',
      } as any),
    ).rejects.toBeInstanceOf(SyncAuthAlreadyRegistered);
  });

  it('throws when AuthResult lacks registration JSON', async () => {
    const client = new SyncAuthClient({
      baseUrl: 'https://x',
      fetchImpl: vi.fn() as any,
    });
    await expect(
      client.registerVault('vid', {
        success: true,
        prfSecret: new Uint8Array(32),
      } as any),
    ).rejects.toThrow(/registrationResponseJSON/);
  });
});

describe('SyncAuthClient.fetchChallenge / exchange', () => {
  it('parses the /auth/challenge JSON', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ challenge: 'abc', expiresAt: 1700000000 }),
    );
    const client = new SyncAuthClient({
      baseUrl: 'https://x',
      fetchImpl: fetchImpl as any,
    });
    const r = await client.fetchChallenge('vid');
    expect(r).toEqual({ challenge: 'abc', expiresAt: 1700000000 });
  });

  it('parses the /auth/exchange JSON', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ token: 'eyJhbGc...', expiresAt: 1700001000 }),
    );
    const client = new SyncAuthClient({
      baseUrl: 'https://x',
      fetchImpl: fetchImpl as any,
    });
    const r = await client.exchange('vid', makeAssertion());
    expect(r).toEqual({ token: 'eyJhbGc...', expiresAt: 1700001000 });
  });

  it('throws on non-2xx fetchChallenge', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404));
    const client = new SyncAuthClient({
      baseUrl: 'https://x',
      fetchImpl: fetchImpl as any,
    });
    await expect(client.fetchChallenge('vid')).rejects.toThrow(/404/);
  });
});

describe('BearerHolder', () => {
  it('returns null before set()', () => {
    const h = new BearerHolder();
    expect(h.getValidToken()).toBeNull();
  });

  it('returns the token while not expired', () => {
    const h = new BearerHolder();
    h.set('tok', Date.now() + 60_000);
    expect(h.getValidToken()).toBe('tok');
  });

  it('returns null inside the early-expiry window', () => {
    const h = new BearerHolder({ earlyExpirySecs: 30 });
    h.set('tok', Date.now() + 10_000); // 10s ahead, but slack is 30s
    expect(h.getValidToken()).toBeNull();
  });

  it('returns null after explicit markExpired()', () => {
    const h = new BearerHolder();
    h.set('tok', Date.now() + 60_000);
    h.markExpired();
    expect(h.getValidToken()).toBeNull();
  });

  it('returns null after the absolute expiry passes', () => {
    const h = new BearerHolder({ earlyExpirySecs: 0 });
    h.set('tok', Date.now() + 50);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 100);
    expect(h.getValidToken()).toBeNull();
    vi.useRealTimers();
  });
});
