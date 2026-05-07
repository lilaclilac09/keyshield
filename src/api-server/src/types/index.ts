// Core type definitions for KeyShield v2

/**
 * Encryption scheme used for key storage.
 * Argon2id is the recommended KDF (OWASP 2023) — resistant to GPU brute-force.
 */
export enum EncryptionScheme {
  Argon2id = 'argon2id',
  Pbkdf2 = 'pbkdf2',
}

/**
 * Result of encrypting a key.
 * Binary-safe: nonce and ciphertext are stored as hex for file storage.
 */
export interface EncryptedKey {
  version: number;          // 0x01 = Argon2id, 0x00 = PBKDF2
  scheme: EncryptionScheme;
  salt: string;             // hex-encoded
  nonce: string;            // hex-encoded (12 bytes for AES-GCM)
  ciphertext: string;       // hex-encoded
  tag: string;              // hex-encoded (AES-GCM auth tag, last 16 bytes of ciphertext)
}

/**
 * Entry in the file vault.
 * Each user has their own directory under VAULT_DIR.
 */
export interface VaultEntry {
  userId: string;
  upstream: string;         // e.g., "openai", "anthropic", "helius"
  encrypted: EncryptedKey;
  createdAt: number;        // unix timestamp
}

/**
 * Session token format: <base64url-payload>.<hmac-signature>
 * Self-contained — survives server restarts.
 */
export interface SessionPayload {
  uid: string;              // user_id
  exp: number;              // expiry epoch (seconds)
  iat: number;              // issued at epoch
  nbf: number;              // not-before epoch
}

/**
 * Validated session info returned by get().
 * Password is decrypted from the DB for auth operations.
 */
export interface SessionInfo {
  userId: string;
  password: string;
  valid: boolean;
  expiresAt: number;
}

/**
 * Agent registration in the agents DB.
 */
export interface AgentRegistration {
  id: number;
  ownerWallet: string;
  pubkeyB58: string;
  name: string;
  scopes: string;           // comma-separated scope list or "*" for all
  createdAt: number;
  lastUsedAt: number | null;
}

/**
 * Agent revocation entry (CRL).
 */
export interface RevocationEntry {
  ownerWallet: string;
  pubkeyB58: string;
  revokedAt: number;
  reason: string;
}

/**
 * x402 payment verification result.
 */
export interface PaymentVerificationResult {
  verified: boolean;
  mode: 'real' | 'stub-fallback';
  amountUsd: number;
  txHash?: string;
}

/**
 * Upstream configuration for the proxy.
 */
export interface UpstreamConfig {
  name: string;
  baseUrl: string;
  apiKeyHeader?: string;     // header name for the key (e.g., "x-api-key", "Authorization")
  keyType: 'self_custodian' | 'platform';
}

/**
 * Proxy call record for usage tracking.
 */
export interface UsageRecord {
  userId: string;
  upstream: string;
  keyType: string;
  method: string;
  path: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  statusCode: number;
}

/**
 * Price data from Pyth/Hermes feeds.
 */
export interface PriceData {
  symbol: string;
  price: number;              // in base units (e.g., USD)
  confidence: number;         // ± margin
  ageMs: number;              // latency since last update
  timestamp: number;          // unix timestamp
}

/**
 * Swap quote from a DEX aggregator (0x, Jupiter, etc.).
 */
export interface SwapQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: number;         // in base units (with decimals)
  buyAmount: number;          // in base units
  price: number;              // buy/sell
  priceImpact: number;        // fraction (e.g., 0.005 = 0.5%)
  gas: number;                // estimated gas cost
  calldata?: string;          // hex-encoded tx data
  to?: string;                // destination address
  expiresAt?: number;         // quote expiry
}

/**
 * Transaction result from execution.
 */
export interface TxResult {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  chainId: number;
}
