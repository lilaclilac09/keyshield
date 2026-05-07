/**
 * @file api/server.ts — KeyShield v2 API server with Fastify.
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { storeKey, loadKey, listKeys, deleteKey, deleteVault } from '../vault/index';
import { createToken, getToken, verifyToken, getBalance, logCall, topupBalance, deleteAllForUser } from '../sessions/index';
import { registerWallet, loadWallet, generateEphemeralWallet, listWallets, purgeWallets } from '../wallet/index';
import { verifyOnChain, recordClaim, hasClaim, loadX402Config } from '../x402/index';
import { proxyRequest, batchProxy, isCacheable } from '../proxy/index';
import { fetchSolUsdPrice, findSolTransfer, findMemo, issueTopupMemo } from '../trading/index';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DEV_TOKEN = process.env.KS_TOKEN || randomBytes(16).toString('hex');

interface ServerInstance extends FastifyInstance {
  start(): Promise<void>;
}

function createServer(): ServerInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    bodyLimit: 1_000_000,
  }) as any;

  app.register(fastifyCors, { origin: true });
  app.register(fastifyHelmet);

  // Auth middleware
  const authenticate = async (request: any, reply: any) => {
    const authHeader = request.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/, '') || request.headers['x-api-key'] || DEV_TOKEN;

    const session = getToken(token);
    if (!session) {
      return reply.code(401).send({ error: 'invalid_or_expired_token' });
    }

    request.userId = session.userId;
    request.password = session.password;
    request.sessionToken = token;
  };

  app.decorate('authenticate', authenticate);

  // Auth routes
  app.post('/auth/login', {
    schema: { body: { type: 'object', required: ['userId', 'password'], properties: { userId: { type: 'string' }, password: { type: 'string' } } } },
  }, async (request: any, reply: any) => {
    const { userId, password } = request.body as { userId: string; password: string };
    const token = createToken(userId, password);
    return reply.code(200).send({ token, expiresAt: Date.now() / 1000 + 86400 });
  });

  app.post('/auth/logout', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const token = request.sessionToken;
    deleteAllForUser(request.userId);
    return reply.code(204).send();
  });

  app.post('/auth/delete-account', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    deleteVault(request.userId);
    return reply.code(204).send();
  });

  // Wallet routes
  app.post('/wallet/register', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const ephemeral = generateEphemeralWallet(request.userId);
    const { id } = registerWallet(request.userId, ephemeral.wallet.publicKey);
    return reply.code(201).send({ walletId: id, publicKey: ephemeral.wallet.publicKey, chain: ephemeral.wallet.chain });
  });

  app.get('/wallet/list', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const wallets = listWallets(request.userId);
    return reply.code(200).send({ wallets });
  });

  // Vault routes
  app.post('/manage/store', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const { upstream, apiKey } = request.body as { upstream: string; apiKey: string };
    storeKey(request.userId, upstream, apiKey, request.password);
    return reply.code(201).send({ success: true, upstream });
  });

  app.get('/manage/list-keys', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const keys = listKeys(request.userId);
    return reply.code(200).send({ keys });
  });

  app.delete('/manage/delete-key', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const { upstream } = request.body as { upstream: string };
    deleteKey(request.userId, upstream);
    return reply.code(204).send();
  });

  // Proxy routes
  app.post('/proxy/:upstream', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const upstream = request.params.upstream as string;
    const config: any = { baseUrl: '', apiKeyHeader: '' };

    const UPSTREAMS: Record<string, typeof config> = {
      openai:    { baseUrl: 'https://api.openai.com',     apiKeyHeader: 'Authorization' },
      anthropic: { baseUrl: 'https://api.anthropic.com',  apiKeyHeader: 'x-api-key' },
      groq:      { baseUrl: 'https://api.groq.com',       apiKeyHeader: 'x-api-key' },
      helius:    { baseUrl: 'https://mainnet.helius-rpc.com', apiKeyHeader: 'x-api-key' },
      '0x':      { baseUrl: 'https://api.0x.org',         apiKeyHeader: 'x-api-key' },
      pyth:      { baseUrl: 'https://hermes.pyth.network', apiKeyHeader: '' },
    };

    const upstreamConfig = UPSTREAMS[upstream] || { baseUrl: `https://${upstream}.com`, apiKeyHeader: '' };

    const response = await proxyRequest({ upstream: { name: upstream, ...upstreamConfig, keyType: 'self_custodian' }, method: request.method, headers: request.headers, body: request.body });

    logCall(request.userId, upstream, 'self_custodian', request.method, request.url, 0, 0, response.latencyMs * 0.001, response.status, 200);

    return reply.code(response.status).headers({ 'x-ks-latency': String(response.latencyMs), ...response.headers }).send(response.body);
  });

  app.post('/manage/batch', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const requests = (request.body as { requests: Array<{ upstream: string; method?: string; body?: unknown }> }).requests;
    const results = await Promise.all(requests.map(async (req: any) => {
      try {
        const response = await proxyRequest({ upstream: { name: req.upstream, baseUrl: `https://${req.upstream}.com`, keyType: 'self_custodian' }, method: req.method, body: req.body });
        return { success: true, upstream: req.upstream, status: response.status };
      } catch (err) {
        return { success: false, upstream: req.upstream, error: err instanceof Error ? err.message : 'Unknown' };
      }
    }));
    return reply.code(200).send({ results });
  });

  // Billing
  app.post('/billing/topup', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const { amountUsd } = request.body as { amountUsd: number };
    return reply.code(200).send({ balance: topupBalance(request.userId, amountUsd) });
  });

  app.get('/billing/balance', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    return reply.code(200).send({ balance: getBalance(request.userId) });
  });

  // Trading
  app.get('/trading/sol-usd', async (request: any, reply: any) => {
    const price = await fetchSolUsdPrice();
    return reply.code(200).send({ ...price, fetchedAt: Date.now() / 1000 });
  });

  app.post('/trading/topup-memo', { preValidation: [app.authenticate] }, async (request: any, reply: any) => {
    const memo = issueTopupMemo(request.userId);
    return reply.code(200).send({ memo });
  });

  // x402
  app.post('/x402/verify', async (request: any, reply: any) => {
    const config = loadX402Config();
    const { paymentProof, amountUsd } = request.body as { paymentProof: string; amountUsd: number };
    return reply.code(200).send(await verifyOnChain(config, paymentProof, amountUsd || 10));
  });

  app.post('/x402/claim', async (request: any, reply: any) => {
    const { userId, paymentProof, amountUsd } = request.body as { userId: string; paymentProof: string; amountUsd: number };
    if (hasClaim(paymentProof)) return reply.code(409).send({ error: 'duplicate_claim' });
    recordClaim(paymentProof, userId, amountUsd, 'stub-fallback');
    topupBalance(userId, amountUsd);
    return reply.code(201).send({ claimed: true });
  });

  // Health
  app.get('/health', async () => ({ status: 'ok' }));

  const start = async () => {
    try {
      await app.listen({ port: PORT, host: HOST });
      console.log(`KeyShield v2 listening on http://${HOST}:${PORT}`);
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  };

  (app as ServerInstance).start = start;
  return app as ServerInstance;
}

if ((require as any).main === module) {
  const app = createServer();
  app.start();
}

export { createServer };
