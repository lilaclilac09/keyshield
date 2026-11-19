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
    const request = (token = 'owner', origin = ORIGIN, host = api) => new Request(`${host}/auth/passkey/register-options`, {
      headers: { Authorization: `Bearer ${token}`, Origin: origin } });
    const observe = (token = 'owner', challenge = 'observed', accountId = 'account-A', origin = ORIGIN, host = api) => observer.observe(request(token, origin, host),
      async () => Response.json({ challenge, user: { id: accountId }, rp: { id: RP_ID } }));
    return { observer, observe, advance: (ms: number) => { clock += ms; } };
  }

  it('pins a real registration against the independently observed challenge and account', async () => {
    const w = await setup(); const signer = softwarePasskey(); await w.observe();
    const registration = signer.registration('observed'); const binding = w.observer.consume(registration);
    const store = createApprovalPasskey(); await store.register(registration, binding.challenge, binding.accountId);
    expect(store.get()).toMatchObject({ credentialId: signer.id, accountId: 'account-A' });
    expect(() => w.observer.consume(registration)).toThrow('unavailable');
    await expect(store.register(softwarePasskey().registration('other'), 'other', 'account-B')).rejects.toThrow('already_pinned');
  });

  it.each(['unobserved', 'expired', 'wrong challenge', 'wrong origin', 'wrong API', 'account switched', 'reissued'])('refuses %s enrollment', async (mode) => {
    const w = await setup(); const signer = softwarePasskey();
    if (mode !== 'unobserved') await w.observe('owner', 'observed', 'account-A', mode === 'wrong origin' ? 'https://wrong.invalid' : ORIGIN, mode === 'wrong API' ? 'http://127.0.0.1:9999' : api);
    if (mode === 'expired') w.advance(120000);
    if (mode === 'account switched') await w.observe('other-owner', 'other', 'account-B');
    if (mode === 'reissued') await w.observe('owner', 'replacement');
    expect(() => w.observer.consume(signer.registration(mode === 'wrong challenge' ? 'renderer-selected' : 'observed'))).toThrow('unavailable');
  });

  it('does not let failed or malformed options authorize pinning', async () => {
    const w = await setup(); await w.observe();
    await w.observer.observe(new Request(`${api}/auth/passkey/register-options`, { headers: { Origin: ORIGIN, Authorization: 'Bearer owner' } }), async () => new Response('bad', { status: 401 }));
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

  it('keeps normal registration working when broker pinning is unavailable', async () => {
    const events = new EventTarget();
    const pin = vi.fn(async () => { throw new Error('approval_registration_unavailable'); });
    vi.stubGlobal('window', { location: { hostname: 'localhost' }, keyshieldDesktop: { broker: { pinApprovalPasskey: pin } }, addEventListener: events.addEventListener.bind(events) });
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('navigator', { credentials: { create: async () => ({ id: 'id', rawId: new Uint8Array([1]).buffer,
      response: { attestationObject: new Uint8Array([2]).buffer, clientDataJSON: new Uint8Array([3]).buffer }, getClientExtensionResults: () => ({}) }) } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('register-options')
      ? Response.json({ challenge: 'AQID', user: { id: 'BAUG' }, rp: { id: RP_ID } })
      : Response.json({ credentialId: 'id', name: 'normal passkey' })));
    const { registerPasskey } = await import('../src/web/lib/auth');
    expect(await registerPasskey('normal passkey')).toMatchObject({ credentialId: 'id', vaultEnrolled: false });
    expect(pin).toHaveBeenCalledTimes(1);
  });
});
