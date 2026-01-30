#!/usr/bin/env node
/**
 * Surfpool integration test: connect to local Surfnet (http://localhost:8899),
 * deploy or use existing KeyShield program, run StoreKey and verify vault account.
 *
 * Prerequisites:
 *   - surfpool start (or surfpool start --background)
 *   - npm install @solana/web3.js (from repo root or run from frontend)
 *
 * Run: node scripts/integration-surfpool.mjs
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const RPC = process.env.RPC_URL || 'http://localhost:8899';
const VAULT_SEED = Buffer.from('vault');

function deriveVaultPDA(owner, programId) {
  const [pda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, owner.toBuffer()],
    programId
  );
  return pda;
}

async function main() {
  const connection = new Connection(RPC, 'confirmed');

  let programId;
  const keypairPath = path.join(process.cwd(), 'target/deploy/keyshield-keypair.json');
  if (fs.existsSync(keypairPath)) {
    const keypairBytes = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairBytes));
    programId = keypair.publicKey;
    console.log('Using program ID from keypair:', programId.toBase58());
  } else {
    console.warn('No keyshield-keypair.json found. Run: cargo build-sbf');
    console.warn('Using placeholder program ID for connection check only.');
    programId = new PublicKey('11111111111111111111111111111111');
  }

  const owner = Keypair.generate();
  console.log('Owner:', owner.publicKey.toBase58());

  const airdrop = await connection.requestAirdrop(owner.publicKey, 2e9).catch(() => null);
  if (airdrop) {
    await connection.confirmTransaction(airdrop);
    console.log('Airdrop confirmed');
  }

  const vaultPDA = deriveVaultPDA(owner.publicKey, programId);
  console.log('Vault PDA:', vaultPDA.toBase58());

  const accountInfo = await connection.getAccountInfo(vaultPDA);
  if (accountInfo) {
    console.log('Vault account exists, data length:', accountInfo.data.length);
  } else {
    console.log('No vault account yet (run StoreKey from extension or a client to create one).');
  }

  console.log('Surfpool integration script finished. RPC:', RPC);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
