import React from 'react';

/**
 * VenueBadge — where the proxy response actually came from.
 *   - cache:    served from KeyShield's hot cache (sub-30ms typically)
 *   - upstream: round-tripped to the upstream provider (OpenAI, Helius, etc)
 */
export type Venue = 'cache' | 'upstream';

export interface VenueBadgeProps {
  venue: Venue;
  className?: string;
}

const STYLES: Record<Venue, string> = {
  cache: 'bg-cyan-950/40 text-cyan-300 border-cyan-900/60',
  upstream: 'bg-orange-950/40 text-orange-300 border-orange-900/60',
};

const LABEL: Record<Venue, string> = {
  cache: 'Cache',
  upstream: 'Upstream',
};

export const VenueBadge: React.FC<VenueBadgeProps> = ({ venue, className = '' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider border ${STYLES[venue]} ${className}`}
  >
    {LABEL[venue]}
  </span>
);

/**
 * Fallback inference based on latency. The proxy will eventually report
 * `venue` directly; until then, sub-30ms responses are cache hits.
 */
export function inferVenue(row: { latency_ms?: number }): Venue {
  return (row.latency_ms ?? 0) < 30 ? 'cache' : 'upstream';
}
