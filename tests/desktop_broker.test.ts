import { createServer, request as httpRequest, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const { createBroker } = createRequire(import.meta.url)('../src/desktop/broker.cjs');
const SECRET = 'FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const cleanup: (() => Promise<void>)[] = [];

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  cleanup.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

async function world(options: Record<string, unknown> = {}) {
  const seen: { method?: string; path?: string; authorization?: string; body: string }[] = [];
  const response = { status: 200, body: JSON.stringify({ echo: 'safe' }), type: 'application/json', location: '' };
  const provider = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({ method: req.method, path: req.url, authorization: req.headers.authorization, body: Buffer.concat(chunks).toString() });
    if (response.status === 0) return;
    res.writeHead(response.status, {
      'content-type': response.type, 'x-provider-private': 'must be dropped',
      ...(response.location ? { location: response.location } : {}),
    });
    res.end(response.body);
  });
  const providerOrigin = await listen(provider);
  const fetchCalls: { url: string; redirect: string }[] = [];
  const broker = createBroker({
    providerOrigin,
    fetchImpl: (url: string, init: RequestInit) => {
      expect(new URL(url).origin).toBe(providerOrigin);
      fetchCalls.push({ url, redirect: init.redirect! });
      return fetch(url, init);
    },
    ...options,
  });
  const address = await broker.listen(0);
  expect(address.address).toBe('127.0.0.1');
  cleanup.push(() => new Promise<void>((resolve, reject) => {
    broker.server.closeAllConnections();
    broker.server.close((error: Error) => error ? reject(error) : resolve());
  }));
  const base = `http://127.0.0.1:${address.port}`;
  const agent = broker.registerAgent('trusted');
  async function call(path: string, init: RequestInit = {}, token = agent.token) {
    return fetch(base + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
  }
  async function submit(body: unknown = { operation: 'mock.echo', credential: 'openai' }) {
    const result = await call('/v1/requests', { method: 'POST', body: JSON.stringify(body) });
    expect(result.status).toBe(202);
    const request = await result.json();
    expect(request.id).toMatch(/^[a-f0-9]{32}$/);
    expect(request.status).toBe('pending');
    return request;
  }
  const approve = (request: { id: string }, overrides = {}) => broker.approve({
    id: request.id, agentId: agent.agentId, credential: 'openai', operation: 'mock.echo', secret: SECRET,
    ...overrides,
  });
  return { broker, agent, base, call, submit, approve, seen, response, fetchCalls };
}

describe('desktop per-use approval broker', () => {
  it('executes exactly the approved fixed operation and returns only a sanitized result', async () => {
    const w = await world();
    let changes = 0;
    const unsubscribe = w.broker.onChange(() => changes++);
    const pending = await w.submit();
    expect(w.seen).toEqual([]);
    expect(w.broker.listRequests()[0]).toMatchObject({
      agent: 'trusted', agentId: w.agent.agentId, credential: 'openai',
      description: 'POST /v1/mock on the mock provider (harmless echo)',
    });
    const completed = await w.approve(pending);
    expect(completed).toMatchObject({ status: 'completed', result: { status: 200, body: { echo: 'safe' } } });
    expect(w.seen).toEqual([{
      method: 'POST', path: '/v1/mock', authorization: `Bearer ${SECRET}`,
      body: '{"input":"keyshield-acceptance"}',
    }]);
    expect(w.fetchCalls).toHaveLength(1);
    expect(w.fetchCalls[0].redirect).toBe('manual');
    const response = await w.call(`/v1/requests/${pending.id}`);
    expect(await response.json()).toEqual(completed);
    expect([...response.headers.values()].join('')).not.toContain(SECRET);
    expect(JSON.stringify(completed)).not.toContain(SECRET);
    expect(JSON.stringify(completed)).not.toContain('must be dropped');
    expect(JSON.stringify(w.broker.audit())).not.toContain(SECRET);
    expect(JSON.stringify(w.broker.listAgents())).not.toContain(w.agent.token);
    expect(w.broker.audit().map((entry: { event: string }) => entry.event)).toEqual([
      'agent.registered', 'request.created', 'request.approved', 'request.completed',
    ]);
    expect(changes).toBe(3);
    unsubscribe();
    w.broker.registerAgent('second');
    expect(changes).toBe(3);
  });

  it.each(['deny', 'revokeRequest'])('%s is terminal with zero provider egress', async (action) => {
    const w = await world();
    const pending = await w.submit();
    w.broker[action](pending.id);
    expect(w.broker.listRequests()[0].status).toBe(action === 'deny' ? 'denied' : 'revoked');
    await expect(w.approve(pending)).rejects.toThrow('request_not_pending');
    expect(w.seen).toEqual([]);
    expect(w.fetchCalls).toEqual([]);
  });

  it('expires by timer and rejects late approval', async () => {
    const w = await world({ approvalTtlMs: 30 });
    const pending = await w.submit();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(w.broker.audit().some((entry: { event: string }) => entry.event === 'request.expired')).toBe(true);
    await expect(w.approve(pending)).rejects.toThrow('request_not_pending');
    expect(w.broker.listRequests()[0].status).toBe('expired');
    expect(w.fetchCalls).toEqual([]);
  });

  it('checks expiry at approval even before the timer fires', async () => {
    let clock = 100;
    const w = await world({ now: () => clock, approvalTtlMs: 60000 });
    const pending = await w.submit();
    expect(pending.expires_at).toBe(60100);
    clock = pending.expires_at;
    await expect(w.approve(pending)).rejects.toThrow('request_not_pending');
    expect(w.fetchCalls).toEqual([]);
  });

  it('immediately revokes agent authentication and its pending requests', async () => {
    const w = await world();
    const pending = await w.submit();
    w.broker.revokeAgent(w.agent.agentId);
    expect((await w.call(`/v1/requests/${pending.id}`)).status).toBe(401);
    expect(w.broker.listRequests()[0].status).toBe('revoked');
    await expect(w.approve(pending)).rejects.toThrow('request_not_pending');
    expect(w.fetchCalls).toEqual([]);
  });

  it('atomically consumes approval and rejects concurrent and later reuse', async () => {
    const w = await world();
    const pending = await w.submit();
    const first = w.approve(pending);
    await expect(w.approve(pending)).rejects.toThrow('request_not_pending');
    await expect(first).resolves.toMatchObject({ status: 'completed' });
    await expect(w.approve(pending)).rejects.toThrow('request_not_pending');
    expect(w.seen).toHaveLength(1);
  });

  it.each([
    { agentId: 'wrong' }, { credential: 'another-entry' }, { operation: 'another.operation' },
  ])('rejects approval binding mismatch %j', async (override) => {
    const w = await world();
    const pending = await w.submit();
    await expect(w.approve(pending, override)).rejects.toThrow('binding_mismatch');
    expect(w.broker.listRequests()[0].status).toBe('pending');
    expect(w.fetchCalls).toEqual([]);
  });

  it.each(['', null, 42])('rejects an empty or invalid secret %j', async (secret) => {
    const w = await world();
    const pending = await w.submit();
    await expect(w.approve(pending, { secret })).rejects.toThrow('secret_required');
    expect(w.fetchCalls).toEqual([]);
  });

  it.each(['url', 'command', 'headers', 'body', 'host', 'path', 'method'])('rejects unknown field %s', async (field) => {
    const w = await world();
    const response = await w.call('/v1/requests', {
      method: 'POST', body: JSON.stringify({ operation: 'mock.echo', credential: 'openai', [field]: 'untrusted' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unknown_field' });
    expect(w.broker.listRequests()).toEqual([]);
  });

  it.each([
    [{ operation: 'arbitrary', credential: 'openai' }, 'unknown_operation'],
    [{ operation: 'mock.echo', credential: '' }, 'invalid_credential'],
    [{ operation: 'mock.echo' }, 'invalid_credential'],
    [null, 'invalid_request'], [[], 'invalid_request'],
  ])('rejects malformed or unsupported request %j', async (body, error) => {
    const w = await world();
    const response = await w.call('/v1/requests', { method: 'POST', body: JSON.stringify(body) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(w.fetchCalls).toEqual([]);
  });

  it('requires JSON, limits request bytes and rejects invalid JSON', async () => {
    const w = await world();
    for (const [body, type, status, error] of [
      ['{}', 'text/plain', 400, 'json_required'],
      ['{', 'application/json', 400, 'invalid_json'],
      ['x'.repeat(4097), 'application/json', 413, 'body_too_large'],
    ] as const) {
      const response = await w.call('/v1/requests', { method: 'POST', body, headers: { 'Content-Type': type } });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    }
    expect(w.broker.listRequests()).toEqual([]);
  });

  it.each([
    'https://api.openai.com', 'https://evil.test.attacker.com', 'file:///etc/passwd',
    'http://127.0.0.1/path', 'http://localhost?query=1', 'https://api.provider.test/#hash',
    'http://user:password@localhost', 'not an origin',
  ])('disables the operation for invalid origin %s', async (providerOrigin) => {
    const w = await world({ providerOrigin });
    const response = await w.call('/v1/requests', { method: 'POST', body: JSON.stringify({ operation: 'mock.echo', credential: 'openai' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'operation_unavailable' });
    expect(w.fetchCalls).toEqual([]);
  });

  it.each(['http://localhost:9876', 'https://api.provider.test'])('accepts configured mock origin %s without network', async (providerOrigin) => {
    const w = await world({ providerOrigin });
    await w.submit();
    expect(w.fetchCalls).toEqual([]);
  });

  it('refuses redirects without contacting the redirect target', async () => {
    let targetHits = 0;
    const target = await listen(createServer((_req, res) => { targetHits++; res.end(); }));
    const w = await world();
    w.response.status = 307;
    w.response.location = `${target}/collect`;
    const pending = await w.submit();
    await expect(w.approve(pending)).resolves.toMatchObject({ status: 'failed', error: 'redirect_refused' });
    expect(w.seen).toHaveLength(1);
    expect(targetHits).toBe(0);
  });

  it.each(['raw', 'base64', 'url', 'escaped', 'non-json', 'invalid-json', 'oversized'])('rejects unsafe provider response %s', async (mode) => {
    const w = await world();
    const encoded = mode === 'base64' ? Buffer.from(SECRET).toString('base64') : mode === 'url' ? encodeURIComponent(SECRET) : SECRET;
    w.response.body = JSON.stringify({ leaked: encoded });
    if (mode === 'escaped') w.response.body = w.response.body.replaceAll('A', '\\u0041');
    if (mode === 'non-json') w.response.type = 'text/plain';
    if (mode === 'invalid-json') w.response.body = '{';
    if (mode === 'oversized') w.response.body = JSON.stringify({ data: 'x'.repeat(4096) });
    const pending = await w.submit();
    await expect(w.approve(pending)).resolves.toMatchObject({ status: 'failed', error: 'provider_response_rejected' });
    const agentResult = await (await w.call(`/v1/requests/${pending.id}`)).json();
    expect(agentResult.result).toBeUndefined();
    expect(JSON.stringify(agentResult)).not.toContain(encoded);
    expect(JSON.stringify(w.broker.audit())).not.toContain(SECRET);
  });

  it('times out a stalled provider after five seconds', async () => {
    const w = await world();
    w.response.status = 0;
    const pending = await w.submit();
    const started = Date.now();
    await expect(w.approve(pending)).resolves.toMatchObject({ status: 'failed' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(4900);
    expect(Date.now() - started).toBeLessThan(8000);
  });

  it('blocks browser origins and bad Host without CORS or state changes', async () => {
    const w = await world();
    const origin = await w.call('/v1/requests', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' });
    expect(origin.status).toBe(403);
    expect(origin.headers.get('access-control-allow-origin')).toBeNull();
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(w.base + '/v1/requests', {
        method: 'POST', headers: { Host: 'evil.test', Authorization: `Bearer ${w.agent.token}` },
      }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on('error', reject);
      req.end('{}');
    });
    expect(status).toBe(421);
    expect(w.broker.listRequests()).toEqual([]);
    expect(w.fetchCalls).toEqual([]);
  });

  it('requires authentication with no state changes', async () => {
    const w = await world();
    expect((await fetch(w.base + '/v1/requests')).status).toBe(401);
    expect((await w.call('/v1/requests', { method: 'POST', body: '{}' }, 'wrong')).status).toBe(401);
    expect(w.broker.listRequests()).toEqual([]);
    expect(w.broker.audit()).toHaveLength(1);
  });

  it('isolates request visibility and cancellation by creating agent', async () => {
    const w = await world();
    const pending = await w.submit();
    const other = w.broker.registerAgent('other');
    for (const method of ['GET', 'DELETE']) {
      expect((await w.call(`/v1/requests/${pending.id}`, { method }, other.token)).status).toBe(404);
    }
    const cancelled = await w.call(`/v1/requests/${pending.id}`, { method: 'DELETE' });
    expect((await cancelled.json()).status).toBe('cancelled');
    await expect(w.approve(pending)).rejects.toThrow('request_not_pending');
    expect(w.fetchCalls).toEqual([]);
  });

  it('has no HTTP approval, denial, agent management or arbitrary relay routes', async () => {
    const w = await world();
    const pending = await w.submit();
    for (const path of [`/v1/requests/${pending.id}/approve`, `/v1/requests/${pending.id}/deny`, '/v1/agents', '/proxy']) {
      expect((await w.call(path, { method: 'POST', body: '{}' })).status).toBe(404);
    }
    expect(w.broker.listRequests()[0].status).toBe('pending');
    expect(w.fetchCalls).toEqual([]);
  });
});
