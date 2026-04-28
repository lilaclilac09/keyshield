/**
 * KeyShield Agent SDK
 * 
 * A TypeScript SDK for AI agents to securely access API keys and make payments
 * through the KeyShield Universal Vault.
 * 
 * Features:
 * - Secure key retrieval with Bonsol ZK proofs
 * - Arcium MPC for agent-to-agent decryption
 * - x402 streaming payments
 * - OpenClaw skill compatibility
 * - Coinbase Agentic Wallet style guardrails
 * 
 * @package @keyshield/agent-sdk
 * @version 2.0.0
 */

import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { LitProtocol } from './lit';
import { BonsolVerifier } from './bonsol';
import { ArciumMPC } from './arcium';
import { X402Client } from './x402';
import { KeyShieldClient } from './client';

// Re-export session management (per-device 2-hour grant lifecycle).
export {
  SessionManager,
  parseActiveSessions,
  encodeGrantAgentAccessData,
  encodeRevokeAgentAccessData,
  encodeRevokeAllAgentsData,
  deriveUniversalVaultPda,
  isSessionExpired,
  VAULT_LAYOUT,
  IX,
  DEFAULT_SESSION_DURATION_SECS,
} from './session';
export type {
  SessionInfo,
  GrantSessionParams,
  SessionManagerConfig,
} from './session';

// Re-export types
export type {
  AgentGrant,
  KeyGroup,
  PolicyRule,
  PaymentStream,
  UniversalVault,
  EphemeralSigner,
} from './types';

export type {
  KeyShieldConfig,
  AgentAccessParams,
  PaymentParams,
  StreamingPaymentParams,
} from './types';

// Main export
export class KeyShieldAgent {
  private client: KeyShieldClient;
  private lit: LitProtocol;
  private bonsol: BonsolVerifier;
  private arcium: ArciumMPC;
  private x402: X402Client;
  
  private agentPubkey: PublicKey | null = null;
  private ownerPubkey: PublicKey | null = null;
  
  readonly connection: Connection;

  constructor(config: {
    /** Either supply a URL (a new Connection is created) ... */
    rpcUrl?: string;
    /** ... or pass an existing Connection to reuse across the app.
     *  Reusing one Connection avoids rebuilding the HTTP agent / idle
     *  pool / WebSocket on every SDK instance. See P2-4. */
    connection?: Connection;
    programId: string;
    lit?: {
      network: 'datil-dev' | 'datil';
      chain: 'solana';
    };
  }) {
    if (config.connection) {
      this.connection = config.connection;
    } else if (config.rpcUrl) {
      this.connection = new Connection(config.rpcUrl);
    } else {
      throw new Error(
        'KeyShieldAgent requires either `connection` or `rpcUrl`. ' +
          'For production, pass in a Connection pointing at a paid RPC ' +
          '(Helius / Triton / QuickNode) — public mainnet-beta is rate-limited.',
      );
    }

    this.client = new KeyShieldClient({
      connection: this.connection,
      programId: new PublicKey(config.programId),
    });

    this.lit = new LitProtocol(config.lit || {
      network: 'datil-dev',
      chain: 'solana',
    });

    this.bonsol = new BonsolVerifier();
    this.arcium = new ArciumMPC();
    this.x402 = new X402Client();
  }
  
  /**
   * Initialize the agent with owner wallet
   */
  async initialize(ownerPublicKey: PublicKey): Promise<void> {
    this.ownerPubkey = ownerPublicKey;
    await this.lit.init();
  }
  
  /**
   * Register this agent with KeyShield
   */
  async registerAgent(agentPublicKey: PublicKey): Promise<string> {
    this.agentPubkey = agentPublicKey;
    
    // Generate a session token
    const sessionToken = this.generateSessionToken();
    
    // Store session locally
    await this.storeSession(agentPublicKey, sessionToken);
    
    return sessionToken;
  }
  
  /**
   * Get API key by name with ZK proof verification
   * 
   * This method:
   * 1. Generates a Bonsol ZK proof proving the agent is authorized
   * 2. Submits the proof to the KeyShield program
   * 3. Retrieves the encrypted key from the vault
   * 4. Decrypts the key using Lit Protocol
   */
  async getApiKey(
    keyName: string,
    options?: {
      sessionToken?: string;
      bonsolProof?: Uint8Array;
      timeout?: number;
    }
  ): Promise<string> {
    if (!this.agentPubkey || !this.ownerPubkey) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }
    
    // Generate or use provided ZK proof
    let proof = options?.bonsolProof;
    if (!proof) {
      proof = await this.bonsol.createProof({
        agentPubkey: this.agentPubkey,
        ownerPubkey: this.ownerPubkey,
        keyName,
        timestamp: Date.now(),
      });
    }
    
    // Verify proof
    const isValid = await this.bonsol.verifyProof(proof);
    if (!isValid) {
      throw new Error('Invalid Bonsol ZK proof');
    }
    
    // Access the vault
    const keyData = await this.client.getKey({
      owner: this.ownerPubkey,
      agent: this.agentPubkey,
      keyName,
      proof,
    });
    
    // Decrypt the key using Lit
    const decryptedKey = await this.lit.decrypt({
      encryptedData: keyData.encryptedData,
      encryptedSymmetricKey: keyData.encryptedSymmetricKey,
    });
    
    return decryptedKey;
  }
  
  /**
   * Get universal keys - access all keys in a group
   * 
   * @param group Key group (e.g., "openai", "stripe", "universal")
   */
  async getUniversalKeys(
    group: string,
    options?: {
      sessionToken?: string;
      bonsolProof?: Uint8Array;
    }
  ): Promise<Record<string, string>> {
    if (!this.agentPubkey || !this.ownerPubkey) {
      throw new Error('Agent not initialized');
    }
    
    // Generate ZK proof for universal access
    let proof = options?.bonsolProof;
    if (!proof) {
      proof = await this.bonsol.createProof({
        agentPubkey: this.agentPubkey,
        ownerPubkey: this.ownerPubkey,
        keyName: `group:${group}`,
        timestamp: Date.now(),
      });
    }
    
    // Get all keys in group
    const keys = await this.client.getKeysInGroup({
      owner: this.ownerPubkey,
      agent: this.agentPubkey,
      group,
      proof,
    });
    
    // Decrypt each key in parallel — Lit decrypt is a network call, so
    // serializing N of them with `await` inside a for loop was an easy
    // 500ms-2s win to remove. See docs/roadmap/VAULT_FACEID_BACKLOG.md P1-8.
    const entries = Object.entries(keys as Record<string, any>);
    const decrypted = await Promise.all(
      entries.map(async ([name, keyData]) => {
        const plaintext = await this.lit.decrypt({
          encryptedData: keyData.encryptedData,
          encryptedSymmetricKey: keyData.encryptedSymmetricKey,
        });
        return [name, plaintext] as const;
      }),
    );
    return Object.fromEntries(decrypted);
  }
  
  /**
   * Start a streaming payment session
   * 
   * This enables usage-based payments where the agent is charged
   * incrementally based on actual usage (e.g., per token, per call).
   */
  async startStreamingPayment(
    serviceUrl: string,
    options: {
      maxRateUsdPerMin: number;
      unit: 'per_call' | 'per_token';
      proof?: Uint8Array;
    }
  ): Promise<StreamingPaymentSession> {
    if (!this.agentPubkey || !this.ownerPubkey) {
      throw new Error('Agent not initialized');
    }
    
    // Generate proof
    let proof = options.proof;
    if (!proof) {
      proof = await this.bonsol.createProof({
        agentPubkey: this.agentPubkey,
        ownerPubkey: this.ownerPubkey,
        keyName: `streaming:${serviceUrl}`,
        timestamp: Date.now(),
      });
    }
    
    // Initiate streaming payment
    const stream = await this.client.startStreamingPayment({
      agent: this.agentPubkey,
      owner: this.ownerPubkey,
      serviceUrl,
      ratePerUnit: options.maxRateUsdPerMin,
      unit: options.unit,
      proof,
    });
    
    // Create session wrapper
    return new StreamingPaymentSession(
      this.client,
      this.x402,
      stream,
      serviceUrl,
      options.unit
    );
  }
  
  /**
   * Pay for a single service request (one-shot payment)
   */
  async payWithVault(
    amount: number,
    memo: string,
    options?: {
      proof?: Uint8Array;
    }
  ): Promise<string> {
    if (!this.agentPubkey || !this.ownerPubkey) {
      throw new Error('Agent not initialized');
    }
    
    // Generate proof
    let proof = options?.proof;
    if (!proof) {
      proof = await this.bonsol.createProof({
        agentPubkey: this.agentPubkey,
        ownerPubkey: this.ownerPubkey,
        keyName: `payment:${amount}`,
        timestamp: Date.now(),
      });
    }
    
    // Process payment via x402
    const txSignature = await this.client.payForService({
      agent: this.agentPubkey,
      owner: this.ownerPubkey,
      amount,
      memo,
      proof,
    });
    
    return txSignature;
  }
  
  /**
   * Create an ephemeral signer for GOAT-style actions
   * 
   * This is similar to OpenClaw Vault-0's custodian model where
   * the agent receives a temporary signer that can perform specific
   * actions within defined guardrails.
   */
  async createEphemeralSigner(
    allowedActions: string[],
    expirySeconds: number,
    options?: {
      proof?: Uint8Array;
    }
  ): Promise<EphemeralSignerSession> {
    if (!this.agentPubkey || !this.ownerPubkey) {
      throw new Error('Agent not initialized');
    }
    
    // Create ephemeral signer via MPC
    const signer = await this.arcium.createEphemeralSigner({
      agentPubkey: this.agentPubkey,
      ownerPubkey: this.ownerPubkey,
      allowedActions,
      expirySeconds,
    });
    
    return new EphemeralSignerSession(
      signer.publicKey,
      signer.privateKey,
      signer.expiry,
      allowedActions
    );
  }
  
  /**
   * Agent-to-agent key sharing via Arcium MPC
   * 
   * Allows secure sharing between agents without human intervention
   */
  async shareWithAgent(
    recipientAgentPubkey: PublicKey,
    keyNames: string[],
    expirySeconds: number
  ): Promise<void> {
    if (!this.agentPubkey || !this.ownerPubkey) {
      throw new Error('Agent not initialized');
    }
    
    // Create MPC share
    await this.arcium.shareKey({
      senderPubkey: this.agentPubkey,
      recipientPubkey: recipientAgentPubkey,
      keyNames,
      expirySeconds,
    });
  }
  
  /**
   * Get agent's access status and rate limits
   */
  async getAgentStatus(): Promise<AgentStatus> {
    if (!this.agentPubkey || !this.ownerPubkey) {
      throw new Error('Agent not initialized');
    }
    
    return this.client.getAgentStatus({
      owner: this.ownerPubkey,
      agent: this.agentPubkey,
    });
  }
  
  /**
   * Revoke this agent's access (self-revoke)
   */
  async revokeOwnAccess(): Promise<string> {
    if (!this.agentPubkey || !this.ownerPubkey) {
      throw new Error('Agent not initialized');
    }
    
    return this.client.revokeAgentAccess({
      owner: this.ownerPubkey,
      agent: this.agentPubkey,
    });
  }
  
  // Private helpers
  private generateSessionToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }
  
  private async storeSession(agentPubkey: PublicKey, token: string): Promise<void> {
    // Store in localStorage or secure storage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`keyshield_session_${agentPubkey.toBase58()}`, token);
    }
  }
}

// Streaming Payment Session
export class StreamingPaymentSession {
  private client: KeyShieldClient;
  private x402: X402Client;
  private streamId: string;
  private serviceUrl: string;
  private unit: 'per_call' | 'per_token';
  private unitsUsed: number = 0;
  private lastSettlement: number = Date.now();
  
  constructor(
    client: KeyShieldClient,
    x402: X402Client,
    stream: { streamId: string },
    serviceUrl: string,
    unit: 'per_call' | 'per_token'
  ) {
    this.client = client;
    this.x402 = x402;
    this.streamId = stream.streamId;
    this.serviceUrl = serviceUrl;
    this.unit = unit;
  }
  
  /**
   * Record usage
   */
  async recordUsage(units: number): Promise<void> {
    this.unitsUsed += units;
    
    // Check if settlement is due (every 60 seconds)
    const now = Date.now();
    if (now - this.lastSettlement > 60000) {
      await this.settle();
    }
  }
  
  /**
   * Settle accumulated payment
   */
  async settle(): Promise<string> {
    if (this.unitsUsed === 0) return '';
    
    const tx = await this.client.settlePayment({
      streamId: this.streamId,
      unitsConsumed: this.unitsUsed,
    });
    
    this.unitsUsed = 0;
    this.lastSettlement = Date.now();
    
    return tx;
  }
  
  /**
   * Close the streaming payment
   */
  async close(): Promise<string> {
    // Final settlement
    const finalSettlement = await this.settle();
    
    // Close stream
    return this.client.closePaymentStream({
      streamId: this.streamId,
    });
  }
  
  getUnitsUsed(): number {
    return this.unitsUsed;
  }
  
  getServiceUrl(): string {
    return this.serviceUrl;
  }
}

// Ephemeral Signer Session
export class EphemeralSignerSession {
  public readonly publicKey: PublicKey;
  public readonly expiry: number;
  public readonly allowedActions: string[];
  private privateKey: Uint8Array;

  constructor(
    publicKey: PublicKey,
    privateKey: Uint8Array,
    expiry: number,
    allowedActions: string[]
  ) {
    this.publicKey = publicKey;
    // Bug fix: previous code wrote `privateKey = privateKey;` which
    // reassigned the parameter back to itself and left `this.privateKey`
    // uninitialized. tsc caught this once strict mode was turned on.
    this.privateKey = privateKey;
    this.expiry = expiry;
    this.allowedActions = allowedActions;
  }
  
  /**
   * Check if session is expired
   */
  isExpired(): boolean {
    return Date.now() > this.expiry;
  }
  
  /**
   * Check if action is allowed
   */
  isActionAllowed(action: string): boolean {
    if (this.isExpired()) return false;
    return this.allowedActions.includes(action) || this.allowedActions.includes('*');
  }
  
  /**
   * Get the private key for signing
   * 
   * WARNING: This should be used carefully. The key is ephemeral
   * and will be invalidated after expiry.
   */
  getPrivateKey(): Uint8Array {
    if (this.isExpired()) {
      throw new Error('Ephemeral signer has expired');
    }
    return this.privateKey;
  }
  
  /**
   * Sign a transaction (GOAT-style)
   */
  async signTransaction(tx: Transaction): Promise<Transaction> {
    if (!this.isActionAllowed('sign')) {
      throw new Error('Signing not allowed for this session');
    }
    
    // Sign with ephemeral key
    tx.sign(this.privateKey as any);
    return tx;
  }
  
  /**
   * Zero out the private key (security)
   */
  destroy(): void {
    this.privateKey.fill(0);
  }
}

interface AgentStatus {
  isActive: boolean;
  keyGroup: number;
  rateLimitCallsPerHour: number;
  rateLimitTokensPerMin: number;
  maxSpendMicroUSDC: number;
  paymentStreamEnabled: boolean;
  cumulativeSpend: number;
  lastAccess: number;
}

// Factory function for creating agent
export async function createKeyShieldAgent(
  config: {
    rpcUrl: string;
    programId: string;
    ownerPublicKey: string;
    agentPublicKey?: string;
    lit?: {
      network: 'datil-dev' | 'datil';
      chain: 'solana';
    };
  }
): Promise<KeyShieldAgent> {
  const agent = new KeyShieldAgent(config);
  
  await agent.initialize(new PublicKey(config.ownerPublicKey));
  
  if (config.agentPublicKey) {
    await agent.registerAgent(new PublicKey(config.agentPublicKey));
  }
  
  return agent;
}

export default KeyShieldAgent;
