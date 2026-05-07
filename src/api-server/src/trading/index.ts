/**
 * @file trading.ts — Pyth price feeds, billing, Solana payment verification.
 */

import * as path from 'path';
import * as fs from 'fs';

// ─── Constants ──────────────────────────────────────────────────────────

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const MEMO_PROGRAM_V2 = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const MEMO_PROGRAM_V1 = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';

export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export const PYTH_SOL_USD_FEED = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

// ─── Price data ─────────────────────────────────────────────────────────

export interface SolUsdPrice {
  priceUsd: number;
  publishTime: number;
  confidenceUsd: number;
}

/**
 * Fetch the latest SOL/USD price from Pyth Hermes.
 */
export async function fetchSolUsdPrice(hermesBase = 'https://hermes.pyth.network'): Promise<SolUsdPrice> {
  const url = `${hermesBase}/v2/updates/price/latest?ids[]=${PYTH_SOL_USD_FEED}&parsed=true`;
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`Pyth Hermes returned HTTP ${resp.status}`);
  }

  const body = (await resp.json()) as any;
  const parsed = (body.parsed || [])[0];
  if (!parsed || !parsed.price) {
    throw new Error('Pyth response missing price data');
  }

  const priceData = parsed.price;
  const rawPrice = parseInt(priceData.price, 10);
  const expo = parseInt(String(priceData.expo), 10);
  const conf = parseInt(String(priceData.conf || '0'), 10) * (10 ** expo);

  return {
    priceUsd: rawPrice * (10 ** expo),
    publishTime: parseInt(String(priceData.publish_time || Date.now() / 1000), 10),
    confidenceUsd: conf,
  };
}

// ─── Solana payment verification ────────────────────────────────────────

export class PaymentVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentVerificationError';
  }
}

interface TransactionResult {
  transaction?: {
    message?: {
      instructions?: Array<{
        programId?: string;
        parsed?: Record<string, unknown>;
        data?: string;
      }>;
      accountKeys?: Array<{ pubkey?: string } | string>;
    };
  };
  meta?: { err?: unknown; postTokenBalances?: Array<{ accountIndex: number; owner?: string; mint?: string }> };
}

async function getTransaction(
  rpcUrl: string,
  txSignature: string,
  commitment = 'confirmed',
): Promise<TransactionResult | null> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getTransaction',
    params: [txSignature, {
      encoding: 'jsonParsed',
      commitment,
      maxSupportedTransactionVersion: 0,
    }],
  });

  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!resp.ok) {
    throw new PaymentVerificationError(`Solana RPC returned HTTP ${resp.status}`);
  }

const data = (await resp.json()) as any;
  if ('error' in data) {
    throw new PaymentVerificationError(`Solana RPC error: ${data.error?.message || data.error}`);
  }
  return data.result;
}

function verifyTxSucceeded(tx: TransactionResult): void {
  if (!tx) {
    throw new PaymentVerificationError('Transaction not found or not confirmed');
  }
  const meta = tx.meta || {};
  if (meta.err !== undefined && meta.err !== null) {
    throw new PaymentVerificationError(`Transaction reverted: ${JSON.stringify(meta.err)}`);
  }
}

function getInstructions(tx: TransactionResult): Array<{ programId?: string; parsed?: Record<string, unknown>; data?: string }> {
  const msg = tx.transaction?.message || {};
  return (msg.instructions || []) as any[];
}

export function findSolTransfer(
  tx: TransactionResult,
  expectedSender: string,
  expectedRecipient: string,
): number {
  verifyTxSucceeded(tx);
  for (const ix of getInstructions(tx)) {
    if (ix.programId !== SYSTEM_PROGRAM_ID) continue;
    const parsed = (ix.parsed || {}) as any;
    if (parsed.type !== 'transfer') continue;
    const info = parsed.info || {};
    if (info.source === expectedSender && info.destination === expectedRecipient && info.lamports != null) {
      return parseInt(String(info.lamports), 10);
    }
  }
  throw new PaymentVerificationError(`No SystemProgram.transfer from ${expectedSender} to ${expectedRecipient}`);
}

export function findUsdcTransfer(
  tx: TransactionResult,
  expectedSenderAuthority: string,
  expectedRecipientOwner: string,
  usdcMint = USDC_MINT_MAINNET,
): number {
  verifyTxSucceeded(tx);
  const meta = tx.meta || {};
  const postTokenBals = meta.postTokenBalances || [];

  // Map ATA index → owner
  const keys = ((tx.transaction?.message?.accountKeys || []) as any[]).map((k: any) =>
    typeof k === 'object' ? k.pubkey : k,
  );

  function ataOwner(ataPubkey: string): [string | null, string | null] {
    for (const tb of postTokenBals) {
      const idx = tb.accountIndex;
      if (idx != null && idx < keys.length && keys[idx] === ataPubkey) {
        return [tb.owner || null, tb.mint || null];
      }
    }
    return [null, null];
  }

  for (const ix of getInstructions(tx)) {
    if (!ix.programId || ![TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].includes(ix.programId)) continue;
    const parsed = (ix.parsed || {}) as any;
    const ixType = parsed.type;
    const info = parsed.info || {};

    if (ixType === 'transferChecked') {
      if (info.mint !== usdcMint) continue;
      const authority = info.authority || info.tokenAuthority;
      const dst = info.destination;
      const amt = info.tokenAmount?.amount || info.amount;
      const [dstOwner, _] = ataOwner(dst);
      if (authority === expectedSenderAuthority && dstOwner === expectedRecipientOwner && amt != null) {
        return parseInt(String(amt), 10);
      }
    } else if (ixType === 'transfer') {
      const authority = info.authority || info.multisigAuthority;
      const dst = info.destination;
      const amt = info.amount;
      const [dstOwner, dstMint] = ataOwner(dst);
      if (authority === expectedSenderAuthority && dstOwner === expectedRecipientOwner && dstMint === usdcMint && amt != null) {
        return parseInt(String(amt), 10);
      }
    }
  }

  throw new PaymentVerificationError(
    `No USDC transfer from ${expectedSenderAuthority} to owner-of-ATA ${expectedRecipientOwner}`,
  );
}

export function findMemo(tx: TransactionResult): string | null {
  if (!tx) return null;
  for (const ix of getInstructions(tx)) {
    const prog = ix.programId;
    if (![MEMO_PROGRAM_V2, MEMO_PROGRAM_V1].includes(prog || '')) continue;

    const parsed = ix.parsed;
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'object' && parsed) {
      const info = parsed.info as any;
      if (info?.memo && typeof info.memo === 'string') return info.memo;
      if ((parsed as any).memo && typeof (parsed as any).memo === 'string') return (parsed as any).memo;
    }

    // Raw data (base58)
    const raw = ix.data;
    if (typeof raw === 'string') {
      try {
        const { Buffer } = require('buffer');
        const bs58 = require('bs58');
        return bs58.decode(raw).toString('utf8');
      } catch {
        // Skip unparsable data
      }
    }
  }
  return null;
}

// ─── Memo-based anti-replay ─────────────────────────────────────────────

const _TOPUP_MEMOS = new Map<string, [number, string]>(); // memo → [expiry, userId]

export function issueTopupMemo(userId: string, ttlSecs = 300): string {
  purgeExpiredMemos();
  const memo = `ks-topup-${crypto.randomUUID()}`;
  _TOPUP_MEMOS.set(memo, [Date.now() / 1000 + ttlSecs, userId]);
  return memo;
}

export function verifyTopupMemo(memo: string, userId: string): void {
  const entry = _TOPUP_MEMOS.get(memo);
  if (!entry) {
    throw new PaymentVerificationError('Memo not recognized or already consumed');
  }
  const [expiry, owner] = entry;
  if (expiry < Date.now() / 1000) {
    _TOPUP_MEMOS.delete(memo);
    throw new PaymentVerificationError('Memo expired — request a new quote');
  }
  if (owner !== userId) {
    throw new PaymentVerificationError('Memo was issued for a different user');
  }
}

export function consumeTopupMemo(memo: string): void {
  _TOPUP_MEMOS.delete(memo);
}

function purgeExpiredMemos(): void {
  const now = Date.now() / 1000;
  for (const [memo, [expiry]] of _TOPUP_MEMOS.entries()) {
    if (expiry < now) _TOPUP_MEMOS.delete(memo);
  }
}

// ─── Trading execution helpers ──────────────────────────────────────────

export interface TradeExecutionResult {
  success: boolean;
  bundleHash?: string;
  errorMessage?: string;
}

/**
 * Execute a trade through Titan (private block builder) for better pricing.
 */
export async function executeThroughTitan(
  rpcUrl: string,
  signedTxHex: string,
): Promise<TradeExecutionResult> {
  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [[{ data: signedTxHex }]],
      }),
    });

    if (!resp.ok) {
      return { success: false, errorMessage: `Titan returned HTTP ${resp.status}` };
    }

const data = (await resp.json()) as any;
    if ('error' in data) {
      return { success: false, errorMessage: data.error?.message || String(data.error) };
    }
    return { success: true, bundleHash: data.result?.bundle?.bundle_hash || data.result?.bundle || 'unknown' };
  } catch (err) {
    return { success: false, errorMessage: err instanceof Error ? err.message : 'Unknown error' };
  }
}
