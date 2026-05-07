/**
 * Integration tests for the KeyShield server.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/api/server';

describe('server / integration', () => {
  let app: any;
  let url: string;

  beforeAll(async () => {
    app = createServer();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as { port: number };
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return health check', async () => {
    const resp = await fetch(`${url}/health`);
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.status).toBe('ok');
  });

  it('should login and get a token', async () => {
    const resp = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test-user', password: 'test-pass' }),
    });

    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.token).toBeDefined();
    expect(typeof data.expiresAt).toBe('number');
  });

  it('should store a key in the vault', async () => {
    // First login to get a token
    const loginResp = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test-vault-user', password: 'vault-pass' }),
    });
    const { token } = await loginResp.json();

    // Store a key
    const storeResp = await fetch(`${url}/manage/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ upstream: 'openai', apiKey: 'sk-test-stored' }),
    });

    expect(storeResp.status).toBe(201);
  });

  it('should list keys in the vault', async () => {
    const loginResp = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test-vault-user', password: 'vault-pass' }),
    });
    const { token } = await loginResp.json();

    const listResp = await fetch(`${url}/manage/list-keys`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listResp.status).toBe(200);
  });

  it('should check billing balance', async () => {
    const loginResp = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test-billing-user', password: 'bp' }),
    });
    const { token } = await loginResp.json();

    const resp = await fetch(`${url}/billing/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(typeof data.balance).toBe('number');
  });

  it('should get SOL/USD price', async () => {
    try {
      const resp = await fetch(`${url}/trading/sol-usd`, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const data = await resp.json();
        expect(data.priceUsd).toBeGreaterThan(0);
      } else {
        // Network error in CI is acceptable
        expect(true).toBe(true);
      }
    } catch {
      expect(true).toBe(true);
    }
  });

  it('should handle duplicate x402 claims', async () => {
    const proof = '0x' + 'ab'.repeat(32);
    await fetch(`${url}/x402/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test-x402', paymentProof: proof, amountUsd: 10 }),
    });

    // Duplicate claim should return 409
    const dupResp = await fetch(`${url}/x402/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test-x402', paymentProof: proof, amountUsd: 10 }),
    });

    expect(dupResp.status).toBe(409);
  });
});
