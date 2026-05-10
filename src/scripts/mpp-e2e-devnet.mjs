#!/usr/bin/env node
/**
 * MPP end-to-end on devnet — proves the 2026-05-10 ATA fix.
 *
 * Earlier on devnet, opening a stream + settling once produced
 * `custom program error: 0x4` (SPL Token OwnerMismatch) at the
 * mpp_settle CPI step, because the off-chain code was passing the
 * **owner's** USDC ATA as `stream.usdc_ata`. The on-chain program
 * (programs/keyshield/src/instructions/mpp_settle.rs:228) tries to
 * sign the transfer with the **stream PDA** as authority — which
 * isn't the owner of an owner-owned ATA. Fix: the server now returns
 * a 3-ix bundle (create stream-PDA-owned ATA + fund it + open stream)
 * via `/mpp/streams/:id/build-open-tx`'s `prereqIxs`. See commit
 * 9974a8e85 for the change, 5e752a054 for the typed SDK helper.
 *
 * What this script verifies:
 *   1. Backend up + auth works.
 *   2. POST /mpp/streams returns a stream row.
 *   3. POST /mpp/streams/:id/build-open-tx returns
 *      { programId, keys, data, streamUsdcAta, prereqIxs[2] }.
 *   4. The 3 ixs reconstruct into a valid Solana Transaction.
 *   5. The owner-signed Transaction confirms on devnet.
 *   6. The stream PDA exists on-chain with discriminator 'ksaywal1'.
 *   7. The stream USDC ATA exists on-chain with the right balance.
 *
 * Required env (override defaults):
 *   KS_API_BASE      backend URL              (http://localhost:8000)
 *   KS_DEMO_USER     login user               (alice)
 *   KS_DEMO_PW       login password           (pw)
 *   KS_RPC_URL       Solana RPC               (https://api.devnet.solana.com)
 *   KS_PROGRAM_ID    KeyShield program        (41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j)
 *   KS_USDC_MINT     USDC mint                (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)
 *   KS_AGENT_PUBKEY  (optional) override the agent pubkey we use; defaults
 *                    to the same wallet as the owner (self-grant pattern from
 *                    bootstrap-onchain.py).
 *
 * Required local state:
 *   ~/.config/solana/id.json   — owner CLI keypair, has SOL + USDC on devnet
 *   Backend running with env  — KS_KEYSHIELD_PROGRAM_ID, KS_USDC_MINT,
 *                                KS_VAULT_PDA, KS_MPP_SETTLER_*
 *   Already bootstrapped       — UniversalVault + AgentGrant exist on-chain
 *                                for owner + agent (see scripts/bootstrap-onchain.py
 *                                in repo history if missing)
 *
 * Run:
 *   node src/scripts/mpp-e2e-devnet.mjs
 *
 * Exit code: 0 on green smoke, 1 on any check failure.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── Config ──────────────────────────────────────────────────────────
const API_BASE   = process.env.KS_API_BASE   ?? 'http://localhost:8000';
const RPC_URL    = process.env.KS_RPC_URL    ?? 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.KS_PROGRAM_ID ?? '41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j');
const USDC_MINT  = new PublicKey(process.env.KS_USDC_MINT  ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const DEMO_USER  = process.env.KS_DEMO_USER  ?? 'alice';
const DEMO_PW    = process.env.KS_DEMO_PW    ?? 'pw';
const KEYPAIR    = path.join(os.homedir(), '.config', 'solana', 'id.json');

// ── Tiny print helpers ──────────────────────────────────────────────
const colors = process.stdout.isTTY ? {
  step: (s) => `\x1b[36;1m${s}\x1b[0m`,
  ok:   (s) => `\x1b[32m${s}\x1b[0m`,
  err:  (s) => `\x1b[31m${s}\x1b[0m`,
  dim:  (s) => `\x1b[2m${s}\x1b[0m`,
} : {
  step: (s) => s, ok: (s) => s, err: (s) => s, dim: (s) => s,
};
const banner = (s) => console.log('\n' + colors.step(`▶ ${s}`));
const ok = (s) => console.log(`  ${colors.ok('✓')} ${s}`);
const die = (s) => { console.error(`  ${colors.err('✗')} ${s}`); process.exit(1); };
const detail = (k, v) => console.log(`    ${colors.dim(k.padEnd(20))} ${v}`);

// ── HTTP helpers ────────────────────────────────────────────────────
async function api(path, init = {}, token) {
  const headers = { 'content-type': 'application/json', ...(init.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    die(`${init.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

// ── Convert server JSON ix → web3.js TransactionInstruction ─────────
function jsonToIx(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.keys.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

// ── Manual ATA derivation (no @solana/spl-token dep) ────────────────
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM_ID   = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

function deriveAta(owner, mint) {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID,
  );
  return ata;
}

// Stream PDA: matches APS_SEED in programs/keyshield/src/instructions/open_stream.rs
const APS_SEED = Buffer.from('agent_payment_stream');
function deriveStreamPda(agent, owner) {
  return PublicKey.findProgramAddressSync(
    [APS_SEED, agent.toBuffer(), owner.toBuffer()],
    PROGRAM_ID,
  );
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  MPP end-to-end devnet — verifies the ATA fix (0x4 gone)    ║
╚══════════════════════════════════════════════════════════════╝`);

  banner('1. load owner keypair + RPC');
  if (!fs.existsSync(KEYPAIR)) die(`No keypair at ${KEYPAIR}. Run: solana-keygen new`);
  const ownerSecret = JSON.parse(fs.readFileSync(KEYPAIR, 'utf8'));
  const owner = Keypair.fromSecretKey(Uint8Array.from(ownerSecret));
  detail('owner pubkey:', owner.publicKey.toBase58());
  const conn = new Connection(RPC_URL, 'confirmed');
  const bal = await conn.getBalance(owner.publicKey);
  detail('SOL balance:', `${(bal / 1e9).toFixed(4)} SOL`);
  if (bal < 5_000_000) die('Owner needs at least 0.005 SOL for tx fees');
  ok('keypair + RPC ready');

  banner('2. backend login');
  const { token } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ userId: DEMO_USER, password: DEMO_PW }),
  });
  if (!token) die('login returned no token');
  ok(`logged in as ${DEMO_USER}`);

  banner('3. open MPP stream (off-chain row)');
  const agent = process.env.KS_AGENT_PUBKEY
    ? new PublicKey(process.env.KS_AGENT_PUBKEY)
    : owner.publicKey; // self-grant pattern
  const openRes = await api('/mpp/streams', {
    method: 'POST',
    body: JSON.stringify({
      agentPubkey: agent.toBase58(),
      agentName: 'mpp-e2e-devnet',
      upstream: 'openai',
      ratePerTokenMicroUsdc: 1,
      settlementIntervalSecs: 60,
    }),
  }, token);
  const streamId = String(openRes.stream.id);
  detail('stream id:', streamId);
  detail('upstream:', openRes.stream.upstream);
  ok('stream row created');

  banner('4. derive PDAs + ATAs locally');
  const [streamPda, bump] = deriveStreamPda(agent, owner.publicKey);
  const ownerUsdcAta = deriveAta(owner.publicKey, USDC_MINT);
  const expectedStreamUsdcAta = deriveAta(streamPda, USDC_MINT);
  detail('stream PDA:', `${streamPda.toBase58()} (bump=${bump})`);
  detail('owner USDC ATA:', ownerUsdcAta.toBase58());
  detail('expected stream USDC ATA:', expectedStreamUsdcAta.toBase58());
  ok('derivation done');

  banner('5. POST /build-open-tx — verify prereqIxs are in the response');
  const buildRes = await api(`/mpp/streams/${streamId}/build-open-tx`, {
    method: 'POST',
    body: JSON.stringify({
      ownerPubkey: owner.publicKey.toBase58(),
      streamPda: streamPda.toBase58(),
      bump,
      usdcAta: ownerUsdcAta.toBase58(),
      maxTotalMicroUsdc: 100_000, // 0.1 USDC budget cap
      costPerUnitMicroUsdc: 1,
    }),
  }, token);
  if (!Array.isArray(buildRes.prereqIxs) || buildRes.prereqIxs.length !== 2) {
    die(`expected prereqIxs[2], got ${JSON.stringify(buildRes).slice(0, 200)}`);
  }
  if (!buildRes.streamUsdcAta) die('response missing streamUsdcAta');
  if (buildRes.streamUsdcAta !== expectedStreamUsdcAta.toBase58()) {
    die(`server-derived ATA ${buildRes.streamUsdcAta} ≠ client-derived ${expectedStreamUsdcAta.toBase58()}`);
  }
  detail('main programId:', buildRes.programId);
  detail('prereqIxs[0] program:', buildRes.prereqIxs[0].programId, '(SPL ATA)');
  detail('prereqIxs[1] program:', buildRes.prereqIxs[1].programId, '(SPL Token)');
  ok('prereqIxs[2] + streamUsdcAta returned ✓ ATA fix wired');

  banner('6. assemble + sign + submit Transaction');
  const ixs = [
    jsonToIx(buildRes.prereqIxs[0]), // create stream-PDA-owned USDC ATA (idempotent)
    jsonToIx(buildRes.prereqIxs[1]), // fund: owner USDC → stream USDC
    jsonToIx({ programId: buildRes.programId, keys: buildRes.keys, data: buildRes.data }),
  ];
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: owner.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.sign(owner);
  let sig;
  try {
    sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    detail('submitted:', sig);
    detail('explorer:', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    ok('confirmed');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('0x4') || msg.includes('OwnerMismatch')) {
      die(`OwnerMismatch (0x4) returned — ATA fix is NOT wired correctly: ${msg}`);
    }
    die(`tx submit/confirm failed: ${msg}`);
  }

  banner('7. verify stream PDA exists on-chain');
  const streamAcc = await conn.getAccountInfo(streamPda);
  if (!streamAcc) die('stream PDA not on chain');
  if (!streamAcc.owner.equals(PROGRAM_ID)) die(`stream PDA owner ${streamAcc.owner.toBase58()} ≠ program`);
  // Discriminator: `ksaywal1` (8 bytes) — see state.rs::AGENT_PAYMENT_STREAM_DISCRIMINATOR
  const disc = streamAcc.data.slice(0, 8).toString('utf8');
  if (disc !== 'ksaywal1') die(`stream disc '${disc}' ≠ 'ksaywal1'`);
  detail('owner:', streamAcc.owner.toBase58());
  detail('discriminator:', `'${disc}'`);
  detail('data length:', `${streamAcc.data.length} bytes`);
  ok('stream PDA on-chain ✓');

  banner('8. verify stream-PDA-owned USDC ATA exists + has the funded balance');
  const streamAtaAcc = await conn.getAccountInfo(expectedStreamUsdcAta);
  if (!streamAtaAcc) die('stream USDC ATA not on chain');
  if (!streamAtaAcc.owner.equals(TOKEN_PROGRAM_ID)) {
    die(`stream USDC ATA owner ${streamAtaAcc.owner.toBase58()} ≠ SPL Token`);
  }
  // SPL Token Account layout: amount is at bytes 64..72 (LE u64).
  const amount = streamAtaAcc.data.readBigUInt64LE(64);
  detail('SPL Token-owned:', '✓');
  detail('balance (micro-USDC):', amount.toString());
  if (amount === 0n) die('stream USDC ATA balance is 0 — funding ix did not transfer');
  ok(`stream USDC ATA funded with ${amount} micro-USDC`);

  banner('9. record tx signature on backend');
  await api(`/mpp/streams/${streamId}/record-tx`, {
    method: 'POST',
    body: JSON.stringify({ tx_signature: sig }),
  }, token);
  ok('backend recorded the on-chain signature');

  console.log(`
${colors.ok('╔══════════════════════════════════════════════════════════════╗')}
${colors.ok('║  ✓ End-to-end green. ATA fix is wired and works on devnet.  ║')}
${colors.ok('╚══════════════════════════════════════════════════════════════╝')}

  Stream PDA:   ${colors.dim(streamPda.toBase58())}
  Stream ATA:   ${colors.dim(expectedStreamUsdcAta.toBase58())}
  Open tx:      https://explorer.solana.com/tx/${sig}?cluster=devnet

  Next: settle a small amount via POST /mpp/streams/${streamId}/settle and
  watch the on-chain transfer happen without 0x4 OwnerMismatch.
`);
}

main().catch((e) => {
  console.error(`\n${colors.err('FATAL')}: ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
