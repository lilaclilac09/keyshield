/**
 * Pinocchio zk-vault surface on 41P2wHK… — ixs 40–43.
 * Spec names: init_vault / update_policy / execute_action / revoke_grant.
 *
 * On-chain proof is tagged:
 *   0x00 scaffold-sha256 — binds public inputs (not pairing)
 *   0x01 Groth16 — rejected until a VK is installed
 * Passkey verify stays client-layer (WebAuthn PRF).
 */
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { concatBytes, fromHex, sha256, te } from './bytes';
import type { AuthorizationProof } from './zk';

export const ONCHAIN_VERIFIER = 'scaffold-sha256' as const;
export const PROOF_KIND_SCAFFOLD = 0x00;
export const PROOF_KIND_GROTH16 = 0x01;
export const GROTH16_VK_INSTALLED = false;
export const PROGRAM_ID_DEFAULT = '41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j';
export const ZK_VAULT_SEED = new TextEncoder().encode('keyshield');
export const ZK_NULLIFIER_SEED = new TextEncoder().encode('nullifier');
export const IX_INIT_ZK_VAULT = 40;
export const IX_REGISTER_ROOT = 41;
export const IX_VERIFY_AND_EXECUTE = 42;
export const IX_REVOKE_ZK_GRANT = 43;

export interface PlannedIxs {
  verifier: typeof ONCHAIN_VERIFIER;
  programNote: string;
  ixs: {
    name: string;
    args: Record<string, string>;
  }[];
}

function u64le(n: bigint | number | string): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function b32(hex: string): Uint8Array {
  const u = fromHex(hex);
  if (u.length !== 32) throw new Error(`expected 32-byte hex, got ${u.length}`);
  return u;
}

export async function encodeScaffoldOnchainProof(args: {
  nullifierHex: string;
  actionHashHex: string;
  amount: bigint | number | string;
  validUntilSlot: bigint | number | string;
  merkleRootHex: string;
}): Promise<Uint8Array> {
  const digest = await sha256(
    concatBytes(
      te('ks-scaffold-v1'),
      b32(args.nullifierHex),
      b32(args.actionHashHex),
      u64le(args.amount),
      u64le(args.validUntilSlot),
      b32(args.merkleRootHex),
    ),
  );
  return concatBytes(new Uint8Array([PROOF_KIND_SCAFFOLD]), digest);
}

export function programId(): PublicKey {
  return new PublicKey(PROGRAM_ID_DEFAULT);
}

export function deriveZkVaultPda(owner: PublicKey, pid = programId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(ZK_VAULT_SEED), owner.toBuffer()], pid);
}

export function deriveZkNullifierPda(
  nullifierHex: string,
  pid = programId(),
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(ZK_NULLIFIER_SEED), Buffer.from(b32(nullifierHex))], pid);
}

export function buildInitializeVaultIx(args: {
  owner: PublicKey;
  spendCap: bigint | number | string;
  merkleRootHex: string;
  depositLamports?: bigint | number;
  pid?: PublicKey;
}): TransactionInstruction {
  const pid = args.pid ?? programId();
  const [vault, bump] = deriveZkVaultPda(args.owner, pid);
  return new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concat(
        new Uint8Array([IX_INIT_ZK_VAULT]),
        u64le(args.spendCap),
        b32(args.merkleRootHex),
        new Uint8Array([bump]),
        u64le(args.depositLamports ?? 0),
      ),
    ),
  });
}

export function buildRegisterRootIx(args: {
  owner: PublicKey;
  merkleRootHex: string;
  pid?: PublicKey;
}): TransactionInstruction {
  const pid = args.pid ?? programId();
  const [vault] = deriveZkVaultPda(args.owner, pid);
  return new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(concat(new Uint8Array([IX_REGISTER_ROOT]), b32(args.merkleRootHex))),
  });
}

export function buildVerifyAndExecuteIx(args: {
  payer: PublicKey;
  destination: PublicKey;
  nullifierHex: string;
  actionHashHex: string;
  amount: bigint | number | string;
  validUntilSlot: bigint | number | string;
  proof: Uint8Array;
  pid?: PublicKey;
}): TransactionInstruction {
  if (args.proof.length === 0) throw new Error('scaffold proof must be non-empty');
  const pid = args.pid ?? programId();
  const [vault] = deriveZkVaultPda(args.payer, pid);
  const [nullifierPda, nBump] = deriveZkNullifierPda(args.nullifierHex, pid);
  return new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: nullifierPda, isSigner: false, isWritable: true },
      { pubkey: args.destination, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concat(
        new Uint8Array([IX_VERIFY_AND_EXECUTE]),
        b32(args.nullifierHex),
        b32(args.actionHashHex),
        u64le(args.amount),
        u64le(args.validUntilSlot),
        new Uint8Array([nBump]),
        args.proof,
      ),
    ),
  });
}

export function planVerifyExecute(proof: AuthorizationProof, amount: string): PlannedIxs {
  return {
    verifier: ONCHAIN_VERIFIER,
    programNote:
      'Pinocchio ixs 40–43. Scaffold 0x00 binds public inputs. Groth16 0x01 calls alt_bn128 only after a VK is installed — currently fail-closed, not live pairing. Passkey stays client-layer. Live 41P2wHK… must be upgraded before 40–43 land.',
    ixs: [
      {
        name: 'init_vault',
        args: {
          spend_cap: proof.publicInputs.spendCap,
          merkle_root: proof.publicInputs.merkleRoot,
          seeds: '[b"keyshield", owner]',
          disc: String(IX_INIT_ZK_VAULT),
        },
      },
      {
        name: 'update_policy',
        args: {
          new_spend_cap: proof.publicInputs.spendCap,
          new_root: proof.publicInputs.merkleRoot,
          disc: String(IX_REGISTER_ROOT),
        },
      },
      {
        name: 'execute_action',
        args: {
          nullifier: proof.publicInputs.nullifier,
          action_hash: proof.publicInputs.actionHash,
          amount,
          proof_kind: proof.kind,
          proof: proof.proofHex,
          seeds: '[b"nullifier", nullifier_hash]',
          disc: String(IX_VERIFY_AND_EXECUTE),
        },
      },
      {
        name: 'revoke_grant',
        args: {
          disc: String(IX_REVOKE_ZK_GRANT),
          note: 'owner-only; not a chain rollback of a landed execute',
        },
      },
    ],
  };
}
