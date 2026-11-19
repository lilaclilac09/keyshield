import { createServer, request as httpRequest, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { softwarePasskey, ORIGIN } from './software_passkey';

const requireDesktop = createRequire(new URL('../src/desktop/package.json', import.meta.url));
const { createBroker } = requireDesktop('./broker.cjs');
const { createApprovalPasskey } = requireDesktop('./approval-passkey.cjs');
const SECRET = 'FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  return (server.address() as { port: number }).port;
}

async function world(options: { noPin?: boolean; ttl?: number; brokerOptions?: Record<string, unknown> } = {}) {
  let clock = Date.now();
  const signer = softwarePasskey();
  const passkey = createApprovalPasskey();
  if (!options.noPin) await passkey.register(signer.registration('registration-challenge'), 'registration-challenge');
  const seen: unknown[] = [];
  const response = { status: 200, body: JSON.stringify({ echo: 'keyshield-acceptance' }), type: 'application/json', location: '' };
  const providerPort = await listen(createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    seen.push({ authorization: req.headers.authorization, path: req.url, method: req.method, body: Buffer.concat(chunks).toString() });
    res.writeHead(response.status, { 'content-type': response.type, 'x-private': SECRET,
      ...(response.location ? { location: response.location } : {}) });
    res.end(response.body);
  }));
  const broker = createBroker({ mockProviderPort: providerPort, passkey, now: () => clock,
    approvalTtlMs: options.ttl ?? 120000, ...options.brokerOptions });
  const port = await listen(broker.server);
  const agent = broker.registerAgent('mock agent');
  const base = `http://127.0.0.1:${port}`;
  async function call(path: string, init: RequestInit = {}, token = agent.token) {
    const result = await fetch(`${base}${path}`, { ...init, headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers,
    } });
    const body = await result.text();
    expect(body).not.toContain(SECRET);
    expect(JSON.stringify([...result.headers])).not.toContain(SECRET);
    return { status: result.status, body: JSON.parse(body), headers: result.headers };
  }
  async function submit(credential = 'openai#2') {
    const result = await call('/v1/requests', { method: 'POST', body: JSON.stringify({ operation: 'mock.echo', credential }) });
    expect(result.status).toBe(202); return result.body;
  }
  function approve(request: { id: string }, assertion?: unknown) {
    const grant = assertion ? null : broker.beginApproval(request.id);
    return broker.approve({ requestId: request.id, secret: SECRET, assertion: assertion ?? signer.assertion(grant.challenge) });
  }
  return { broker, signer, passkey, seen, response, base, port, agent, call, submit, approve, advance: (ms: number) => { clock += ms; } };
}

describe('mock desktop broker with real WebAuthn verification', () => {
  it('dispatches once only after a broker-bound assertion and returns the fixed result', async () => {
    const w = await world(); const r = await w.submit();
    expect(w.seen).toEqual([]);
    expect(w.broker.listRequests()[0]).toMatchObject({ credential: 'openai#2', description: expect.stringContaining('Mock provider (test only)') });
    const grant = w.broker.beginApproval(r.id);
    expect(grant.binding).toMatchObject({ requestId: r.id, entryId: 'openai#2', agentName: 'mock agent', operation: 'mock.echo' });
    const assertion = w.signer.assertion(grant.challenge);
    await w.approve(r, assertion);
    expect(w.seen).toEqual([{ authorization: `Bearer ${SECRET}`, method: 'POST', path: '/v1/mock', body: '{"input":"keyshield-acceptance"}' }]);
    expect((await w.call(`/v1/requests/${r.id}`)).body).toMatchObject({ status: 'completed', result: { ok: true, operation: 'mock.echo' } });
    await expect(w.approve(r, assertion)).rejects.toThrow('request_not_pending');
    expect(w.seen).toHaveLength(1);
    expect(JSON.stringify(w.broker.audit())).not.toContain(SECRET);
  });

  it.each([
    { echo: 'keyshield-acceptance', extra: 'not allowed' }, { echo: SECRET }, { secret: SECRET },
    { echo: Buffer.from(SECRET).toString('base64') }, { echo: encodeURIComponent(SECRET) }, [], null,
  ])('never forwards provider JSON %j', async (body) => {
    const w = await world(); const r = await w.submit(); w.response.body = JSON.stringify(body);
    await w.approve(r);
    const response = await w.call(`/v1/requests/${r.id}`);
    expect(response.body).toMatchObject({ status: 'failed', error: 'provider_response_rejected' });
    expect(response.body.result).toBeUndefined(); expect(w.seen).toHaveLength(1);
  });

  it.each(['wrong challenge', 'no UV', 'wrong origin', 'wrong key', 'no assertion', 'expired challenge', 'replaced challenge'])('refuses %s without egress', async (mode) => {
    const w = await world(); const r = await w.submit(); const grant = w.broker.beginApproval(r.id);
    const signer = mode === 'wrong key' ? softwarePasskey() : w.signer;
    const assertion = signer.assertion(mode === 'wrong challenge' ? 'wrong' : grant.challenge,
      { uv: mode !== 'no UV', origin: mode === 'wrong origin' ? 'https://wrong.invalid' : ORIGIN });
    if (mode === 'wrong key') assertion.id = assertion.rawId = w.signer.id;
    if (mode === 'expired challenge') w.advance(60001);
    if (mode === 'replaced challenge') w.broker.beginApproval(r.id);
    await expect(w.broker.approve({ requestId: r.id, secret: SECRET, ...(mode === 'no assertion' ? {} : { assertion }) })).rejects.toThrow();
    expect(w.seen).toEqual([]); expect(w.broker.listRequests()[0].status).toBe('pending');
  });

  it('requires a pin for beginning or approving', async () => {
    const w = await world({ noPin: true }); const r = await w.submit();
    expect(() => w.broker.beginApproval(r.id)).toThrow('approval_passkey_not_pinned');
    await expect(w.approve(r, w.signer.assertion('anything'))).rejects.toThrow('approval_passkey_not_pinned');
    expect(w.seen).toEqual([]);
  });

  it('refuses a challenge belonging to a different request or exact entry ID', async () => {
    const w = await world(); const first = await w.submit('openai'); const second = await w.submit('openai#2');
    const a = w.broker.beginApproval(first.id); w.broker.beginApproval(second.id);
    await expect(w.approve(second, w.signer.assertion(a.challenge))).rejects.toThrow();
    await expect(w.broker.approve({ requestId: first.id, credential: 'openai#2', assertion: w.signer.assertion(a.challenge), secret: SECRET })).rejects.toThrow('approval_binding_refused');
    expect(w.seen).toEqual([]);
  });

  it('refuses replayed assertions on new requests', async () => {
    const w = await world(); const first = await w.submit(); const grant = w.broker.beginApproval(first.id);
    const assertion = w.signer.assertion(grant.challenge); await w.approve(first, assertion);
    const second = await w.submit(); w.broker.beginApproval(second.id);
    await expect(w.approve(second, assertion)).rejects.toThrow(); expect(w.seen).toHaveLength(1);
  });

  it('refuses replay of a valid zero-signCount platform-style assertion without relying on the counter', async () => {
    const w = await world(); const r = await w.submit(); const grant = w.broker.beginApproval(r.id);
    const assertion = w.signer.assertion(grant.challenge, { counter: 0 });
    await w.approve(r, assertion);
    expect(w.passkey.get().counter).toBe(0);
    await expect(w.approve(r, assertion)).rejects.toThrow('request_not_pending');
    expect(w.seen).toHaveLength(1);
    expect((await w.call(`/v1/requests/${r.id}`)).body.status).toBe('completed');
  });

  it('atomically permits only one concurrent approval', async () => {
    const w = await world(); const r = await w.submit(); const g = w.broker.beginApproval(r.id);
    const results = await Promise.allSettled([w.approve(r, w.signer.assertion(g.challenge)), w.approve(r, w.signer.assertion(g.challenge))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); expect(w.seen).toHaveLength(1);
  });

  it.each(['deny', 'expiry', 'new challenge'])('rechecks %s after asynchronous signature verification', async (mode) => {
    const w = await world(); const r = await w.submit(); const g = w.broker.beginApproval(r.id);
    const verify = w.passkey.verify;
    w.passkey.verify = async (...args: unknown[]) => {
      await verify(...args);
      if (mode === 'deny') w.broker.deny(r.id);
      if (mode === 'expiry') w.advance(120001);
      if (mode === 'new challenge') w.broker.beginApproval(r.id);
    };
    await expect(w.approve(r, w.signer.assertion(g.challenge))).rejects.toThrow();
    expect(w.seen).toEqual([]);
  });

  it.each(['deny', 'revokeRequest', 'agent revoke', 'expiry', 'cancel'])('%s fails closed including late approval', async (mode) => {
    const w = await world(); const r = await w.submit(); const g = w.broker.beginApproval(r.id); const assertion = w.signer.assertion(g.challenge);
    if (mode === 'agent revoke') { w.broker.revokeAgent(w.agent.agentId); expect((await w.call(`/v1/requests/${r.id}`)).status).toBe(401); }
    else if (mode === 'expiry') w.advance(120001);
    else if (mode === 'cancel') await w.call(`/v1/requests/${r.id}`, { method: 'DELETE' });
    else w.broker[mode](r.id);
    await expect(w.approve(r, assertion)).rejects.toThrow('request_not_pending'); expect(w.seen).toEqual([]);
  });

  it('does not follow redirects', async () => {
    const w = await world(); let redirected = 0;
    const port = await listen(createServer((_req, res) => { redirected++; res.end('{}'); }));
    w.response.status = 307; w.response.location = `http://127.0.0.1:${port}/steal`;
    const r = await w.submit(); await w.approve(r);
    expect((await w.call(`/v1/requests/${r.id}`)).body.error).toBe('redirect_refused'); expect(redirected).toBe(0);
  });

  it.each(['url', 'command', 'headers', 'origin', 'host', 'path', 'method', 'body'])('rejects extra request field %s', async (field) => {
    const w = await world(); const r = await w.call('/v1/requests', { method: 'POST', body: JSON.stringify({ operation: 'mock.echo', credential: 'openai', [field]: 'bad' }) });
    expect(r).toMatchObject({ status: 400, body: { error: 'unknown_field' } }); expect(w.seen).toEqual([]);
  });

  it.each([undefined, 'https://example.com', '123@evil.invalid', 0, -1, 65536])('cannot configure non-loopback destination %s', async (mockProviderPort) => {
    const w = await world({ brokerOptions: { mockProviderPort, providerOrigin: 'https://example.com' } });
    expect((await w.call('/v1/requests', { method: 'POST', body: '{"operation":"mock.echo","credential":"openai"}' })).body.error).toBe('operation_unavailable');
    expect(w.seen).toEqual([]);
  });

  it('enforces agent authentication, ownership, Origin, Host and no HTTP administration', async () => {
    const w = await world(); const r = await w.submit(); const other = w.broker.registerAgent('other');
    expect((await w.call(`/v1/requests/${r.id}`, {}, 'wrong')).status).toBe(401);
    expect((await w.call(`/v1/requests/${r.id}`, {}, other.token)).status).toBe(404);
    expect((await w.call('/v1/requests', { headers: { Origin: ORIGIN } })).status).toBe(403);
    const status = await new Promise((resolve) => { const req = httpRequest(w.base, { headers: { Host: 'evil.invalid' } }, (res) => { res.resume(); resolve(res.statusCode); }); req.end(); });
    expect(status).toBe(421);
    for (const path of ['/approve', '/deny', '/agents', '/beginApproval', '/pinApprovalPasskey']) expect((await w.call(path, { method: 'POST', body: '{}' })).status).toBe(404);
    expect(w.seen).toEqual([]);
  });

  it('persists only a verified registration and counter; refuses re-pinning and missing UV/origin', async () => {
    const dir = mkdtempSync(join(homedir(), '.keyshield-pin-test-')); cleanup.push(() => rmSync(dir, { recursive: true }));
    const file = join(dir, 'approval-passkey.json'); const signer = softwarePasskey();
    const store = createApprovalPasskey({ file });
    await expect(store.register(signer.registration('challenge', { uv: false }), 'challenge')).rejects.toThrow();
    await expect(store.register(signer.registration('challenge', { origin: 'https://wrong.invalid' }), 'challenge')).rejects.toThrow();
    await expect(store.register(signer.registration('challenge'), 'wrong')).rejects.toThrow();
    expect(store.get()).toBeNull();
    await store.register(signer.registration('challenge'), 'challenge');
    await store.verify(signer.assertion('approval'), 'approval');
    expect(createApprovalPasskey({ file }).get()).toMatchObject({ credentialId: signer.id, counter: 1, origin: ORIGIN });
    expect(JSON.parse(readFileSync(file, 'utf8')).publicKey).toEqual(expect.any(String));
    expect(statSync(file).mode & 0o777).toBe(0o600);
    await expect(store.register(softwarePasskey().registration('new'), 'new')).rejects.toThrow('already_pinned');
  });
});
