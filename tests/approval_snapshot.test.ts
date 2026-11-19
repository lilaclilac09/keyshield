import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const prf = new Uint8Array(32).fill(7).buffer;
let broker: any;
let get: ReturnType<typeof vi.fn>;
let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  broker = {
    listRequests: vi.fn(async () => ['r', 'request-2'].map((id) => ({ id, credential: 'openai#2' }))),
    beginApproval: vi.fn(async ({ requestId, snapshot }) => ({ challenge: 'AQID', credentialId: 'BAUG', rpId: 'app.ks.aileena.xyz',
      binding: { requestId, entryId: snapshot.entryId, operation: 'mock.echo', snapshot } })),
    invalidateApprovals: vi.fn(async () => {}),
    approve: vi.fn(async () => ({})),
  };
  get = vi.fn(async () => ({ id: 'BAUG', rawId: new Uint8Array([4, 5, 6]).buffer, type: 'public-key',
    getClientExtensionResults: () => ({ prf: { results: { first: prf } } }),
    response: { authenticatorData: prf, clientDataJSON: prf, signature: prf, userHandle: null },
  }));
  const events = new EventTarget();
  vi.stubGlobal('window', { keyshieldDesktop: { broker }, location: { hostname: 'localhost' },
    addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) });
  vi.stubGlobal('navigator', { credentials: { get } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  network = vi.fn(); vi.stubGlobal('fetch', network);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function seeded(entryFields: Record<string, unknown> = {}) {
  const crypto = await import('../src/web/lib/vault');
  const cipher = await crypto.encryptVault(await crypto.deriveMasterKey(prf), {
    entries: { openai: { upstream: 'openai', apiKey: '', addedAt: 1 },
      'openai#2': { upstream: 'openai', apiKey: SECRET, addedAt: 2, ...entryFields } }, updatedAt: 2,
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
    expect(broker.approve).toHaveBeenCalledWith({ requestId: 'request-2', assertion: expect.any(Object), secret: SECRET,
      snapshot: expect.objectContaining({ revision: 2, entryId: 'openai#2', metadata: { addedAt: 2 } }) });
    expect(decrypt.mock.calls[0][1]).toEqual(cipher);
    expect(Object.keys(decrypt.mock.calls[0][1]).sort()).toEqual(['ciphertext', 'iv', 'updatedAt', 'version']);
    expect(JSON.stringify(decrypt.mock.calls[0][1])).not.toContain(SECRET);
    expect(network).not.toHaveBeenCalled(); expect(session.isVaultUnlocked()).toBe(false);
    expect((await import('../src/web/lib/zk')).getZkRoot()).toBeNull();
  });

  it('missing exact ID does not fall back to the provider entry', async () => {
    const { session } = await seeded();
    broker.listRequests.mockResolvedValue([{ id: 'r', credential: 'openai#3' }]);
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
    broker.listRequests.mockResolvedValue([{ id: 'r', credential: 'new-entry' }]);
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

  it.each(['mutate', 'remove', 'new pull revision', 'reused ID metadata', 'label metadata', 'expiry metadata', 'different vault', 'account switch', 'sync error', 'conflict'])('invalidates outstanding approval on %s', async (mode) => {
    const { session, crypto, cipher } = await seeded();
    await session.unlockVault(prf, {});
    let finish: (credential: any) => void = () => {};
    const credential = await get(); get.mockClear();
    get.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const approval = session.approveRequestWithPasskey('r');
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    broker.invalidateApprovals.mockClear();
    if (mode === 'mutate') await session.addEntry('other-entry', SECRET);
    if (mode === 'remove') await session.removeEntry('openai#2');
    if (mode === 'account switch') {
      localStorage.getItem = () => 'different-account';
      window.dispatchEvent(new Event('storage'));
    }
    if (mode === 'sync error') {
      network.mockRejectedValueOnce(new Error('sync failed'));
      await expect(session.unlockVault(prf, {})).rejects.toThrow();
    }
    if (mode === 'conflict') {
      network.mockResolvedValueOnce(new Response(null, { status: 409 }));
      await expect(session.addEntry('other-entry', SECRET)).rejects.toThrow('vault conflict');
    }
    if (['new pull revision', 'reused ID metadata', 'label metadata', 'expiry metadata', 'different vault'].includes(mode)) {
      const nextPrf = mode === 'different vault' ? new Uint8Array(32).fill(8).buffer : prf;
      const updated = await crypto.encryptVault(await crypto.deriveMasterKey(nextPrf), {
        entries: { 'openai#2': { upstream: 'openai', apiKey: SECRET, addedAt: mode === 'reused ID metadata' ? 99 : 2,
          ...(mode === 'label metadata' ? { label: 'new label' } : {}), ...(mode === 'expiry metadata' ? { expiresAt: 123456 } : {}) } },
        updatedAt: mode === 'new pull revision' ? 3 : cipher.updatedAt,
      });
      network.mockImplementation(async (url: string) => url.endsWith('/auth/exchange')
        ? Response.json({ token: 'test', expiresAt: Date.now() + 600000 }) : Response.json(updated));
      session.lockVault(); await session.unlockVault(nextPrf, {});
    }
    finish(credential);
    await expect(approval).rejects.toThrow('snapshot changed');
    await vi.waitFor(() => expect(broker.invalidateApprovals).toHaveBeenCalled());
    expect(broker.approve).not.toHaveBeenCalled();
  });

  it('clears the snapshot after a sync error or conflict until another successful unlock', async () => {
    const { session } = await seeded();
    network.mockRejectedValueOnce(new Error('offline'));
    await expect(session.unlockVault(prf, {})).rejects.toThrow();
    await expect(session.approveRequestWithPasskey('r')).rejects.toThrow('unlock the device vault once first');
    expect(broker.approve).not.toHaveBeenCalled();
  });

  it('binds label and expiry metadata without forwarding keys embedded in labels', async () => {
    const { session } = await seeded({ label: `label-${SECRET}`, expiresAt: 123456 });
    await session.approveRequestWithPasskey('r');
    const descriptor = broker.beginApproval.mock.calls[0][0].snapshot;
    expect(descriptor.metadata).toEqual({ addedAt: 2, label: 'label-[REDACTED]', expiresAt: 123456 });
    expect(JSON.stringify(descriptor)).not.toContain(SECRET);
  });
});
