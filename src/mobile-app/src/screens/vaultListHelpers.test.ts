import { describe, it, expect } from 'vitest';
import {
  collectTags,
  filterEntries,
  maskValue,
  maskedDots,
  parseTagsInput,
  relativeTime,
} from './vaultListHelpers';

const FIXED_NOW = 1_700_000_000_000;

describe('relativeTime', () => {
  it('returns "never used" when ts is missing', () => {
    expect(relativeTime(undefined, FIXED_NOW)).toBe('never used');
  });

  it('returns "just now" inside the first minute', () => {
    expect(relativeTime(FIXED_NOW - 30 * 1000, FIXED_NOW)).toBe('just now');
  });

  it('uses minutes inside the first hour', () => {
    expect(relativeTime(FIXED_NOW - 5 * 60 * 1000, FIXED_NOW)).toBe('5m ago');
  });

  it('uses hours inside the first day', () => {
    expect(relativeTime(FIXED_NOW - 2 * 60 * 60 * 1000, FIXED_NOW)).toBe(
      '2h ago',
    );
  });

  it('uses days under a month', () => {
    expect(relativeTime(FIXED_NOW - 3 * 24 * 60 * 60 * 1000, FIXED_NOW)).toBe(
      '3d ago',
    );
  });

  it('uses months under a year', () => {
    expect(
      relativeTime(FIXED_NOW - 60 * 24 * 60 * 60 * 1000, FIXED_NOW),
    ).toBe('2mo ago');
  });

  it('uses years past 365 days', () => {
    expect(
      relativeTime(FIXED_NOW - 400 * 24 * 60 * 60 * 1000, FIXED_NOW),
    ).toBe('1y ago');
  });

  it('clamps negative diffs (clock skew) to "just now"', () => {
    expect(relativeTime(FIXED_NOW + 5_000, FIXED_NOW)).toBe('just now');
  });
});

describe('parseTagsInput', () => {
  it('returns undefined for blank input', () => {
    expect(parseTagsInput('')).toBeUndefined();
    expect(parseTagsInput('   ')).toBeUndefined();
    expect(parseTagsInput(',,, ')).toBeUndefined();
  });

  it('trims whitespace and drops empties', () => {
    expect(parseTagsInput('  prod , ai  ,, ')).toEqual(['prod', 'ai']);
  });

  it('preserves order entered by the user', () => {
    expect(parseTagsInput('z,a,m')).toEqual(['z', 'a', 'm']);
  });
});

describe('collectTags', () => {
  it('returns an empty array when no keys carry tags', () => {
    expect(
      collectTags({
        apiKeys: { foo: { value: 'sk-1', createdAt: 1 } },
        settings: {} as any,
      } as any),
    ).toEqual([]);
  });

  it('deduplicates and sorts tags across all keys', () => {
    expect(
      collectTags({
        apiKeys: {
          a: { value: 'sk', createdAt: 1, tags: ['z', 'a'] },
          b: { value: 'sk', createdAt: 2, tags: ['m', 'a'] },
        },
        settings: {} as any,
      } as any),
    ).toEqual(['a', 'm', 'z']);
  });
});

describe('filterEntries', () => {
  const vault = {
    apiKeys: {
      'openai-prod': { value: 'sk-1', createdAt: 1, tags: ['ai', 'prod'] },
      'stripe-test': { value: 'sk-2', createdAt: 2, tags: ['payments'] },
      anthropic: { value: 'sk-3', createdAt: 3 },
    },
    settings: {} as any,
  } as any;

  it('returns everything in alphabetical name order when no filter', () => {
    const out = filterEntries(vault, '', null);
    expect(out.map(([k]) => k)).toEqual(['anthropic', 'openai-prod', 'stripe-test']);
  });

  it('filters by case-insensitive name substring', () => {
    const out = filterEntries(vault, 'STRIPE', null);
    expect(out.map(([k]) => k)).toEqual(['stripe-test']);
  });

  it('matches tag substrings', () => {
    const out = filterEntries(vault, 'pay', null);
    expect(out.map(([k]) => k)).toEqual(['stripe-test']);
  });

  it('restricts to keys carrying the active tag (exact match)', () => {
    const out = filterEntries(vault, '', 'payments');
    expect(out.map(([k]) => k)).toEqual(['stripe-test']);
  });

  it('intersects search and tag filter', () => {
    const out = filterEntries(vault, 'open', 'ai');
    expect(out.map(([k]) => k)).toEqual(['openai-prod']);
  });

  it('returns nothing when the active tag misses every key', () => {
    expect(filterEntries(vault, '', 'nope')).toEqual([]);
  });
});

describe('maskValue / maskedDots', () => {
  it('maskValue keeps the first three and last three characters', () => {
    expect(maskValue('sk-live-abcdef')).toMatch(/^sk-•+def$/);
  });

  it('maskValue dots short values entirely', () => {
    expect(maskValue('abc')).toBe('•••');
    expect(maskValue('ab')).toBe('••');
  });

  it('maskedDots caps at 24 dots regardless of value length', () => {
    expect(maskedDots('x'.repeat(100))).toBe('•'.repeat(24));
    expect(maskedDots('xy')).toBe('••');
  });
});
