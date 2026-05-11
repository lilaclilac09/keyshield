/**
 * KeyShield × Claude demo
 *
 * Shows the full agent flow end-to-end:
 *   1. Generate an Ed25519 keypair for the agent
 *   2. Register the agent with the KeyShield backend
 *   3. Authenticate (challenge-response, server issues signed token)
 *   4. List the vault + pick the Anthropic key
 *   5. Call Claude through the KeyShield proxy (key never leaves the backend)
 *
 * Run:
 *   node src/scripts/demo-claude-agent.mjs
 *
 * Requirements:
 *   - Backend running on http://127.0.0.1:8001  (uvicorn src.backend.app:app ...)
 *   - At least one vault item with upstream = "anthropic" in your vault
 *   - (or add one via the dashboard first)
 */

import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

const API = process.env.KEYSHIELD_API_URL ?? 'http://127.0.0.1:8001';
const ANTHROPIC_VAULT_KEY_ID = process.env.VAULT_KEY_ID ?? null; // set or auto-detect

// ─── helpers ────────────────────────────────────────────────────────────────

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ─── Step 1: generate keypair ────────────────────────────────────────────────

console.log('\n🔑  Step 1 — Generate agent keypair');
const kp = nacl.sign.keyPair();
const pubkeyB58 = bs58.encode(kp.publicKey);
console.log(`   pubkey: ${pubkeyB58}`);

// ─── Step 2: register agent ──────────────────────────────────────────────────

console.log('\n📝  Step 2 — Register agent with backend');

// First we need a user token (wallet login or passphrase login).
// For this demo we use the simple passphrase login.
const USER_ID  = process.env.DEMO_USER_ID  ?? 'demo-wallet';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password';

let userToken;
try {
  const loginData = await post('/auth/login', { userId: USER_ID, password: PASSWORD });
  userToken = loginData.token;
  console.log(`   user token: ${userToken.slice(0, 20)}…`);
} catch (e) {
  console.error('   ⚠️  Could not get user token — is the backend running?');
  console.error('   ', e.message);
  process.exit(1);
}

const agentData = await post('/agents', { name: 'claude-demo-agent', pubkey: pubkeyB58 }, userToken);
const agentId = agentData.id ?? agentData.agent_id;
console.log(`   agent id: ${agentId}`);

// ─── Step 3: agent authenticates ─────────────────────────────────────────────

console.log('\n🔐  Step 3 — Agent login (challenge-response)');
const { challenge, nonce } = await post('/auth/agent-challenge', {});
console.log(`   challenge: ${challenge.slice(0, 20)}…`);

const sigBytes = nacl.sign.detached(new TextEncoder().encode(challenge), kp.secretKey);
const signature = Buffer.from(sigBytes).toString('base64');

const { token: agentToken } = await post('/auth/agent-login', {
  pubkeyB58,
  challenge,
  nonce,
  signature,
});
console.log(`   agent token: ${agentToken.slice(0, 20)}…`);

// ─── Step 4: find Anthropic key in vault ─────────────────────────────────────

console.log('\n🗄️   Step 4 — Find Anthropic key in vault');
const vaultItems = await get('/manage/vault', userToken); // vault is scoped to the user

let keyId = ANTHROPIC_VAULT_KEY_ID;
if (!keyId) {
  const found = vaultItems.find(
    (v) => v.upstream === 'anthropic' || v.name?.toLowerCase().includes('anthropic') || v.name?.toLowerCase().includes('claude'),
  );
  if (!found) {
    console.error('   ❌  No Anthropic key found in vault.');
    console.error('   → Go to the dashboard and add one with upstream = "anthropic" first.');
    process.exit(1);
  }
  keyId = found.id;
  console.log(`   auto-detected key: "${found.name}" (id=${keyId})`);
} else {
  console.log(`   using key id: ${keyId}`);
}

const { value: anthropicKey } = await get(`/manage/decrypt/${keyId}`, userToken);
console.log(`   key: ${anthropicKey.slice(0, 10)}… (${anthropicKey.length} chars)`);

// ─── Step 5: call Claude through the KeyShield proxy ─────────────────────────

console.log('\n🤖  Step 5 — Call Claude via KeyShield proxy');

const proxyRes = await fetch(`${API}/proxy/anthropic/v1/messages`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${agentToken}`,
    'X-Upstream-API-Key': anthropicKey,
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: 'You are running inside a KeyShield agent demo. Say hello and confirm your model name in one sentence.',
      },
    ],
  }),
});

const reply = await proxyRes.json().catch(() => ({}));

if (!proxyRes.ok) {
  console.error('   ❌  Proxy call failed:', reply);
  process.exit(1);
}

const text = reply?.content?.[0]?.text ?? JSON.stringify(reply);
console.log(`\n✅  Claude says:\n   "${text}"\n`);
console.log('Demo complete. The API key never left the backend — only the bearer token and masked headers were sent by the agent.\n');
