import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const requireDesktop = createRequire(new URL('../src/desktop/package.json', import.meta.url));
const main = readFileSync('src/desktop/main.cjs', 'utf8');
const preload = readFileSync('src/desktop/preload.cjs', 'utf8');

async function harness(enabled = true, isPackaged = false, syncProxy = false, listenFailure = false, forcePackaged = false) {
  const handlers = new Map<string, Function>();
  const passkey = { register: vi.fn(), get: vi.fn(() => null) };
  const nativeDialog = { showMessageBox: vi.fn(async () => ({ response: 1 })) };
  const preferences = { canPromptTouchID: vi.fn(() => true), promptTouchID: vi.fn(async () => {}) };
  let pinOptions: any;
  let changed = () => {};
  const broker = Object.fromEntries(['listAgents', 'registerAgent', 'revokeAgent', 'listRequests', 'deny', 'revokeRequest', 'beginApproval', 'approve', 'invalidateApprovals'].map((name) => [name, vi.fn()]));
  broker.listen = vi.fn(async () => ({ port: 12345 }));
  if (listenFailure) broker.listen.mockRejectedValueOnce(new Error('EADDRINUSE'));
  broker.onChange = vi.fn((cb) => { changed = cb; });
  const app = { on: vi.fn(), setName: vi.fn(), quit: vi.fn(), requestSingleInstanceLock: () => false,
    isPackaged, getPath: () => '/unused', commandLine: { appendSwitch: vi.fn() } };
  const fetch = vi.fn(async () => Response.json({ challenge: 'observed-challenge', user: { id: 'account' }, rp: { id: 'app.ks.aileena.xyz' } }));
  const protocols = new Map<string, Function>();
  const ses = { fetch, protocol: { handle: (scheme: string, cb: Function) => protocols.set(scheme, cb) } };
  const errorLog = vi.fn();
  const context = createContext({ URL, console: { log: vi.fn(), error: errorLog }, process: {
    env: { ...(enabled ? { KS_DESKTOP_BROKER: '1' } : {}), ...(syncProxy ? { KS_DESKTOP_SYNC_PROXY: '1' } : {}), ...(forcePackaged ? { KS_DESKTOP_FORCE_PACKAGED: '1' } : {}) },
    on: vi.fn(), platform: 'test',
  },
    __dirname: '/unused', require: (name: string) => {
      if (name === 'electron') return { app, dialog: nativeDialog, systemPreferences: preferences, net: { fetch }, ipcMain: { handle: (name: string, cb: Function) => handlers.set(name, cb), on: vi.fn() } };
      if (name === './broker.cjs') return { createBroker: () => broker };
      if (name === './approval-passkey.cjs') return { createApprovalPasskey: (options: any) => { pinOptions = options; return passkey; } };
      if (name === './runtime-preflight.cjs') return {};
      if (name === './diagnostics.cjs') return { createDiagnostics: () => ({ log: vi.fn() }) };
      return requireDesktop(name);
    } });
  runInContext(main, context);
  await runInContext('startBroker()', context);
  const frame = { url: 'https://app.ks.aileena.xyz/device-vault', parent: null };
  const wc = { mainFrame: frame, send: vi.fn(), session: ses };
  const win = { isDestroyed: () => false, webContents: wc };
  (context as any).testWindow = win; runInContext('mainWindow = testWindow', context);
  (context as any).testSession = ses;
  return { handlers, broker, frame, wc, context, passkey, changed, fetch, protocols, nativeDialog, preferences, pinOptions, win, errorLog };
}

describe('broker IPC main-frame boundary', () => {
  it('continues normal startup after a broker listen failure', async () => {
    const w = await harness(true, false, false, true);
    expect(w.errorLog).toHaveBeenCalledWith('Approval broker unavailable; continuing without it', 'EADDRINUSE');
    expect(runInContext('broker === null && brokerPort === null && registrationObserver === null', w.context)).toBe(true);
    expect([...w.handlers.keys()].filter((name) => name.startsWith('ks-broker:'))).toEqual([]);
    expect(w.wc).toBeDefined();
  });
  it.each(['accepted', 'cancelled', 'dialog failed', 'Touch ID failed', 'Touch ID unavailable'])('uses main-owned native enrollment confirmation: %s', async (mode) => {
    const w = await harness();
    if (mode === 'cancelled') w.nativeDialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
    if (mode === 'dialog failed') w.nativeDialog.showMessageBox.mockRejectedValueOnce(new Error('native dialog failed'));
    if (mode === 'Touch ID failed') w.preferences.promptTouchID.mockRejectedValueOnce(new Error('Touch ID cancelled'));
    if (mode === 'Touch ID unavailable') w.preferences.canPromptTouchID.mockReturnValue(false);
    const confirmation = w.pinOptions.confirmEnrollment({ credentialId: 'credential-under-review' });
    if (mode.endsWith('failed')) await expect(confirmation).rejects.toThrow();
    else expect(await confirmation).toBe(mode !== 'cancelled');
    expect(w.nativeDialog.showMessageBox).toHaveBeenCalledWith(w.win, expect.objectContaining({
      message: 'Use this passkey for agent approvals on this device?', detail: 'Credential ID: credential-under-review',
      buttons: ['Cancel', 'Use passkey'], defaultId: 0, cancelId: 0 }));
    if (mode === 'cancelled' || mode === 'dialog failed' || mode === 'Touch ID unavailable') expect(w.preferences.promptTouchID).not.toHaveBeenCalled();
    else expect(w.preferences.promptTouchID).toHaveBeenCalledOnce();
  });
  it.each(['packaged', 'packaged-mode fixture'])('refuses mock startup when %s', async (mode) => {
    const w = await harness(true, mode === 'packaged', false, false, mode === 'packaged-mode fixture');
    expect([...w.handlers.keys()].filter((key) => key.startsWith('ks-broker:'))).toEqual([]);
    expect(w.broker.listen).not.toHaveBeenCalled();
  });
  it('does not register any broker handlers when disabled', async () => {
    const w = await harness(false); expect([...w.handlers.keys()].filter((key) => key.startsWith('ks-broker:'))).toEqual([]);
    expect(w.broker.listen).not.toHaveBeenCalled();
  });
  it.each(['other window', 'subframe', 'wrong origin', 'file', 'missing frame', 'destroyed'])('refuses every trusted call from %s', async (mode) => {
    const w = await harness();
    let frame: any = w.frame; let sender: any = w.wc;
    if (mode === 'other window') sender = {};
    if (mode === 'subframe') frame = { ...frame, parent: w.frame };
    if (mode === 'wrong origin') w.frame.url = 'https://evil.invalid';
    if (mode === 'file') w.frame.url = 'file:///renderer/index.html';
    if (mode === 'missing frame') frame = null;
    if (mode === 'destroyed') runInContext('mainWindow = null', w.context);
    for (const [name, handler] of w.handlers) {
      if (!name.startsWith('ks-broker:')) continue;
      expect(() => handler({ sender, senderFrame: frame }, {})).toThrow('broker_caller_refused');
    }
    expect(w.broker.approve).not.toHaveBeenCalled(); expect(w.passkey.register).not.toHaveBeenCalled();
  });
  it.each([true, false])('accepts the main session registration GET without Origin (Referer present: %s)', async (withReferer) => {
    const w = await harness(); const event = { sender: w.wc, senderFrame: w.frame }; const payload = { requestId: 'r', assertion: {}, secret: 'synthetic' };
    w.handlers.get('ks-broker:approve')!(event, payload); expect(w.broker.approve).toHaveBeenCalledWith(payload);
    const registrationRequest = new Request('https://keyshield-production.up.railway.app/auth/passkey/register-options', {
      headers: { ...(withReferer ? { Referer: 'https://app.ks.aileena.xyz/device-vault' } : {}), Authorization: 'Bearer account-session' } });
    runInContext('installHttpsHandler(testSession)', w.context);
    expect([...w.protocols.keys()]).toEqual(['https', 'http']);
    await w.protocols.get('https')!(registrationRequest);
    expect(w.fetch).toHaveBeenCalledWith(registrationRequest.url, expect.objectContaining({
      method: 'GET', headers: registrationRequest.headers, bypassCustomProtocolHandlers: true }));
    const response = { response: { clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: 'observed-challenge', origin: 'https://app.ks.aileena.xyz' })).toString('base64url') } };
    await w.handlers.get('ks-broker:pinApprovalPasskey')!(event, { response, expectedChallenge: 'renderer-lie' });
    expect(w.passkey.register).toHaveBeenCalledWith(response, 'observed-challenge', 'account', expect.any(Function));
    w.handlers.get('ks-broker:invalidateApprovals')!(event); expect(w.broker.invalidateApprovals).toHaveBeenCalled();
  });
  it('does not observe registration through a different session', async () => {
    const w = await harness(); w.wc.session = {} as any;
    runInContext('installHttpsHandler(testSession)', w.context);
    await w.protocols.get('https')!(new Request('https://keyshield-production.up.railway.app/auth/passkey/register-options', {
      headers: { Referer: 'https://app.ks.aileena.xyz/', Authorization: 'Bearer account-session' } }));
    expect(w.fetch).toHaveBeenCalledTimes(1);
    await expect(w.handlers.get('ks-broker:pinApprovalPasskey')!({ sender: w.wc, senderFrame: w.frame }, { response: {} })).rejects.toThrow('approval_registration_unavailable');
    expect(w.passkey.register).not.toHaveBeenCalled();
  });
  it.each([
    ['http://localhost:8787/auth/register', 'http://localhost:8787/auth/register'],
    ['https://keyshield-production.up.railway.app/auth/passkey/register-verify', 'https://keyshield-production.up.railway.app/auth/passkey/register-verify'],
    ['https://sync.ks.aileena.xyz/auth/register', 'http://127.0.0.1:8787/auth/register'],
  ])('preserves POST method, headers and streaming body when forwarding %s', async (url, destination) => {
    const w = await harness(true, false, true);
    runInContext('installHttpsHandler(testSession)', w.context);
    const body = JSON.stringify({ vaultId: 'test-vault', attestation: { id: 'synthetic' } });
    const request = new Request(url, { method: 'POST', credentials: 'include',
      headers: { Authorization: 'Bearer local-test-token', 'Content-Type': 'application/json', Referer: 'https://app.ks.aileena.xyz/' }, body });
    w.fetch.mockImplementationOnce(async (input: any, init: any) => {
      expect(input).toBe(destination);
      expect(init.duplex).toBe('half'); expect(init.bypassCustomProtocolHandlers).toBe(true);
      const forwarded = new Request(input, init);
      expect(forwarded.method).toBe('POST'); expect(forwarded.credentials).toBe('include');
      expect([...forwarded.headers]).toEqual([...request.headers]);
      expect(await forwarded.text()).toBe(body);
      return Response.json({ ok: true });
    });
    const response = await w.protocols.get(new URL(url).protocol.slice(0, -1))!(request);
    expect(await response.json()).toEqual({ ok: true });
    expect(w.fetch).toHaveBeenCalledTimes(1);
  });
  it('exposes only the v2 bridge and removes change subscriptions', () => {
    let bridge: any;
    const ipc = { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
    const load = (enabled: boolean) => runInContext(preload, createContext({ process: { argv: enabled ? ['--ks-desktop-broker-port=12345'] : [], env: {} },
      require: () => ({ contextBridge: { exposeInMainWorld: (_name: string, value: unknown) => { bridge = value; } }, ipcRenderer: ipc }) }));
    load(false); expect(bridge.broker).toBeUndefined(); load(true);
    expect(Object.keys(bridge.broker).sort()).toEqual(['listAgents', 'registerAgent', 'revokeAgent', 'listRequests', 'deny', 'revokeRequest', 'beginApproval', 'approve', 'pinApprovalPasskey', 'onChanged', 'invalidateApprovals', 'approvalStatus'].sort());
    const cb = vi.fn(); const unsubscribe = bridge.broker.onChanged(cb); ipc.on.mock.calls[0][1]({}, { secret: 'never forwarded' }); expect(cb).toHaveBeenCalledWith();
    unsubscribe(); expect(ipc.removeListener).toHaveBeenCalledWith('ks-broker:changed', ipc.on.mock.calls[0][1]);
  });
});
