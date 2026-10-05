/**
 * Pinocchio zk-vault builders — ixs 40–43 on
 * `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`.
 *
 * Seeds: `[b"keyshield", owner]` and `[b"nullifier", hash]`.
 * On-chain proof: `0x00` scaffold digest binds public inputs.
 * `0x01` Groth16 is rejected until a VK is installed (not live).
 */
import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

export const PROGRAM_ID_DEFAULT = "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j";
export const ZK_VAULT_SEED = Buffer.from("keyshield");
export const ZK_NULLIFIER_SEED = Buffer.from("nullifier");
export const IX_INIT_ZK_VAULT = 40;
export const IX_REGISTER_ROOT = 41;
export const IX_VERIFY_AND_EXECUTE = 42;
export const IX_REVOKE_ZK_GRANT = 43;
export const ONCHAIN_VERIFIER = "scaffold-sha256" as const;
export const PROOF_KIND_SCAFFOLD = 0x00;
export const PROOF_KIND_GROTH16 = 0x01;
export const GROTH16_VK_INSTALLED = false;
export const SCAFFOLD_DOMAIN = Buffer.from("ks-scaffold-v1");
export const SCAFFOLD_DIR_LEFT = 0;
export const SCAFFOLD_DIR_RIGHT = 1;
export const SCAFFOLD_MAX_DEPTH = 16;

export function encodeScaffoldProof(args: {
  nullifier: Buffer | Uint8Array | number[] | string;
  actionHash: Buffer | Uint8Array | number[] | string;
  amount: number | bigint;
  validUntilSlot: number | bigint;
  merkleRoot: Buffer | Uint8Array | number[] | string;
  merklePath?: {
    leaf: Buffer | Uint8Array | number[] | string;
    leafIndex: number;
    siblings: Array<Buffer | Uint8Array | number[] | string>;
    dirs: Array<"L" | "R">;
  };
}): Buffer {
  const path = args.merklePath ?? {
    leaf: args.merkleRoot,
    leafIndex: 0,
    siblings: [] as Array<Buffer | Uint8Array | number[] | string>,
    dirs: [] as Array<"L" | "R">,
  };
  if (path.siblings.length !== path.dirs.length) {
    throw new Error("invalid scaffold path: siblings/dirs mismatch");
  }
  if (path.siblings.length > SCAFFOLD_MAX_DEPTH) {
    throw new Error(`invalid scaffold path: depth>${SCAFFOLD_MAX_DEPTH}`);
  }
  const depth = path.siblings.length;
  const suffix = Buffer.alloc(4 + 1 + depth * 33);
  suffix.writeUInt32LE(path.leafIndex >>> 0, 0);
  suffix[4] = depth;
  for (let i = 0; i < depth; i++) {
    suffix[5 + i * 33] = path.dirs[i] === "L" ? SCAFFOLD_DIR_LEFT : SCAFFOLD_DIR_RIGHT;
    as32(path.siblings[i]).copy(suffix, 5 + i * 33 + 1);
  }
  const leaf = as32(path.leaf);
  const pre = Buffer.concat([
    SCAFFOLD_DOMAIN,
    as32(args.nullifier),
    as32(args.actionHash),
    u64le(args.amount),
    u64le(args.validUntilSlot),
    as32(args.merkleRoot),
    leaf,
    suffix,
  ]);
  return Buffer.concat([Buffer.from([PROOF_KIND_SCAFFOLD]), createHash("sha256").update(pre).digest(), leaf, suffix]);
}

export function u64le(n: number | bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

export function as32(bytes: Buffer | Uint8Array | number[] | string): Buffer {
  if (typeof bytes === "string") {
    const h = bytes.trim().replace(/^0x/i, "");
    if (h.length !== 64) throw new Error(`expected 32-byte hex, got ${h.length / 2} bytes`);
    return Buffer.from(h, "hex");
  }
  const buf = Buffer.from(bytes);
  if (buf.length !== 32) throw new Error(`expected 32 bytes, got ${buf.length}`);
  return buf;
}

export function deriveZkVaultPda(
  programId: PublicKey,
  owner: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ZK_VAULT_SEED, owner.toBuffer()], programId);
}

export function deriveZkNullifierPda(
  programId: PublicKey,
  nullifier: Buffer | Uint8Array | number[] | string,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ZK_NULLIFIER_SEED, as32(nullifier)], programId);
}

export function buildInitializeVaultIx(args: {
  programId: PublicKey;
  owner: PublicKey;
  vaultPda: PublicKey;
  bump: number;
  spendCap: number | bigint;
  merkleRoot: Buffer | Uint8Array | number[] | string;
  depositLamports?: number | bigint;
}): TransactionInstruction {
  const deposit = args.depositLamports ?? 0;
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([IX_INIT_ZK_VAULT]),
      u64le(args.spendCap),
      as32(args.merkleRoot),
      Buffer.from([args.bump]),
      u64le(deposit),
    ]),
  });
}

export function buildRegisterRootIx(args: {
  programId: PublicKey;
  owner: PublicKey;
  vaultPda: PublicKey;
  merkleRoot: Buffer | Uint8Array | number[] | string;
  spendCap?: number | bigint;
}): TransactionInstruction {
  const body =
    args.spendCap === undefined
      ? as32(args.merkleRoot)
      : Buffer.concat([u64le(args.spendCap), as32(args.merkleRoot)]);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: false },
      { pubkey: args.vaultPda, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([Buffer.from([IX_REGISTER_ROOT]), body]),
  });
}

export function buildUpdatePolicyIx(args: {
  programId: PublicKey;
  owner: PublicKey;
  vaultPda: PublicKey;
  spendCap: number | bigint;
  merkleRoot: Buffer | Uint8Array | number[] | string;
}): TransactionInstruction {
  return buildRegisterRootIx({
    programId: args.programId,
    owner: args.owner,
    vaultPda: args.vaultPda,
    spendCap: args.spendCap,
    merkleRoot: args.merkleRoot,
  });
}

export function buildVerifyAndExecuteIx(args: {
  programId: PublicKey;
  payer: PublicKey;
  vaultPda: PublicKey;
  nullifierPda: PublicKey;
  destination: PublicKey;
  nullifier: Buffer | Uint8Array | number[] | string;
  actionHash: Buffer | Uint8Array | number[] | string;
  amount: number | bigint;
  validUntilSlot: number | bigint;
  nullifierBump: number;
  proof: Buffer | Uint8Array;
}): TransactionInstruction {
  const proof = Buffer.from(args.proof);
  if (proof.length === 0) throw new Error("scaffold proof must be non-empty");
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: args.vaultPda, isSigner: false, isWritable: true },
      { pubkey: args.nullifierPda, isSigner: false, isWritable: true },
      { pubkey: args.destination, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([IX_VERIFY_AND_EXECUTE]),
      as32(args.nullifier),
      as32(args.actionHash),
      u64le(args.amount),
      u64le(args.validUntilSlot),
      Buffer.from([args.nullifierBump]),
      proof,
    ]),
  });
}

export function buildRevokeZkGrantIx(args: {
  programId: PublicKey;
  owner: PublicKey;
  vaultPda: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: false },
      { pubkey: args.vaultPda, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IX_REVOKE_ZK_GRANT]),
  });
}
