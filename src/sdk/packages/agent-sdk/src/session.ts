/**
 * KeyShield session lifecycle — the per-device 2-hour grant model from
 * `docs/technical/LOCAL_VAULT_ARCHITECTURE.md`.
 *
 * A session is a (device, ephemeral pubkey, expiresAt) tuple:
 *   - one session per device (the user can have up to 32 concurrent)
 *   - each session lives on-chain as an AgentGrant slot in the
 *     UniversalVault, keyed by the ephemeral pubkey
 *   - `expiresAt = created_at + session_timeout` where session_timeout
 *     is whatever duration the user picked (2h by default)
 *
 * This module only builds / parses instructions and decodes vault bytes.
 * It does NOT sign transactions — callers pass in an owner signer (e.g.
 * the goat-wallet plugin or a hardware wallet) to actually broadcast.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';

// ==================== Constants ====================

/** Layout must stay in sync with programs/keyshield/src/state.rs. */
export const VAULT_LAYOUT = {
  DISCRIMINATOR: 'univault', // 8 bytes
  OWNER_OFFSET: 8,
  UPDATED_AT_OFFSET: 48,
  AGENT_GRANT_COUNT_OFFSET: 61,
  AGENT_GRANTS_START: 768,
  AGENT_GRANT_SIZE: 128,
  MAX_AGENTS: 32,
  // Offsets inside a single AgentGrant:
  GRANT_PUBKEY_OFFSET: 0,
  GRANT_SESSION_TIMEOUT_OFFSET: 41,
  GRANT_IS_ACTIVE_OFFSET: 58,
  GRANT_CREATED_AT_OFFSET: 78,
} as const;

/**
 * Instruction discriminators — see
 * programs/keyshield/src/instructions/mod.rs.
 */
export const IX = {
  GRANT_AGENT_ACCESS: 20,
  REVOKE_AGENT_ACCESS: 21,
} as const;

export const DEFAULT_SESSION_DURATION_SECS = 2 * 60 * 60; // 2 hours

// ==================== Types ====================

export interface SessionInfo {
  /** The ephemeral agent pubkey used for signing during this session. */
  agentPubkey: PublicKey;
  /** When this session was granted (unix seconds). */
  createdAt: number;
  /** How long the session lives, in seconds. 0 means "no expiry". */
  sessionTimeoutSecs: number;
  /** Computed: createdAt + sessionTimeoutSecs. 0 if no expiry. */
  expiresAt: number;
  /** Whether the grant is still active (not revoked). */
  isActive: boolean;
  /** Slot index inside the vault's agent_grants array (0..31). */
  slotIndex: number;
}

export interface GrantSessionParams {
  /** Owner (wallet) — this is what signs the grant transaction. */
  ownerPubkey: PublicKey;
  /** Ephemeral agent pubkey — one per device. */
  agentPubkey: PublicKey;
  /** How long this session should live. Defaults to 2 hours. */
  durationSecs?: number;
  /** Key group this agent is allowed to read. 255 = universal. */
  keyGroup?: number;
  /** Per-hour API call limit. 0 = no limit. */
  rateLimitCallsPerHour?: number;
  /** Per-minute token limit. 0 = no limit. */
  rateLimitTokensPerMin?: number;
  /** Max USDC spend cap in micro-USDC. 0 = no limit. */
  maxSpendMicroUsdc?: number;
  /** Enable streaming payments for this grant. */
  paymentStreamEnabled?: boolean;
}

// ==================== Instruction builders ====================

/**
 * Build the instruction data payload for GrantAgentAccess.
 *
 * Matches the byte layout parsed by
 * programs/keyshield/src/instructions/agent_access.rs:53-79.
 */
export function encodeGrantAgentAccessData(p: GrantSessionParams): Uint8Array {
  const durationSecs = p.durationSecs ?? DEFAULT_SESSION_DURATION_SECS;
  const keyGroup = p.keyGroup ?? 255; // Universal
  const rateLimitCalls = p.rateLimitCallsPerHour ?? 0;
  const rateLimitTokens = p.rateLimitTokensPerMin ?? 0;
  const maxSpend = BigInt(p.maxSpendMicroUsdc ?? 0);
  const payStream = p.paymentStreamEnabled ? 1 : 0;

  // 1 (discriminator) + 32 (agent) + 1 (key_group) + 4 + 4 + 8 + 8 + 1 + 2 = 61 bytes
  const buf = new Uint8Array(61);
  const dv = new DataView(buf.buffer);
  let o = 0;
  buf[o++] = IX.GRANT_AGENT_ACCESS;
  buf.set(p.agentPubkey.toBytes(), o);
  o += 32;
  buf[o++] = keyGroup;
  dv.setUint32(o, rateLimitCalls, true);
  o += 4;
  dv.setUint32(o, rateLimitTokens, true);
  o += 4;
  dv.setBigUint64(o, BigInt(durationSecs), true);
  o += 8;
  dv.setBigUint64(o, maxSpend, true);
  o += 8;
  buf[o++] = payStream;
  dv.setUint16(o, 0, true); // zk_proof_length = 0 (direct agent pubkey path)
  return buf;
}

export function encodeRevokeAgentAccessData(agent: PublicKey): Uint8Array {
  const buf = new Uint8Array(33);
  buf[0] = IX.REVOKE_AGENT_ACCESS;
  buf.set(agent.toBytes(), 1);
  return buf;
}

export function deriveUniversalVaultPda(
  owner: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('universal_vault'), owner.toBuffer()],
    programId,
  );
}

// ==================== Vault parsing ====================

/**
 * Decode all active grants out of a raw UniversalVault account data buffer.
 * Returns slots whose agent_pubkey is non-zero AND is_active = 1, regardless
 * of whether they've expired (the caller decides what to filter).
 */
export function parseActiveSessions(vaultData: Uint8Array): SessionInfo[] {
  if (vaultData.length < VAULT_LAYOUT.AGENT_GRANTS_START) {
    return [];
  }
  // Check discriminator.
  const disc = new TextDecoder().decode(vaultData.slice(0, 8));
  if (disc !== VAULT_LAYOUT.DISCRIMINATOR) {
    throw new Error(
      `not a UniversalVault (discriminator = "${disc}", expected "${VAULT_LAYOUT.DISCRIMINATOR}")`,
    );
  }

  const out: SessionInfo[] = [];
  const dv = new DataView(vaultData.buffer, vaultData.byteOffset, vaultData.byteLength);

  for (let i = 0; i < VAULT_LAYOUT.MAX_AGENTS; i++) {
    const slotOffset =
      VAULT_LAYOUT.AGENT_GRANTS_START + i * VAULT_LAYOUT.AGENT_GRANT_SIZE;
    const pkBytes = vaultData.slice(
      slotOffset + VAULT_LAYOUT.GRANT_PUBKEY_OFFSET,
      slotOffset + VAULT_LAYOUT.GRANT_PUBKEY_OFFSET + 32,
    );
    // Empty slot: agent_pubkey is all zero.
    if (pkBytes.every((b) => b === 0)) continue;

    const isActive = vaultData[slotOffset + VAULT_LAYOUT.GRANT_IS_ACTIVE_OFFSET] === 1;
    if (!isActive) continue;

    const sessionTimeoutSecs = Number(
      dv.getBigUint64(slotOffset + VAULT_LAYOUT.GRANT_SESSION_TIMEOUT_OFFSET, true),
    );
    const createdAt = Number(
      dv.getBigUint64(slotOffset + VAULT_LAYOUT.GRANT_CREATED_AT_OFFSET, true),
    );
    const expiresAt = sessionTimeoutSecs === 0 ? 0 : createdAt + sessionTimeoutSecs;

    out.push({
      agentPubkey: new PublicKey(pkBytes),
      createdAt,
      sessionTimeoutSecs,
      expiresAt,
      isActive,
      slotIndex: i,
    });
  }
  return out;
}

export function isSessionExpired(s: SessionInfo, nowSecs: number): boolean {
  if (s.expiresAt === 0) return false; // no expiry
  return nowSecs >= s.expiresAt;
}

// ==================== High-level manager ====================

export interface SessionManagerConfig {
  connection: Connection;
  programId: PublicKey;
  ownerPubkey: PublicKey;
}

/**
 * SessionManager orchestrates the key operations from
 * docs/technical/LOCAL_VAULT_ARCHITECTURE.md section 7:
 *   - grantSession    (flow 3)
 *   - renewSession    (flow 5)
 *   - revokeSession   (one device)
 *   - listActiveSessions (for the session-management UI)
 *
 * It builds Solana instructions and reads vault state. It deliberately
 * DOES NOT sign transactions — pass the built Transaction to whichever
 * wallet/plugin you're using (owner Keypair, Phantom, goat-wallet, etc.).
 */
export class SessionManager {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly ownerPubkey: PublicKey;
  readonly vaultPda: PublicKey;

  constructor(config: SessionManagerConfig) {
    this.connection = config.connection;
    this.programId = config.programId;
    this.ownerPubkey = config.ownerPubkey;
    [this.vaultPda] = deriveUniversalVaultPda(config.ownerPubkey, config.programId);
  }

  /**
   * Build a Transaction that, once signed by the owner, grants a
   * 2-hour-by-default session to the given ephemeral agent pubkey.
   */
  buildGrantSessionTx(
    params: Omit<GrantSessionParams, 'ownerPubkey'> & { agentPubkey: PublicKey },
  ): Transaction {
    const data = encodeGrantAgentAccessData({
      ...params,
      ownerPubkey: this.ownerPubkey,
    });
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.ownerPubkey, isSigner: true, isWritable: true },
        { pubkey: this.vaultPda, isSigner: false, isWritable: true },
      ],
      data: Buffer.from(data),
    });
    const tx = new Transaction();
    tx.feePayer = this.ownerPubkey;
    tx.add(ix);
    return tx;
  }

  /**
   * Renew an existing session: same as grantSession with the same pubkey.
   * The on-chain `grant` handler updates the slot in place and resets
   * created_at to now.
   */
  buildRenewSessionTx(
    agentPubkey: PublicKey,
    durationSecs?: number,
  ): Transaction {
    return this.buildGrantSessionTx({ agentPubkey, durationSecs });
  }

  /**
   * Revoke a single device's session by agent pubkey.
   */
  buildRevokeSessionTx(agentPubkey: PublicKey): Transaction {
    const data = encodeRevokeAgentAccessData(agentPubkey);
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.ownerPubkey, isSigner: true, isWritable: false },
        { pubkey: this.vaultPda, isSigner: false, isWritable: true },
      ],
      data: Buffer.from(data),
    });
    const tx = new Transaction();
    tx.feePayer = this.ownerPubkey;
    tx.add(ix);
    return tx;
  }

  /**
   * Read the vault and return every currently-active session. The caller
   * is responsible for filtering out expired sessions if they care.
   *
   * One RPC round-trip regardless of session count.
   */
  async listActiveSessions(): Promise<SessionInfo[]> {
    const info = await this.connection.getAccountInfo(this.vaultPda);
    if (!info) return [];
    return parseActiveSessions(new Uint8Array(info.data));
  }
}

// Re-export for convenience.
export { SystemProgram }; // eslint-disable-line @typescript-eslint/no-unused-vars
