#!/usr/bin/env node
/**
 * pay_x402 end-to-end on devnet — proves the agent-signed x402
 * micropayment path (ix #25) that backs EmbeddedWalletInterceptor.
 *
 * Unlike mpp-settle-e2e-devnet.mjs (settler-signed mpp_settle #26), this
 * exercises the AGENT-signed pay_x402 #26: the server-held wallet key
 * (server_wallets.db) signs + fee-pays the on-chain transfer, and the
 * tx signature is returned as the x402 payment proof.
 *
 * Full orchestration (all on devnet):
 *   1. Wallet-signed login as owner.
 *   2. POST /agents/{id}/wallet/create → the server-held agent pubkey P.
 *      P is both the pay_x402 signer AND the fee payer, so we fund it
 *      with a little SOL from the owner.
 *   3. Grant P on-chain in the owner's UniversalVault (ix #20) — pay_x402
 *      requires an active, non-revoked grant for the signer.
 *   4. Open a payment stream bound to agent P (owner-signed 3-ix bundle:
 *      create stream-PDA-owned ATA + fund it + open_payment_stream #24),
 *      then bind it off-chain via /record-tx (stream_pda + stream_usdc_ata).
 *   5. Snapshot the stream ATA + recipient ATA balances.
 *   6. POST /agents/{id}/wallet/pay_x402 — backend signs pay_x402 with P's
 *      server-held key and submits.
 *   7. Assert the requested micro-USDC moved stream ATA → recipient ATA,
 *      with no 0x4 (OwnerMismatch) / 0x17d7 (NotOwner) / budget error.
 *
 * Required local state:
 *   ~/.config/solana/id.json   — owner keypair (SOL + USDC on devnet)
 *   backend running on KS_API_BASE with the on-chain env set
 *     (KS_MPP_SETTLER_KEY unused here but load_mpp_config needs it +
 *      KS_KEYSHIELD_PROGRAM_ID + KS_VAULT_PDA + KS_USDC_MINT), plus
 *      pynacl + base58 + solders installed for wallet-login + submit.
 *
 * Run:
 *   node src/scripts/pay-x402-e2e-devnet.mjs
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const API = process.env.KS_API_BASE ?? 'http://127.0.0.1:8001';
const RPC = process.env.KS_RPC_URL ?? 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(
  process.env.KS_PROGRAM_ID ?? '41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j',
);
const USDC_MINT = new PublicKey(
  process.env.KS_USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
);
const DEMO_PW = process.env.KS_DEMO_PW ?? 'pw';
// Unique agent id per run so we always get a fresh server wallet + PDA.
const AGENT_ID = process.env.KS_PAY_AGENT_ID ?? `x402-agent-${Date.now()}`;
const PAY_AMOUNT = Number(process.env.KS_PAY_AMOUNT ?? 500); // micro-USDC
const STREAM_BUDGET = Number(process.env.KS_STREAM_BUDGET ?? 100_000); // 0.1 USDC

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const VAULT_SEED = Buffer.from('universal_vault');
const APS_SEED = Buffer.from('agent_payment_stream');
const IX_GRANT_AGENT = 20;

const banner = (s) => console.log(`\n▶ ${s}`);
const ok = (s) => console.log(`  ✓ ${s}`);
const detail = (k, v) => console.log(`    ${k.padEnd(24)} ${v}`);
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

function deriveAta(owner, mint) {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID,
  );
  return ata;
}

function deriveStreamPda(agent, owner) {
  return PublicKey.findProgramAddressSync(
    [APS_SEED, agent.toBuffer(), owner.toBuffer()],
    PROGRAM_ID,
  );
}

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

async function tokenBalance(conn, ata) {
  const acc = await conn.getAccountInfo(ata);
  if (!acc) return null;
  return acc.data.readBigUInt64LE(64);
}

async function sendSigned(conn, ixs, signer) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight }).add(
    ...ixs,
  );
  tx.sign(signer);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  pay_x402 end-to-end devnet — agent-signed x402 micropayment ║
╚══════════════════════════════════════════════════════════════╝`);

  banner('1. load owner keypair + RPC');
  const owner = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/solana/id.json'), 'utf8'))),
  );
  detail('owner pubkey:', owner.publicKey.toBase58());
  detail('agent id:', AGENT_ID);
  const conn = new Connection(RPC, 'confirmed');
  const bal = await conn.getBalance(owner.publicKey);
  detail('owner SOL:', `${(bal / 1e9).toFixed(4)} SOL`);
  if (bal < 20_000_000) die('owner needs ≥0.02 SOL (funds agent + tx fees)');
  ok('ready');

  banner('2. login + create server-held agent wallet');
  const ch = await api('/auth/wallet-challenge');
  const challenge = ch.challenge ?? ch.nonce;
  const naclMod = await import('tweetnacl');
  const nacl = naclMod.default ?? naclMod;
  const loginSig = nacl.sign.detached(Buffer.from(challenge, 'utf8'), owner.secretKey);
  const { token } = await api('/auth/wallet-login', {
    method: 'POST',
    body: JSON.stringify({
      walletAddress: owner.publicKey.toBase58(),
      challenge,
      nonce: ch.nonce ?? challenge,
      passphrase: DEMO_PW,
      signature: Buffer.from(loginSig).toString('base64'),
    }),
  });
  const created = await api(`/agents/${encodeURIComponent(AGENT_ID)}/wallet/create`, { method: 'POST' }, token);
  const agentPk = new PublicKey(created.pubkey);
  detail('agent pubkey P:', agentPk.toBase58());
  ok('server wallet created');

  banner('3. fund agent P with SOL (pay_x402 fee payer)');
  const agentBal = await conn.getBalance(agentPk);
  if (agentBal < 5_000_000) {
    const fundSig = await sendSigned(
      conn,
      [SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: agentPk, lamports: 10_000_000 })],
      owner,
    );
    detail('fund tx:', fundSig);
  }
  detail('agent SOL:', `${((await conn.getBalance(agentPk)) / 1e9).toFixed(4)} SOL`);
  ok('agent funded');

  banner('4. grant agent P on-chain (ix #20)');
  const [vaultPda] = PublicKey.findProgramAddressSync([VAULT_SEED, owner.publicKey.toBuffer()], PROGRAM_ID);
  detail('vault PDA:', vaultPda.toBase58());
  const grant = Buffer.alloc(63);
  let gp = 0;
  grant.writeUInt8(IX_GRANT_AGENT, gp); gp += 1;
  agentPk.toBuffer().copy(grant, gp); gp += 32;
  grant.writeUInt8(255, gp); gp += 1;              // key_group = universal
  grant.writeUInt32LE(1000, gp); gp += 4;          // rate_limit_calls
  grant.writeUInt32LE(1_000_000, gp); gp += 4;     // rate_limit_tokens
  grant.writeBigUInt64LE(86400n, gp); gp += 8;     // session_timeout
  grant.writeBigUInt64LE(1_000_000n, gp); gp += 8; // max_spend = 1 USDC
  grant.writeUInt8(0, gp); gp += 1;                // payment_stream_enabled
  grant.writeUInt16LE(0, gp); gp += 2;             // zk_proof_length
  grant.writeUInt8(0, gp); gp += 1;                // allowed_endpoints
  grant.writeUInt8(0, gp); gp += 1;                // allowed_models
  const grantIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: false },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
    ],
    data: grant,
  });
  const grantSig = await sendSigned(conn, [grantIx], owner);
  detail('grant tx:', grantSig);
  ok('agent granted on-chain');

  banner('5. open payment stream bound to agent P');
  const streamRow = await api(
    '/mpp/streams',
    {
      method: 'POST',
      body: JSON.stringify({
        agentPubkey: agentPk.toBase58(),
        agentName: AGENT_ID,
        upstream: 'openai',
        ratePerTokenMicroUsdc: 1,
        settlementIntervalSecs: 3600,
      }),
    },
    token,
  );
  const streamId = String(streamRow.stream.id);
  const [streamPda, bump] = deriveStreamPda(agentPk, owner.publicKey);
  const ownerUsdcAta = deriveAta(owner.publicKey, USDC_MINT);
  const streamUsdcAta = deriveAta(streamPda, USDC_MINT);
  detail('stream id:', streamId);
  detail('stream PDA:', `${streamPda.toBase58()} (bump=${bump})`);
  detail('stream USDC ATA:', streamUsdcAta.toBase58());

  const buildRes = await api(
    `/mpp/streams/${streamId}/build-open-tx`,
    {
      method: 'POST',
      body: JSON.stringify({
        ownerPubkey: owner.publicKey.toBase58(),
        streamPda: streamPda.toBase58(),
        bump,
        usdcAta: ownerUsdcAta.toBase58(),
        maxTotalMicroUsdc: STREAM_BUDGET,
        costPerUnitMicroUsdc: 1,
      }),
    },
    token,
  );
  if (buildRes.streamUsdcAta !== streamUsdcAta.toBase58()) {
    die(`server ATA ${buildRes.streamUsdcAta} ≠ client ${streamUsdcAta.toBase58()}`);
  }
  const openSig = await sendSigned(
    conn,
    [
      jsonToIx(buildRes.prereqIxs[0]),
      jsonToIx(buildRes.prereqIxs[1]),
      jsonToIx({ programId: buildRes.programId, keys: buildRes.keys, data: buildRes.data }),
    ],
    owner,
  );
  detail('open tx:', openSig);
  await api(
    `/mpp/streams/${streamId}/record-tx`,
    {
      method: 'POST',
      body: JSON.stringify({
        tx_signature: openSig,
        stream_pda: streamPda.toBase58(),
        stream_usdc_ata: streamUsdcAta.toBase58(),
      }),
    },
    token,
  );
  ok(`stream opened + funded ${STREAM_BUDGET} micro-USDC`);

  banner('6. snapshot balances, then pay_x402');
  // Recipient = owner's own USDC ATA (guaranteed to exist since we just
  // funded the stream FROM it). payTo is the owner wallet; backend
  // derives the same ATA.
  const recipientAta = ownerUsdcAta;
  const beforeStream = await tokenBalance(conn, streamUsdcAta);
  const beforeRecipient = await tokenBalance(conn, recipientAta);
  detail('stream ATA before:', beforeStream);
  detail('recipient ATA before:', beforeRecipient);

  const payRes = await api(
    `/agents/${encodeURIComponent(AGENT_ID)}/wallet/pay_x402`,
    {
      method: 'POST',
      body: JSON.stringify({
        envelope: {
          network: 'solana-devnet',
          amountRequired: PAY_AMOUNT,
          payTo: owner.publicKey.toBase58(),
          resource: 'pay-x402-e2e',
        },
      }),
    },
    token,
  );
  detail('pay signature:', payRes.signature);
  detail('explorer:', `https://explorer.solana.com/tx/${payRes.signature}?cluster=devnet`);
  ok('pay_x402 endpoint returned a signature');

  banner('7. verify on-chain movement');
  await conn.confirmTransaction(payRes.signature, 'confirmed').catch(() => {});
  await new Promise((r) => setTimeout(r, 6000));
  const afterStream = await tokenBalance(conn, streamUsdcAta);
  const afterRecipient = await tokenBalance(conn, recipientAta);
  detail('stream ATA after:', afterStream);
  detail('recipient ATA after:', afterRecipient);

  const movedOut = (beforeStream ?? 0n) - (afterStream ?? 0n);
  const movedIn = (afterRecipient ?? 0n) - (beforeRecipient ?? 0n);
  detail('moved out of stream:', `${movedOut} micro-USDC`);
  detail('moved into recipient:', `${movedIn} micro-USDC`);
  if (movedOut !== BigInt(PAY_AMOUNT)) {
    die(`expected ${PAY_AMOUNT} out of stream ATA, saw ${movedOut}`);
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ✓ pay_x402 green — agent-signed micropayment landed.        ║
╚══════════════════════════════════════════════════════════════╝

  Agent P:      ${agentPk.toBase58()}
  Stream PDA:   ${streamPda.toBase58()}
  Pay tx:       https://explorer.solana.com/tx/${payRes.signature}?cluster=devnet
  Moved:        ${movedOut} micro-USDC (no 0x4 / 0x17d7 / budget error)
`);
}

main().catch((e) => {
  console.error(`\nFATAL: ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
