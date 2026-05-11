import React from 'react';

/**
 * PaymentBadge — pill showing payment settlement state for a proxy call.
 *
 * Server may supply `payment_status` directly on usage rows; when absent the
 * caller derives a fallback from `status_code` / `cost_usd` (see inferPaymentStatus).
 */
export type PaymentStatus = 'paid' | 'pending' | 'failed';

export interface PaymentBadgeProps {
  status: PaymentStatus;
  className?: string;
}

const STYLES: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-950/40 text-emerald-300 border-emerald-900/60',
  pending: 'bg-amber-950/40 text-amber-300 border-amber-900/60',
  failed: 'bg-red-950/40 text-red-300 border-red-900/60',
};

const LABEL: Record<PaymentStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
};

export const PaymentBadge: React.FC<PaymentBadgeProps> = ({ status, className = '' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider border ${STYLES[status]} ${className}`}
  >
    {LABEL[status]}
  </span>
);

/**
 * Fallback inference for when the backend hasn't been updated yet to emit
 * `payment_status`. Mirrors what the proxy will report once wired:
 *   - non-2xx/3xx → failed
 *   - zero-cost   → pending (not yet settled)
 *   - otherwise   → paid
 */
export function inferPaymentStatus(row: { status_code?: number; cost_usd?: number }): PaymentStatus {
  if ((row.status_code ?? 0) >= 400) return 'failed';
  if ((row.cost_usd ?? 0) > 0) return 'paid';
  return 'pending';
}
