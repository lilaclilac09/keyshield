import { describe, it, expect } from 'vitest';
import { PublicKey, Keypair } from '@solana/web3.js';
import {
  SessionManager,
  parseActiveSessions,
  encodeGrantAgentAccessData,
  encodeRevokeAgentAccessData,
  encodeRevokeAllAgentsData,
  deriveUniversalVaultPda,
  isSessionExpired,
  IX,
  VAULT_LAYOUT,
  DEFAULT_SESSION_DURATION_SECS,
} from './session';

const PROGRAM_ID = new PublicKey('11111111111111111111111111111112');

/**
 * Build a fake UniversalVault byte buffer with `grants` slots filled in.
 * Mirrors the layout programs/keyshield/src/state.rs writes.
 */
function fakeVault(owner: PublicKey, grants: Array<{
  agent: PublicKey;
  createdAt: number;
  sessionTimeoutSecs: number;
  isActive: boolean;
}>): Uint8Array {
  const buf = new Uint8Array(18400);
  const dv = new DataView(buf.buffer);

  // Discriminator "univault"
  buf.set(new TextEncoder().encode(VAULT_LAYOUT.DISCRIMINATOR), 0);
  buf.set(owner.toBytes(), VAULT_LAYOUT.OWNER_OFFSET);
  buf[VAULT_LAYOUT.AGENT_GRANT_COUNT_OFFSET] = grants.filter((g) => g.isActive).length;

  for (let i = 0; i < grants.length && i < VAULT_LAYOUT.MAX_AGENTS; i++) {
    const g = grants[i];
    const off = VAULT_LAYOUT.AGENT_GRANTS_START + i * VAULT_LAYOUT.AGENT_GRANT_SIZE;
    buf.set(g.agent.toBytes(), off + VAULT_LAYOUT.GRANT_PUBKEY_OFFSET);
    dv.setBigUint64(off + VAULT_LAYOUT.GRANT_SESSION_TIMEOUT_OFFSET, BigInt(g.sessionTimeoutSecs), true);
    buf[off + VAULT_LAYOUT.GRANT_IS_ACTIVE_OFFSET] = g.isActive ? 1 : 0;
    dv.setBigUint64(off + VAULT_LAYOUT.GRANT_CREATED_AT_OFFSET, BigInt(g.createdAt), true);
  }
  return buf;
}

describe('encodeGrantAgentAccessData', () => {
  it('encodes discriminator 20 + 61 bytes total with defaults', () => {
    const agent = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const data = encodeGrantAgentAccessData({ ownerPubkey: owner, agentPubkey: agent });

    expect(data.length).toBe(61);
    expect(data[0]).toBe(IX.GRANT_AGENT_ACCESS);
    // Agent pubkey at offset 1..33.
    expect(Array.from(data.slice(1, 33))).toEqual(Array.from(agent.toBytes()));
    // key_group default = 255 (universal).
    expect(data[33]).toBe(255);
    // session_timeout at offset 42..50 should be 7200 (2h).
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(Number(dv.getBigUint64(42, true))).toBe(DEFAULT_SESSION_DURATION_SECS);
  });

  it('honors a custom durationSecs', () => {
    const data = encodeGrantAgentAccessData({
      ownerPubkey: Keypair.generate().publicKey,
      agentPubkey: Keypair.generate().publicKey,
      durationSecs: 300,
    });
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(Number(dv.getBigUint64(42, true))).toBe(300);
  });
});

describe('encodeRevokeAgentAccessData', () => {
  it('produces 33 bytes: discriminator + 32-byte pubkey', () => {
    const agent = Keypair.generate().publicKey;
    const data = encodeRevokeAgentAccessData(agent);
    expect(data.length).toBe(33);
    expect(data[0]).toBe(IX.REVOKE_AGENT_ACCESS);
    expect(Array.from(data.slice(1))).toEqual(Array.from(agent.toBytes()));
  });
});

describe('encodeRevokeAllAgentsData', () => {
  it('is a single byte equal to discriminator 24', () => {
    const data = encodeRevokeAllAgentsData();
    expect(data.length).toBe(1);
    expect(data[0]).toBe(IX.REVOKE_ALL_AGENTS);
  });
});

describe('deriveUniversalVaultPda', () => {
  it('returns a deterministic PDA for the same owner/program', () => {
    const owner = Keypair.generate().publicKey;
    const [pda1, bump1] = deriveUniversalVaultPda(owner, PROGRAM_ID);
    const [pda2, bump2] = deriveUniversalVaultPda(owner, PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });
});

describe('parseActiveSessions', () => {
  it('returns empty for a vault with no grants', () => {
    const owner = Keypair.generate().publicKey;
    const vault = fakeVault(owner, []);
    expect(parseActiveSessions(vault)).toEqual([]);
  });

  it('extracts every active grant with timing info', () => {
    const owner = Keypair.generate().publicKey;
    const agentA = Keypair.generate().publicKey;
    const agentB = Keypair.generate().publicKey;
    const agentC = Keypair.generate().publicKey;

    const vault = fakeVault(owner, [
      { agent: agentA, createdAt: 1000, sessionTimeoutSecs: 7200, isActive: true },
      { agent: agentB, createdAt: 2000, sessionTimeoutSecs: 3600, isActive: true },
      { agent: agentC, createdAt: 3000, sessionTimeoutSecs: 7200, isActive: false }, // revoked
    ]);

    const sessions = parseActiveSessions(vault);
    expect(sessions).toHaveLength(2); // C is revoked

    expect(sessions[0].agentPubkey.equals(agentA)).toBe(true);
    expect(sessions[0].createdAt).toBe(1000);
    expect(sessions[0].sessionTimeoutSecs).toBe(7200);
    expect(sessions[0].expiresAt).toBe(8200);
    expect(sessions[0].slotIndex).toBe(0);

    expect(sessions[1].agentPubkey.equals(agentB)).toBe(true);
    expect(sessions[1].expiresAt).toBe(5600);
    expect(sessions[1].slotIndex).toBe(1);
  });

  it('treats session_timeout=0 as "no expiry"', () => {
    const owner = Keypair.generate().publicKey;
    const vault = fakeVault(owner, [
      { agent: Keypair.generate().publicKey, createdAt: 42, sessionTimeoutSecs: 0, isActive: true },
    ]);
    const [s] = parseActiveSessions(vault);
    expect(s.expiresAt).toBe(0);
    expect(isSessionExpired(s, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('throws on a wrong-discriminator buffer', () => {
    const buf = new Uint8Array(18400);
    buf.set(new TextEncoder().encode('notavault'), 0);
    expect(() => parseActiveSessions(buf)).toThrow(/discriminator/);
  });
});

describe('isSessionExpired', () => {
  const s = {
    agentPubkey: Keypair.generate().publicKey,
    createdAt: 1000,
    sessionTimeoutSecs: 7200,
    expiresAt: 8200,
    isActive: true,
    slotIndex: 0,
  };

  it('is false just before expiry', () => {
    expect(isSessionExpired(s, 8199)).toBe(false);
  });

  it('is true at exact expiry', () => {
    expect(isSessionExpired(s, 8200)).toBe(true);
  });

  it('is true after expiry', () => {
    expect(isSessionExpired(s, 9000)).toBe(true);
  });
});

describe('SessionManager', () => {
  const owner = Keypair.generate().publicKey;
  const agent = Keypair.generate().publicKey;

  function manager() {
    return new SessionManager({
      connection: {} as any, // not touched by the builders
      programId: PROGRAM_ID,
      ownerPubkey: owner,
    });
  }

  it('derives a stable vaultPda on construction', () => {
    const m1 = manager();
    const m2 = manager();
    expect(m1.vaultPda.equals(m2.vaultPda)).toBe(true);
  });

  it('buildGrantSessionTx produces a transaction with one GrantAgentAccess ix', () => {
    const tx = manager().buildGrantSessionTx({ agentPubkey: agent });
    expect(tx.instructions).toHaveLength(1);
    expect(tx.feePayer?.equals(owner)).toBe(true);

    const ix = tx.instructions[0];
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
    expect(ix.data[0]).toBe(IX.GRANT_AGENT_ACCESS);
    // Owner is signer + writable, vault is writable non-signer.
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[0].pubkey.equals(owner)).toBe(true);
    expect(ix.keys[1].isSigner).toBe(false);
    expect(ix.keys[1].isWritable).toBe(true);
  });

  it('buildRevokeSessionTx encodes the target agent pubkey', () => {
    const tx = manager().buildRevokeSessionTx(agent);
    expect(tx.instructions).toHaveLength(1);
    const data = tx.instructions[0].data;
    expect(data[0]).toBe(IX.REVOKE_AGENT_ACCESS);
    expect(Array.from(data.slice(1, 33))).toEqual(Array.from(agent.toBytes()));
  });

  it('buildRevokeAllSessionsTx uses discriminator 24 with no payload', () => {
    const tx = manager().buildRevokeAllSessionsTx();
    expect(tx.instructions).toHaveLength(1);
    const data = tx.instructions[0].data;
    expect(data.length).toBe(1);
    expect(data[0]).toBe(IX.REVOKE_ALL_AGENTS);
  });

  it('listActiveSessions round-trips through parseActiveSessions', async () => {
    const m = manager();
    const vault = fakeVault(owner, [
      { agent, createdAt: 100, sessionTimeoutSecs: 7200, isActive: true },
    ]);
    // Mock connection.getAccountInfo to return our fake vault.
    (m as any).connection = {
      getAccountInfo: async (pk: PublicKey) => {
        expect(pk.equals(m.vaultPda)).toBe(true);
        return { data: Buffer.from(vault) };
      },
    };
    const sessions = await m.listActiveSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].agentPubkey.equals(agent)).toBe(true);
    expect(sessions[0].expiresAt).toBe(7300);
  });

  it('listActiveSessions returns empty when vault account does not exist', async () => {
    const m = manager();
    (m as any).connection = {
      getAccountInfo: async () => null,
    };
    expect(await m.listActiveSessions()).toEqual([]);
  });
});
