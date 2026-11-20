import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { readFileSync } from 'node:fs';
import { SAVE_SYNC_FAILED, getVaultSyncStatus, reportVaultSyncChange } from '../src/web/lib/vault-sync-status';

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
import { connectOpenRouter, fetchOpenRouterStatus } from '../src/web/lib/openrouter-interface';
import { detectKeyOnServer, storeDetectedKeys } from '../src/web/lib/keychain';
import { DeviceVaultRequiredError, DEVICE_VAULT_REQUIRED, DEVICE_CALL_SKIPPED, saveKeyOnDevice } from '../src/web/lib/device-save';
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
import { HomeSection } from '../src/web/components/sections/HomeSection';
import { ExtensionTokenCopy } from '../src/web/components/ExtensionTokenCopy';
import { SessionsSection } from '../src/web/components/sections/SessionsSection';
import { RevealField } from '../src/web/components/ui/RevealField';

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
function renderedText(node: any): string {
  if (Array.isArray(node)) return node.map(renderedText).join('');
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return renderedText(node.props?.children);
}
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
  reportVaultSyncChange('save', true);
  let tree = render(() => VaultSection(vaultProps));
  findNode(tree, (node) => node.type === 'textarea').props.onChange({ target: { value: raw } });
  tree = render(() => VaultSection(vaultProps));
  await findNode(tree, (node) => node.type === 'button' && node.props?.children === (alsoCall ? 'Save + Call' : 'Save')).props.onClick();
  await vi.waitFor(() => expect(hooks.states[1]).toBe(false));
  const last = hooks.states.find((state) => typeof state === 'string' && (state.startsWith(DEVICE_VAULT_REQUIRED) || state.startsWith('Device vault save failed')));
  if (last?.startsWith(DEVICE_VAULT_REQUIRED)) throw new DeviceVaultRequiredError();
  if (last) throw new Error(last);
  if (getVaultSyncStatus().message) throw new Error(getVaultSyncStatus().message!);
}
const entries = [
  ['modal addItem', () => render(() => useVaults('', '')).addItem({ upstream: 'openrouter', rawKey: raw, value: raw, name: raw })],
  ['quick paste Save', () => quickSave(false)],
  ['quick paste Save + Call', () => quickSave(true)],
  ['OpenRouter Connect', () => connectOpenRouter(raw)],
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
    await expect(save()).rejects.toThrow(failure === 'sync network' ? SAVE_SYNC_FAILED : 'Device vault save failed. Unlock the vault and retry.');
    expect(getDecryptedKey('openrouter')).toBeNull();
    expectPrivate();
    if (failure !== 'sync network') expect(requests).toHaveLength(0);
  });
});

describe('central guards and consent', () => {
  it.each([false, true])('ignores ambient pending messages and stored hits (unlocked=%s) without saving or requesting', async (unlocked) => {
    if (unlocked) await unlock();
    const queued = JSON.stringify([{ upstream: 'openrouter', value: raw }]);
    localStorage.setItem('ks_pending_vault', queued);
    sessionStorage.setItem('ks_pending_vault', queued);
    localStorage.setItem('ks_auto_store', 'true');
    const target = new EventTarget();
    Object.assign(window, {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    });
    vi.stubGlobal('document', new EventTarget());
    const cleanups: Array<undefined | void | (() => void)> = [];
    const originalEffect = vi.mocked(useEffect).getMockImplementation();
    vi.mocked(useEffect).mockImplementation((effect) => { cleanups.push(effect()); });
    const addition = vi.spyOn(vaultSession, 'addEntry');
    try {
      render(() => useVaults('', ''));
      await new Promise<void>((resolve) => setImmediate(resolve));
      requests = []; storageWrites = []; messages = [];
      const event = Object.assign(new Event('message'), { source: window, data: { __ks_pending_vault: JSON.parse(queued) } });
      window.dispatchEvent(event);
      window.dispatchEvent(Object.assign(new Event('storage'), { key: 'ks_pending_vault', newValue: queued }));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(addition).not.toHaveBeenCalled();
      expect(requests).toHaveLength(0);
      expect(storageWrites).toHaveLength(0);
      expect(messages).toHaveLength(0);
      expect(localStorage.getItem('ks_pending_vault')).toBe(queued);
      expect(sessionStorage.getItem('ks_pending_vault')).toBe(queued);
      expect(unlocked ? vaultSession.listEntries() : []).toEqual([]);
      for (const file of ['../src/web/App.tsx', '../src/web/hooks/useVaults.ts', '../src/web/lib/vault-list.ts']) {
        const source = readFileSync(new URL(file, import.meta.url), 'utf8');
        expect(source).not.toMatch(/__ks_pending|ks_pending_vault|ks_auto_store|flushPendingVaultHits|previewPendingVaultHits/);
      }
      expectPrivate();
    } finally {
      for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
      vi.mocked(useEffect).mockImplementation(originalEffect || (() => {}));
    }
  });
  it('decrypts, lists and reveals legacy encrypted entries without rewriting them on read', async () => {
    const key = await vaultCrypto.deriveMasterKey(new Uint8Array(32).fill(7).buffer);
    const legacy = { entries: { openai: { upstream: 'openai', apiKey: raw, addedAt: 123 } }, updatedAt: 123 };
    const cipher = await vaultCrypto.encryptVault(key, legacy);
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ token: 'synthetic-token', expiresAt: Date.now() + 600000 }))
      .mockResolvedValueOnce(Response.json(cipher));
    await unlock();
    expect(vaultSession.listEntries()).toEqual([legacy.entries.openai]);
    const vault = render(() => useVaults('', ''));
    vault.refresh();
    await vi.waitFor(() => expect(hooks.states[0]).toHaveLength(1));
    expect(hooks.states[0][0]).toMatchObject({ id: 'device:openai', upstream: 'openai', name: 'OpenAI' });
    await expect(vault.decryptItem('device:openai')).resolves.toBe(raw);
    expect(requests.some(({ body }) => body.includes('ciphertext'))).toBe(false);
    expect(vaultSession.listEntries()).toEqual([legacy.entries.openai]);
    await vault.deleteItem('device:openai');
    expect(vaultSession.listEntries()).toEqual([]);
    expectPrivate();
  });
  it('round-trips modal and quick-paste labels and expiry in ciphertext and renders device expiry warnings', async () => {
    await unlock();
    const expiry = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const vault = render(() => useVaults('', ''));
    await vault.addItem({ upstream: 'openai', rawKey: raw, name: 'My development key', expiryDate: expiry, domain: 'openai.com' });
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    await storeDetectedKeys(`Panthermaze\n${first}\n${expiry}\nHeronplanet\n${second}\n2030-12-31`);
    const key = await vaultCrypto.deriveMasterKey(new Uint8Array(32).fill(7).buffer);
    const payload = JSON.parse(requests.filter(({ body }) => body.includes('ciphertext')).at(-1)!.body);
    const decrypted = await vaultCrypto.decryptVault(key, payload);
    expect(decrypted.entries.openai).toMatchObject({ name: 'My development key', expiresAt: expiry, domain: 'openai.com' });
    expect(decrypted.entries.helius).toMatchObject({ apiKey: first, name: 'Panthermaze', expiresAt: expiry });
    expect(decrypted.entries['helius#2']).toMatchObject({ apiKey: second, name: 'Heronplanet', expiresAt: '2030-12-31' });
    vault.refresh();
    await vi.waitFor(() => expect(hooks.states[0]).toHaveLength(3));
    const items = hooks.states[0];
    expect(items[0]).toMatchObject({ name: 'My development key', expiryDate: expiry, domain: 'openai.com' });
    expect(items[1]).toMatchObject({ name: 'Panthermaze', expiryDate: expiry });
    expect(items[2]).toMatchObject({ name: 'Heronplanet', expiryDate: '2030-12-31' });
    hooks.states = [];
    const tree = render(() => VaultSection({ ...vaultProps, items, total: 3 }));
    const visible = JSON.stringify(findNode(tree, (node) => node.props?.['data-testid'] === 'vault-saved-apis'));
    expect(visible).toContain('Panthermaze');
    expect(visible).toContain('Heronplanet');
    expect(visible).toContain('soon');
    for (const secret of [raw, first, second]) expectPrivate(secret);
  });
  it('masks raw or escaped credential labels and drops secret-bearing metadata fields before encryption', async () => {
    await unlock();
    await saveKeyOnDevice('openai', raw, { name: `label ${JSON.stringify(raw).replace(/s/g, '\\u0073')}`, domain: raw, expiresAt: raw });
    const entry = vaultSession.listEntries()[0];
    expect(entry.name).toBe(`${raw.slice(0, 6)}…${raw.slice(-4)}`);
    expect(entry.domain).toBeUndefined();
    expect(entry.expiresAt).toBeUndefined();
    expect(JSON.stringify({ ...entry, apiKey: undefined })).not.toContain(raw);
    const release = registerSavingSecret(raw);
    try { await expect(apiFetch('/synthetic', { body: JSON.stringify({ metadata: { name: raw } }) })).rejects.toThrow('Refusing request'); }
    finally { release(); }
    expectPrivate();
  });
  it('OpenRouter status refresh cannot replace a device save with stale hosted status', async () => {
    await unlock();
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const staleRefresh = fetchOpenRouterStatus();
    await connectOpenRouter(raw);
    finish(Response.json({ key_configured: false, key_source: 'none', key_prefix: null }));
    const refreshed = await staleRefresh;
    expect(refreshed).toMatchObject({ key_configured: true, key_source: 'device-local' });
    expect(JSON.stringify(refreshed)).not.toContain(raw);
    requests = [];
    await expect(fetchOpenRouterStatus()).resolves.toMatchObject({ key_configured: true, key_source: 'device-local' });
    expect(requests).toHaveLength(0);
    sessionStorage.setItem('ks_landing', 'activity-mpp');
    hooks.states = [];
    let tree = render(() => ActivitySection({}));
    findNode(tree, (node) => node.type === 'input' && String(node.props?.placeholder).includes('sk-or-')).props.onChange({ target: { value: raw } });
    tree = render(() => ActivitySection({}));
    await findNode(tree, (node) => node.props?.onClick?.name === 'handleConnectOpenRouter').props.onClick();
    tree = render(() => ActivitySection({}));
    expect(findNode(tree, (node) => node.type === 'span' && typeof node.props?.children === 'string' && node.props.children.startsWith('Saved on this device '))).toBeDefined();
    expectPrivate();
  });
  it('Home counts device APIs and skips both call actions without sending a key', async () => {
    const props = { home: null, walletConnected: false, onRefresh: vi.fn(), onGo: vi.fn() };
    let tree = render(() => HomeSection(props));
    expect(findNode(tree, (node) => node.props?.['data-testid'] === 'home-call-first').props.disabled).toBe(true);
    await unlock();
    await connectOpenRouter(raw);
    await connectOpenRouter(`${raw}-second`);
    requests = [];
    tree = render(() => HomeSection(props));
    const saved = findNode(tree, (node) => node.props?.['data-testid'] === 'home-saved-apis');
    expect(saved.props.children[0].props.children[0]).toBe(2);
    const callFirst = findNode(tree, (node) => node.props?.['data-testid'] === 'home-call-first');
    expect(callFirst.props.disabled).toBe(false);
    callFirst.props.onClick();
    findNode(tree, (node) => node.props?.['data-testid'] === 'api-call-openrouter').props.onClick();
    expect(hooks.states).toContain(DEVICE_CALL_SKIPPED);
    expect(requests).toHaveLength(0);
    expectPrivate();
    lockVault();
    tree = render(() => HomeSection(props));
    expect(findNode(tree, (node) => node.props?.['data-testid'] === 'home-saved-apis').props.children[0].props.children[0]).toBe(0);
  });
  it('Home starts with a vault action for an empty locked account and keeps secondary tools collapsed', () => {
    const onGo = vi.fn();
    const tree = render(() => HomeSection({ home: null, walletConnected: false, onRefresh: vi.fn(), onGo }));
    expect(tree.props.children[0].props['data-testid']).toBe('home-vault-summary');
    const open = findNode(tree, node => node.props?.['data-testid'] === 'home-open-vault');
    expect(renderedText(open)).toBe('Open or create vault');
    open.props.onClick();
    expect(onGo).toHaveBeenCalledOnce();
    expect(onGo).toHaveBeenCalledWith('vault');
    expect(renderedText(tree)).toContain('No saved APIs available. Open Vault to add a key.');
    for (const id of ['home-wallet-tools', 'home-extension-setup']) {
      const details = findNode(tree, node => node.props?.['data-testid'] === id);
      expect(details.type).toBe('details');
      expect(details.props.open).not.toBe(true);
    }
    expect(requests).toHaveLength(0);
  });
  it('Home keeps the existing unlock and refresh callbacks and exposes loading/error states', () => {
    const onUnlock = vi.fn(), onRefresh = vi.fn();
    const tree = render(() => HomeSection({ home: null, loading: true, error: 'Synthetic offline', walletConnected: false, onRefresh, onUnlock, onGo: vi.fn() }));
    expect(renderedText(findNode(tree, node => node.props?.role === 'status'))).toContain('Refreshing account status');
    expect(renderedText(findNode(tree, node => node.props?.role === 'alert'))).toContain('Synthetic offline');
    findNode(tree, node => node.type === 'button' && node.props.onClick === onUnlock).props.onClick();
    findNode(tree, node => node.type === 'button' && node.props.onClick === onRefresh).props.onClick();
    expect(onUnlock).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
  it('Home reflects an open device vault without changing navigation', async () => {
    await unlock();
    const tree = render(() => HomeSection({ home: null, walletConnected: false, onRefresh: vi.fn(), onGo: vi.fn() }));
    expect(renderedText(findNode(tree, node => node.props?.['data-testid'] === 'home-open-vault'))).toBe('Open vault');
    expect(renderedText(tree)).toContain('Your Device Vault is open.');
  });
  it('Vault offers the existing create/unlock panel before a failed save, but not when already unlocked', () => {
    const onUnlock = vi.fn();
    let tree = render(() => VaultSection({ ...vaultProps, unlocked: false, onUnlock }));
    expect(findNode(tree, node => node.type === DeviceVaultConsent).props.onUnlock).toBe(onUnlock);
    tree = render(() => VaultSection({ ...vaultProps, unlocked: true, onUnlock }));
    expect(findNode(tree, node => node.type === DeviceVaultConsent)).toBeUndefined();
    expect(requests).toHaveLength(0);
  });
  it.each(['extension', 'sessions', 'reveal field'] as const)('%s never renders token characters or fragments until explicitly revealed', (surface) => {
    const token = 'SYNTHETIC-TOKEN-PRIVATE-PREFIX-and-private-suffix-993355';
    vi.stubGlobal('window', { ...window, setInterval: vi.fn(() => 1), clearInterval: vi.fn() });
    localStorage.setItem('ks_token', token);
    const component = () => surface === 'extension' ? ExtensionTokenCopy({}) : surface === 'sessions' ? SessionsSection({ onLogout: vi.fn() }) : RevealField({ value: token, label: 'Session token' });
    let tree = render(component);
    for (const fragment of [token, token.slice(0, 12), token.slice(-6)]) expect(renderedText(tree)).not.toContain(fragment);
    const show = findNode(tree, node => node.type === 'button' && ['Show token', 'Reveal'].includes(renderedText(node)));
    show.props.onClick();
    tree = render(component);
    expect(renderedText(tree)).toContain(token);
    findNode(tree, node => node.type === 'button' && ['Hide token', 'Hide'].includes(renderedText(node))).props.onClick();
    tree = render(component);
    expect(renderedText(tree)).not.toContain(token.slice(0, 12));
    expect(renderedText(tree)).not.toContain(token.slice(-6));
    expect(requests).toHaveLength(0);
  });
  it('extension token UI renders nothing when signed out', () => {
    expect(render(() => ExtensionTokenCopy({}))).toBeNull();
  });
  it('Home still calls existing hosted rows even when a device entry uses the same provider', async () => {
    await unlock();
    await connectOpenRouter(raw);
    requests = [];
    const home = { wallet: {}, ledger: {}, rpc_cache: { lowest_ttl_sec: 2 }, apis: [{ id: 'hosted', name: 'Hosted', upstream: 'openrouter', prefix: 'masked' }] } as any;
    const tree = render(() => HomeSection({ home, walletConnected: false, onRefresh: vi.fn(), onGo: vi.fn() }));
    findNode(tree, (node) => node.props?.['data-testid'] === 'home-call-first').props.onClick();
    await vi.waitFor(() => expect(requests.some(({ url }) => url.endsWith('/keychain/call'))).toBe(true));
    expect(JSON.stringify(requests)).not.toContain(raw);
  });
  it('preserves multiple pasted and later keys per provider, while identical values are no-ops', async () => {
    await unlock();
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    const third = '33333333-3333-4333-8333-333333333333';
    await storeDetectedKeys(`${first}\n${second}`);
    await Promise.all([storeDetectedKeys(third), storeDetectedKeys(third)]);
    const pushes = requests.length;
    await storeDetectedKeys(second);
    expect(requests).toHaveLength(pushes);
    expect(vaultSession.listEntries().map(({ upstream }) => upstream)).toEqual(['helius', 'helius#2', 'helius#3']);
    expect(getDecryptedKey('helius')).toBe(first);
    expect(getDecryptedKey('helius#2')).toBe(second);
    expect(getDecryptedKey('helius#3')).toBe(third);
    const vault = render(() => useVaults('', ''));
    vault.refresh();
    await vi.waitFor(() => expect(hooks.states[0]).toHaveLength(3));
    expect(hooks.states[0].map(({ id, upstream }: any) => [id, upstream])).toEqual([
      ['device:helius', 'helius'], ['device:helius#2', 'helius'], ['device:helius#3', 'helius'],
    ]);
    for (const secret of [first, second, third]) expectPrivate(secret);
  });
  it('reveals device rows locally, including secondary keys, without colliding with hosted IDs', async () => {
    await unlock();
    await connectOpenRouter(raw);
    await connectOpenRouter(`${raw}-second`);
    const vault = render(() => useVaults('', ''));
    requests = [];
    await expect(vault.decryptItem('device:openrouter')).resolves.toBe(raw);
    await expect(vault.decryptItem('device:openrouter#2')).resolves.toBe(`${raw}-second`);
    await expect(vault.decryptItem('device:missing')).rejects.toThrow('Unlock your device vault');
    expect(requests).toHaveLength(0);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ value: 'synthetic-hosted-key' }));
    await expect(vault.decryptItem('openrouter')).resolves.toBe('synthetic-hosted-key');
    expect(requests).toHaveLength(0);
    lockVault();
    await expect(vault.decryptItem('device:openrouter')).rejects.toThrow('Unlock your device vault');
    expect(requests).toHaveLength(0);
  });
  it('deletes a namespaced device row from the device vault, not hosted storage', async () => {
    await unlock();
    await connectOpenRouter(raw);
    requests = [];
    await render(() => useVaults('', '')).deleteItem('device:openrouter');
    expect(getDecryptedKey('openrouter')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).includes('/manage/vault/') && init?.method === 'DELETE')).toBe(false);
    expectPrivate();
  });
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
      await expect(makeHttpSyncBackend('https://synthetic.invalid').push('vault', { version: 1, iv: 'iv', ciphertext: secret, updatedAt: 1 }, () => 'token', null)).rejects.toThrow('Refusing request containing');
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
  it('empty input sends nothing', async () => {
    await unlock();
    await expect(render(() => useVaults('', '')).addItem({ rawKey: '' })).rejects.toThrow('Paste the API key');
    expect(requests).toHaveLength(0);
    expectPrivate();
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
