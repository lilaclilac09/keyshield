/**
 * Home shop + pay + RPC demo helpers.
 * Primary SKU is the 2.00 USDC Devnet MPP capture.
 * Buy $0.10 ledger credit is a separate button — no Solana tx.
 */

import { MPP_SHOP_SKU } from './mpp-receipt';

export const SHOP_CREDIT_USD = 0.1;
export const SHOP_ITEM_NAME = 'Shop credit';
export const SHOP_MPP_ITEM_NAME = MPP_SHOP_SKU;
export const SHOP_MPP_USD = 2;

/** Last honest MppSettle on the GHpm Devnet demo wallet (README). */
export const SHOP_PROOF_SETTLE_CU = 1906;
/**
 * RPC timings are only ever the user's own measurement from "RPC speed
 * check" (1st call = cold / WAN, 2nd = repeat, cache hit when the backend
 * reports one). No hardcoded numbers: before a check, the UI shows "—".
 */
export type RpcPingSample = { firstMs: number; secondMs: number; cache: string; rpc: string; at: number };
const RPC_PING_KEY = 'ks_rpc_ping';

export function saveRpcPing(sample: RpcPingSample): void {
  try { sessionStorage.setItem(RPC_PING_KEY, JSON.stringify(sample)); } catch { /* private mode */ }
}

export function loadRpcPing(): RpcPingSample | null {
  try {
    const raw = sessionStorage.getItem(RPC_PING_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as RpcPingSample;
    if (!Number.isFinite(o.firstMs) || !Number.isFinite(o.secondMs)) return null;
    return o;
  } catch {
    return null;
  }
}

export function formatRpcMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  return ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`;
}
export const SHOP_PROOF_CLAWBACK_IX = 28;
export const SHOP_PROOF_SETTLE_IX = 26;

export function wantsShopDemo(search: string): boolean {
  try {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('demo') === 'shop';
  } catch {
    return false;
  }
}

export function describeBalanceChange(before: number, after: number): {
  before: number;
  after: number;
  delta: number;
  label: string;
} {
  const delta = Math.round((after - before) * 1e6) / 1e6;
  const sign = delta > 0 ? '+' : '';
  return {
    before,
    after,
    delta,
    label: `${formatUsd(before)} → ${formatUsd(after)} (${sign}${formatUsd(delta)})`,
  };
}

export function formatUsd(n: number): string {
  const abs = Math.abs(n);
  // Sub-cent amounts (e.g. 0.003 USDC agent streams) must not round to $0.00.
  const maxDigits = abs > 0 && abs < 0.01 ? 6 : 2;
  const body = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: maxDigits });
  return n < 0 ? `-$${body}` : `$${body}`;
}

export function describeRpcPing(firstMs: number, secondMs: number, cache: string, rpc: string): string {
  const faster = secondMs < firstMs;
  return [
    `1st ${Math.round(firstMs)}ms`,
    `2nd ${Math.round(secondMs)}ms`,
    faster ? 'faster' : 'same path',
    `cache ${cache || 'n/a'}`,
    rpc || 'rpc',
  ].join(' · ');
}
