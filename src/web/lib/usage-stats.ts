/**
 * Unwrap GET /usage/stats payloads.
 *
 * The Python route historically wrapped get_stats() a second time, so
 * clients saw `{ stats: { stats: [...] } }`. Accept the array, a single
 * wrap, or the nested wrap so an old :8001 process still fills the table.
 */

export interface UsageStat {
  upstream: string;
  key_type: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_latency: number;
  last_used: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function asStat(v: unknown): UsageStat | null {
  if (!isRecord(v) || typeof v.upstream !== 'string' || !v.upstream) return null;
  return {
    upstream: v.upstream,
    key_type: typeof v.key_type === 'string' ? v.key_type : '',
    calls: num(v.calls),
    tokens_in: num(v.tokens_in),
    tokens_out: num(v.tokens_out),
    cost_usd: num(v.cost_usd),
    avg_latency: num(v.avg_latency),
    last_used: num(v.last_used),
  };
}

export function normalizeStats(raw: unknown, depth = 0): UsageStat[] {
  if (depth > 3) return [];
  if (Array.isArray(raw)) {
    return raw.map(asStat).filter((row): row is UsageStat => row !== null);
  }
  if (isRecord(raw) && 'stats' in raw) {
    return normalizeStats(raw.stats, depth + 1);
  }
  return [];
}

export function usageTotals(stats: UsageStat[]): {
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_latency: number;
} {
  if (stats.length === 0) {
    return { calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, avg_latency: 0 };
  }
  const acc = stats.reduce(
    (sum, row) => ({
      calls: sum.calls + row.calls,
      tokens_in: sum.tokens_in + row.tokens_in,
      tokens_out: sum.tokens_out + row.tokens_out,
      cost_usd: sum.cost_usd + row.cost_usd,
      latency_sum: sum.latency_sum + row.avg_latency,
    }),
    { calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_sum: 0 },
  );
  return {
    calls: acc.calls,
    tokens_in: acc.tokens_in,
    tokens_out: acc.tokens_out,
    cost_usd: acc.cost_usd,
    avg_latency: acc.latency_sum / stats.length,
  };
}
