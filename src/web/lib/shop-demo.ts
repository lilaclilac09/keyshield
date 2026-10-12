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
  const body = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
