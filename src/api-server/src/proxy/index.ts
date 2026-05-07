/**
 * @file proxy/index.ts — Upstream proxy with connection pooling and batch routing.
 */

import * as http from 'http';
import * as https from 'https';
import { randomBytes } from 'crypto';
import type { UpstreamConfig } from '../types/index';

// ─── Connection pool ────────────────────────────────────────────────────

interface PoolEntry {
  agent: http.Agent | https.Agent;
  refCount: number;
}

const _POOLS = new Map<string, PoolEntry>();
const POOL_TTL = 5 * 60 * 1000; // 5 minutes idle before cleanup

function getPool(baseUrl: string): PoolEntry {
  const existing = _POOLS.get(baseUrl);
  if (existing) {
    existing.refCount++;
    return existing;
  }

  const parsed = new URL(baseUrl);
  const agent = parsed.protocol === 'https:'
    ? new https.Agent({ keepAlive: true, maxSockets: 50 })
    : new http.Agent({ keepAlive: true, maxSockets: 50 });

  _POOLS.set(baseUrl, { agent, refCount: 1 });

  setTimeout(() => {
    const entry = _POOLS.get(baseUrl);
    if (entry && --entry.refCount <= 0) {
      agent.destroy();
      _POOLS.delete(baseUrl);
    }
  }, POOL_TTL).unref();

  return _POOLS.get(baseUrl)!;
}

// ─── Proxy request ──────────────────────────────────────────────────────

export interface ProxyOptions {
  upstream: UpstreamConfig;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  latencyMs: number;
}

export async function proxyRequest(options: ProxyOptions): Promise<ProxyResponse> {
  const { upstream, method = 'GET', headers: extraHeaders = {}, body, timeoutMs = 30_000 } = options;

  const parsed = new URL(upstream.baseUrl);
  const pool = getPool(upstream.baseUrl);

  return new Promise<ProxyResponse>((resolve, reject) => {
    const startTime = Date.now();
    const reqHeaders: Record<string, string> = { ...extraHeaders };

    // Inject API key
    const apiKey = process.env[`UPSTREAM_KEY_${upstream.name.toUpperCase()}`] || '';
    if (upstream.apiKeyHeader && apiKey) {
      reqHeaders[upstream.apiKeyHeader] = apiKey;
    }

    const req = (parsed.protocol === 'https:' ? https : http).request({
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        ...reqHeaders,
        'Content-Type': body ? 'application/json' : undefined,
        'Host': parsed.host,
      },
      agent: pool.agent,
      timeout: timeoutMs,
    });

    req.on('error', (err) => {
      reject(Object.assign(err, { latencyMs: Date.now() - startTime }));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to ${upstream.name} timed out after ${timeoutMs}ms`));
    });

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(bodyStr);
    }

    req.end();

    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const maxBody = 10 * 1024 * 1024;

      res.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxBody) {
          req.destroy();
          return reject(new Error(`Response body exceeded ${maxBody} bytes`));
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const latency = Date.now() - startTime;
        resolve({
          status: res.statusCode || 500,
          headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, v || ''])) as Record<string, string>,
          body: Buffer.concat(chunks),
          latencyMs: latency,
        });
      });
    });
  });
}

// ─── Batch proxy ────────────────────────────────────────────────────────

export interface BatchRequest {
  upstream: UpstreamConfig;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface BatchResponse {
  success: boolean;
  upstream: string;
  status?: number;
  body?: Buffer;
  error?: string;
}

export async function batchProxy(requests: BatchRequest[]): Promise<BatchResponse[]> {
  const results = await Promise.allSettled(
    requests.map(async (req) => {
      try {
        const response = await proxyRequest(req);
        return { success: true, upstream: req.upstream.name, status: response.status, body: response.body };
      } catch (err) {
        return { success: false, upstream: req.upstream.name, error: err instanceof Error ? err.message : 'Unknown' };
      }
    }),
  );

  return results.map((r): BatchResponse => {
    if ((r as PromiseFulfilledResult<BatchResponse>).status === 'fulfilled') return (r as PromiseFulfilledResult<BatchResponse>).value;
    const idx = results.indexOf(r);
    const settled = r as PromiseRejectedResult;
    return { success: false, upstream: requests[idx].upstream.name, error: settled.reason instanceof Error ? settled.reason.message : 'Unknown' };
  });
}

// ─── Cache layer ────────────────────────────────────────────────────────

interface CacheEntry {
  data: Buffer;
  headers: Record<string, string>;
  expiresAt: number;
}

const _CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

export function getCacheKey(method: string, uri: string): string {
  return `${method}:${uri}`;
}

export function getCached(key: string): CacheEntry | null {
  const entry = _CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    _CACHE.delete(key);
    return null;
  }
  return entry;
}

export function setCache(key: string, data: Buffer, headers: Record<string, string>, ttlMs = CACHE_TTL): void {
  _CACHE.set(key, { data, headers, expiresAt: Date.now() + ttlMs });
}

const CACHEABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isCacheable(method: string): boolean {
  return CACHEABLE_METHODS.has(method);
}

export function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of _CACHE.entries()) {
    if (entry.expiresAt < now) _CACHE.delete(key);
  }
}

setInterval(cleanup, 60_000).unref();
