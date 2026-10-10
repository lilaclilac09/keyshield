/**
 * 402 preview — details first, then Pay, capped by max-amount.
 * Same shape as the extension toast and `pay.sh --details`.
 */

import { apiFetch } from './auth';

export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export interface X402Accept {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface X402Preview {
  x402Version: number;
  error: string;
  accepts: X402Accept[];
  amount_micro_usdc: number;
  max_amount_micro_usdc: number;
  capped: boolean;
  over_cap: boolean;
}

export interface X402PayResult {
  ok: boolean;
  settle_mode?: string;
  artifact_hash?: string;
  stream_id?: number;
  signature?: string;
  explorer_url?: string;
  detail?: string;
  code?: string;
}

export function parseMicroAmount(raw: string | number | undefined): number {
  if (raw == null) return 0;
  const text = String(raw).trim();
  if (!/^[0-9]+$/.test(text)) {
    throw new Error('amount must be a canonical integer (micro-USDC)');
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error('amount out of range');
  }
  return n;
}

export function assertUnderCap(amount: number, maxAmount: number): void {
  if (maxAmount > 0 && amount > maxAmount) {
    throw new Error(`amount ${amount} exceeds --max-amount ${maxAmount}`);
  }
}

export async function fetch402Preview(input: {
  amountMicroUsdc?: number;
  maxAmountMicroUsdc?: number;
  resource?: string;
}): Promise<X402Preview> {
  const params = new URLSearchParams();
  if (input.amountMicroUsdc != null) params.set('amount', String(input.amountMicroUsdc));
  if (input.maxAmountMicroUsdc != null) params.set('max_amount', String(input.maxAmountMicroUsdc));
  if (input.resource) params.set('resource', input.resource);
  const r = await apiFetch(`/billing/402-preview?${params.toString()}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: '402 preview failed' }));
    throw new Error((err as { detail?: string }).detail || '402 preview failed');
  }
  return r.json();
}

export async function pay402Preview(input: {
  amountMicroUsdc: number;
  maxAmountMicroUsdc: number;
  streamId?: number;
  resource?: string;
}): Promise<X402PayResult> {
  assertUnderCap(input.amountMicroUsdc, input.maxAmountMicroUsdc);
  const r = await apiFetch('/billing/402-pay', {
    method: 'POST',
    body: JSON.stringify({
      amount_micro_usdc: input.amountMicroUsdc,
      max_amount_micro_usdc: input.maxAmountMicroUsdc,
      stream_id: input.streamId,
      resource: input.resource,
    }),
  });
  const body = (await r.json().catch(() => ({}))) as X402PayResult;
  if (!r.ok) {
    return {
      ok: false,
      detail: body.detail || '402 pay failed',
      code: body.code,
    };
  }
  return { ...body, ok: true };
}
