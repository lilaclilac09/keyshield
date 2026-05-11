import React from 'react';

/**
 * CostBadge — monospace pill displaying call cost (e.g. "$0.0012").
 * Uses the navy palette to blend with v2 surfaces.
 */
export interface CostBadgeProps {
  costUsd: number;
  className?: string;
}

function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.0000';
  // 4 decimals is granular enough for sub-cent calls without becoming noisy.
  return `$${cost.toFixed(4)}`;
}

export const CostBadge: React.FC<CostBadgeProps> = ({ costUsd, className = '' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider border bg-[#131c39] text-[#a8b3d8] border-[#243365] font-mono ${className}`}
  >
    {formatCost(costUsd)}
  </span>
);
