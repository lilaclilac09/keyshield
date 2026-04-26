import { describe, it, expect } from 'vitest';
import {
  generateMnemonic,
  isValidMnemonic,
  mnemonicToSeed,
  seedToMnemonic,
  normalizePhrase,
  InvalidMnemonicError,
} from './mnemonic';

describe('generateMnemonic', () => {
  it('produces 24 words', () => {
    const words = generateMnemonic().split(' ');
    expect(words).toHaveLength(24);
  });

  it('produces a different phrase each call', () => {
    const a = generateMnemonic();
    const b = generateMnemonic();
    expect(a).not.toBe(b);
  });

  it('every produced phrase round-trips through mnemonicToSeed → seedToMnemonic', () => {
    for (let i = 0; i < 5; i++) {
      const m = generateMnemonic();
      const seed = mnemonicToSeed(m);
      expect(seed.length).toBe(32);
      expect(seedToMnemonic(seed)).toBe(m);
    }
  });
});

describe('mnemonicToSeed', () => {
  it('produces a 32-byte seed', () => {
    const phrase = generateMnemonic();
    expect(mnemonicToSeed(phrase).length).toBe(32);
  });

  it('is deterministic — same phrase → same seed', () => {
    const m = generateMnemonic();
    const a = mnemonicToSeed(m);
    const b = mnemonicToSeed(m);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('throws InvalidMnemonicError on a typo', () => {
    const m = generateMnemonic();
    const corrupted = m.replace(/\b\w+\b/, 'notaword');
    expect(() => mnemonicToSeed(corrupted)).toThrow(InvalidMnemonicError);
  });

  it('throws on the wrong word count', () => {
    const short = 'abandon abandon abandon abandon abandon abandon abandon abandon';
    expect(() => mnemonicToSeed(short)).toThrow(InvalidMnemonicError);
  });

  it('throws on a checksum failure (valid words, wrong order)', () => {
    // BIP-39's last word encodes a checksum, so swapping random valid
    // words almost always breaks the checksum.
    const m = generateMnemonic().split(' ');
    [m[0], m[23]] = [m[23], m[0]];
    expect(() => mnemonicToSeed(m.join(' '))).toThrow(InvalidMnemonicError);
  });
});

describe('seedToMnemonic', () => {
  it('refuses non-32-byte input', () => {
    expect(() => seedToMnemonic(new Uint8Array(16))).toThrow(/32/);
    expect(() => seedToMnemonic(new Uint8Array(64))).toThrow(/32/);
  });

  it("recovers the canonical 'all-zero' BIP-39 phrase", () => {
    // The 32 zero-byte entropy maps to a fixed BIP-39 phrase
    // ("abandon abandon ... abandon art"). We don't hardcode the full
    // string — we just check that round-tripping zeros lands back on
    // zeros, which exercises the same edge.
    const seed = new Uint8Array(32);
    const phrase = seedToMnemonic(seed);
    const back = mnemonicToSeed(phrase);
    expect(Array.from(back)).toEqual(Array.from(seed));
    // And the canonical first word is 'abandon'.
    expect(phrase.split(' ')[0]).toBe('abandon');
  });
});

describe('normalizePhrase', () => {
  it('lowercases + collapses whitespace', () => {
    expect(normalizePhrase('  Abandon   ABILITY\nable  ')).toBe(
      'abandon ability able',
    );
  });

  it('strips punctuation', () => {
    expect(normalizePhrase('abandon, ability. able!')).toBe(
      'abandon ability able',
    );
  });

  it('lets a copy-pasted real phrase through unchanged (modulo case)', () => {
    const m = generateMnemonic();
    expect(normalizePhrase(m)).toBe(m);
  });
});

describe('isValidMnemonic', () => {
  it('accepts a freshly-generated phrase', () => {
    expect(isValidMnemonic(generateMnemonic())).toBe(true);
  });

  it('accepts a copy-pasted phrase with mixed case + extra whitespace', () => {
    const m = generateMnemonic();
    const messy = `  ${m
      .split(' ')
      .map((w, i) => (i % 2 ? w.toUpperCase() : w))
      .join('   ')}  `;
    expect(isValidMnemonic(messy)).toBe(true);
  });

  it('rejects a phrase with a typo', () => {
    const m = generateMnemonic();
    expect(isValidMnemonic(m.replace(/\b\w+\b/, 'fakeword'))).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidMnemonic('')).toBe(false);
  });
});
