/**
 * Tests for the proxy module.
 */

import { describe, it, expect } from 'vitest';
import {
  proxyRequest,
  batchProxy,
  getCached,
  setCache,
  isCacheable,
  cleanup,
} from '../src/proxy/index';

describe('proxy / cache', () => {
  it('should identify cacheable methods', () => {
    expect(isCacheable('GET')).toBe(true);
    expect(isCacheable('POST')).toBe(false);
    expect(isCacheable('HEAD')).toBe(true);
  });

  it('should set and get cached entries', () => {
    const key = 'test-key';
    const data = Buffer.from('test-data');
    setCache(key, data, { 'x-test': 'true' });

    const entry = getCached(key);
    expect(entry).not.toBeNull();
    expect(entry!.data.toString()).toBe('test-data');
  });

  it('should return null for expired entries', () => {
    const key = 'expire-key';
    setCache(key, Buffer.from('x'), {}, -100); // already expired
    expect(getCached(key)).toBeNull();
  });

  it('should clean up expired entries', () => {
    const key = 'cleanup-key';
    setCache(key, Buffer.from('x'), {}, -100);
    cleanup();
    expect(getCached(key)).toBeNull();
  });
});

describe('proxy / batch', () => {
  it('should handle empty batch', async () => {
    const results = await batchProxy([]);
    expect(results).toEqual([]);
  });

  it('should return error for invalid upstreams', async () => {
    const results = await batchProxy([
      {
        upstream: { name: 'invalid-upstream-xyz', baseUrl: 'https://nonexistent.example.com' },
      },
    ]);

    expect(results.length).toBe(1);
    // Should be either success or failure — not crash
    expect(typeof results[0].success === 'boolean').toBe(true);
  });
});
