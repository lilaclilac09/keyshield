// RestoreScreen relies on isValidMnemonic + normalizePhrase (from
// extension-sync) + a wordCount === 24 gate to enable its "Restore
// vault" button. These tests assert that the same predicates the
// screen relies on actually hold for representative inputs, so a
// regression in the upstream lib gets caught at the mobile boundary.

import { describe, it, expect } from 'vitest';
import {
  isValidMnemonic,
  normalizePhrase,
  generateMnemonic,
} from '@keyshield/extension-sync/src/lib/mnemonic';

function isValidForScreen(input: string): boolean {
  const norm = normalizePhrase(input);
  if (!norm) return false;
  if (norm.split(' ').length !== 24) return false;
  return isValidMnemonic(norm);
}

describe('RestoreScreen validation', () => {
  it('rejects an empty input', () => {
    expect(isValidForScreen('')).toBe(false);
    expect(isValidForScreen('   ')).toBe(false);
  });

  it('rejects fewer than 24 words', () => {
    expect(
      isValidForScreen(
        'army army army army army army army army army army army army',
      ),
    ).toBe(false);
  });

  it('rejects 24 random words that fail the BIP-39 checksum', () => {
    const bogus = Array(24).fill('army').join(' ');
    expect(isValidForScreen(bogus)).toBe(false);
  });

  it('accepts a freshly generated 24-word phrase', () => {
    const phrase = generateMnemonic();
    expect(phrase.split(' ').length).toBe(24);
    expect(isValidForScreen(phrase)).toBe(true);
  });

  it('accepts a generated phrase even with messy whitespace', () => {
    const phrase = generateMnemonic();
    const messy = `   ${phrase.split(' ').join('   ')}   `;
    expect(isValidForScreen(messy)).toBe(true);
  });

  it('accepts a generated phrase with mixed-case letters', () => {
    const phrase = generateMnemonic();
    const upper = phrase
      .split(' ')
      .map((w, i) => (i % 2 === 0 ? w.toUpperCase() : w))
      .join(' ');
    expect(isValidForScreen(upper)).toBe(true);
  });
});
