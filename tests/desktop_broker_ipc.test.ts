import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const requireDesktop = createRequire(new URL('../src/desktop/package.json', import.meta.url));
const main = readFileSync('src/desktop/main.cjs', 'utf8');
const preload = readFileSync('src/desktop/preload.cjs', 'utf8');

async function harness(enabled = true, isPackaged = false) {
  const handlers = new Map<string, Function>();
  const passkey = { register: vi.fn(), get: vi.fn(() => null) };
  let changed = () => {};
  const broker = Object.fromEntries(['listAgents', 'registerAgent', 'revokeAgent', 'listRequests', 'deny', 'revokeRequest', 'beginApproval', 'approve', 'invalidateApprovals'].map((name) => [name, vi.fn()]));
  broker.listen = vi.fn(async () => ({ port: 12345 }));
  broker.onChange = vi.fn((cb) => { changed = cb; });
  const app = { on: vi.fn(), setName: vi.fn(), quit: vi.fn(), requestSingleInstanceLock: () => false,
    isPackaged, getPath: () => '/unused', commandLine: { appendSwitch: vi.fn() } };
  const fetch = vi.fn(async () => Response.json({ challenge: 'observed-challenge', user: { id: 'account' }, rp: { id: 'app.ks.aileena.xyz' } }));
  const context = createContext({ URL, console: { log: vi.fn() }, process: { env: enabled ? { KS_DESKTOP_BROKER: '1' } : {}, platform: 'test' },
    __dirname: '/unused', require: (name: string) => {
      if (name === 'electron') return { app, net: { fetch }, ipcMain: { handle: (name: string, cb: Function) => handlers.set(name, cb), on: vi.fn() } };
      if (name === './broker.cjs') return { createBroker: () => broker };
      if (name === './approval-passkey.cjs') return { createApprovalPasskey: () => passkey };
      if (name === './runtime-preflight.cjs') return {};
      return requireDesktop(name);
    } });
  runInContext(main, context);
  await runInContext('startBroker()', context);
  const frame = { url: 'https://app.ks.aileena.xyz/device-vault', parent: null };
  const wc = { mainFrame: frame, send: vi.fn() };
  const win = { isDestroyed: () => false, webContents: wc };
  (context as any).testWindow = win; runInContext('mainWindow = testWindow', context);
  return { handlers, broker, frame, wc, context, passkey, changed, fetch };
}

describe('broker IPC main-frame boundary', () => {
  it('refuses mock startup in a packaged Electron app', async () => {
    const w = await harness(true, true);
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
  it('accepts only the real main frame at the dashboard origin, including approve and pin', async () => {
    const w = await harness(); const event = { sender: w.wc, senderFrame: w.frame }; const payload = { requestId: 'r', assertion: {}, secret: 'synthetic' };
    w.handlers.get('ks-broker:approve')!(event, payload); expect(w.broker.approve).toHaveBeenCalledWith(payload);
    const registrationRequest = new Request('https://keyshield-production.up.railway.app/auth/passkey/register-options', {
      headers: { Origin: 'https://app.ks.aileena.xyz', Authorization: 'Bearer account-session' } });
    const protocols = new Map<string, Function>();
    (w.context as any).testSession = { protocol: { handle: (scheme: string, cb: Function) => protocols.set(scheme, cb) } };
    runInContext('installHttpsHandler(testSession)', w.context);
    expect([...protocols.keys()]).toEqual(['https', 'http']);
    await protocols.get('https')!(registrationRequest);
    expect(w.fetch).toHaveBeenCalledWith(registrationRequest, { bypassCustomProtocolHandlers: true });
    const response = { response: { clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: 'observed-challenge', origin: 'https://app.ks.aileena.xyz' })).toString('base64url') } };
    await w.handlers.get('ks-broker:pinApprovalPasskey')!(event, { response, expectedChallenge: 'renderer-lie' });
    expect(w.passkey.register).toHaveBeenCalledWith(response, 'observed-challenge', 'account', expect.any(Function));
    w.handlers.get('ks-broker:invalidateApprovals')!(event); expect(w.broker.invalidateApprovals).toHaveBeenCalled();
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
