/**
 * @file x402.ts — x402 payment protocol: on-chain verification + idempotency.
 */

import * as path from 'path';
import * as fs from 'fs';
import { createHash, randomBytes } from 'crypto';
import { PaymentVerificationResult } from '../types';

// ─── Configuration ──────────────────────────────────────────────────────

export interface X402Config {
  rpcUrl: string;
  receiverAddress: string; // 40-hex EVM, lowercase, with 0x prefix
  usdcAddress: string;     // 40-hex EVM, lowercase, with 0x prefix
  minConfirmations: number;
  verifyRequired: boolean;
}

export const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DEFAULT_MIN_CONFIRMATIONS = 5;

// ERC-20 Transfer event topic0
export const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ─── Config loading ─────────────────────────────────────────────────────

const _WARNED_ENV_MISSING = { value: false };

function isEvmAddress(s: string): boolean {
  if (!s.startsWith('0x') || s.length !== 42) return false;
  try {
    parseInt(s.slice(2), 16);
    return true;
  } catch {
    return false;
  }
}

export function loadX402Config(): X402Config | null {
  const rpcUrl = (process.env.KS_X402_BASE_RPC_URL || '').trim();
  const receiver = (process.env.KS_X402_RECEIVER_ADDRESS || '').trim().toLowerCase();

  if (!rpcUrl || !receiver) {
    if (!_WARNED_ENV_MISSING.value) {
      const missing = ['KS_X402_BASE_RPC_URL', 'KS_X402_RECEIVER_ADDRESS']
        .filter((name, i) => [rpcUrl, receiver][i] === '')
        .join(', ');
      console.warn(`x402: stub-fallback active — missing env: ${missing}`);
      _WARNED_ENV_MISSING.value = true;
    }
    return null;
  }

  if (!isEvmAddress(receiver)) {
    console.error(`x402: KS_X402_RECEIVER_ADDRESS invalid: ${receiver}`);
    return null;
  }

  const usdc = (process.env.KS_X402_USDC_ADDRESS || '').trim().toLowerCase() || USDC_BASE_MAINNET.toLowerCase();
  if (!isEvmAddress(usdc)) {
    console.error(`x402: KS_X402_USDC_ADDRESS invalid: ${usdc}`);
    return null;
  }

  const minConf = parseInt(process.env.KS_X402_MIN_CONFIRMATIONS || String(DEFAULT_MIN_CONFIRMATIONS), 10);
  if (isNaN(minConf) || minConf < 0) {
    console.error('x402: KS_X402_MIN_CONFIRMATIONS must be a non-negative integer');
    return null;
  }

  return {
    rpcUrl,
    receiverAddress: receiver,
    usdcAddress: usdc,
    minConfirmations: minConf,
    verifyRequired: (process.env.KS_X402_VERIFY_REQUIRED || '0').trim() === '1',
  };
}

// ─── Idempotency store (in-memory + file backup) ───────────────────────

interface ClaimRecord {
  paymentProof: string;
  userId: string;
  amountUsd: number;
  verifiedMode: 'real' | 'stub-fallback';
  timestamp: number;
}

const _CLAIMS = new Map<string, ClaimRecord>();
const _CLAIMS_FILE = path.join(__dirname, '..', 'data', 'x402_claims.json');

function loadClaims(): void {
  if (fs.existsSync(_CLAIMS_FILE)) {
    try {
      const data: ClaimRecord[] = JSON.parse(fs.readFileSync(_CLAIMS_FILE, 'utf8'));
      for (const c of data) {
        _CLAIMS.set(c.paymentProof, c);
      }
    } catch {
      // Corrupted file — start fresh
    }
  }
}

function saveClaims(): void {
  try {
    const entries = Array.from(_CLAIMS.values());
    fs.mkdirSync(path.dirname(_CLAIMS_FILE), { recursive: true });
    fs.writeFileSync(_CLAIMS_FILE, JSON.stringify(entries, null, 2));
  } catch {
    // Ignore write errors
  }
}

// Load on startup
loadClaims();

/**
 * Record a claim (idempotent). Returns true if this is a new claim.
 */
export function recordClaim(
  paymentProof: string,
  userId: string,
  amountUsd: number,
  verifiedMode: 'real' | 'stub-fallback',
): boolean {
  if (_CLAIMS.has(paymentProof)) return false;
  _CLAIMS.set(paymentProof, { paymentProof, userId, amountUsd, verifiedMode, timestamp: Date.now() / 1000 });
  saveClaims();
  return true;
}

/**
 * Check if a payment proof has already been claimed.
 */
export function hasClaim(paymentProof: string): boolean {
  return _CLAIMS.has(paymentProof);
}

// ─── On-chain verification ──────────────────────────────────────────────

interface TxReceipt {
  status: string;
  blockNumber: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

async function fetchTxReceipt(config: X402Config, txHash: string): Promise<TxReceipt> {
  // Use httpx (or node-fetch) to call the RPC
  const response = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC returned HTTP ${response.status}`);
  }

   const body: any = await response.json();
  if ('error' in body) {
    throw new Error(`RPC error: ${body.error?.message || body.error}`);
  }

  return body.result;
}

async function fetchBlockNumber(config: X402Config): Promise<number> {
  const response = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_blockNumber',
      params: [],
    }),
  });

  const body: any = await response.json();
  return parseInt(body.result, 16);
}

/**
 * Verify a payment on-chain.
 */
export async function verifyOnChain(
  config: X402Config | null,
  paymentProof: string,
  expectedAmountUsd: number,
): Promise<PaymentVerificationResult> {
  if (!paymentProof) {
    throw new Error('payment_proof must not be empty');
  }

  // Stub fallback
  if (config === null) {
    return { verified: true, mode: 'stub-fallback', amountUsd: expectedAmountUsd };
  }

  // Validate tx hash format
  if (!paymentProof.startsWith('0x') || paymentProof.length !== 66) {
    throw new Error('payment_proof must be a 0x-prefixed 66-char tx hash');
  }

  const receipt = (await fetchTxReceipt(config, paymentProof));

  // Check status
  if (receipt.status !== '0x1') {
    throw new Error(`Transaction failed on-chain (status=${receipt.status})`);
  }

  // Check confirmations
  const txBlock = parseInt(receipt.blockNumber, 16);
  const headBlock = await fetchBlockNumber(config);
  if (headBlock - txBlock < config.minConfirmations) {
    throw new Error(`Only ${headBlock - txBlock} confirmations, need ${config.minConfirmations}`);
  }

  // Decode transfer logs
  return verifyTransferLog((receipt as any).logs, config, expectedAmountUsd);
}

function verifyTransferLog(
  logs: Array<{ address: string; topics: string[]; data: string }>,
  config: X402Config,
  expectedAmountUsd: number,
): PaymentVerificationResult {
  const expectedMicros = Math.round(expectedAmountUsd * 1_000_000);
  const receiverPadded = '0x' + config.receiverAddress.slice(2).padEnd(64, '0');

  for (const log of logs) {
    const addr = (log.address || '').toLowerCase();
    if (addr !== config.usdcAddress) continue;

    const topics = log.topics || [];
    if (!topics.length || topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    if (topics.length < 3) continue;

    // Topic 2 = recipient (32-byte left-padded address)
    if (topics[2].toLowerCase() !== receiverPadded.toLowerCase()) continue;

    // Data = uint256 amount
    const amount = parseInt(log.data || '0x0', 16);
    if (amount >= expectedMicros) {
      return { verified: true, mode: 'real', amountUsd: amount / 1_000_000 };
    }

    throw new Error(
      `USDC transfer amount ${amount / 1_000_000} < expected ${expectedAmountUsd}`,
    );
  }

  throw new Error('No matching USDC Transfer log to platform receiver in tx');
}

// ─── Stub payment proof generation (for testing) ────────────────────────

export function generateStubPaymentProof(): string {
  return '0x' + randomBytes(32).toString('hex');
}
