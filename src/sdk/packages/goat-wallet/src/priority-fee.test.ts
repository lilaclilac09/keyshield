import { describe, it, expect } from 'vitest';
import { estimatePriorityFeeMicroLamports } from './index';

/**
 * Build a fake Connection that returns the given prioritization fee entries
 * from getRecentPrioritizationFees(). Enough to exercise the median math.
 */
function fakeConnection(
  fees: Array<{ prioritizationFee: number }> | null | Error,
): any {
  return {
    getRecentPrioritizationFees: async () => {
      if (fees instanceof Error) throw fees;
      return fees;
    },
  };
}

describe('estimatePriorityFeeMicroLamports', () => {
  it('returns the median of recent fees', async () => {
    const conn = fakeConnection([
      { prioritizationFee: 100 },
      { prioritizationFee: 500 },
      { prioritizationFee: 1000 },
      { prioritizationFee: 2000 },
      { prioritizationFee: 10_000 },
    ]);
    // Sorted: [100, 500, 1000, 2000, 10000]. floor(5/2) = 2 → 1000.
    expect(await estimatePriorityFeeMicroLamports(conn)).toBe(1000);
  });

  it('ignores negative and non-finite values', async () => {
    const conn = fakeConnection([
      { prioritizationFee: -5 },
      { prioritizationFee: NaN },
      { prioritizationFee: 500 },
      { prioritizationFee: 1000 },
    ] as any);
    // After filter: [500, 1000]. floor(2/2) = 1 → 1000.
    expect(await estimatePriorityFeeMicroLamports(conn)).toBe(1000);
  });

  it('falls back to default on empty result', async () => {
    const conn = fakeConnection([]);
    expect(await estimatePriorityFeeMicroLamports(conn, 7_777)).toBe(7_777);
  });

  it('falls back on RPC error instead of throwing', async () => {
    const conn = fakeConnection(new Error('rpc down'));
    expect(await estimatePriorityFeeMicroLamports(conn, 99)).toBe(99);
  });

  it('falls back when RPC returns null/undefined', async () => {
    const conn = fakeConnection(null as any);
    expect(await estimatePriorityFeeMicroLamports(conn)).toBe(10_000);
  });

  it('falls back when connection lacks getRecentPrioritizationFees entirely', async () => {
    const conn = {} as any;
    expect(await estimatePriorityFeeMicroLamports(conn, 42)).toBe(42);
  });
});
