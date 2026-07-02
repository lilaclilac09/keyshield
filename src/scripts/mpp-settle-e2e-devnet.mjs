#!/usr/bin/env node
/**
 * MPP settle e2e on devnet — proves the real on-chain `mpp_settle`
 * (ix #26) path end-to-end, complementing mpp-e2e-devnet.mjs which
 * only proves open_payment_stream.
 *
 * Flow:
 *   1. Wallet-signed login (same as mpp-e2e-devnet.mjs).
 *   2. Read the stream-PDA USDC ATA + platform USDC ATA balances.
 *   3. Create a fresh off-chain stream row, bind it to the EXISTING
 *      on-chain stream PDA via POST /record-tx (stream_pda +
 *      stream_usdc_ata are persisted so settle_on_chain() can build
 *      the ix — without them it stub-falls-back to DB-only).
 *   4. POST /record with tokens → pending_micro_usdc.
 *   5. POST /settle → backend submits mpp_settle signed by
 *      KS_MPP_SETTLER_KEY.
 *   6. Re-read both ATAs — assert micro-USDC moved stream → platform.
 *      An 0x4 (SPL OwnerMismatch) would mean the stream ATA is not
 *      PDA-owned; its absence is the point of this test.
 *
 * Required env:
 *   KS_API_BASE          backend URL          (http://127.0.0.1:8001)
 *   KS_RPC_URL           Solana RPC           (https://api.devnet.solana.com)
 *   KS_STREAM_PDA        existing on-chain stream PDA (from mpp-e2e-devnet.mjs run)
 *   KS_STREAM_USDC_ATA   its PDA-owned USDC ATA
 *   KS_PLATFORM_USDC_ATA platform receiver ATA (matches backend env)
 *   KS_AGENT_PUBKEY      agent pubkey used when the PDA was opened
 *   KS_OPEN_TX           open_payment_stream tx signature to bind
 *   KS_DEMO_PW           session passphrase   (pw)
 *
 * Backend must run with KS_MPP_SETTLER_KEY / KS_PLATFORM_USDC_ATA /
 * KS_KEYSHIELD_PROGRAM_ID / KS_VAULT_PDA set, plus pynacl + base58 +
 * solders installed (wallet-login verify + settle submission).
 *
 * Run:
 *   node src/scripts/mpp-settle-e2e-devnet.mjs
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const API = process.env.KS_API_BASE ?? 'http://127.0.0.1:8001';
const RPC = process.env.KS_RPC_URL ?? 'https://api.devnet.solana.com';
const STREAM_PDA = new PublicKey(
  process.env.KS_STREAM_PDA ?? 'Dit8rnzaH3QikXgyVBRSSg4xdgyTNxfbiaKjTdbqQPD1',
);
const STREAM_ATA = new PublicKey(
  process.env.KS_STREAM_USDC_ATA ?? 'GDXBvJDpMUAtdNFhiBhmzZ2fRutCDZzBnEbWDsBR9LQ7',
);
const PLATFORM_ATA = new PublicKey(
  process.env.KS_PLATFORM_USDC_ATA ?? '5XkmKe6giGYgEgmiNdnwVJrsQMKEc3HJbvy2ACspAMqG',
);
const AGENT = process.env.KS_AGENT_PUBKEY ?? 'WAUjjarihxNossg9REdRYVh5aM5HbmeUWJfxcW8crVZ';
const OPEN_TX =
  process.env.KS_OPEN_TX ??
  '5s8jAb2XPYAJg8hvfuoWAFuFsPmt3PtaUS2TX9RYQpjXL1qJS8Yiyt1zMRifuARdnqMCPChM1KKv3UEBxkhDvvUr';
const DEMO_PW = process.env.KS_DEMO_PW ?? 'pw';
const TOKENS = Number(process.env.KS_SETTLE_TOKENS ?? 500);

const ok = (s) => console.log(`  ✓ ${s}`);
const die = (s) => {
  console.error(`  ✗ ${s}`);
  process.exit(1);
};

async function api(p, init = {}, token) {
  const headers = { 'content-type': 'application/json', ...(init.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${p}`, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) die(`${init.method ?? 'GET'} ${p} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// SPL Token Account layout: amount at bytes 64..72 (LE u64).
async function tokenBalance(conn, ata) {
  const acc = await conn.getAccountInfo(ata);
  if (!acc) return null;
  return acc.data.readBigUInt64LE(64);
}

async function main() {
  const secret = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), '.config/solana/id.json'), 'utf8'),
  );
  const owner = Keypair.fromSecretKey(Uint8Array.from(secret));
  console.log(`owner: ${owner.publicKey.toBase58()}`);
  const conn = new Connection(RPC, 'confirmed');

  // 1. wallet-signed login
  let token = process.env.KS_E2E_TOKEN?.trim();
  if (!token) {
    const ch = await api('/auth/wallet-challenge');
    const challenge = ch.challenge ?? ch.nonce;
    const naclMod = await import('tweetnacl');
    const nacl = naclMod.default ?? naclMod;
    const sig = nacl.sign.detached(Buffer.from(challenge, 'utf8'), owner.secretKey);
    ({ token } = await api('/auth/wallet-login', {
      method: 'POST',
      body: JSON.stringify({
        walletAddress: owner.publicKey.toBase58(),
        challenge,
        nonce: ch.nonce ?? challenge,
        passphrase: DEMO_PW,
        signature: Buffer.from(sig).toString('base64'),
      }),
    }));
  }
  ok('logged in');

  // 2. baseline balances
  const beforeStream = await tokenBalance(conn, STREAM_ATA);
  const beforePlatform = await tokenBalance(conn, PLATFORM_ATA);
  console.log(`  stream ATA before:   ${beforeStream}`);
  console.log(`  platform ATA before: ${beforePlatform}`);
  if (beforeStream === null) die('stream ATA missing on-chain — run mpp-e2e-devnet.mjs first');
  if (beforeStream < BigInt(TOKENS)) die(`stream ATA balance ${beforeStream} < ${TOKENS} needed`);

  // 3. fresh row bound to the existing on-chain PDA
  const openRes = await api(
    '/mpp/streams',
    {
      method: 'POST',
      body: JSON.stringify({
        agentPubkey: AGENT,
        agentName: 'settle-e2e',
        upstream: 'openai',
        ratePerTokenMicroUsdc: 1,
        settlementIntervalSecs: 3600,
      }),
    },
    token,
  );
  const id = openRes.stream.id;
  ok(`stream row id=${id}`);

  await api(
    `/mpp/streams/${id}/record-tx`,
    {
      method: 'POST',
      body: JSON.stringify({
        tx_signature: OPEN_TX,
        stream_pda: STREAM_PDA.toBase58(),
        stream_usdc_ata: STREAM_ATA.toBase58(),
      }),
    },
    token,
  );
  ok('PDA/ATA bound via record-tx');

  // 4. record usage
  const rec = await api(
    `/mpp/streams/${id}/record`,
    { method: 'POST', body: JSON.stringify({ tokens: TOKENS, calls: 1 }) },
    token,
  );
  console.log(`  pending after record: ${rec.stream.pending_micro_usdc}`);

  // 5. settle
  const st = await api(`/mpp/streams/${id}/settle`, { method: 'POST' }, token);
  console.log(`  just_settled:  ${st.stream.just_settled_micro_usdc}`);
  console.log(`  settled_total: ${st.stream.settled_micro_usdc}`);
  ok('settle endpoint returned');

  // 6. verify on-chain movement
  await new Promise((r) => setTimeout(r, 8000));
  const afterStream = await tokenBalance(conn, STREAM_ATA);
  const afterPlatform = await tokenBalance(conn, PLATFORM_ATA);
  console.log(`  stream ATA after:    ${afterStream}`);
  console.log(`  platform ATA after:  ${afterPlatform}`);

  const moved = (beforeStream ?? 0n) - (afterStream ?? 0n);
  console.log(`  moved out of stream ATA: ${moved} micro-USDC`);
  if (moved <= 0n) {
    die('no on-chain movement — settle fell back to stub (check backend env/logs)');
  }
  ok(`ON-CHAIN SETTLE CONFIRMED — ${moved} micro-USDC moved, no 0x4 OwnerMismatch`);
}

main().catch((e) => {
  console.error(`FATAL: ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
