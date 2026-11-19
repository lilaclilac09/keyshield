import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const prf = new Uint8Array(32).fill(7).buffer;
let broker: any;
let get: ReturnType<typeof vi.fn>;
let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  broker = {
    beginApproval: vi.fn(async (requestId) => ({ challenge: 'AQID', credentialId: 'BAUG', rpId: 'app.ks.aileena.xyz',
      binding: { requestId, entryId: 'openai#2', operation: 'mock.echo' } })),
    approve: vi.fn(async () => ({})),
  };
  get = vi.fn(async () => ({ id: 'BAUG', rawId: new Uint8Array([4, 5, 6]).buffer, type: 'public-key',
    getClientExtensionResults: () => ({ prf: { results: { first: prf } } }),
    response: { authenticatorData: prf, clientDataJSON: prf, signature: prf, userHandle: null },
  }));
  vi.stubGlobal('window', { keyshieldDesktop: { broker }, location: { hostname: 'localhost' }, addEventListener: vi.fn() });
  vi.stubGlobal('navigator', { credentials: { get } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  network = vi.fn(); vi.stubGlobal('fetch', network);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function seeded() {
  const crypto = await import('../src/web/lib/vault');
  const cipher = await crypto.encryptVault(await crypto.deriveMasterKey(prf), {
    entries: { openai: { upstream: 'openai', apiKey: '', addedAt: 1 },
      'openai#2': { upstream: 'openai', apiKey: SECRET, addedAt: 2 } }, updatedAt: 2,
  });
  network.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/exchange')) return Response.json({ token: 'test-bearer', expiresAt: Date.now() + 600000 });
    if (init?.method === 'PUT') return Response.json({});
    if (url.includes('/vault/')) return Response.json(cipher);
    throw new Error('unexpected network');
  });
  const session = await import('../src/web/lib/vault-session');
  await session.unlockVault(prf, {});
  session.lockVault(); network.mockClear();
  return { session, crypto, cipher };
}

describe('private approval decrypt through broker-bound ceremony', () => {
  it('retains ciphertext only across lock, decrypts exact openai#2, stays locked and makes zero fetch calls', async () => {
    const { session, crypto, cipher } = await seeded();
    const decrypt = vi.spyOn(crypto, 'decryptVault');
    expect((session as any).decryptEntryForApproval).toBeUndefined();
    expect(session.isVaultUnlocked()).toBe(false);
    await session.approveRequestWithPasskey('request-2');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0].publicKey).toMatchObject({ userVerification: 'required', rpId: 'app.ks.aileena.xyz' });
    expect(broker.approve).toHaveBeenCalledWith({ requestId: 'request-2', assertion: expect.any(Object), secret: SECRET });
    expect(decrypt.mock.calls[0][1]).toEqual(cipher);
    expect(Object.keys(decrypt.mock.calls[0][1]).sort()).toEqual(['ciphertext', 'iv', 'updatedAt', 'version']);
    expect(JSON.stringify(decrypt.mock.calls[0][1])).not.toContain(SECRET);
    expect(network).not.toHaveBeenCalled(); expect(session.isVaultUnlocked()).toBe(false);
    expect((await import('../src/web/lib/zk')).getZkRoot()).toBeNull();
  });

  it('missing exact ID does not fall back to the provider entry', async () => {
    const { session } = await seeded();
    broker.beginApproval.mockResolvedValue({ challenge: 'AQID', credentialId: 'BAUG', rpId: 'app.ks.aileena.xyz', binding: { requestId: 'r', entryId: 'openai#3' } });
    await expect(session.approveRequestWithPasskey('r')).rejects.toThrow('entry not found');
    expect(broker.approve).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(session.isVaultUnlocked()).toBe(false);
  });

  it.each(['cancel', 'error', 'no PRF'])('never sends approval to main on %s', async (mode) => {
    const { session } = await seeded();
    if (mode === 'cancel') get.mockResolvedValue(null);
    if (mode === 'error') get.mockRejectedValue(new Error('cancelled'));
    if (mode === 'no PRF') get.mockResolvedValue({ getClientExtensionResults: () => ({}) });
    await expect(session.approveRequestWithPasskey('r')).rejects.toThrow();
    expect(broker.approve).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it('requires an in-memory snapshot, including after reload', async () => {
    const { session } = await seeded();
    vi.resetModules();
    const reloaded = await import('../src/web/lib/vault-session');
    await expect(reloaded.approveRequestWithPasskey('r')).rejects.toThrow('unlock the device vault once first');
    expect(get).not.toHaveBeenCalled(); expect(broker.beginApproval).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled(); session.lockVault();
  });

  it('retains the last successfully pushed cipher', async () => {
    const { session } = await seeded();
    await session.unlockVault(prf, {});
    await session.addEntry('new-entry', SECRET);
    session.lockVault(); network.mockClear();
    broker.beginApproval.mockResolvedValue({ challenge: 'AQID', credentialId: 'BAUG', rpId: 'app.ks.aileena.xyz', binding: { requestId: 'r', entryId: 'new-entry' } });
    await session.approveRequestWithPasskey('r');
    expect(broker.approve.mock.calls[0][0].secret).toBe(SECRET); expect(network).not.toHaveBeenCalled();
  });

  it('does not retain a snapshot when the broker bridge is absent', async () => {
    delete window.keyshieldDesktop!.broker;
    const { session } = await seeded();
    window.keyshieldDesktop!.broker = broker;
    await expect(session.approveRequestWithPasskey('r')).rejects.toThrow('unlock the device vault once first');
    expect(network).not.toHaveBeenCalled();
  });
});
