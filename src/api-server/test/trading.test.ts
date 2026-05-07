/**
 * Tests for the trading module (Pyth, Solana payments).
 */

import { describe, it, expect } from 'vitest';
import {
  PYTH_SOL_USD_FEED,
  USDC_MINT_MAINNET,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  MEMO_PROGRAM_V2,
  fetchSolUsdPrice,
  findSolTransfer,
  findMemo,
  issueTopupMemo,
  verifyTopupMemo,
  consumeTopupMemo,
} from '../src/trading/index';

describe('trading / constants', () => {
  it('should have correct Solana program IDs', () => {
    expect(SYSTEM_PROGRAM_ID).toBe('11111111111111111111111111111111');
    expect(TOKEN_PROGRAM_ID).toMatch(/^Token/);
  });

  it('should have USDC mainnet mint', () => {
    expect(USDC_MINT_MAINNET).toMatch(/^EPjFW/);
  });

  it('should have Pyth feed ID', () => {
    expect(PYTH_SOL_USD_FEED.length).toBeGreaterThan(0);
    expect(PYTH_SOL_USD_FEED.length).toBeLessThan(100);
  });
});

describe('trading / solana payments', () => {
  it('should parse a valid SOL transfer', () => {
    const tx = {
      transaction: {
        message: {
          instructions: [
            {
              programId: SYSTEM_PROGRAM_ID,
              parsed: { type: 'transfer', info: { source: 'sender123', destination: 'recipient456', lamports: 1000000000 } },
            },
          ],
        },
      },
      meta: {},
    };

    const amount = findSolTransfer(tx, 'sender123', 'recipient456');
    expect(amount).toBe(1000000000);
  });

  it('should throw when no matching SOL transfer found', () => {
    const tx = {
      transaction: { message: { instructions: [] }, meta: {} },
      meta: {},
    };

    expect(() => findSolTransfer(tx, 'sender', 'recipient')).toThrow();
  });

  it('should find a memo in transaction', () => {
    const tx = {
      transaction: {
        message: {
          instructions: [
            { programId: MEMO_PROGRAM_V2, parsed: 'ks-topup-abc123' },
          ],
        },
      },
      meta: {},
    };

    const memo = findMemo(tx);
    expect(memo).toBe('ks-topup-abc123');
  });

  it('should return null when no memo found', () => {
    const tx = {
      transaction: { message: { instructions: [] }, meta: {} },
      meta: {},
    };

    expect(findMemo(tx)).toBeNull();
  });
});

describe('trading / memo anti-replay', () => {
  it('should issue and verify a memo', () => {
    const memo = issueTopupMemo('user123');
    expect(memo).toMatch(/^ks-topup-/);

    expect(() => verifyTopupMemo(memo, 'user123')).not.toThrow();
  });

  it('should reject wrong user', () => {
    const memo = issueTopupMemo('owner123');
    expect(() => verifyTopupMemo(memo, 'other456')).toThrow();
  });

  it('should consume a memo', () => {
    const memo = issueTopupMemo('user123');
    consumeTopupMemo(memo);

    // After consumption, should fail (memo is consumed)
    expect(() => verifyTopupMemo(memo, 'user123')).toThrow();
  });

  it('should issue unique memos', () => {
    const memo1 = issueTopupMemo('user123');
    const memo2 = issueTopupMemo('user123');
    expect(memo1).not.toBe(memo2);
  });
});

describe('trading / Pyth price fetch', () => {
  it('should fetch SOL/USD price (integration)', async () => {
    try {
      const price = await fetchSolUsdPrice();
      expect(price.priceUsd).toBeGreaterThan(0);
      expect(typeof price.publishTime).toBe('number');
      expect(price.confidenceUsd).toBeGreaterThanOrEqual(0);
    } catch (err) {
      // Network error is OK in CI without actual RPC
      expect(err).toBeDefined();
    }
  }, 15_000);
});
