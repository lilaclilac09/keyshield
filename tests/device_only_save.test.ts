import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ states: [] as any[], index: 0 }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: any) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.states[index], (value: any) => { hooks.states[index] = typeof value === 'function' ? value(hooks.states[index]) : value; }];
  },
  useEffect: vi.fn(), useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
  useRef: () => ({ current: null }),
}));
vi.mock('@solana/wallet-adapter-react', () => ({ useWallet: () => ({ connected: false }) }));

import { useVaults } from '../src/web/hooks/useVaults';
import { unlockVault, lockVault, getDecryptedKey } from '../src/web/lib/vault-session';
import * as vaultSession from '../src/web/lib/vault-session';
import * as vaultCrypto from '../src/web/lib/vault';
import { apiFetch } from '../src/web/lib/auth';
import { connectOpenRouter } from '../src/web/lib/openrouter-interface';
import { detectKeyOnServer, storeDetectedKeys } from '../src/web/lib/keychain';
import { flushPendingVaultHits } from '../src/web/lib/vault-list';
import { DeviceVaultRequiredError, DEVICE_VAULT_REQUIRED, DEVICE_CALL_SKIPPED } from '../src/web/lib/device-save';
import { registerSavingSecret } from '../src/web/lib/secret-guard';
import { emitAppFeedback } from '../src/web/lib/app-feedback';
import { humanActionError } from '../src/web/lib/human-usable';
import { storeUpstreamKey } from '../src/web/lib/api';
import { storeZkItem } from '../src/web/lib/zk';
import { VaultSection } from '../src/web/components/sections/VaultSection';
import { ActivitySection } from '../src/web/components/sections/ActivitySection';
import { AddKeyModal } from '../src/web/components/AddKeyModal';
import { DeviceVaultConsent } from '../src/web/components/DeviceVaultConsent';
import { makeHttpSyncBackend } from '../src/web/lib/sync';

const raw = 'sk-or-v1-SYNTHETIC-device-local-new-key';
let requests: Array<{ url: string; headers: [string, string][]; body: string }>;
let diagnostics: unknown[];
let messages: unknown[];
let failNetwork: boolean;
let storageWrites: unknown[];

function findNode(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) return node.map((child) => findNode(child, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  return findNode(node.props?.children, predicate);
}
function render<T>(fn: () => T): T { hooks.index = 0; return fn(); }
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { storageWrites.push([key, value]); data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

beforeEach(() => {
  hooks.states = []; hooks.index = 0;
  requests = []; diagnostics = []; messages = []; storageWrites = []; failNetwork = false;
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', origin: 'https://synthetic.invalid' },
    dispatchEvent: (event: CustomEvent) => { diagnostics.push(event.detail); },
    postMessage: (message: unknown) => { messages.push(message); },
    keyshieldDesktop: { notify: (fb: unknown) => diagnostics.push(fb) },
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), headers: [...new Headers(init?.headers).entries()], body: String(init?.body ?? '') });
    if (url.endsWith('/auth/exchange')) return Response.json({ token: 'synthetic-token', expiresAt: Date.now() + 600000 });
    if (init?.method === 'PUT' && failNetwork) throw new Error(`network rejected ${raw}`);
    if (url.includes('/vault/') && init?.method === 'GET') return new Response(null, { status: 404 });
    if (url.endsWith('/manage/vault')) return Response.json([]);
    return Response.json({});
  }));
  vi.stubGlobal('XMLHttpRequest', class { open(...args: unknown[]) { diagnostics.push(args); } send(body: unknown) { diagnostics.push(body); } });
  vi.stubGlobal('WebSocket', class { constructor(url: string) { diagnostics.push(url); } send(body: unknown) { diagnostics.push(body); } });
  vi.stubGlobal('navigator', { sendBeacon: (...args: unknown[]) => { diagnostics.push(args); return true; } });
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { diagnostics.push(args); });
  }
});

afterEach(() => { lockVault(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function unlock() {
  await unlockVault(new Uint8Array(32).fill(7).buffer, {});
  requests = []; storageWrites = []; diagnostics = [];
}
function expectPrivate(secret = raw) {
  for (const captured of [requests, diagnostics, storageWrites, messages]) {
    const text = JSON.stringify(captured);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(JSON.stringify(secret).slice(1, -1));
  }
  expect(requests.some(({ url }) => /\/(manage\/store|demo\/upstream-key|keychain\/(call|detect|store))/.test(url))).toBe(false);
}

const vaultProps = { items: [], total: 0, searchQuery: '', onAdd: vi.fn(), onDelete: vi.fn(), onDecrypt: vi.fn() };
async function quickSave(alsoCall: boolean): Promise<void> {
  let tree = render(() => VaultSection(vaultProps));
  findNode(tree, (node) => node.type === 'textarea').props.onChange({ target: { value: raw } });
  tree = render(() => VaultSection(vaultProps));
  await findNode(tree, (node) => node.type === 'button' && node.props?.children === (alsoCall ? 'Save + Call' : 'Save')).props.onClick();
  await vi.waitFor(() => expect(hooks.states[1]).toBe(false));
  const last = hooks.states.find((state) => typeof state === 'string' && (state.startsWith(DEVICE_VAULT_REQUIRED) || state.startsWith('Device vault save failed')));
  if (last?.startsWith(DEVICE_VAULT_REQUIRED)) throw new DeviceVaultRequiredError();
  if (last) throw new Error(last);
}
const entries = [
  ['modal addItem', () => render(() => useVaults('', '')).addItem({ upstream: 'openrouter', rawKey: raw, value: raw, name: raw })],
  ['quick paste Save', () => quickSave(false)],
  ['quick paste Save + Call', () => quickSave(true)],
  ['OpenRouter Connect', () => connectOpenRouter(raw)],
  ['pending-hit flush', () => flushPendingVaultHits([{ upstream: 'openrouter', value: raw }])],
] as const;

describe.each(entries)('%s device-only save', (name, save) => {
  it('unlocked: encrypts locally without sending a new raw key or calling the hosted proxy', async () => {
    await unlock(); await save();
    expect(getDecryptedKey('openrouter')).toBe(raw);
    expect(requests.some(({ body }) => body.includes('ciphertext'))).toBe(true);
    expectPrivate();
    if (name === 'quick paste Save + Call') expect(hooks.states).toContain(DEVICE_CALL_SKIPPED);
  });
  it('locked: requires consent/unlock, makes zero requests and persists nothing', async () => {
    await expect(save()).rejects.toBeInstanceOf(DeviceVaultRequiredError);
    expect(requests).toHaveLength(0); expect(storageWrites).toHaveLength(0);
    expect(messages).not.toContainEqual({ __ks_pending_vault_cleared: true });
    expectPrivate();
  });
  it.each(['addEntry', 'sync network', 'encryption', 'unsafe ciphertext'] as const)('%s failure: fails closed with secret-free error and console output', async (failure) => {
    await unlock();
    if (failure === 'addEntry') vi.spyOn(vaultSession, 'addEntry').mockImplementation(async () => {
      console.error(new Error(raw), { secret: raw });
      emitAppFeedback({ kind: 'error', title: raw, detail: raw });
      diagnostics.push(humanActionError('vault-save', new Error(raw)));
      throw new Error(raw);
    });
    if (failure === 'sync network') failNetwork = true;
    if (failure === 'encryption') vi.spyOn(vaultCrypto, 'encryptVault').mockRejectedValue(new Error(raw));
    if (failure === 'unsafe ciphertext') vi.spyOn(vaultCrypto, 'encryptVault').mockResolvedValue({ version: 1, iv: 'iv', ciphertext: raw, updatedAt: 1 });
    await expect(save()).rejects.toThrow('Device vault save failed. Unlock the vault and retry.');
    expect(getDecryptedKey('openrouter')).toBeNull();
    expect(messages).not.toContainEqual({ __ks_pending_vault_cleared: true });
    expectPrivate();
    if (failure !== 'sync network') expect(requests).toHaveLength(0);
  });
});

describe('central guards and consent', () => {
  it.each([
    ['body', '/synthetic', (secret: string) => ({ method: 'POST', body: JSON.stringify({ value: secret }) })],
    ['URL', `/synthetic?value=${encodeURIComponent(raw)}`, (_secret: string) => ({})],
    ['headers', '/synthetic', (secret: string) => ({ headers: { 'X-Test': secret } })],
    ['unicode-escaped body', '/synthetic', (secret: string) => ({ body: JSON.stringify({ value: secret }).replace(/s/g, '\\u0073') })],
  ] as const)('apiFetch refuses secret-bearing %s', async (_name, url, options) => {
    const release = registerSavingSecret(raw);
    try { await expect(apiFetch(url, options(raw))).rejects.toThrow('Refusing request containing'); }
    finally { release(); }
    expect(requests).toHaveLength(0);
  });
  it('blocks JSON-escaped quotes, backslashes and newlines in API and sync payloads', async () => {
    const secret = 'sk-test-SYNTHETIC-"quoted"\\line\nend';
    const release = registerSavingSecret(secret);
    try {
      await expect(apiFetch('/synthetic', { body: JSON.stringify({ value: secret }) })).rejects.toThrow('Refusing request containing');
      await expect(makeHttpSyncBackend('https://synthetic.invalid').push('vault', { version: 1, iv: 'iv', ciphertext: secret, updatedAt: 1 }, () => 'token')).rejects.toThrow('Refusing request containing');
    } finally { release(); }
    expect(requests).toHaveLength(0); expectPrivate(secret);
  });
  it('legacy save/detect helpers cannot bypass device-only storage', async () => {
    expect((await detectKeyOnServer(raw)).upstream).toBe('openrouter');
    await expect(storeUpstreamKey('openrouter', raw)).rejects.toBeInstanceOf(DeviceVaultRequiredError);
    await expect(storeZkItem('openrouter', raw)).rejects.toBeInstanceOf(DeviceVaultRequiredError);
    await expect(storeDetectedKeys(raw)).rejects.toBeInstanceOf(DeviceVaultRequiredError);
    expect(requests).toHaveLength(0); expectPrivate();
  });
  it('keeps hosted record listing, reveal and delete available unchanged', async () => {
    const vault = render(() => useVaults('', ''));
    await vault.refresh();
    expect(requests.some(({ url }) => url.endsWith('/manage/vault'))).toBe(true);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ value: 'synthetic-existing-hosted-record' }));
    await expect(vault.decryptItem('old-record')).resolves.toBe('synthetic-existing-hosted-record');
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/manage\/decrypt\/old-record$/), expect.anything());
    await vault.deleteItem('old-record');
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/manage\/vault\/old-record$/), expect.objectContaining({ method: 'DELETE' }));
  });
  it('empty input sends nothing; pending hits clear only after a successful local save', async () => {
    await unlock();
    await expect(render(() => useVaults('', '')).addItem({ rawKey: '' })).rejects.toThrow('Paste the API key');
    expect(requests).toHaveLength(0);
    await flushPendingVaultHits([{ upstream: 'openrouter', value: raw }]);
    expect(messages).toContainEqual({ __ks_pending_vault_cleared: true }); expectPrivate();
  });
  it('quick paste retains the value and exposes an unlock/create action after a locked save', async () => {
    await quickSave(false).catch(() => {});
    const unlockAction = vi.fn();
    const tree = render(() => VaultSection({ ...vaultProps, onUnlock: unlockAction }));
    expect(findNode(tree, (node) => node.type === 'textarea').props.value).toBe(raw);
    expect(findNode(tree, (node) => node.type === DeviceVaultConsent).props.onUnlock).toBe(unlockAction);
  });
  it('new-key modal retains the value and exposes the same consent action on a locked save', async () => {
    const props = { isOpen: true, onClose: vi.fn(), onSave: () => { throw new DeviceVaultRequiredError(); }, onUnlock: vi.fn() };
    let tree = render(() => AddKeyModal(props));
    findNode(tree, (node) => node.type === 'input' && node.props?.type === 'password').props.onChange({ target: { value: raw } });
    tree = render(() => AddKeyModal(props));
    await findNode(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault: vi.fn() });
    tree = render(() => AddKeyModal(props));
    expect(findNode(tree, (node) => node.type === 'input' && node.props?.type === 'password').props.value).toBe(raw);
    expect(findNode(tree, (node) => node.type === DeviceVaultConsent).props.onUnlock).toBe(props.onUnlock);
    expect(props.onClose).not.toHaveBeenCalled(); expectPrivate();
  });
  it('Activity Connect retains input and exposes consent when locked', async () => {
    sessionStorage.setItem('ks_landing', 'activity-mpp');
    let tree = render(() => ActivitySection({}));
    findNode(tree, (node) => node.type === 'input' && String(node.props?.placeholder).includes('sk-or-')).props.onChange({ target: { value: raw } });
    tree = render(() => ActivitySection({}));
    await findNode(tree, (node) => node.props?.onClick?.name === 'handleConnectOpenRouter').props.onClick();
    tree = render(() => ActivitySection({}));
    expect(findNode(tree, (node) => node.type === 'input' && node.props?.value === raw)).toBeDefined();
    expect(findNode(tree, (node) => node.type === DeviceVaultConsent)).toBeDefined(); expectPrivate();
  });
});
