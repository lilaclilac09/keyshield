import { describe, it, expect } from 'vitest';
import {
  formatVaultAsEnv,
  formatVaultAsEnvExample,
  quoteEnvValue,
  toEnvName,
} from './env-export';
import { LocalVault } from './vault';

const FIXED_NOW = new Date('2026-04-28T12:00:00.000Z');

describe('toEnvName', () => {
  it('upcases lowercase keys', () => {
    expect(toEnvName('openai')).toBe('OPENAI');
  });

  it('replaces hyphens, dots, slashes, spaces with underscores', () => {
    expect(toEnvName('openai-prod')).toBe('OPENAI_PROD');
    expect(toEnvName('a.b.c')).toBe('A_B_C');
    expect(toEnvName('with spaces')).toBe('WITH_SPACES');
    expect(toEnvName('a/b\\c')).toBe('A_B_C');
  });

  it('strips characters outside [A-Z0-9_]', () => {
    expect(toEnvName('hello!world?')).toBe('HELLOWORLD');
    expect(toEnvName('emoji🚀rocket')).toBe('EMOJIROCKET');
  });

  it('prefixes a leading digit with underscore', () => {
    expect(toEnvName('1password')).toBe('_1PASSWORD');
    expect(toEnvName('123')).toBe('_123');
  });

  it('returns empty string for inputs with no env-safe chars', () => {
    expect(toEnvName('!!!')).toBe('');
    expect(toEnvName('🔐')).toBe('');
  });
});

describe('quoteEnvValue', () => {
  it('returns "" for empty input', () => {
    expect(quoteEnvValue('')).toBe('');
  });

  it('leaves simple ASCII unquoted', () => {
    expect(quoteEnvValue('sk-test-1234')).toBe('sk-test-1234');
    expect(quoteEnvValue('a@b.c:1234')).toBe('a@b.c:1234');
  });

  it('quotes values with spaces', () => {
    expect(quoteEnvValue('hello world')).toBe('"hello world"');
  });

  it('quotes values with #, dollar signs, or quotes', () => {
    expect(quoteEnvValue('a#b')).toBe('"a#b"');
    expect(quoteEnvValue('cost: $5')).toBe('"cost: \\$5"');
    expect(quoteEnvValue('she said "hi"')).toBe('"she said \\"hi\\""');
  });

  it('escapes backslashes', () => {
    expect(quoteEnvValue('a\\b')).toBe('"a\\\\b"');
  });

  it('escapes newlines as literal \\n inside quotes', () => {
    expect(quoteEnvValue('line1\nline2')).toBe('"line1\\nline2"');
    expect(quoteEnvValue('cr\r\nlf')).toBe('"cr\\nlf"');
  });
});

function vaultWith(rows: Record<string, string>) {
  const v = LocalVault.emptyVault();
  let i = 0;
  for (const [name, value] of Object.entries(rows)) {
    v.apiKeys[name] = { value, createdAt: ++i };
  }
  return v;
}

describe('formatVaultAsEnv', () => {
  it('produces a stable, sorted, header-prefixed file', () => {
    const v = vaultWith({
      'stripe-test': 'sk_live_x',
      'openai-prod': 'sk-abc',
      anthropic: 'sk-ant-zzz',
    });
    const out = formatVaultAsEnv(v, { now: FIXED_NOW });
    expect(out).toContain('# DO NOT COMMIT THIS FILE TO GIT.');
    expect(out).toContain('# Generated at 2026-04-28T12:00:00.000Z');
    expect(out).toContain('# Keys: 3');
    // Alphabetical: anthropic → openai-prod → stripe-test
    const idxAnth = out.indexOf('ANTHROPIC=');
    const idxOpen = out.indexOf('OPENAI_PROD=');
    const idxStripe = out.indexOf('STRIPE_TEST=');
    expect(idxAnth).toBeGreaterThan(0);
    expect(idxOpen).toBeGreaterThan(idxAnth);
    expect(idxStripe).toBeGreaterThan(idxOpen);
    expect(out).toContain('OPENAI_PROD=sk-abc');
  });

  it('handles values that need quoting', () => {
    const v = vaultWith({ 'db-url': 'postgres://u:p@host/db?ssl=true' });
    const out = formatVaultAsEnv(v, { now: FIXED_NOW });
    // The URL has `?` which is in our SAFE charset, so unquoted.
    expect(out).toContain('DB_URL=postgres://u:p@host/db?ssl=true');
  });

  it('quotes values with spaces or hashes', () => {
    const v = vaultWith({ note: 'has spaces and #hash' });
    const out = formatVaultAsEnv(v, { now: FIXED_NOW });
    expect(out).toContain('NOTE="has spaces and #hash"');
  });

  it('skips empty values by default', () => {
    const v = vaultWith({ filled: 'x', empty: '' });
    const out = formatVaultAsEnv(v, { now: FIXED_NOW });
    expect(out).toContain('FILLED=x');
    expect(out).not.toContain('EMPTY=');
    expect(out).toContain('# Keys: 1');
  });

  it('includes empty values when keepEmpty is set', () => {
    const v = vaultWith({ filled: 'x', empty: '' });
    const out = formatVaultAsEnv(v, { now: FIXED_NOW, keepEmpty: true });
    expect(out).toContain('EMPTY=');
    expect(out).toContain('# Keys: 2');
  });

  it('respects selectedNames filter', () => {
    const v = vaultWith({ openai: 'sk-1', stripe: 'sk-2', anthropic: 'sk-3' });
    const out = formatVaultAsEnv(v, {
      now: FIXED_NOW,
      selectedNames: ['openai', 'stripe'],
    });
    expect(out).toContain('OPENAI=sk-1');
    expect(out).toContain('STRIPE=sk-2');
    expect(out).not.toContain('ANTHROPIC');
  });

  it('disambiguates collisions with _2, _3, ...', () => {
    const v = vaultWith({
      'openai-prod': 'sk-A',
      'openai_prod': 'sk-B',
      'OPENAI-PROD': 'sk-C',
    });
    const out = formatVaultAsEnv(v, { now: FIXED_NOW });
    // Sort order is OPENAI-PROD, openai-prod, openai_prod by localeCompare.
    // First gets OPENAI_PROD, second OPENAI_PROD_2, third OPENAI_PROD_3.
    expect(out).toMatch(/OPENAI_PROD=/);
    expect(out).toMatch(/OPENAI_PROD_2=/);
    expect(out).toMatch(/OPENAI_PROD_3=/);
  });

  it('skips keys that are ALL stripped chars (no env name possible)', () => {
    const v = vaultWith({ '🔐': 'value', valid: 'ok' });
    const out = formatVaultAsEnv(v, { now: FIXED_NOW });
    expect(out).toContain('VALID=ok');
    expect(out).toContain('# Keys: 1');
  });

  it('produces a valid file when the vault is empty', () => {
    const v = LocalVault.emptyVault();
    const out = formatVaultAsEnv(v, { now: FIXED_NOW });
    expect(out).toContain('# Keys: 0');
    expect(out).toContain('# DO NOT COMMIT');
  });
});

describe('formatVaultAsEnvExample', () => {
  it('contains the same key names as the .env, no values', () => {
    const v = vaultWith({ 'openai-prod': 'sk-1', stripe: 'sk_live_2' });
    const out = formatVaultAsEnvExample(v, { now: FIXED_NOW });
    expect(out).toContain('OPENAI_PROD=');
    expect(out).toContain('STRIPE=');
    expect(out).not.toContain('sk-1');
    expect(out).not.toContain('sk_live_2');
  });

  it('includes the "safe to commit" header', () => {
    const v = vaultWith({ openai: 'x' });
    const out = formatVaultAsEnvExample(v, { now: FIXED_NOW });
    expect(out).toContain('committable template');
  });

  it('respects the same name-collision rules as the .env', () => {
    const v = vaultWith({ 'openai-prod': 'A', 'openai_prod': 'B' });
    const out = formatVaultAsEnvExample(v, { now: FIXED_NOW });
    expect(out).toMatch(/OPENAI_PROD=$/m);
    expect(out).toMatch(/OPENAI_PROD_2=$/m);
  });
});
