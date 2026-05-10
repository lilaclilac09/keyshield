#!/usr/bin/env node
/**
 * bootstrap-fresh-agent.mjs — register a fresh agent with the on-chain
 * UniversalVault so the next `mpp-e2e-devnet.mjs` run gets a clean
 * stream-PDA to open against.
 *
 * Why this exists: the vault still holds an agent grant (and an
 * already-open stream PDA) for `agent_pubkey == owner` from a prior
 * pre-ATA-fix run. Re-running the e2e against the same agent hits
 * `PaymentStreamActive` (custom 6051 / 0x17a3). To verify the ATA fix
 * end-to-end we need a *new* (agent, owner) tuple, which derives a
 * fresh AgentPaymentStream PDA the program is willing to create.
 *
 * What it does:
 *   1. Generate (or load) a fresh agent keypair → /tmp/keyshield-test-agent.json
 *   2. Derive the vault PDA + verify it exists on-chain.
 *   3. Build + sign + submit `process_grant_agent_access` (ix #20):
 *        rate_limit_calls    = 1000/hr
 *        rate_limit_tokens   = 1_000_000/min
 *        session_timeout     = 86400s
 *        max_spend           = 1_000_000 micro-USDC (1 USDC cap)
 *        payment_stream_enabled = 0   (skips vault.flags & 0x08 check)
 *        zk_proof_length     = 0     (direct pubkey, no ZK)
 *        allowed_endpoints   = 0
 *        allowed_models      = 0
 *   4. Confirm tx, print the new agent pubkey.
 *   5. Print the exact env-var line to feed `mpp-e2e-devnet.mjs`:
 *        KS_AGENT_PUBKEY=<new pubkey> node src/scripts/mpp-e2e-devnet.mjs
 *
 * Idempotent-ish: if the keypair file already exists it's reused. The
 * grant ix itself isn't strictly idempotent — running twice for the
 * same agent overwrites the existing slot's data, but doesn't crash.
 *
 * Required env: same Solana RPC as the rest of the stack (devnet by default).
 *
 * Run:
 *   node src/scripts/bootstrap-fresh-agent.mjs
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── Config ──────────────────────────────────────────────────────────
const RPC_URL    = process.env.KS_RPC_URL    ?? 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.KS_PROGRAM_ID ?? '41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j');
const OWNER_KP   = path.join(os.homedir(), '.config', 'solana', 'id.json');
const AGENT_KP   = process.env.KS_AGENT_KEYPAIR_FILE ?? '/tmp/keyshield-test-agent.json';

// Vault SIZE — should match `UniversalVault::SIZE` in state.rs.
const VAULT_SIZE = Number(process.env.KS_VAULT_SIZE ?? 2992);

// Discriminator for `Instruction::GrantAgentUniversalAccess` — see
// programs/keyshield/src/instructions/mod.rs (variant index 20).
const IX_GRANT_AGENT = 20;
const VAULT_SEED = Buffer.from('universal_vault');

// ── Tiny print helpers ──────────────────────────────────────────────
const c = process.stdout.isTTY
  ? { step: (s) => `\x1b[36;1m${s}\x1b[0m`, ok: (s) => `\x1b[32m${s}\x1b[0m`,
      err: (s) => `\x1b[31m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` }
  : { step: (s) => s, ok: (s) => s, err: (s) => s, dim: (s) => s };
const banner = (s) => console.log('\n' + c.step(`▶ ${s}`));
const ok = (s) => console.log(`  ${c.ok('✓')} ${s}`);
const die = (s) => { console.error(`  ${c.err('✗')} ${s}`); process.exit(1); };
const detail = (k, v) => console.log(`    ${c.dim(k.padEnd(22))} ${v}`);

// ── Load / mint agent keypair ───────────────────────────────────────
function loadOrCreate(filePath, label) {
  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  fs.chmodSync(filePath, 0o600);
  console.log(`  ${c.dim('•')} created new ${label} keypair at ${filePath}`);
  return kp;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  bootstrap-fresh-agent — grant a new agent to the vault     ║
╚══════════════════════════════════════════════════════════════╝`);

  banner('1. load owner + agent keypairs');
  if (!fs.existsSync(OWNER_KP)) die(`No owner keypair at ${OWNER_KP}`);
  const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(OWNER_KP, 'utf8'))));
  detail('owner pubkey:', owner.publicKey.toBase58());
  const agent = loadOrCreate(AGENT_KP, 'agent');
  detail('agent pubkey:', agent.publicKey.toBase58());
  detail('agent kp file:', AGENT_KP);
  ok('keypairs ready');

  banner('2. derive + check vault PDA');
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, owner.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  detail('vault PDA:', `${vaultPda.toBase58()} (bump=${vaultBump})`);
  const conn = new Connection(RPC_URL, 'confirmed');
  const vaultAcc = await conn.getAccountInfo(vaultPda);
  if (!vaultAcc) die(`vault PDA not on chain — run a vault-create flow first`);
  if (!vaultAcc.owner.equals(PROGRAM_ID)) {
    die(`vault PDA owner ${vaultAcc.owner.toBase58()} ≠ KeyShield program`);
  }
  if (vaultAcc.data.length < VAULT_SIZE) {
    die(`vault data ${vaultAcc.data.length} < expected ${VAULT_SIZE}`);
  }
  ok('vault on chain ✓');

  banner('3. build + sign + submit GrantAgentAccess (ix #20)');
  // Layout per programs/keyshield/src/instructions/agent_access.rs:60+
  //   discriminator (1)              ← outer-tx adds it
  //   agent_pubkey (32)
  //   key_group (1)
  //   rate_limit_calls (4 LE u32)
  //   rate_limit_tokens (4 LE u32)
  //   session_timeout (8 LE u64)
  //   max_spend_micro_usdc (8 LE u64)
  //   payment_stream_enabled (1)
  //   zk_proof_length (2 LE u16)
  //   allowed_endpoints_count (1)
  //   allowed_models_count (1)
  const data = Buffer.alloc(63);
  let p = 0;
  data.writeUInt8(IX_GRANT_AGENT, p); p += 1;
  agent.publicKey.toBuffer().copy(data, p); p += 32;
  data.writeUInt8(255, p); p += 1;                                    // key_group = universal
  data.writeUInt32LE(1000, p); p += 4;                                 // rate_limit_calls
  data.writeUInt32LE(1_000_000, p); p += 4;                            // rate_limit_tokens
  data.writeBigUInt64LE(86400n, p); p += 8;                            // session_timeout
  data.writeBigUInt64LE(1_000_000n, p); p += 8;                        // max_spend = 1 USDC
  data.writeUInt8(0, p); p += 1;                                       // payment_stream_enabled = 0
  data.writeUInt16LE(0, p); p += 2;                                    // zk_proof_length = 0
  data.writeUInt8(0, p); p += 1;                                       // allowed_endpoints_count
  data.writeUInt8(0, p); p += 1;                                       // allowed_models_count

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner.publicKey, isSigner: true,  isWritable: false },
      { pubkey: vaultPda,        isSigner: false, isWritable: true  },
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: owner.publicKey, blockhash, lastValidBlockHeight }).add(ix);
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
    die(`grant ix failed: ${msg}`);
  }

  banner('4. ready — feed this into mpp-e2e-devnet.mjs');
  console.log(`
  ${c.ok('Run the e2e against the new agent:')}

      ${c.dim('# Same shell — backend should already be running')}
      KS_AGENT_PUBKEY=${agent.publicKey.toBase58()} \\
        node src/scripts/mpp-e2e-devnet.mjs

  This time stream PDA will derive from the new (agent, owner) tuple
  → fresh PDA → no PaymentStreamActive collision → end-to-end runs
  through, including the on-chain settle that proves the ATA fix.
`);
}

main().catch((e) => {
  console.error(`\n${c.err('FATAL')}: ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
