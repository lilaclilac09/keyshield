/**
 * @file index.ts — KeyShield v2 unified entry point.
 * Clean, modular TypeScript-first architecture with cross-platform support.
 */

// Core types
export {
  EncryptionScheme,
  EncryptedKey,
  VaultEntry,
  SessionPayload,
  SessionInfo,
  AgentRegistration,
  RevocationEntry,
  PaymentVerificationResult,
  UpstreamConfig,
  UsageRecord,
  PriceData,
  SwapQuote,
  TxResult,
} from './types/index';

// Crypto (AES-256-GCM + Argon2id)
export {
  hashPassword,
  verifyPassword,
  deriveKeyPBKDF2,
  storeKey,
  loadKey,
  deleteKey,
  listKeys,
  getVaultPath,
  migrateAllToArgon2,
} from './vault/index';

// Session management
export {
  createToken,
  getToken,
  verifyToken,
  deleteToken,
  markDeleted,
  isDeleted,
  registerAgent,
  lookupOwner,
  revokeAgent,
  listAgents,
  purgeAgents,
  getBalance,
  logCall,
  extractTokenUsage,
} from './sessions/index';

// Wallet management (MCP, Solana, EVM)
export {
  generateEphemeralWallet,
  loadWallet,
  registerWallet,
  revokeWallet,
  listWallets,
  purgeWallets,
} from './wallet/index';

// x402 payment protocol
export {
  loadX402Config,
  verifyOnChain,
  recordClaim,
  hasClaim,
  generateStubPaymentProof,
} from './x402/index';

// Trading (Pyth, Solana payments)
export {
  fetchSolUsdPrice,
  findSolTransfer,
  findMemo,
  issueTopupMemo,
} from './trading/index';

// Proxy with connection pooling
export {
  proxyRequest,
  batchProxy,
  getCached,
  setCache,
  isCacheable,
  cleanup,
} from './proxy/index';

// API server
export { createServer } from './api/server';
