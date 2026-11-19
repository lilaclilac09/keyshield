'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const LIMIT = 4096;
const DESCRIPTION = 'POST /v1/mock on the mock provider (harmless echo)';

// Agents, requests and audit history are memory-only and disappear on restart.
function createBroker({
  providerOrigin = process.env.KS_BROKER_MOCK_PROVIDER_ORIGIN,
  approvalTtlMs = Number(process.env.KS_BROKER_APPROVAL_TTL_MS || 60000),
  now = Date.now,
  fetchImpl = fetch,
  randomBytes = crypto.randomBytes,
} = {}) {
  if (!Number.isFinite(approvalTtlMs) || approvalTtlMs <= 0) {
    throw new Error('invalid_approval_ttl');
  }
  let origin;
  try {
    const url = new URL(providerOrigin);
    if (
      typeof providerOrigin === 'string' && /^[a-z]+:\/\/[^/?#]+\/?$/i.test(providerOrigin) &&
      ['http:', 'https:'].includes(url.protocol) &&
      (['127.0.0.1', 'localhost'].includes(url.hostname) || url.hostname.endsWith('.test')) &&
      url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
    ) origin = url.origin;
  } catch {}

  const agents = new Map();
  const requests = new Map();
  const timers = new Map();
  const listeners = new Set();
  const history = [];
  const hash = (value) => crypto.createHash('sha256').update(value).digest();
  const id = () => randomBytes(16).toString('hex');
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function record(event, request, agent, result = null) {
    history.push({
      time: now(), event, request_id: request?.id || null,
      agent: agent?.name || null, credential: request?.credential || null,
      operation: request?.operation || null, result,
    });
    for (const cb of listeners) {
      try { cb(); } catch {}
    }
  }

  function transition(request, status, error) {
    clearTimeout(timers.get(request.id));
    timers.delete(request.id);
    request.status = status;
    request.updated_at = now();
    if (error) request.error = error;
    const event = status === 'executing' ? 'approved' : status;
    record(`request.${event}`, request, agents.get(request.agentId), status);
  }

  function expire(request) {
    if (request.status === 'pending' && now() >= request.expires_at) {
      transition(request, 'expired');
    }
  }

  function scheduleExpiry(request) {
    const timer = setTimeout(() => {
      expire(request);
      if (request.status === 'pending') scheduleExpiry(request);
    }, Math.min(Math.max(1, request.expires_at - now()), 2147483647));
    timer.unref();
    timers.set(request.id, timer);
  }

  function pending(requestId) {
    const request = requests.get(requestId);
    if (!request) throw new Error('request_not_found');
    expire(request);
    if (request.status !== 'pending') throw new Error('request_not_pending');
    return request;
  }

  function view(request) {
    const { id, status, operation, credential, expires_at, result, error } = request;
    return copy({ id, status, operation, credential, expires_at, result, error });
  }

  function authenticate(req) {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const supplied = hash(match?.[1] || '');
    let found;
    for (const agent of agents.values()) {
      const matches = crypto.timingSafeEqual(supplied, agent.tokenHash);
      if (matches && match && !agent.revoked) found = agent;
    }
    return found;
  }

  function json(res, status, value) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  }

  async function readJson(req) {
    if (!(req.headers['content-type'] || '').toLowerCase().match(/^application\/json(?:\s*;|$)/)) {
      throw new Error('json_required');
    }
    return new Promise((resolve, reject) => {
      let length = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        length += chunk.length;
        if (length > LIMIT) return reject(new Error('body_too_large'));
        chunks.push(chunk);
      });
      req.on('error', () => reject(new Error('invalid_json')));
      req.on('end', () => {
        if (length > LIMIT) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('invalid_json')); }
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    const port = server.address()?.port;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
      return json(res, 421, { error: 'invalid_host' });
    }
    if (req.headers.origin !== undefined) return json(res, 403, { error: 'origin_refused' });
    const agent = authenticate(req);
    if (!agent) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST' && req.url === '/v1/requests') {
      let body;
      try { body = await readJson(req); }
      catch (error) {
        return json(res, error.message === 'body_too_large' ? 413 : 400, { error: error.message });
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json(res, 400, { error: 'invalid_request' });
      }
      if (Object.keys(body).some((key) => !['operation', 'credential'].includes(key))) {
        return json(res, 400, { error: 'unknown_field' });
      }
      if (body.operation !== 'mock.echo') return json(res, 400, { error: 'unknown_operation' });
      if (!origin) return json(res, 400, { error: 'operation_unavailable' });
      if (typeof body.credential !== 'string' || !body.credential.trim()) {
        return json(res, 400, { error: 'invalid_credential' });
      }
      const created = now();
      const request = {
        id: id(), agentId: agent.agentId, operation: body.operation, credential: body.credential,
        status: 'pending', created_at: created, updated_at: created,
        expires_at: created + approvalTtlMs,
      };
      requests.set(request.id, request);
      scheduleExpiry(request);
      record('request.created', request, agent);
      return json(res, 202, view(request));
    }
    const match = /^\/v1\/requests\/([a-f0-9]{32})$/.exec(req.url);
    if (match && ['GET', 'DELETE'].includes(req.method)) {
      const request = requests.get(match[1]);
      if (!request || request.agentId !== agent.agentId) {
        return json(res, 404, { error: 'not_found' });
      }
      expire(request);
      if (req.method === 'DELETE') {
        if (request.status !== 'pending') return json(res, 409, { error: 'request_not_pending' });
        transition(request, 'cancelled');
      }
      return json(res, 200, view(request));
    }
    return json(res, 404, { error: 'not_found' });
  });
  server.on('close', () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });

  async function approve({ id, agentId, credential, operation, secret }) {
    const request = pending(id);
    if (request.agentId !== agentId || request.credential !== credential || request.operation !== operation) {
      throw new Error('binding_mismatch');
    }
    if (typeof secret !== 'string' || !secret.trim()) throw new Error('secret_required');
    transition(request, 'executing');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchImpl(`${origin}/v1/mock`, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'keyshield-acceptance' }),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        transition(request, 'failed', 'redirect_refused');
        return view(request);
      }
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel();
        transition(request, 'failed', 'provider_response_rejected');
        return view(request);
      }
      const reader = response.body?.getReader();
      let size = 0;
      const chunks = [];
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > LIMIT) {
            await reader.cancel();
            throw new Error('provider_response_rejected');
          }
          chunks.push(Buffer.from(value));
        }
      }
      const text = Buffer.concat(chunks).toString('utf8');
      const body = JSON.parse(text);
      const representations = [secret, Buffer.from(secret).toString('base64'), encodeURIComponent(secret)];
      if (representations.some((value) => text.includes(value) || JSON.stringify(body).includes(value)) ||
          text.toLowerCase().includes(encodeURIComponent(secret).toLowerCase())) {
        transition(request, 'failed', 'provider_response_rejected');
        return view(request);
      }
      request.result = { status: response.status, body };
      transition(request, 'completed');
    } catch {
      transition(request, 'failed', 'provider_response_rejected');
    } finally {
      clearTimeout(timeout);
    }
    return view(request);
  }

  return {
    server,
    listen(port = Number(process.env.KS_BROKER_PORT || 8790)) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      });
    },
    registerAgent(name) {
      if (typeof name !== 'string' || !name.trim()) throw new Error('name_required');
      const agentId = id();
      const token = randomBytes(32).toString('hex');
      const agent = { agentId, name, tokenHash: hash(token), revoked: false };
      agents.set(agentId, agent);
      record('agent.registered', null, agent);
      return { agentId, name, token };
    },
    listAgents() {
      return [...agents.values()].map(({ agentId, name, revoked }) => ({ agentId, name, revoked }));
    },
    revokeAgent(agentId) {
      const agent = agents.get(agentId);
      if (!agent) throw new Error('agent_not_found');
      if (agent.revoked) return;
      agent.revoked = true;
      for (const request of requests.values()) {
        if (request.agentId === agentId) {
          expire(request);
          if (request.status === 'pending') transition(request, 'revoked');
        }
      }
      record('agent.revoked', null, agent);
    },
    listRequests() {
      return [...requests.values()].map((request) => {
        expire(request);
        return copy({
          ...view(request), agentId: request.agentId, agent: agents.get(request.agentId).name,
          description: DESCRIPTION, created_at: request.created_at, updated_at: request.updated_at,
        });
      });
    },
    deny(requestId) { transition(pending(requestId), 'denied'); },
    revokeRequest(requestId) { transition(pending(requestId), 'revoked'); },
    approve,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    audit() { return copy(history); },
  };
}

module.exports = { createBroker };
