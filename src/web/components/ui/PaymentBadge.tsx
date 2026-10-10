import React from 'react';
import {
  SETTLE_LABEL,
  SETTLE_STYLE,
  normalizeSettleMode,
  type SettleMode,
} from '../../lib/payment-status';

export type { SettleMode };
export type PaymentStatus = SettleMode;

export interface PaymentBadgeProps {
  status?: string | null;
  settleMode?: string | null;
  className?: string;
}

export const PaymentBadge: React.FC<PaymentBadgeProps> = ({
  status,
  settleMode,
  className = '',
}) => {
  const mode = normalizeSettleMode({ settle_mode: settleMode || status });
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider border ${SETTLE_STYLE[mode]} ${className}`}
      title={`settle_mode=${mode}`}
    >
      {SETTLE_LABEL[mode]}
    </span>
  );
};

export { inferPaymentStatus, normalizeSettleMode } from '../../lib/payment-status';
