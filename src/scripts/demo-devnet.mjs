#!/usr/bin/env node
/**
 * KeyShield Devnet MVP Demo
 *
 * Verifies the live on-chain deployment end-to-end:
 *   1. Loads your CLI keypair (~/.config/solana/id.json)
 *   2. Connects to Solana devnet
 *   3. Queries wallet balance
 *   4. Inspects the deployed KeyShield program account
 *      (owner, executable flag, data length, programData PDA)
 *   5. Pulls a recent slot to confirm cluster liveness
 *
 * Run:
 *   node src/scripts/demo-devnet.mjs
 *
 * Expected output: 5 sections, all with green checkmarks. If any
 * section fails, the error tells you what's broken (RPC, keypair,
 * program ID).
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj');
const KEYPAIR_PATH = path.join(os.homedir(), '.config', 'solana', 'id.json');

function banner(s) { console.log(`\n${'━'.repeat(60)}\n${s}\n${'━'.repeat(60)}`); }
function ok(s) { console.log(`  ✓ ${s}`); }
function info(k, v) { console.log(`    ${k.padEnd(18)} ${v}`); }

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   🔑 KeyShield — Devnet MVP Demo                           ║
║   Live program: DHPTRYb...S6EBj on Solana devnet           ║
╚════════════════════════════════════════════════════════════╝`);

  // ── 1. Load CLI keypair ──────────────────────────────────
  banner('1️⃣  Load CLI keypair');
  if (!fs.existsSync(KEYPAIR_PATH)) {
    throw new Error(`No keypair at ${KEYPAIR_PATH}. Run: solana-keygen new`);
  }
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));
  ok('Keypair loaded');
  info('Address:', wallet.publicKey.toBase58());
  info('Path:', KEYPAIR_PATH);

  // ── 2. Connect to devnet ─────────────────────────────────
  banner('2️⃣  Connect to Solana devnet');
  const conn = new Connection(RPC_URL, 'confirmed');
  const version = await conn.getVersion();
  ok('Connected to devnet RPC');
  info('Endpoint:', RPC_URL);
  info('solana-core:', version['solana-core']);

  // ── 3. Wallet balance ────────────────────────────────────
  banner('3️⃣  Wallet balance');
  const lamports = await conn.getBalance(wallet.publicKey);
  const sol = (lamports / 1e9).toFixed(4);
  ok(`Balance: ${sol} SOL`);
  if (lamports < 1e8) {
    info('⚠️  Low balance:', 'top up via `solana airdrop 1 --url devnet`');
  }

  // ── 4. Inspect deployed program ──────────────────────────
  banner('4️⃣  Inspect KeyShield program account');
  const progInfo = await conn.getAccountInfo(PROGRAM_ID);
  if (!progInfo) {
    throw new Error(`Program ${PROGRAM_ID.toBase58()} not found on devnet`);
  }
  ok('Program account found on-chain');
  info('Program ID:', PROGRAM_ID.toBase58());
  info('Owner:', progInfo.owner.toBase58());
  info('Executable:', progInfo.executable);
  info('Data length:', `${progInfo.data.length} bytes`);
  info('Lamports:', `${(progInfo.lamports / 1e9).toFixed(6)} SOL (rent)`);

  // The owner of an upgradeable program is BPFLoaderUpgradeable;
  // the actual bytecode lives in a separate ProgramData PDA.
  const programDataAddress = new PublicKey(progInfo.data.slice(4, 36));
  const progData = await conn.getAccountInfo(programDataAddress);
  if (progData) {
    ok('ProgramData PDA found');
    info('PDA address:', programDataAddress.toBase58());
    info('Bytecode size:', `${progData.data.length} bytes`);
    info('Last upgrade slot:',
      Number(new DataView(progData.data.buffer, progData.data.byteOffset, 8).getBigUint64(0, true))
    );
  }

  // ── 5. Cluster liveness check ────────────────────────────
  banner('5️⃣  Cluster liveness');
  const slot = await conn.getSlot();
  const blockTime = await conn.getBlockTime(slot);
  ok('Devnet is producing blocks');
  info('Current slot:', slot);
  info('Block time:', new Date(blockTime * 1000).toISOString());

  // ── Done ─────────────────────────────────────────────────
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   ✅ MVP demo passed — KeyShield is live on Solana devnet ║
║                                                            ║
║   Explorer:                                                ║
║   https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet
╚════════════════════════════════════════════════════════════╝
`);
}

main().catch((e) => {
  console.error(`\n❌ Demo failed: ${e.message}`);
  if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  process.exit(1);
});
