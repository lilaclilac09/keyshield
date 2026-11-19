import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('react', () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: vi.fn(),
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
}));
vi.mock('../src/web/lib/auth', () => ({
  API_BASE: 'https://synthetic.invalid',
  isAuthenticated: () => true,
  requestVaultUnlock: vi.fn(),
  apiFetch: (path: string, init?: RequestInit) => fetch(`https://synthetic.invalid${path}`, init),
}));

import { useVaults } from '../src/web/hooks/useVaults';
import { unlockVault, lockVault, getDecryptedKey } from '../src/web/lib/vault-session';
import * as vaultCrypto from '../src/web/lib/vault';

const raw = 'sk-test-SYNTHETIC-device-local-new-key';
const input = { upstream: 'openai', rawKey: raw, value: raw, name: raw };
let requests: Array<{ url: string; init?: RequestInit }>;
let diagnostics: unknown[];
let failNetwork: boolean;

beforeEach(() => {
  requests = [];
  diagnostics = [];
  failNetwork = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (url.endsWith('/auth/exchange')) return Response.json({ token: 'synthetic-token', expiresAt: Date.now() + 600000 });
    if (init?.method === 'PUT' && failNetwork) throw new Error(`network rejected ${raw}`);
    if (url.includes('/vault/') && init?.method === 'GET') return new Response(null, { status: 404 });
    if (url.endsWith('/manage/vault')) return Response.json([]);
    return Response.json({});
  }));
  vi.stubGlobal('XMLHttpRequest', class { open(...args: unknown[]) { requests.push({ url: JSON.stringify(args) }); } send(body: unknown) { diagnostics.push(body); } });
  vi.stubGlobal('WebSocket', class { constructor(url: string) { requests.push({ url }); } send(body: unknown) { diagnostics.push(body); } });
  vi.stubGlobal('navigator', { sendBeacon: (...args: unknown[]) => { diagnostics.push(args); return true; } });
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => { diagnostics.push(args); });
  }
});

afterEach(() => {
  lockVault();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function unlock() {
  await unlockVault(new Uint8Array(32).fill(7).buffer, {});
  requests = [];
}

function expectPrivate() {
  expect(JSON.stringify(requests)).not.toContain(raw);
  expect(JSON.stringify(diagnostics)).not.toContain(raw);
  expect(requests.some(({ url }) => url.endsWith('/manage/store'))).toBe(false);
}

describe('canonical dashboard new key device-local privacy', () => {
  it('saves through real local encryption and sync, never posting plaintext to hosted storage', async () => {
    await unlock();
    await useVaults('', '').addItem(input);
    expect(getDecryptedKey('openai')).toBe(raw);
    const put = requests.find(({ init }) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.init?.body))).toMatchObject({ version: 1, ciphertext: expect.any(String) });
    expectPrivate();
  });

  it.each(['encryption', 'network', 'unsafe ciphertext'] as const)('fails closed on %s failure and discards secret-bearing errors', async (failure) => {
    await unlock();
    if (failure === 'encryption') vi.spyOn(vaultCrypto, 'encryptVault').mockRejectedValue(new Error(raw));
    if (failure === 'network') failNetwork = true;
    if (failure === 'unsafe ciphertext') vi.spyOn(vaultCrypto, 'encryptVault').mockResolvedValue({ version: 1, iv: 'iv', ciphertext: raw, updatedAt: 1 });
    const error = await useVaults('', '').addItem(input).catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toBe('Error: Device vault save failed. Unlock the vault and retry.');
    diagnostics.push(String(error));
    expect(getDecryptedKey('openai')).toBeNull();
    expectPrivate();
    if (failure !== 'network') expect(requests).toHaveLength(0);
  });

  it('rejects empty input without sending anything', async () => {
    await unlock();
    await expect(useVaults('', '').addItem({ rawKey: '' })).rejects.toThrow('Paste the API key');
    expect(requests).toHaveLength(0);
    expectPrivate();
  });

  it('preserves the hosted-mode plaintext store contract when no device vault is unlocked', async () => {
    await useVaults('', '').addItem({ ...input, name: 'Synthetic key' });
    const store = requests.find(({ url }) => url.endsWith('/manage/store'));
    expect(store?.init?.method).toBe('POST');
    expect(JSON.parse(String(store?.init?.body))).toMatchObject({ upstream: 'openai', apiKey: raw, value: raw });
  });

  it('does not include user-controlled secret labels in success diagnostics', () => {
    const app = readFileSync('src/web/App.tsx', 'utf8');
    expect(app).toContain("emitAppFeedback({ kind: 'success', title: 'Saved to vault', source: 'save' })");
  });
});
