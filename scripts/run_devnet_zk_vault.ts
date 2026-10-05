#!/usr/bin/env npx tsx
/**
 * Devnet runner for the 3-ix zk vault path:
 *   initialize_vault (40) → register_root (41) → verify_and_execute (42)
 *
 * SOL deposit + SOL payout. Proof bytes are a scaffold assertion
 * (non-empty), not Groth16 / alt_bn128 pairing. Passkey verify stays
 * client-layer.
 *
 * If live program `41P2wHK…` rejects disc 40, this script does **not**
 * pretend the ix landed. It records the simulation error and may send a
 * separately labeled wallet-liveness transfer.
 *
 *   npx tsx scripts/run_devnet_zk_vault.ts
 *
 * Wallet: `.keyshield-devnet/user-devnet.json` (never printed).
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  PROGRAM_ID_DEFAULT,
  buildInitializeVaultIx,
  buildRegisterRootIx,
  buildVerifyAndExecuteIx,
  deriveZkNullifierPda,
  deriveZkVaultPda,
  encodeScaffoldProof,
} from "./zk_vault_ix.ts";
import {
  PROGRAM_ID_DEFAULT as LIVE_PROGRAM,
  buildCreateUniversalVaultIx,
  deriveVaultPda,
} from "./live_e2e_run.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const USER_PATH = join(ROOT, ".keyshield-devnet/user-devnet.json");
const PROVIDER_PATH = join(ROOT, ".keyshield-devnet/mpp-settler-devnet.json");
const ARTIFACT_DIR = "/opt/cursor/artifacts";
const RPC = process.env.KS_RPC_URL || process.env.KS_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(process.env.KS_KEYSHIELD_PROGRAM_ID || PROGRAM_ID_DEFAULT);
const DEPOSIT_LAMPORTS = Number(process.env.KS_ZK_DEPOSIT_LAMPORTS || 10_000_000);
const EXECUTE_LAMPORTS = Number(process.env.KS_ZK_EXECUTE_LAMPORTS || 5_000_000);
const EXPLORER = "https://explorer.solana.com/tx";

type Report = {
  programId: string;
  owner: string;
  vaultPda: string;
  destination: string;
  verifier: "scaffold-sha256";
  groth16: false;
  altBn128: false;
  liveProgramHasZkIxs: boolean | null;
  simulation: { ok: boolean; err: string | null; logs: string[] };
  txs: Array<{ name: string; signature: string; explorer: string; kind: "zk-vault" | "fallback-labeled" }>;
  fallback?: { reason: string; name: string };
};

function loadKeypair(path: string): Keypair {
  if (!existsSync(path)) throw new Error(`missing keypair: ${path}`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as number[] | { _keypair?: { secretKey: number[] } };
  const secret = Array.isArray(raw) ? raw : raw._keypair?.secretKey;
  if (!secret) throw new Error(`unrecognized keypair json: ${path}`);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function hex32(label: string): Buffer {
  return createHash("sha256").update(label).digest();
}

async function simulate(
  conn: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
): Promise<{ ok: boolean; err: string | null; logs: string[] }> {
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(...ixs);
  tx.sign(payer);
  const sim = await conn.simulateTransaction(tx);
  const err = sim.value.err ? JSON.stringify(sim.value.err) : null;
  return { ok: !sim.value.err, err, logs: sim.value.logs ?? [] };
}

async function send(
  conn: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(conn, tx, [payer], {
    commitment: "confirmed",
    skipPreflight: false,
  });
}

function explorer(sig: string): string {
  return `${EXPLORER}/${sig}?cluster=devnet`;
}

async function main(): Promise<void> {
  const user = loadKeypair(USER_PATH);
  const dest = existsSync(PROVIDER_PATH) ? loadKeypair(PROVIDER_PATH).publicKey : user.publicKey;
  const conn = new Connection(RPC, "confirmed");
  const [vaultPda, vaultBump] = deriveZkVaultPda(PROGRAM_ID, user.publicKey);
  const root = hex32("ks-devnet-commitment-root-v1");
  const nullifier = randomBytes(32);
  const actionHash = hex32(`ks-action:${Date.now()}`);
  const [nullifierPda, nullifierBump] = deriveZkNullifierPda(PROGRAM_ID, nullifier);

  const report: Report = {
    programId: PROGRAM_ID.toBase58(),
    owner: user.publicKey.toBase58(),
    vaultPda: vaultPda.toBase58(),
    destination: dest.toBase58(),
    verifier: "scaffold-sha256",
    groth16: false,
    altBn128: false,
    liveProgramHasZkIxs: null,
    simulation: { ok: false, err: null, logs: [] },
    txs: [],
  };

  console.log("Program ID:", report.programId);
  console.log("Owner:", report.owner);
  console.log("Zk vault PDA [keyshield, owner]:", report.vaultPda);
  console.log("Destination:", report.destination);
  console.log("Verifier: scaffold-sha256 (NOT Groth16 / alt_bn128)");
  if (PROGRAM_ID.toBase58() !== LIVE_PROGRAM) {
    console.log("Note: KS_KEYSHIELD_PROGRAM_ID overrides default", LIVE_PROGRAM);
  }

  const programAcc = await conn.getAccountInfo(PROGRAM_ID);
  if (!programAcc?.executable) {
    throw new Error(`program ${report.programId} is not executable on this RPC`);
  }
  const bal = await conn.getBalance(user.publicKey);
  const slot = await conn.getSlot("confirmed");
  console.log("Owner SOL lamports:", bal);
  console.log("Slot:", slot);
  if (bal < DEPOSIT_LAMPORTS + EXECUTE_LAMPORTS + 2_000_000) {
    throw new Error(`owner balance ${bal} too low for deposit ${DEPOSIT_LAMPORTS}`);
  }

  const initIx = buildInitializeVaultIx({
    programId: PROGRAM_ID,
    owner: user.publicKey,
    vaultPda,
    bump: vaultBump,
    spendCap: DEPOSIT_LAMPORTS,
    merkleRoot: root,
    depositLamports: DEPOSIT_LAMPORTS,
  });
  report.simulation = await simulate(conn, user, [initIx]);
  report.liveProgramHasZkIxs = report.simulation.ok;
  console.log("Simulate initialize_vault (ix 40):", report.simulation.ok ? "OK" : report.simulation.err);
  if (report.simulation.logs.length) {
    console.log("Sim logs (tail):");
    for (const line of report.simulation.logs.slice(-12)) console.log(" ", line);
  }

  if (report.simulation.ok) {
    const existing = await conn.getAccountInfo(vaultPda);
    if (!existing) {
      const sig1 = await send(conn, user, [initIx]);
      report.txs.push({ name: "initialize_vault", signature: sig1, explorer: explorer(sig1), kind: "zk-vault" });
      console.log("Tx initialize_vault:", sig1);
    } else {
      console.log("Vault PDA already exists — skip initialize_vault");
    }

    const rootIx = buildRegisterRootIx({
      programId: PROGRAM_ID,
      owner: user.publicKey,
      vaultPda,
      merkleRoot: root,
    });
    const sig2 = await send(conn, user, [rootIx]);
    report.txs.push({ name: "register_root", signature: sig2, explorer: explorer(sig2), kind: "zk-vault" });
    console.log("Tx register_root:", sig2);

    const execIx = buildVerifyAndExecuteIx({
      programId: PROGRAM_ID,
      payer: user.publicKey,
      vaultPda,
      nullifierPda,
      destination: dest,
      nullifier,
      actionHash,
      amount: EXECUTE_LAMPORTS,
      validUntilSlot: slot + 10_000,
      nullifierBump,
      proof: encodeScaffoldProof({
        nullifier,
        actionHash,
        amount: EXECUTE_LAMPORTS,
        validUntilSlot: slot + 10_000,
        merkleRoot: root,
      }),
    });
    const execSim = await simulate(conn, user, [execIx]);
    console.log("Simulate verify_and_execute (ix 42):", execSim.ok ? "OK" : execSim.err);
    if (!execSim.ok) {
      report.simulation = execSim;
      throw new Error(`verify_and_execute simulation failed: ${execSim.err}`);
    }
    const sig3 = await send(conn, user, [execIx]);
    report.txs.push({
      name: "verify_and_execute",
      signature: sig3,
      explorer: explorer(sig3),
      kind: "zk-vault",
    });
    console.log("Tx verify_and_execute:", sig3);
    console.log("Confirmed on Devnet. Amount lamports:", EXECUTE_LAMPORTS, "(SOL, not USDC)");
  } else {
    report.fallback = {
      reason:
        "Live program rejected ix 40. 41P2wHK… likely predates zk vault ixs 40–43. Upgrade required. Not claiming Groth16.",
      name: "wallet_liveness_transfer",
    };
    console.log(report.fallback.reason);

    const [uvPda, uvBump] = deriveVaultPda(PROGRAM_ID, user.publicKey);
    const uv = await conn.getAccountInfo(uvPda);
    if (!uv) {
      const createUv = buildCreateUniversalVaultIx(PROGRAM_ID, user.publicKey, uvPda, uvBump);
      const uvSim = await simulate(conn, user, [createUv]);
      console.log("Fallback simulate CreateUniversalVault ix 10:", uvSim.ok ? "OK" : uvSim.err);
      if (uvSim.ok) {
        const sig = await send(conn, user, [createUv]);
        report.txs.push({
          name: "fallback_create_universal_vault",
          signature: sig,
          explorer: explorer(sig),
          kind: "fallback-labeled",
        });
        console.log("Fallback Tx (ix 10, NOT zk vault):", sig);
      }
    } else {
      console.log("Universal vault already on-chain — skip ix 10 fallback");
    }

    const live = SystemProgram.transfer({
      fromPubkey: user.publicKey,
      toPubkey: dest,
      lamports: 5_000,
    });
    const sig = await send(conn, user, [live]);
    report.txs.push({
      name: "fallback_wallet_liveness_5000_lamports",
      signature: sig,
      explorer: explorer(sig),
      kind: "fallback-labeled",
    });
    console.log("Fallback Tx (SystemProgram.transfer, NOT verify_and_execute):", sig);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const out = join(ARTIFACT_DIR, "zk-vault-devnet.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log("Wrote", out);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
