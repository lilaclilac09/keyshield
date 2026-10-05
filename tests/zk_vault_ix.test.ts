import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  IX_INIT_ZK_VAULT,
  IX_REGISTER_ROOT,
  IX_VERIFY_AND_EXECUTE,
  PROGRAM_ID_DEFAULT,
  as32,
  buildInitializeVaultIx,
  buildRegisterRootIx,
  buildVerifyAndExecuteIx,
  deriveZkNullifierPda,
  deriveZkVaultPda,
  encodeScaffoldProof,
  PROOF_KIND_SCAFFOLD,
  u64le,
} from "../scripts/zk_vault_ix.ts";

const PROGRAM_ID = new PublicKey(PROGRAM_ID_DEFAULT);

describe("zk vault ix builders", () => {
  it("initialize_vault is disc 40 + cap|root|bump|deposit", () => {
    const owner = Keypair.generate().publicKey;
    const [vault, bump] = deriveZkVaultPda(PROGRAM_ID, owner);
    const root = Buffer.alloc(32, 7);
    const ix = buildInitializeVaultIx({
      programId: PROGRAM_ID,
      owner,
      vaultPda: vault,
      bump,
      spendCap: 10_000_000,
      merkleRoot: root,
      depositLamports: 10_000_000,
    });
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
    expect(ix.keys).toHaveLength(3);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[1].pubkey.equals(vault)).toBe(true);
    expect(ix.keys[2].pubkey.equals(SystemProgram.programId)).toBe(true);
    const data = Buffer.from(ix.data);
    expect(data[0]).toBe(IX_INIT_ZK_VAULT);
    expect(data.subarray(1, 9)).toEqual(u64le(10_000_000));
    expect(data.subarray(9, 41)).toEqual(root);
    expect(data[41]).toBe(bump);
    expect(data.subarray(42, 50)).toEqual(u64le(10_000_000));
    expect(data).toHaveLength(50);
  });

  it("register_root accepts 32-byte root-only", () => {
    const owner = Keypair.generate().publicKey;
    const [vault] = deriveZkVaultPda(PROGRAM_ID, owner);
    const root = Buffer.alloc(32, 9);
    const ix = buildRegisterRootIx({
      programId: PROGRAM_ID,
      owner,
      vaultPda: vault,
      merkleRoot: root,
    });
    expect(Buffer.from(ix.data)).toEqual(Buffer.concat([Buffer.from([IX_REGISTER_ROOT]), root]));
    expect(ix.keys).toHaveLength(2);
  });

  it("verify_and_execute is SOL 5-account path with client bump", () => {
    const payer = Keypair.generate().publicKey;
    const dest = Keypair.generate().publicKey;
    const [vault] = deriveZkVaultPda(PROGRAM_ID, payer);
    const nullifier = as32("11".repeat(32));
    const [nPda, nBump] = deriveZkNullifierPda(PROGRAM_ID, nullifier);
    const action = Buffer.alloc(32, 2);
    const root = Buffer.alloc(32, 3);
    const proof = encodeScaffoldProof({
      nullifier,
      actionHash: action,
      amount: 5_000_000,
      validUntilSlot: 99,
      merkleRoot: root,
    });
    expect(proof[0]).toBe(PROOF_KIND_SCAFFOLD);
    expect(proof).toHaveLength(33);
    const ix = buildVerifyAndExecuteIx({
      programId: PROGRAM_ID,
      payer,
      vaultPda: vault,
      nullifierPda: nPda,
      destination: dest,
      nullifier,
      actionHash: action,
      amount: 5_000_000,
      validUntilSlot: 99,
      nullifierBump: nBump,
      proof,
    });
    expect(ix.keys).toHaveLength(5);
    expect(ix.keys[3].pubkey.equals(dest)).toBe(true);
    expect(ix.keys[3].isWritable).toBe(true);
    const data = Buffer.from(ix.data);
    expect(data[0]).toBe(IX_VERIFY_AND_EXECUTE);
    expect(data[81]).toBe(nBump);
    expect(data.subarray(82)).toEqual(proof);
    expect(() =>
      buildVerifyAndExecuteIx({
        programId: PROGRAM_ID,
        payer,
        vaultPda: vault,
        nullifierPda: nPda,
        destination: dest,
        nullifier,
        actionHash: action,
        amount: 1,
        validUntilSlot: 1,
        nullifierBump: nBump,
        proof: Buffer.alloc(0),
      }),
    ).toThrow(/non-empty/);
  });
});
