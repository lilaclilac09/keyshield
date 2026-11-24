import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { softwarePasskey, ORIGIN, RP_ID } from './software_passkey';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentApprovalsPanel } from '../src/web/components/sections/AgentApprovalsPanel';

const requireDesktop = createRequire(new URL('../src/desktop/package.json', import.meta.url));
const { createRegistrationObserver } = requireDesktop('./registration-observer.cjs');
const { createApprovalPasskey } = requireDesktop('./approval-passkey.cjs');
const api = 'http://127.0.0.1:8001';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('main-observed registration enrollment', () => {
  async function setup() {
    let clock = 1000;
    const observer = createRegistrationObserver({ apiOrigin: api, origin: ORIGIN, now: () => clock });
    const request = (token = 'owner', referer = `${ORIGIN}/device-vault`, host = api) => new Request(`${host}/auth/passkey/register-options`, {
      headers: { Authorization: `Bearer ${token}`, ...(referer ? { Referer: referer } : {}) } });
    const observe = (token = 'owner', challenge = 'observed', accountId = 'account-A', referer = `${ORIGIN}/device-vault`, host = api) => observer.observe(request(token, referer, host),
      async () => Response.json({ challenge, user: { id: accountId }, rp: { id: RP_ID } }));
    return { observer, observe, advance: (ms: number) => { clock += ms; } };
  }

  it('pins a real registration against the independently observed challenge and account', async () => {
    const w = await setup(); const signer = softwarePasskey(); await w.observe();
    const registration = signer.registration('observed'); const binding = w.observer.consume(registration);
    const confirmEnrollment = vi.fn(async () => true);
    const store = createApprovalPasskey({ confirmEnrollment }); await store.register(registration, binding.challenge, binding.accountId);
    expect(confirmEnrollment).toHaveBeenCalledWith({ credentialId: signer.id });
    expect(store.get()).toMatchObject({ credentialId: signer.id, accountId: 'account-A' });
    expect(() => w.observer.consume(registration)).toThrow('unavailable');
    await expect(store.register(softwarePasskey().registration('other'), 'other', 'account-B')).rejects.toThrow('already_pinned');
  });

  it.each(['absent', 'cancelled', 'failed'])('does not pin when main confirmation is %s', async (mode) => {
    const signer = softwarePasskey();
    const confirmEnrollment = mode === 'absent' ? undefined : vi.fn(async () => {
      if (mode === 'failed') throw new Error('confirmation failed'); return false;
    });
    const store = createApprovalPasskey({ confirmEnrollment });
    await expect(store.register(signer.registration('observed'), 'observed', 'account-A')).rejects.toThrow();
    expect(store.get()).toBeNull();
  });

  it.each(['unobserved', 'expired', 'wrong challenge', 'wrong referer', 'malformed referer', 'wrong API', 'account switched', 'reissued'])('refuses %s enrollment', async (mode) => {
    const w = await setup(); const signer = softwarePasskey();
    if (mode !== 'unobserved') await w.observe('owner', 'observed', 'account-A', mode === 'wrong referer' ? 'https://wrong.invalid' : mode === 'malformed referer' ? 'invalid' : ORIGIN, mode === 'wrong API' ? 'http://127.0.0.1:9999' : api);
    if (mode === 'expired') w.advance(120000);
    if (mode === 'account switched') await w.observe('other-owner', 'other', 'account-B');
    if (mode === 'reissued') await w.observe('owner', 'replacement');
    expect(() => w.observer.consume(signer.registration(mode === 'wrong challenge' ? 'renderer-selected' : 'observed'))).toThrow('unavailable');
  });

  it('accepts a GET without Origin or Referer through the bound session', async () => {
    const w = await setup(); await w.observe('owner', 'observed', 'account-A', '');
    expect(w.observer.consume(softwarePasskey().registration('observed'))).toMatchObject({ challenge: 'observed', accountId: 'account-A' });
  });

  it('still refuses a registration assertion from the wrong origin', async () => {
    const w = await setup(); await w.observe();
    expect(() => w.observer.consume(softwarePasskey().registration('observed', { origin: 'https://wrong.invalid' }))).toThrow('unavailable');
  });

  it('does not let failed or malformed options authorize pinning', async () => {
    const w = await setup(); await w.observe();
    await w.observer.observe(new Request(`${api}/auth/passkey/register-options`, { headers: { Referer: ORIGIN, Authorization: 'Bearer owner' } }), async () => new Response('bad', { status: 401 }));
    expect(() => w.observer.consume(softwarePasskey().registration('observed'))).toThrow('unavailable');
  });

  it('clears observed enrollment on account-session changes and explicit invalidation', async () => {
    const w = await setup(); await w.observe();
    await w.observer.observe(new Request(`${api}/manage/vault`, { headers: { Authorization: 'Bearer other-owner' } }), async () => Response.json([]));
    expect(() => w.observer.consume(softwarePasskey().registration('observed'))).toThrow('unavailable');
    await w.observe(); w.observer.invalidate();
    expect(() => w.observer.consume(softwarePasskey().registration('observed'))).toThrow('unavailable');
  });

  it('refuses a consumed registration if the account changes while verification is outstanding', async () => {
    const w = await setup(); await w.observe(); const signer = softwarePasskey();
    const registration = signer.registration('observed'); const binding = w.observer.consume(registration);
    const store = createApprovalPasskey();
    const verification = store.register(registration, binding.challenge, binding.accountId, binding.isCurrent);
    w.observer.invalidate();
    await expect(verification).rejects.toThrow('registration_refused'); expect(store.get()).toBeNull();
  });

  it('shows unavailability without suggesting re-enrollment or rotation', () => {
    const markup = renderToStaticMarkup(createElement(AgentApprovalsPanel, { broker: {} as any }));
    expect(markup).toContain('Broker approval is unavailable on this device.');
    expect(markup).not.toMatch(/re-enroll|rotate|rotation/i);
  });

  it('refuses a non-PRF passkey before requesting native confirmation', async () => {
    const confirmEnrollment = vi.fn(async () => true); const store = createApprovalPasskey({ confirmEnrollment });
    await expect(store.register(softwarePasskey().registration('observed', { prf: false }), 'observed', 'account-A')).rejects.toThrow('approval_prf_required');
    expect(confirmEnrollment).not.toHaveBeenCalled(); expect(store.get()).toBeNull();
  });

  it.each([true, false])('keeps normal registration working and pins only PRF-enabled credentials (%s)', async (prfEnabled) => {
    const events = new EventTarget();
    const pin = vi.fn(async () => { throw new Error('approval_registration_unavailable'); });
    const invalidateApprovals = vi.fn(async () => {});
    vi.stubGlobal('window', { location: { hostname: 'localhost' }, keyshieldDesktop: { broker: { pinApprovalPasskey: pin, invalidateApprovals } }, addEventListener: events.addEventListener.bind(events) });
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal('navigator', { credentials: { create: async () => ({ id: 'id', rawId: new Uint8Array([1]).buffer,
      response: { attestationObject: new Uint8Array([2]).buffer, clientDataJSON: new Uint8Array([3]).buffer }, getClientExtensionResults: () => ({ prf: { enabled: prfEnabled } }) }) } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('register-options')
      ? Response.json({ challenge: 'AQID', user: { id: 'BAUG', name: 'account-A' }, rp: { id: RP_ID } })
      : Response.json({ credentialId: 'id', name: 'normal passkey' })));
    const { registerPasskey } = await import('../src/web/lib/auth');
    expect(await registerPasskey('normal passkey')).toMatchObject({ credentialId: 'id', vaultEnrolled: false });
    expect(pin).toHaveBeenCalledTimes(prfEnabled ? 1 : 0);
    if (prfEnabled) {
      await vi.waitFor(() => expect(invalidateApprovals).toHaveBeenCalled());
      expect(pin.mock.invocationCallOrder[0]).toBeLessThan(invalidateApprovals.mock.invocationCallOrder[0]);
    }
  });
});
