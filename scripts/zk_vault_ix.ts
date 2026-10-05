/**
 * Pinocchio zk-vault builders — ixs 40–43 on
 * `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`.
 *
 * Seeds: `[b"keyshield", owner]` and `[b"nullifier", hash]`.
 * On-chain proof check is a non-empty-bytes scaffold, not Groth16 / alt_bn128.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

export const PROGRAM_ID_DEFAULT = "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j";
export const ZK_VAULT_SEED = Buffer.from("keyshield");
export const ZK_NULLIFIER_SEED = Buffer.from("nullifier");
export const IX_INIT_ZK_VAULT = 40;
export const IX_REGISTER_ROOT = 41;
export const IX_VERIFY_AND_EXECUTE = 42;
export const IX_REVOKE_ZK_GRANT = 43;
export const ONCHAIN_VERIFIER = "scaffold-sha256" as const;

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
