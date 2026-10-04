import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  AGENT_GRANT_SIZE,
  AGENT_GRANTS_START,
  CREATE_VAULT_DISC,
  GRANT_ACCESS_DISC,
  GRANT_IS_ACTIVE_OFFSET,
  PAYMENT_ENABLED_FLAG,
  UPDATE_POLICY_DISC,
  VAULT_DISC,
  VAULT_FLAGS_OFFSET,
  buildCreateUniversalVaultIx,
  buildGrantAgentAccessIx,
  buildUpdateUniversalPolicyFlagsIx,
  deriveVaultPda,
  vaultHasActiveGrant,
  vaultHasPaymentsEnabled,
} from "../scripts/live_e2e_run.ts";

const PROGRAM_ID = new PublicKey("41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j");

describe("live e2e vault + grant builders", () => {
  it("CreateUniversalVault is disc 10 + bump with owner/vault/system", () => {
    const owner = Keypair.generate().publicKey;
    const [vault, bump] = deriveVaultPda(PROGRAM_ID, owner);
    const ix = buildCreateUniversalVaultIx(PROGRAM_ID, owner, vault, bump);
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
    expect(Buffer.from(ix.data)).toEqual(Buffer.from([CREATE_VAULT_DISC, bump]));
    expect(ix.keys).toHaveLength(3);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[1].pubkey.equals(vault)).toBe(true);
    expect(ix.keys[2].pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("UpdateUniversalPolicy set_flags writes 0x08", () => {
    const owner = Keypair.generate().publicKey;
    const [vault] = deriveVaultPda(PROGRAM_ID, owner);
    const ix = buildUpdateUniversalPolicyFlagsIx(PROGRAM_ID, owner, vault);
    expect(ix.data[0]).toBe(UPDATE_POLICY_DISC);
    expect(ix.data.readUInt32LE(1)).toBe(PAYMENT_ENABLED_FLAG);
    expect(ix.data[5]).toBe(0);
    expect(ix.data.length).toBe(6);
  });

  it("GrantAgentAccess is 61 bytes matching agent_access.rs", () => {
    const owner = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const [vault] = deriveVaultPda(PROGRAM_ID, owner);
    const ix = buildGrantAgentAccessIx({
      programId: PROGRAM_ID,
      owner,
      vaultPda: vault,
      agent,
      sessionTimeout: 7200,
      maxSpendMicroUsdc: 5_000_000,
      paymentStreamEnabled: true,
    });
    expect(ix.data.length).toBe(61);
    expect(ix.data[0]).toBe(GRANT_ACCESS_DISC);
    expect(Buffer.from(ix.data.subarray(1, 33))).toEqual(Buffer.from(agent.toBytes()));
    expect(ix.data[33]).toBe(255);
    expect(Number(ix.data.readBigUInt64LE(42))).toBe(7200);
    expect(Number(ix.data.readBigUInt64LE(50))).toBe(5_000_000);
    expect(ix.data[58]).toBe(1);
    expect(ix.data.readUInt16LE(59)).toBe(0);
  });

  it("parses PAYMENT_ENABLED and an active grant slot", () => {
    const agent = Keypair.generate().publicKey;
    const data = Buffer.alloc(2992);
    data.write(VAULT_DISC, 0, 8, "utf8");
    data.writeUInt32LE(PAYMENT_ENABLED_FLAG, VAULT_FLAGS_OFFSET);
    const off = AGENT_GRANTS_START;
    Buffer.from(agent.toBytes()).copy(data, off);
    data[off + GRANT_IS_ACTIVE_OFFSET] = 1;
    expect(vaultHasPaymentsEnabled(data)).toBe(true);
    expect(vaultHasActiveGrant(data, agent)).toBe(true);
    expect(vaultHasActiveGrant(data, Keypair.generate().publicKey)).toBe(false);
    data[off + GRANT_IS_ACTIVE_OFFSET] = 0;
    expect(vaultHasActiveGrant(data, agent)).toBe(false);
    expect(data.length).toBeGreaterThan(AGENT_GRANTS_START + AGENT_GRANT_SIZE);
  });
});
