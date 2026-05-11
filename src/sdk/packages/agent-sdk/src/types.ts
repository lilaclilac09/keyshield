import { PublicKey } from '@solana/web3.js';

// ==================== ENUMS ====================

export enum KeyGroup {
  Generic = 0,
  OpenAI = 1,
  Anthropic = 2,
  Stripe = 3,
  Vercel = 4,
  GitHub = 5,
  Google = 6,
  PaymentUSDC = 7,
  Universal = 255,
}

export enum PolicyRuleType {
  DomainAllow = 0,
  DomainBlock = 1,
  RateLimit = 2,
  MaxSpend = 3,
  OutputRedact = 4,
  AllowedTool = 5,
}

export enum PaymentUnit {
  PerCall = 'per_call',
  PerToken = 'per_token',
}

// ==================== STRUCTURES ====================

export interface AgentGrant {
  agentPubkey: PublicKey;
  keyGroup: KeyGroup;
  rateLimitCallsPerHour: number;
  rateLimitTokensPerMin: number;
  sessionTimeout: number;
  maxSpendMicroUSDC: number;
  paymentStreamEnabled: boolean;
  isActive: boolean;
  allowedEndpoints: string[];
  allowedModels: string[];
  lastAccess: number;
  cumulativeSpend: number;
  ephemeralSignerBump: number;
  createdAt: number;
}

export interface PolicyRule {
  ruleType: PolicyRuleType;
  enabled: boolean;
  data: Uint8Array;
}

export interface PaymentStream {
  streamId: string;
  serviceUrlHash: string;
  agentPubkey: PublicKey;
  ratePerUnitMicroUSDC: number;
  unitType: PaymentUnit;
  isActive: boolean;
  settlementIntervalSecs: number;
  lastSettlement: number;
  pendingAmount: number;
}

export interface UniversalVault {
  owner: PublicKey;
  createdAt: number;
  updatedAt: number;
  vaultFlags: number;
  keyGroupCount: number;
  agentGrantCount: number;
  policyRuleCount: number;
  paymentStreamCount: number;
  keyGroups: KeyGroupEntry[];
  agentGrants: AgentGrant[];
  policyRules: PolicyRule[];
  paymentStreams: PaymentStream[];
}

export interface KeyGroupEntry {
  groupType: KeyGroup;
  isActive: boolean;
  keyCount: number;
  keyHashes: string[];
  createdAt: number;
}

export interface EphemeralSigner {
  agentPubkey: PublicKey;
  ephemeralPubkey: PublicKey;
  expiry: number;
  allowedActions: string[];
}

// ==================== CONFIG ====================

export interface KeyShieldConfig {
  rpcUrl: string;
  programId: string;
}

export interface AgentAccessParams {
  agentPubkey: PublicKey;
  keyGroup: KeyGroup;
  rateLimitCallsPerHour?: number;
  rateLimitTokensPerMin?: number;
  sessionTimeout?: number;
  maxSpendMicroUSDC?: number;
  paymentStreamEnabled?: boolean;
  allowedEndpoints?: string[];
  allowedModels?: string[];
}

export interface PaymentParams {
  agent: PublicKey;
  owner: PublicKey;
  amount: number;
  memo: string;
  proof?: Uint8Array;
}

export interface StreamingPaymentParams {
  agent: PublicKey;
  owner: PublicKey;
  serviceUrl: string;
  ratePerUnit: number;
  unit: 'per_call' | 'per_token';
  settlementIntervalSecs?: number;
  proof?: Uint8Array;
}

// ==================== RESPONSES ====================

export interface KeyData {
  keyName: string;
  encryptedData: string;
  encryptedSymmetricKey: string;
  keyGroup: KeyGroup;
  createdAt: number;
}

export interface AccessResponse {
  success: boolean;
  keyData?: KeyData;
  error?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionSignature?: string;
  amountPaid?: number;
  error?: string;
}

export interface StreamingSession {
  streamId: string;
  serviceUrl: string;
  ratePerUnit: number;
  unit: PaymentUnit;
  startedAt: number;
}

// ==================== STATUS ====================

export interface AgentStatusResponse {
  isActive: boolean;
  keyGroup: KeyGroup;
  rateLimitCallsPerHour: number;
  rateLimitTokensPerMin: number;
  maxSpendMicroUSDC: number;
  paymentStreamEnabled: boolean;
  cumulativeSpend: number;
  lastAccess: number;
  sessionExpiry: number;
}

export interface VaultStatusResponse {
  owner: string;
  keyCount: number;
  agentCount: number;
  paymentStreamCount: number;
  vaultFlags: {
    timeLockEnabled: boolean;
    zkProofRequired: boolean;
    mpcRequired: boolean;
    paymentEnabled: boolean;
  };
}

// ==================== EVENTS ====================

export interface KeyAccessEvent {
  agentPubkey: string;
  keyName: string;
  timestamp: number;
  success: boolean;
}

export interface PaymentEvent {
  agentPubkey: string;
  amount: number;
  currency: string;
  timestamp: number;
  type: 'one_shot' | 'streaming_settlement';
}

export interface PolicyViolationEvent {
  agentPubkey: string;
  ruleType: PolicyRuleType;
  details: string;
  timestamp: number;
}

// ==================== VAULT ITEMS ====================

export interface VaultItem {
  id: string;
  name: string;
  type: 'api_key' | 'secret' | 'credential';
  upstream: string;
  masked_value: string;
  cipher?: string;
  iv?: string;
  cipher_v?: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
}

// ==================== AGENT REGISTRY ====================

export interface AgentRegistration {
  agentId: string;
  name: string;
  pubkey: string;
  ownerWallet: string;
  createdAt: string;
}

// ==================== MPP ====================

export interface MppStream {
  id: number;
  upstream: string;
  status: 'open' | 'closed';
  ratePerCallMicroUsdc: number;
  ratePerTokenMicroUsdc: number;
  totalCalls: number;
  totalTokens: number;
  pendingMicroUsdc: number;
  settledMicroUsdc: number;
  openedAt: number;
}
