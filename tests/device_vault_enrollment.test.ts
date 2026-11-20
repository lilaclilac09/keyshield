import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ states: [] as any[], index: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.states[index], (value: any) => { hooks.states[index] = typeof value === 'function' ? value(hooks.states[index]) : value; }];
  },
  useEffect: vi.fn(),
  useCallback: (fn: unknown) => fn,
}));

import { DeviceVaultSection } from '../src/web/components/sections/DeviceVaultSection';
import { getPasskeyTrust, registerPasskey, requestVaultUnlock } from '../src/web/lib/auth';
import { isVaultUnlocked, lockVault } from '../src/web/lib/vault-session';

const email = 'synthetic-vault@example.test';
const bytes = () => new Uint8Array(32).fill(7).buffer;
let account: string;
let verifyFails: boolean;
let requests: Array<{ url: string; body: string }>;
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
function find(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) return node.map((n) => find(n, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function render() { hooks.index = 0; return DeviceVaultSection({}); }

beforeEach(() => {
  hooks.states = []; hooks.index = 0; account = email; verifyFails = false; requests = [];
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  localStorage.setItem('ks_token', 'synthetic-session');
  vi.stubGlobal('window', {
    location: { hostname: 'localhost', origin: 'http://localhost:5173' },
    setTimeout: () => 0,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    postMessage: vi.fn(), dispatchEvent: vi.fn(),
  });
  vi.stubGlobal('navigator', { credentials: {
    create: vi.fn(async () => ({
      id: 'synthetic-credential', rawId: bytes(), type: 'public-key',
      response: { attestationObject: bytes(), clientDataJSON: bytes() },
      getClientExtensionResults: () => ({ prf: { results: { first: bytes() } } }),
    })),
    get: vi.fn(async () => ({
      id: 'synthetic-credential', rawId: bytes(), type: 'public-key',
      response: { authenticatorData: bytes(), clientDataJSON: bytes(), signature: bytes(), userHandle: null },
      getClientExtensionResults: () => ({ prf: { results: { first: bytes() } } }),
    })),
  } });
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input); requests.push({ url, body: String(init?.body || '') });
    if (url.includes('/auth/passkey/register-options')) return Response.json({
      challenge: 'c3ludGhldGlj', user: { id: btoa(account), name: account, displayName: 'Device Vault' },
      rp: { id: 'localhost', name: 'Synthetic' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    });
    if (url.includes('/auth/passkey/register-verify')) return verifyFails
      ? Response.json({ detail: 'Synthetic registration rejected' }, { status: 400 })
      : Response.json({ credentialId: 'synthetic-credential', name: 'Device Vault' });
    if (url.includes('/auth/passkey/auth-options')) {
      if (new URL(url).searchParams.get('user_id') !== account) return Response.json({ error: 'wrong account' }, { status: 404 });
      return Response.json({ challenge: 'c3ludGhldGlj', allowCredentials: [{ id: 'c3ludGhldGlj', type: 'public-key' }] });
    }
    if (url.endsWith('/auth/register')) return Response.json({ ok: true });
    if (url.endsWith('/auth/challenge')) return Response.json({ challenge: 'c3ludGhldGlj' });
    if (url.endsWith('/auth/exchange')) return Response.json({ token: 'synthetic-vault-token', expiresAt: Date.now() + 600000 });
    if (url.includes('/vault/')) return new Response(null, { status: 404 });
    if (url.endsWith('/manage/vault')) return Response.json([]);
    throw new Error('Unexpected mocked request');
  }));
});
afterEach(() => { lockVault(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Device Vault enrollment identity', () => {
  it.each([null, email])('enrolls and unlocks the server email identity with local wallet=%s', async (wallet) => {
    if (wallet) localStorage.setItem('ks_wallet', wallet);
    const button = find(render(), (node) => node.type === 'button' && JSON.stringify(node.props.children).includes('Enroll passkey'));
    await button.props.onClick();
    expect(requests.some(({ url }) => url.includes('/auth/passkey/register-verify'))).toBe(true);
    expect(requests.some(({ url }) => url.endsWith('/auth/register'))).toBe(true);
    expect(JSON.stringify(render())).not.toContain('No passkey registered on this device');
    expect(isVaultUnlocked()).toBe(true);
    expect(getPasskeyTrust()?.userId).toBe(email);
    expect(JSON.stringify(render())).toContain('Vault unlocked');
    expect(JSON.stringify(render())).not.toContain('No passkey registered on this device');
    expect(requests.some(({ url }) => url.includes('/auth/passkey/auth-options') && new URL(url).searchParams.get('user_id') === email)).toBe(true);
  });
  it('still enrolls wallet accounts', async () => {
    account = 'synthetic-wallet';
    localStorage.setItem('ks_wallet', account);
    await registerPasskey('Device Vault');
    await requestVaultUnlock();
    expect(isVaultUnlocked()).toBe(true);
    expect(getPasskeyTrust()?.userId).toBe(account);
  });
  it('does not treat email login alone as passkey enrollment', () => {
    localStorage.setItem('ks_wallet', email);
    expect(getPasskeyTrust()).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
  });
  it('does not trust or unlock an email account when registration verification fails', async () => {
    localStorage.setItem('ks_wallet', email); verifyFails = true;
    const button = find(render(), (node) => node.type === 'button' && JSON.stringify(node.props.children).includes('Enroll passkey'));
    await button.props.onClick();
    expect(getPasskeyTrust()).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
    expect(requests.some(({ url }) => url.endsWith('/auth/register') || url.endsWith('/auth/exchange'))).toBe(false);
    expect(JSON.stringify(render())).toContain('Synthetic registration rejected');
  });
});
