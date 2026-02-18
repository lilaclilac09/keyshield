/**
 * KeyShield OpenClaw Skill
 * 
 * Implementation of the KeyShield skill for OpenClaw agents.
 * Provides secure API key access and payments through KeyShield vault.
 * 
 * @package @keyshield/openclaw-skill
 * @version 2.0.0
 */

import { KeyShieldAgent, StreamingPaymentSession, EphemeralSignerSession } from '@keyshield/agent-sdk';
import { PublicKey } from '@solana/web3.js';

// ==================== TYPES ====================

export interface SkillConfig {
  rpcUrl: string;
  programId: string;
  ownerPublicKey: string;
  agentPublicKey?: string;
  litNetwork?: 'datil-dev' | 'datil';
}

export interface GetKeyParams {
  bonsolProof?: Uint8Array;
  timeout?: number;
}

export interface GetUniversalKeysParams {
  group: string;
  sessionToken?: string;
  bonsolProof?: Uint8Array;
}

export interface PayParams {
  proof?: Uint8Array;
}

export interface StreamParams {
  maxRateUsdPerMin: number;
  unit: 'per_call' | 'per_token';
  proof?: Uint8Array;
  settlementIntervalSeconds?: number;
}

export interface Policy {
  name: string;
  version: number;
  rateLimit?: {
    callsPerHour: number;
    tokensPerMin: number;
  };
  maxSpend?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowedTools?: string[];
  outputRedaction?: Array<{
    pattern: string;
    replacement: string;
  }>;
  session?: {
    timeoutSeconds: number;
    requireReauth: boolean;
  };
  payments?: {
    streamingEnabled: boolean;
    settlementIntervalSeconds: number;
  };
}

export interface StreamingSession {
  streamId: string;
  serviceUrl: string;
  recordUsage(units: number): Promise<void>;
  settle(): Promise<string>;
  close(): Promise<string>;
  getUnitsUsed(): number;
}

export interface EphemeralSigner {
  publicKey: string;
  expiry: number;
  allowedActions: string[];
  isExpired(): boolean;
  isActionAllowed(action: string): boolean;
}

// ==================== SKILL IMPLEMENTATION ====================

export class KeyShieldSkill {
  private agent: KeyShieldAgent | null = null;
  private config: SkillConfig;
  private streamingSessions: Map<string, StreamingPaymentSession> = new Map();
  
  constructor(config: SkillConfig) {
    this.config = config;
  }
  
  /**
   * Initialize the skill
   */
  async initialize(): Promise<void> {
    if (!this.config.agentPublicKey) {
      throw new Error('agentPublicKey is required');
    }
    
    this.agent = await createKeyShieldAgent({
      rpcUrl: this.config.rpcUrl,
      programId: this.config.programId,
      ownerPublicKey: this.config.ownerPublicKey,
      agentPublicKey: this.config.agentPublicKey,
      lit: {
        network: this.config.litNetwork || 'datil-dev',
        chain: 'solana',
      },
    });
  }
  
  /**
   * Register this agent with KeyShield
   */
  async registerAgent(): Promise<string> {
    if (!this.agent) {
      await this.initialize();
    }
    
    return this.agent!.registerAgent(new PublicKey(this.config.agentPublicKey!));
  }
  
  /**
   * Get a specific API key
   * 
   * @param keyName - Name of the key (e.g., "openai", "stripe")
   * @param params - Optional parameters
   */
  async getApiKey(keyName: string, params?: GetKeyParams): Promise<string> {
    this.ensureInitialized();
    
    try {
      return await this.agent!.getApiKey(keyName, {
        bonsolProof: params?.bonsolProof,
        timeout: params?.timeout,
      });
    } catch (error: any) {
      throw new Error(`Failed to get API key: ${error.message}`);
    }
  }
  
  /**
   * Get all keys in a group
   * 
   * @param params - Group parameters
   */
  async getUniversalKeys(params: GetUniversalKeysParams): Promise<Record<string, string>> {
    this.ensureInitialized();
    
    try {
      return await this.agent!.getUniversalKeys(params.group, {
        sessionToken: params.sessionToken,
        bonsolProof: params.bonsolProof,
      });
    } catch (error: any) {
      throw new Error(`Failed to get universal keys: ${error.message}`);
    }
  }
  
  /**
   * One-shot payment
   * 
   * @param amount - Amount in USDC
   * @param memo - Payment description
   * @param params - Optional parameters
   */
  async payWithVault(amount: number, memo: string, params?: PayParams): Promise<string> {
    this.ensureInitialized();
    
    try {
      return await this.agent!.payWithVault(amount, memo, {
        proof: params?.proof,
      });
    } catch (error: any) {
      throw new Error(`Payment failed: ${error.message}`);
    }
  }
  
  /**
   * Start streaming payment
   * 
   * @param serviceUrl - Service URL to pay
   * @param params - Streaming parameters
   */
  async startPaymentStream(
    serviceUrl: string,
    params: StreamParams
  ): Promise<StreamingSession> {
    this.ensureInitialized();
    
    try {
      const session = await this.agent!.startStreamingPayment(serviceUrl, {
        maxRateUsdPerMin: params.maxRateUsdPerMin,
        unit: params.unit,
        proof: params.proof,
      });
      
      this.streamingSessions.set(session.serviceUrl, session);
      
      // Return wrapped session
      return {
        streamId: session.serviceUrl,
        serviceUrl: session.serviceUrl,
        recordUsage: (units: number) => session.recordUsage(units),
        settle: () => session.settle(),
        close: () => session.close(),
        getUnitsUsed: () => session.getUnitsUsed(),
      };
    } catch (error: any) {
      throw new Error(`Failed to start streaming: ${error.message}`);
    }
  }
  
  /**
   * Create ephemeral signer
   * 
   * @param allowedActions - Actions the signer can perform
   * @param expiry - Expiry in seconds
   */
  async createEphemeralSigner(
    allowedActions: string[],
    expiry: number
  ): Promise<EphemeralSigner> {
    this.ensureInitialized();
    
    try {
      const signer = await this.agent!.createEphemeralSigner(allowedActions, expiry);
      
      return {
        publicKey: signer.publicKey.toBase58(),
        expiry: signer.expiry,
        allowedActions: signer.allowedActions,
        isExpired: () => signer.isExpired(),
        isActionAllowed: (action: string) => signer.isActionAllowed(action),
      };
    } catch (error: any) {
      throw new Error(`Failed to create ephemeral signer: ${error.message}`);
    }
  }
  
  /**
   * Get policies from vault
   */
  async getPolicies(): Promise<Policy[]> {
    this.ensureInitialized();
    
    // This would fetch from the vault via KeyShield client
    // For now, return default policy
    return [{
      name: 'default',
      version: 1,
      rateLimit: {
        callsPerHour: 1000,
        tokensPerMin: 10000,
      },
      maxSpend: 1000000,
      allowedTools: [
        'getApiKey',
        'getUniversalKeys',
        'payWithVault',
        'startPaymentStream',
        'createEphemeralSigner',
      ],
    }];
  }
  
  /**
   * Check if action is permitted
   */
  async checkPermission(action: string, params?: Record<string, any>): Promise<boolean> {
    const policies = await this.getPolicies();
    
    for (const policy of policies) {
      // Check allowed tools
      if (policy.allowedTools && !policy.allowedTools.includes(action)) {
        return false;
      }
      
      // Check rate limits for specific actions
      if (action === 'getApiKey' || action === 'getUniversalKeys') {
        const status = await this.getStatus();
        if (!status.isActive) return false;
        if (status.usedCallsPerHour >= (policy.rateLimit?.callsPerHour || 0)) {
          return false;
        }
      }
      
      // Check spend limits for payments
      if (action === 'payWithVault' || action === 'startPaymentStream') {
        if (params?.amount) {
          const status = await this.getStatus();
          const maxSpend = policy.maxSpend || 0;
          if (status.cumulativeSpend + params.amount > maxSpend) {
            return false;
          }
        }
      }
    }
    
    return true;
  }
  
  /**
   * Get agent status
   */
  async getStatus(): Promise<{
    isActive: boolean;
    usedCallsPerHour: number;
    cumulativeSpend: number;
    sessionExpiry: number;
  }> {
    this.ensureInitialized();
    
    try {
      const status = await this.agent!.getAgentStatus();
      return {
        isActive: status.isActive,
        usedCallsPerHour: 0, // Would need to track
        cumulativeSpend: status.cumulativeSpend,
        sessionExpiry: status.lastAccess + (3600 * 1000), // Approximate
      };
    } catch {
      return {
        isActive: false,
        usedCallsPerHour: 0,
        cumulativeSpend: 0,
        sessionExpiry: 0,
      };
    }
  }
  
  /**
   * Revoke own access
   */
  async revokeOwnAccess(): Promise<string> {
    this.ensureInitialized();
    return this.agent!.revokeOwnAccess();
  }
  
  /**
   * Agent-to-agent key sharing
   */
  async shareWithAgent(
    recipientAgentPubkey: string,
    keyNames: string[],
    expirySeconds: number
  ): Promise<void> {
    this.ensureInitialized();
    await this.agent!.shareWithAgent(
      new PublicKey(recipientAgentPubkey),
      keyNames,
      expirySeconds
    );
  }
  
  /**
   * Close all streaming sessions
   */
  async cleanup(): Promise<void> {
    for (const [url, session] of this.streamingSessions) {
      try {
        await session.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.streamingSessions.clear();
  }
  
  // Private helpers
  private ensureInitialized(): void {
    if (!this.agent) {
      throw new Error('Skill not initialized. Call initialize() or registerAgent() first.');
    }
  }
}

// Helper to create agent
async function createKeyShieldAgent(config: {
  rpcUrl: string;
  programId: string;
  ownerPublicKey: string;
  agentPublicKey: string;
  lit?: { network: 'datil-dev' | 'datil'; chain: 'solana' };
}): Promise<KeyShieldAgent> {
  const { KeyShieldAgent } = await import('@keyshield/agent-sdk');
  return KeyShieldAgent.prototype.initialize.call(
    Object.assign(new KeyShieldAgent({ rpcUrl: config.rpcUrl, programId: config.programId }), {
      ownerPubkey: new PublicKey(config.ownerPublicKey),
      agentPubkey: new PublicKey(config.agentPublicKey),
    }) as any,
    new PublicKey(config.ownerPublicKey)
  ) as any as KeyShieldAgent;
}

// Export skill factory
export function createSkill(config: SkillConfig): KeyShieldSkill {
  return new KeyShieldSkill(config);
}

export default KeyShieldSkill;
