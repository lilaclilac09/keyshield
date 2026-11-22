import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MobileSyncBoundary, PairedSyncUnsupported, SyncHttpError, type VaultCipher } from '../src/mobile/src/sync/boundary';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const workerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = workerRequire('miniflare');
const { build } = workerRequire('esbuild');
const state = resolve(process.env.KS_MOBILE_ROLLOUT_STATE ?? join(homedir(), 'keyshield-mobile-rollout', `${Date.now()}-${process.pid}`));
mkdirSync(state, { recursive: true });
const secret = 'synthetic-loopback-only-hmac-secret-not-a-credential';
const issuer = 'synthetic-mobile-rollout';
const cipher: VaultCipher = { version: 1, iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==', updatedAt: 100 };
const changed: VaultCipher = { ...cipher, ciphertext: 'AQEBAQEBAQEBAQEBAQEBAQ==' };

function token(id: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: id, iss: issuer, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
}

async function worker(name: string, revision: string, port: number) {
  const tree = join(state, name);
  execFileSync('git', ['worktree', 'add', '--detach', tree, revision], { cwd: root, stdio: 'pipe' });
  symlinkSync(join(root, 'node_modules'), join(tree, 'node_modules'), 'dir');
  const scriptPath = join(state, `${name}.mjs`);
  await build({
    entryPoints: [join(tree, 'src/infra/sync-worker/src/index.ts')], outfile: scriptPath,
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', conditions: ['workerd', 'worker', 'browser'],
    external: ['node:*'], alias: { 'cross-fetch': require.resolve('cross-fetch/dist/browser-ponyfill.js') }, logLevel: 'silent',
  });
  const runtime = new Miniflare({
    scriptPath, modulesRoot: state, modules: true, compatibilityDate: '2024-12-30', compatibilityFlags: ['nodejs_compat'],
    host: '127.0.0.1', port, cf: false,
    bindings: { JWT_SECRET: secret, JWT_ISSUER: issuer, MAX_VAULT_BYTES: '65536' },
    r2Buckets: ['VAULTS', 'REGISTRY'], r2Persist: join(state, `${name}-r2`),
  });
  await runtime.ready;
  return { runtime, url: `http://127.0.0.1:${port}`, bucket: await runtime.getR2Bucket('VAULTS') };
}

type Worker = Awaited<ReturnType<typeof worker>>;
function client(server: Worker, id: string, now = 200) {
  const requests: { method: string; base: string | null }[] = [];
  const sync = new MobileSyncBoundary({
    baseUrl: server.url, getToken: () => token(id), now: () => now,
    fetchImpl: async (url, options) => {
      assert.equal(new URL(String(url)).origin, server.url);
      requests.push({ method: options!.method!, base: new Headers(options!.headers).get('X-Vault-Base-Revision') });
      return fetch(url, options);
    },
  });
  return { sync, requests };
}

async function snapshot(server: Worker, id: string) {
  const obj = await server.bucket.get(id);
  return obj ? Buffer.from(await obj.arrayBuffer()).toString('base64') : null;
}

// Simulation of historical headerless HTTP requests, not execution of an old RN build.
function headerless(server: Worker, id: string, method: string, body?: VaultCipher) {
  return fetch(`${server.url}/vault/${id}`, {
    method, headers: { Authorization: `Bearer ${token(id)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const runtimes: Worker[] = [];
try {
  assert.ok(existsSync(join(root, 'node_modules')), 'Install workspace dependencies before running the harness.');
  const old = await worker('old-worker', '9d9ebde9', Number(process.env.KS_MOBILE_OLD_PORT ?? 18878));
  runtimes.push(old);
  const current = await worker('cas-worker', '9c0070ca', Number(process.env.KS_MOBILE_CAS_PORT ?? 18879));
  runtimes.push(current);

  const a = client(old, 'synthetic-stage-a');
  await a.sync.pull('synthetic-stage-a');
  await a.sync.push('synthetic-stage-a', cipher);
  assert.equal(a.requests[1].base, 'none');
  await a.sync.push('synthetic-stage-a', changed);
  await a.sync.remove('synthetic-stage-a');
  assert.equal((await headerless(old, 'synthetic-stage-a', 'GET')).status, 404);
  const preflight = await fetch(`${old.url}/vault/synthetic-stage-a`, {
    method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'X-Vault-Base-Revision' },
  });
  assert.ok(!preflight.headers.get('Access-Control-Allow-Headers')?.toLowerCase().includes('x-vault-base-revision'));
  console.log('A observed: old worker + new native-style client accepts PUT/DELETE headers; browser preflight does not allow the new header. Old worker still provides no CAS guarantee.');

  const id = 'synthetic-stage-b';
  const b = client(current, id);
  await b.sync.pull(id);
  await b.sync.push(id, cipher);
  const before = await snapshot(current, id);
  for (const method of ['PUT', 'DELETE']) {
    assert.equal((await headerless(current, id, method, method === 'PUT' ? changed : undefined)).status, 428);
    assert.equal(await snapshot(current, id), before);
  }
  assert.equal((await headerless(current, id, 'GET')).status, 200);
  for (const bad of ['', '-1', '1.5', 'unknown']) {
    const res = await fetch(`${current.url}/vault/${id}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token(id)}`, 'Content-Type': 'application/json', 'X-Vault-Base-Revision': bad }, body: JSON.stringify(changed),
    });
    assert.equal(res.status, 428);
    assert.equal(await snapshot(current, id), before);
  }
  console.log('B simulated old code: historical headerless PUT/DELETE each return 428 from real CAS worker; raw R2 snapshots unchanged; GET 200. Malformed bases also return 428 without changes.');

  for (const operation of ['save', 'entry-delete', 'whole-vault-delete']) {
    const id = `synthetic-stage-c-${operation}`;
    const first = client(current, id, 1000);
    const stale = client(current, id, 1100);
    await first.sync.pull(id);
    await first.sync.push(id, cipher);
    assert.equal(first.requests[1].base, 'none');
    await stale.sync.pull(id);
    await first.sync.push(id, changed);
    const confirmed = stale.sync.cached(id);
    const stored = await snapshot(current, id);
    const count = stale.requests.length;
    const mutate = () => operation === 'whole-vault-delete' ? stale.sync.remove(id) : stale.sync.push(id, changed);
    await assert.rejects(mutate, (e: unknown) => e instanceof SyncHttpError && e.status === 409);
    assert.equal(stale.requests.length, count + 1);
    assert.deepEqual(stale.sync.cached(id), confirmed);
    assert.equal(await snapshot(current, id), stored);
    await stale.sync.pull(id);
    await mutate();
    if (operation === 'whole-vault-delete') {
      assert.equal((await headerless(current, id, 'GET')).status, 404);
      assert.equal(stale.sync.cached(id), null);
    } else {
      assert.equal(stale.sync.revision(id), 1100);
    }
    console.log(`C observed: ${operation}: create none; stale request exactly once -> 409; ciphertext cache/base/storage unchanged; explicit refresh then retry succeeds.`);
  }
  const paired = client(current, 'synthetic-paired');
  await assert.rejects(() => paired.sync.pushPair('daily', 'recovery', cipher), PairedSyncUnsupported);
  await assert.rejects(() => paired.sync.removePair('daily', 'recovery'), PairedSyncUnsupported);
  assert.equal(paired.requests.length, 0);
  console.log('C observed: paired writes/deletes disabled before either request (0 requests).');
  console.log('Missing build: RN app, Hermes, iOS and Android were not built or exercised; these are ciphertext boundary + loopback worker checks only.');
  console.log(`PASS: isolated rollout artifacts: ${state}`);
} finally {
  await Promise.all(runtimes.map(({ runtime }) => runtime.dispose()));
}
