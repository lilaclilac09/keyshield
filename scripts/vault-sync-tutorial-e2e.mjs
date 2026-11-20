import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { setTimeout } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerRoot = process.env.KS_ACCEPTANCE_WORKER_ROOT;
if (!workerRoot) throw new Error('Set KS_ACCEPTANCE_WORKER_ROOT to a separate PR156 worker worktree.');
const origin = 'http://localhost:5176';
const stateRoot = path.join(homedir(), '.local/state/keyshield-mac-renderer-e2e');
await mkdir(stateRoot, { recursive: true });
const state = await mkdtemp(path.join(stateRoot, 'run-'));
const children = [];
const env = {
  ...process.env,
  PYTHONPATH: root,
  KS_DATA_DIR: state,
  SERVER_SECRET: randomBytes(32).toString('hex'),
  INTERNAL_SECRET: randomBytes(32).toString('hex'),
  KS_RP_ID: 'localhost',
  KS_ORIGIN: origin,
  RP_ORIGIN: origin,
  KS_CORS_ORIGINS: origin,
  KEYSHIELD_API_URL: 'http://localhost:8004',
  KEYSHIELD_SYNC_URL: `${origin}/__sync`,
  KEYSHIELD_PUBLIC_API_BASE: 'http://localhost:8004',
  KEYSHIELD_PUBLIC_SYNC_URL: `${origin}/__sync`,
  PW_USE_EXTERNAL_SERVER: '1',
  PW_PORT: '5176',
  PW_BASE_URL: origin,
  PW_VAULT_TUTORIAL: '1',
};

function start(name, command, args, cwd) {
  const log = createWriteStream(path.join(state, `${name}.log`));
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('error', error => log.write(String(error)));
  children.push(child);
  return child;
}

async function unused(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, () => server.close(resolve));
  });
}

async function ready(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${url}; logs: ${state}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* Real servers are still starting. */ }
    await setTimeout(250);
  }
  throw new Error(`Server not ready: ${url}; logs: ${state}`);
}

function stop() {
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  }
}
process.once('SIGINT', () => { stop(); process.exit(130); });
process.once('SIGTERM', () => { stop(); process.exit(143); });

try {
  await Promise.all([5176, 8790, 8004].map(unused));
  console.log(`Real local stack; isolated state and service logs: ${state}`);
  const backend = start('backend', process.env.PYTHON ?? 'python3', [
    '-m', 'uvicorn', 'src.backend.app:app', '--host', '127.0.0.1', '--port', '8004',
  ], state);
  const worker = start('worker', process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local',
    '--ip', '127.0.0.1', '--port', '8790', '--persist-to', path.join(state, 'worker'),
    // Installed Wrangler 3 uses this runtime date; production config is untouched.
    '--compatibility-date', '2024-12-30',
    '--var', `JWT_SECRET:${randomBytes(32).toString('hex')}`,
    '--var', 'RP_ID:localhost', '--var', `RP_ORIGIN:${origin}`,
  ], path.join(workerRoot, 'src/infra/sync-worker'));
  const dashboard = start('dashboard', process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', '5176', '--strictPort', '--config', path.join(root, 'tests/e2e/vault-sync.vite.config.ts'),
  ], path.join(root, 'src/web'));
  await Promise.all([
    ready('http://127.0.0.1:8004/health', backend),
    ready('http://127.0.0.1:8790/health', worker),
    ready(`${origin}/`, dashboard),
  ]);
  const test = spawn(process.execPath, [
    path.join(root, 'node_modules/@playwright/test/cli.js'), 'test',
    'tests/e2e/vault-sync-tutorial.spec.ts', 'tests/e2e/vault-sync-failure-state.spec.ts', '--workers=2', '--retries=0', '--reporter=line', ...process.argv.slice(2),
  ], { cwd: root, env, stdio: 'inherit' });
  process.exitCode = await new Promise(resolve => test.once('exit', code => resolve(code ?? 1)));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stop();
}
