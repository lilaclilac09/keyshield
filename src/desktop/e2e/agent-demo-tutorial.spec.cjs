const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomBytes } = require('node:crypto');
const net = require('node:net');

const exec = promisify(execFile);
const desktop = path.resolve(__dirname, '..');
const root = path.resolve(desktop, '../..');
const fixture = 'FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const origin = 'https://app.ks.aileena.xyz';
const api = 'http://127.0.0.1:8001';
const worker = 'http://127.0.0.1:8787';

async function clickNativePin(pid) {
  const script = `tell application "System Events"
    set targetProcess to first application process whose unix id is ${pid}
    tell targetProcess
      repeat with w in windows
        set elements to entire contents of w
        set correctDialog to false
        repeat with e in elements
          try
            if value of e is "Use this passkey for agent approvals on this device?" then set correctDialog to true
          end try
        end repeat
        if correctDialog then
          repeat with e in elements
            try
              if role of e is "AXButton" and name of e is "Use passkey" then
                click e
                return "clicked native Use passkey"
              end if
            end try
          end repeat
        end if
      end repeat
    end tell
    return "waiting for native pin dialog"
  end tell`;
  await expect.poll(async () => (await exec('/usr/bin/osascript', ['-e', script], { timeout: 5000 })).stdout.trim(),
    { timeout: 20000, message: 'Accessibility must click the real native pin confirmation' }).toBe('clicked native Use passkey');
}

test('DEMO ONLY tutorial: enroll, native pin, save, register demo-agent, curl approve/deny and terminal metadata', async () => {
  test.setTimeout(180000);
  expect(process.platform, 'Native dialog automation requires macOS').toBe('darwin');
  expect(process.env.KS_E2E_APP, 'This demo must never run against a packaged app').toBeUndefined();
  const parent = path.join(os.homedir(), '.local/state/keyshield-e2e');
  fs.mkdirSync(parent, { recursive: true });
  const run = fs.mkdtempSync(path.join(parent, 'agent-tutorial-'));
  fs.mkdirSync(path.join(run, 'api')); fs.mkdirSync(path.join(run, 'vault'));
  const children = [];
  const start = (command, args, cwd, env, label) => {
    const log = fs.openSync(path.join(run, `${label}.log`), 'w', 0o600);
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', log, log] });
    fs.closeSync(log); children.push(child);
    return child;
  };
  let app;
  try {
    for (const port of [8001, 8787]) {
      const probe = net.createServer();
      await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
      await new Promise((resolve) => probe.close(resolve));
    }
    start(path.join(root, '.venv/bin/python'), ['-m', 'uvicorn', 'src.backend.app:app', '--host', '127.0.0.1', '--port', '8001'], root, {
      KS_DATA_DIR: path.join(run, 'api'), VAULT_DIR: path.join(run, 'vault'),
      SERVER_SECRET: randomBytes(32).toString('hex'), INTERNAL_SECRET: randomBytes(32).toString('hex'),
      KS_RP_ID: 'app.ks.aileena.xyz', KS_ORIGIN: origin, KS_CORS_ORIGINS: origin,
    }, 'api');
    start(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--ip', '127.0.0.1', '--port', '8787',
      '--persist-to', path.join(run, 'worker'), '--var', 'RP_ID:app.ks.aileena.xyz', '--var', `RP_ORIGIN:${origin}`,
      '--var', `JWT_SECRET:${randomBytes(32).toString('hex')}`], path.join(root, 'src/infra/sync-worker'),
    { WRANGLER_SEND_METRICS: 'false', CI: 'true' }, 'worker');
    for (const base of [api, worker]) await expect.poll(async () => {
      try { return (await fetch(`${base}/health`)).status; } catch { return 0; }
    }, { timeout: 30000, message: `Real local service ready at ${base}; logs in ${run}` }).toBe(200);

    app = await electron.launch({ executablePath: require('electron'),
      args: [path.join(desktop, 'main.cjs'), `--user-data-dir=${run}/profile`,
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
      env: { ...process.env, KS_DESKTOP_BROKER: '1', KS_BROKER_PORT: '0', KS_DESKTOP_FORCE_PACKAGED: '0',
        KS_DESKTOP_LIVE: '0', KS_DESKTOP_API_URL: api, KS_DESKTOP_SYNC_PROXY: '0',
        KS_DESKTOP_LOG: path.join(run, 'desktop.log') },
    });
    expect(await app.evaluate(({ systemPreferences }) => systemPreferences.canPromptTouchID()),
      'Use a macOS test host without Touch ID; this spec never stubs native authorization').toBe(false);
    const page = await app.firstWindow();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true,
    } });
    const workerTraffic = () => fs.readFileSync(path.join(run, 'worker.log'), 'utf8').replace(/\u001b\[[0-9;]*m/g, '');
    await page.getByTestId('email-login').fill(`demo-agent-${Date.now()}@example.invalid`);
    await page.getByTestId('password-login-input').fill('Synthetic-demo-password-2026!');
    await page.getByTestId('email-signup').click();
    await page.getByRole('button', { name: 'Vault', exact: true }).click();
    const paste = page.getByPlaceholder('sk-or-…  sk-proj-…  gsk_…  helius UUID…');
    await paste.fill(fixture);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock or create device vault', exact: true }).click();
    const nativeClick = clickNativePin(app.process().pid);
    await Promise.all([page.getByRole('button', { name: 'Enroll passkey', exact: true }).click(), nativeClick]);
    await expect(page.getByText('Vault unlocked — no encrypted keys yet', { exact: true })).toBeVisible();
    await expect(page.getByTestId('broker-unavailable')).toHaveCount(0);
    await expect.poll(workerTraffic).toMatch(/POST \/auth\/register 200 OK/);
    await expect.poll(workerTraffic).toMatch(/POST \/auth\/exchange 200 OK/);
    await paste.fill('');
    await page.getByRole('button', { name: 'Add encrypted key', exact: true }).click();
    await page.getByPlaceholder('sk-proj-…', { exact: true }).fill(fixture);
    await page.getByRole('button', { name: 'Encrypt & store', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Encrypt & store', exact: true })).toHaveCount(0);
    await expect.poll(workerTraffic).toMatch(/PUT \/vault\/[a-f0-9]+ 200 OK/);
    await page.getByTestId('broker-agent-name').fill('demo-agent');
    await page.getByTestId('broker-register-agent').click();
    await page.getByTestId('broker-copy-token').click();
    const token = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const brokerURL = await page.getByTestId('broker-url').innerText();
    expect(brokerURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await page.getByTestId('broker-dismiss-token').click();
    await app.evaluate(({ clipboard }) => clipboard.clear());

    const agentCall = async (method, route, body) => {
      const { stdout, stderr } = await exec('/usr/bin/curl', ['--silent', '--show-error', '--fail-with-body',
        '--request', method, '--dump-header', '-', '--header', `Authorization: Bearer ${token}`,
        ...(body ? ['--header', 'Content-Type: application/json', '--data', JSON.stringify(body)] : []), `${brokerURL}${route}`]);
      expect(`${stdout}${stderr}`).not.toContain(fixture);
      expect(`${stdout}${stderr}`).not.toContain(fixture.split('::')[1]);
      const [headers, json] = stdout.split(/\r?\n\r?\n/);
      expect(headers).toMatch(/content-type: application\/json/i);
      return { status: Number(headers.match(/^HTTP\/\S+ (\d+)/)[1]), body: JSON.parse(json) };
    };
    const submit = async () => {
      const response = await agentCall('POST', '/v1/requests', { operation: 'mock.echo', credential: 'openai' });
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ id: expect.stringMatching(/^[a-f0-9]{32}$/), status: 'pending',
        operation: 'mock.echo', credential: 'openai', expires_at: expect.any(Number) });
      return response.body;
    };
    const terminal = async (request, status) => {
      await expect.poll(async () => (await agentCall('GET', `/v1/requests/${request.id}`)).body.status,
        { timeout: 70000 }).toBe(status);
      const response = await agentCall('GET', `/v1/requests/${request.id}`);
      expect(response).toEqual({ status: 200, body: { ...request, status,
        ...(status === 'completed' ? { result: { ok: true, operation: 'mock.echo' } } : {}) } });
    };
    const approved = await submit();
    await page.getByTestId(`broker-approve-${approved.id}`).click();
    await expect(page.getByTestId('broker-outcomes')).toContainText('demo-agent · Entry ID: openai · mock.echo · completed');
    await terminal(approved, 'completed');
    await page.screenshot({ path: path.join(run, 'approved.png'), fullPage: true });
    const denied = await submit();
    await page.getByTestId(`broker-deny-${denied.id}`).click();
    await terminal(denied, 'denied');
    const revoked = await submit();
    await page.getByTestId(`broker-revoke-request-${revoked.id}`).click();
    await terminal(revoked, 'revoked');
    const expired = await submit();
    await terminal(expired, 'expired');
    await page.screenshot({ path: path.join(run, 'terminal-outcomes.png'), fullPage: true });
    console.log('DEMO ONLY: real local enrollment, native Accessibility click, PRF+UV approve, deny, revoke and expiry metadata verified.');
    console.log(`Evidence: ${run}`);
  } finally {
    if (app) await app.close();
    await Promise.all(children.map(async (child) => {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
    }));
  }
});
