#!/usr/bin/env node
/**
 * Read-only Devnet verification. No transactions, no airdrops, no upgrades.
 * Writes sanitized JSON to KS_EVIDENCE_OUT (default stdout).
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { writeFileSync } from "node:fs";

const PROGRAM_ID = new PublicKey("41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j");
const PROGRAMDATA = new PublicKey("48Ji7Wmwe8DDQxnGpbBRs2ey9oGo2qwdxTEodhwJk2nx");
const STREAM = new PublicKey("E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR");
const VAULT = new PublicKey("9MYSdKcRkg1F9hpYmUXsknEyuQ2vzqtW5JDdfsxnTqmV");
const STREAM_ATA = new PublicKey("6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH");
const USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const APS_SEED = Buffer.from("agent_payment_stream");
const VAULT_SEED = Buffer.from("universal_vault");

const TXS = [
  {
    sig: "t6B8V4WgF3DLWsmWpVaukoogvrsTxY8MtKnLXijYReAmKeoEgaQntoSy9Jd5ZYT8fJJzRzshVSrkHbT5tgyGVEh",
    reportedSlot: 507665661,
  },
  {
    sig: "u99eN5uhtTHrLBNiWCUzHLJgvj85cLnJ2Xhnhk57Zg7z7GHLDesyiEpGxKuGzP9RtNUQ9PHg2o7wwXUbwr9peyi",
    reportedSlot: 507665693,
  },
  {
    sig: "678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVh6K1zGEbq4nPmbLfDKKSiUx2nrT6XTQc",
    reportedSlot: 461386827,
  },
];

const RPC = process.env.KS_DEVNET_RPC || "https://api.devnet.solana.com";
const SANITIZED_RPC = "https://api.devnet.solana.com";
const COMMITMENT = "confirmed";

function b58(buf) {
  return new PublicKey(buf).toBase58();
}

function decodeProgramdata(data) {
  // UpgradeableLoaderState::ProgramData: 4-byte enum + slot u64 + option pubkey
  const slot = data.readBigUInt64LE(4);
  const hasAuth = data[12] === 1;
  const authority = hasAuth ? b58(data.subarray(13, 45)) : null;
  return { slot: Number(slot), authority, dataLen: data.length };
}

function decodeProgram(data) {
  // UpgradeableLoaderState::Program: 4-byte enum + programdata pubkey
  return { programdata: b58(data.subarray(4, 36)) };
}

async function main() {
  const utc = new Date().toISOString();
  const conn = new Connection(RPC, COMMITMENT);
  const out = {
    kind: "read-only-devnet-verification",
    utc,
    commitment: COMMITMENT,
    rpc: SANITIZED_RPC,
    sourceSha: process.env.KS_SOURCE_SHA || null,
  };

  const infos = {};
  for (const [name, pk] of Object.entries({
    program: PROGRAM_ID,
    programdata: PROGRAMDATA,
    stream: STREAM,
    vault: VAULT,
    streamAta: STREAM_ATA,
    usdc: USDC,
  })) {
    const info = await conn.getAccountInfo(pk, COMMITMENT);
    if (!info) {
      infos[name] = { address: pk.toBase58(), present: false };
      continue;
    }
    infos[name] = {
      address: pk.toBase58(),
      present: true,
      executable: info.executable,
      owner: info.owner.toBase58(),
      lamports: info.lamports,
      dataLen: info.data.length,
    };
    if (name === "program") {
      infos[name].decoded = decodeProgram(info.data);
      infos[name].loaderIsUpgradeable = info.owner.equals(UPGRADEABLE);
    }
    if (name === "programdata") {
      infos[name].decoded = decodeProgramdata(info.data);
    }
    if (name === "stream" && info.data.length >= 72) {
      const disc = info.data.subarray(0, 8).toString("utf8");
      const owner = b58(info.data.subarray(8, 40));
      const agent = b58(info.data.subarray(40, 72));
      infos[name].decoded = { discriminator: disc, owner, agent };
      const [derivedStream] = PublicKey.findProgramAddressSync(
        [APS_SEED, new PublicKey(agent).toBuffer(), new PublicKey(owner).toBuffer()],
        PROGRAM_ID,
      );
      const [derivedVault] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, new PublicKey(owner).toBuffer()],
        PROGRAM_ID,
      );
      infos[name].pda = {
        derivedStream: derivedStream.toBase58(),
        matchesSuppliedStream: derivedStream.equals(STREAM),
        derivedVault: derivedVault.toBase58(),
        matchesSuppliedVault: derivedVault.equals(VAULT),
        seeds: {
          stream: ["agent_payment_stream", "agent", "owner"],
          vault: ["universal_vault", "owner"],
        },
      };
    }
  }
  out.accounts = infos;

  out.transactions = [];
  for (const tx of TXS) {
    try {
      const got = await conn.getTransaction(tx.sig, {
        commitment: COMMITMENT,
        maxSupportedTransactionVersion: 0,
      });
      if (!got) {
        out.transactions.push({
          signature: tx.sig,
          reportedSlot: tx.reportedSlot,
          status: "inconclusive-history-unavailable",
        });
        continue;
      }
      out.transactions.push({
        signature: tx.sig,
        reportedSlot: tx.reportedSlot,
        observedSlot: got.slot,
        slotMatches: got.slot === tx.reportedSlot,
        err: got.meta?.err ?? null,
        fee: got.meta?.fee ?? null,
        computeUnits: got.meta?.computeUnitsConsumed ?? null,
        logHead: (got.meta?.logMessages || []).slice(0, 12),
        explorer: `https://explorer.solana.com/tx/${tx.sig}?cluster=devnet`,
      });
    } catch (e) {
      out.transactions.push({
        signature: tx.sig,
        reportedSlot: tx.reportedSlot,
        status: "inconclusive-rpc-error",
        error: String(e).slice(0, 200),
      });
    }
  }

  const json = JSON.stringify(out, null, 2);
  const dest = process.env.KS_EVIDENCE_OUT;
  if (dest) writeFileSync(dest, json);
  else process.stdout.write(json + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
