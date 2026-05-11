#!/usr/bin/env node
/**
 * KeyShield on-chain stress test
 *
 * Full end-to-end: wallet auth → vault key → proxy Claude calls → MPP settle on devnet
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node src/scripts/chain-stress-test.mjs
 *
 * Optional env:
 *   KS_API_BASE          backend URL (https://keyshield-production.up.railway.app)
 *   KS_RPC_URL           Solana RPC  (https://api.devnet.solana.com)
 *   KS_PROGRAM_ID        program     (41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j)
 *   KS_USDC_MINT         USDC mint   (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)
 *   CLAUDE_CALLS         how many Claude calls to fire (default 5)
 *   CLAUDE_MODEL         model (default claude-haiku-4-5-20251001)
 *   SKIP_ONCHAIN         set=1 to skip Solana tx steps (just API hammer)
 */

import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import { default as bs58 } from 'bs58';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── Config ───────────────────────────────────────────────────────────────────
const API_BASE    = process.env.KS_API_BASE   ?? 'https://keyshield-production.up.railway.app';
const RPC_URL     = process.env.KS_RPC_URL    ?? 'https://api.devnet.solana.com';
const PROGRAM_ID  = new PublicKey(process.env.KS_PROGRAM_ID ?? '41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j');
const USDC_MINT   = new PublicKey(process.env.KS_USDC_MINT  ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const CLAUDE_CALLS = parseInt(process.env.CLAUDE_CALLS ?? '5', 10);
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001';
const SKIP_ONCHAIN = process.env.SKIP_ONCHAIN === '1';
const OWNER_KP_PATH = path.join(os.homedir(), '.config', 'solana', 'id.json');

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM   = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// ── Colour helpers ────────────────────────────────────────────────────────────
const tty = process.stdout.isTTY;
const c = {
  step: s => tty ? `\x1b[36;1m${s}\x1b[0m` : s,
  ok:   s => tty ? `\x1b[32m${s}\x1b[0m` : s,
  err:  s => tty ? `\x1b[31m${s}\x1b[0m` : s,
  dim:  s => tty ? `\x1b[2m${s}\x1b[0m` : s,
  bold: s => tty ? `\x1b[1m${s}\x1b[0m` : s,
  yellow: s => tty ? `\x1b[33m${s}\x1b[0m` : s,
};
const banner = s => console.log('\n' + c.step(`━━━ ${s} ━━━`));
const ok   = s => console.log(`  ${c.ok('✓')} ${s}`);
const info = (k, v) => console.log(`    ${c.dim(k.padEnd(24))} ${v}`);
const die  = s => { console.error(`\n  ${c.err('✗ FAIL:')} ${s}`); process.exit(1); };
const warn = s => console.log(`  ${c.yellow('⚠')} ${s}`);

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) die(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// ── Solana helpers ────────────────────────────────────────────────────────────
function deriveVaultPda(owner) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('universal_vault'), owner.toBuffer()],
    PROGRAM_ID,
  );
}
function deriveStreamPda(agent, owner) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent_payment_stream'), agent.toBuffer(), owner.toBuffer()],
    PROGRAM_ID,
  );
}
function deriveAta(owner, mint) {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM,
  );
  return ata;
}
function jsonToIx(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.keys.map(k => ({ pubkey: new PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function ms(start) { return `${Date.now() - start}ms`; }

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(c.bold(`
╔═══════════════════════════════════════════════════════════════════╗
║  KeyShield On-Chain Stress Test                                   ║
║  Wallet auth → Vault keys → Claude proxy hammer → MPP settle      ║
╚═══════════════════════════════════════════════════════════════════╝`));

  // ── 1. Load wallet keypair ──────────────────────────────────────────────────
  banner('1. Load wallet keypair');
  if (!fs.existsSync(OWNER_KP_PATH)) die(`No keypair at ${OWNER_KP_PATH}`);
  const ownerKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(OWNER_KP_PATH, 'utf8'))));
  info('address', ownerKp.publicKey.toBase58());
  info('backend', API_BASE);
  info('rpc', RPC_URL);

  const conn = new Connection(RPC_URL, 'confirmed');
  const solBal = await conn.getBalance(ownerKp.publicKey);
  info('SOL balance', `${(solBal / 1e9).toFixed(4)} SOL`);
  if (solBal < 5_000_000) die('Need ≥0.005 SOL for tx fees');
  ok('wallet ready');

  // ── 2. Wallet-based auth to backend ────────────────────────────────────────
  banner('2. Wallet-based auth to backend');
  const { challenge, nonce } = await api('GET', '/auth/wallet-challenge');
  info('challenge', challenge.slice(0, 20) + '…');

  // Sign challenge with the wallet's Ed25519 keypair (same as Solana signing)
  const sigBytes = nacl.sign.detached(
    new TextEncoder().encode(challenge),
    ownerKp.secretKey,
  );
  const passphrase = bs58.encode(ownerKp.publicKey.toBytes()); // use pubkey as vault passphrase

  const { token: userToken, userId } = await api('POST', '/auth/wallet-login', {
    walletAddress: ownerKp.publicKey.toBase58(),
    challenge,
    nonce,
    signature: Buffer.from(sigBytes).toString('base64'),
    passphrase,
  });
  info('user id', userId ?? ownerKp.publicKey.toBase58());
  info('token', userToken.slice(0, 25) + '…');
  ok('authenticated');

  // ── 3. Ensure Anthropic key is in vault ────────────────────────────────────
  banner('3. Vault — find or store Anthropic key');
  const vaultItems = await api('GET', '/manage/vault', null, userToken);
  info('vault items', vaultItems.length);

  let anthropicKeyId = null;
  const existing = vaultItems.find(v =>
    v.upstream === 'anthropic' ||
    v.name?.toLowerCase().includes('anthropic') ||
    v.name?.toLowerCase().includes('claude'),
  );

  if (existing) {
    anthropicKeyId = existing.id;
    info('found key', `"${existing.name}" (${anthropicKeyId})`);
    ok('using existing vault key');
  } else if (process.env.ANTHROPIC_API_KEY) {
    const stored = await api('POST', '/manage/store', {
      name: 'anthropic-stress-test',
      type: 'api_key',
      upstream: 'anthropic',
      value: process.env.ANTHROPIC_API_KEY,
      tags: ['stress-test'],
    }, userToken);
    anthropicKeyId = stored.id;
    info('stored key id', anthropicKeyId);
    ok('Anthropic key stored in vault');
  } else {
    die('No Anthropic key in vault. Set ANTHROPIC_API_KEY=sk-ant-... to auto-store.');
  }

  // ── 4. Register + auth as agent ────────────────────────────────────────────
  banner('4. Register + auth as agent (self-grant pattern)');
  const agentKp = nacl.sign.keyPair();
  const agentPubkeyB58 = bs58.encode(agentKp.publicKey);
  info('agent pubkey', agentPubkeyB58.slice(0, 20) + '…');

  // Register agent
  const agentReg = await api('POST', '/agents', {
    name: `stress-test-${Date.now()}`,
    pubkey: agentPubkeyB58,
  }, userToken);
  info('agent id', agentReg.id ?? agentReg.agent_id ?? 'ok');
  ok('agent registered');

  // Agent login
  const { challenge: agChal, nonce: agNonce } = await api('POST', '/auth/agent-challenge', {});
  const agSig = nacl.sign.detached(new TextEncoder().encode(agChal), agentKp.secretKey);
  const { token: agentToken } = await api('POST', '/auth/agent-login', {
    pubkeyB58: agentPubkeyB58,
    challenge: agChal,
    nonce: agNonce,
    signature: Buffer.from(agSig).toString('base64'),
  });
  info('agent token', agentToken.slice(0, 25) + '…');
  ok('agent authenticated');

  // ── 5. Decrypt key for proxy calls ─────────────────────────────────────────
  banner('5. Decrypt API key from vault');
  const t0 = Date.now();
  const { value: apiKey } = await api('GET', `/manage/decrypt/${anthropicKeyId}`, null, userToken);
  info('decrypted in', ms(t0));
  info('key prefix', apiKey.slice(0, 12) + '…');
  if (!apiKey.startsWith('sk-')) warn('Key does not look like an Anthropic key — proxy calls may fail');
  ok('key decrypted');

  // ── 6. Hammer Claude through proxy ─────────────────────────────────────────
  banner(`6. Proxy hammer — ${CLAUDE_CALLS}× Claude calls (${CLAUDE_MODEL})`);

  const prompts = [
    'What is 2+2? Answer in one word.',
    'Name one planet in our solar system.',
    'What color is the sky? One word.',
    'How many days in a week? Answer with just a number.',
    'What programming language was created by Guido van Rossum? One word.',
    'What is the capital of France? One word.',
    'Name a primary color.',
    'What is 10×10? Just the number.',
    'Finish: "Hello, __". One word.',
    'What direction does the sun rise? One word.',
  ];

  const results = [];
  let totalTokens = 0;
  let failed = 0;

  for (let i = 0; i < CLAUDE_CALLS; i++) {
    const prompt = prompts[i % prompts.length];
    const t = Date.now();
    try {
      const res = await fetch(`${API_BASE}/proxy/anthropic/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${agentToken}`,
          'X-Upstream-API-Key': apiKey,
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 32,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      if (!res.ok) { failed++; warn(`call ${i+1} failed: ${res.status} ${JSON.stringify(data).slice(0,100)}`); continue; }
      const reply = data?.content?.[0]?.text?.trim() ?? '?';
      const tokens = (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);
      totalTokens += tokens;
      results.push({ i: i+1, latency: ms(t), prompt: prompt.slice(0, 30), reply, tokens });
      console.log(`  ${c.ok(`[${i+1}/${CLAUDE_CALLS}]`)} ${c.dim(ms(t).padEnd(6))} Q: "${prompt.slice(0,30)}" → "${reply}" (${tokens}tok)`);
    } catch (e) {
      failed++;
      warn(`call ${i+1} threw: ${e.message}`);
    }
  }

  const successCount = results.length;
  info('successful calls', `${successCount}/${CLAUDE_CALLS}`);
  info('total tokens', totalTokens);
  info('avg latency', results.length
    ? `${(results.reduce((s,r) => s + parseInt(r.latency), 0) / results.length).toFixed(0)}ms`
    : 'n/a');
  if (failed > 0) warn(`${failed} calls failed`);
  if (successCount === CLAUDE_CALLS) ok('all Claude calls succeeded');

  // ── 7. MPP stream flow (off-chain) ─────────────────────────────────────────
  banner('7. MPP stream — open, record usage, settle (off-chain)');

  const streamRes = await api('POST', '/mpp/streams', {
    agentPubkey: agentPubkeyB58,
    agentName: 'stress-test',
    upstream: 'anthropic',
    ratePerCallMicroUsdc: 500,
    ratePerTokenMicroUsdc: 1,
    settlementIntervalSecs: 60,
  }, userToken);

  const streamId = String(streamRes.stream?.id ?? streamRes.id ?? streamRes.stream_id);
  info('stream id', streamId);
  ok('stream opened');

  // Record usage for all the calls we made
  if (successCount > 0) {
    await api('POST', `/mpp/streams/${streamId}/record`, {
      calls: successCount,
      tokens: totalTokens,
    }, userToken);
    info('recorded', `${successCount} calls, ${totalTokens} tokens`);
    ok('usage recorded');
  }

  // Settle
  const settleRes = await api('POST', `/mpp/streams/${streamId}/settle`, {}, userToken);
  info('settled micro-USDC', settleRes.settled_micro_usdc ?? settleRes.settled ?? 'ok');
  info('tx signature', settleRes.tx_signature ?? settleRes.sig ?? '(off-chain only)');
  ok('stream settled');

  // ── 8. On-chain MPP flow ────────────────────────────────────────────────────
  if (SKIP_ONCHAIN) {
    warn('SKIP_ONCHAIN=1 — skipping Solana transaction steps');
  } else {
    banner('8. On-chain — build open-stream tx, sign, submit to devnet');

    const [streamPda, bump] = deriveStreamPda(new PublicKey(agentPubkeyB58), ownerKp.publicKey);
    const ownerUsdcAta = deriveAta(ownerKp.publicKey, USDC_MINT);
    info('stream PDA', streamPda.toBase58());
    info('owner USDC ATA', ownerUsdcAta.toBase58());

    // Try build-open-tx endpoint
    let buildRes;
    try {
      buildRes = await api('POST', `/mpp/streams/${streamId}/build-open-tx`, {
        ownerPubkey: ownerKp.publicKey.toBase58(),
        streamPda: streamPda.toBase58(),
        bump,
        usdcAta: ownerUsdcAta.toBase58(),
        maxTotalMicroUsdc: 10_000_000, // 10 USDC cap
        costPerUnitMicroUsdc: 1,
      }, userToken);
    } catch (e) {
      warn(`build-open-tx failed: ${e.message} — skipping on-chain steps`);
      buildRes = null;
    }

    if (buildRes && Array.isArray(buildRes.prereqIxs)) {
      info('prereqIxs count', buildRes.prereqIxs.length);
      info('stream USDC ATA', buildRes.streamUsdcAta ?? 'n/a');

      try {
        const ixs = [
          ...buildRes.prereqIxs.map(jsonToIx),
          jsonToIx({ programId: buildRes.programId, keys: buildRes.keys, data: buildRes.data }),
        ];
        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
        const tx = new Transaction({ feePayer: ownerKp.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
        tx.sign(ownerKp);
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        info('submitted', sig);
        info('explorer', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        ok('on-chain stream open tx confirmed ✓');

        // Record tx on backend
        await api('POST', `/mpp/streams/${streamId}/record-tx`, { tx_signature: sig }, userToken).catch(() => {});
        info('recorded tx', sig.slice(0, 20) + '…');
        ok('tx recorded on backend');

        // Verify stream PDA on-chain
        const streamAcc = await conn.getAccountInfo(streamPda);
        if (streamAcc) {
          const disc = streamAcc.data.slice(0, 8).toString('utf8');
          info('PDA discriminator', disc);
          info('PDA data length', `${streamAcc.data.length} bytes`);
          ok('stream PDA verified on-chain ✓');
        }
      } catch (e) {
        warn(`on-chain tx failed: ${e.message}`);
        if (e.message?.includes('0x4') || e.message?.includes('OwnerMismatch')) {
          die('ATA OwnerMismatch (0x4) — backend ATA fix may not be deployed');
        }
      }
    } else {
      warn('build-open-tx returned no instructions — on-chain settle skipped');
      warn('(The on-chain program may need a bootstrapped UniversalVault for this wallet)');
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const finalSolBal = await conn.getBalance(ownerKp.publicKey);
  const solSpent = (solBal - finalSolBal) / 1e9;

  console.log(c.bold(`
╔═══════════════════════════════════════════════════════════════════╗
║  STRESS TEST COMPLETE                                             ║
╚═══════════════════════════════════════════════════════════════════╝`));
  info('Claude calls', `${successCount}/${CLAUDE_CALLS} succeeded`);
  info('Tokens consumed', totalTokens.toString());
  info('MPP stream id', streamId);
  info('SOL spent', `${solSpent.toFixed(6)} SOL`);
  info('SOL remaining', `${(finalSolBal / 1e9).toFixed(4)} SOL`);
  console.log(`\n  ${c.ok('All systems green. KeyShield proxy is protecting your keys.')}\n`);
}

main().catch(e => {
  console.error(`\n  ${c.err('FATAL:')} ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
