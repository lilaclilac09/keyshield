import { describe, it, expect } from 'vitest';
import { formatBarRemaining, formatToastRemaining } from './sessionFormat';

describe('formatBarRemaining', () => {
  it('returns "no session" for null', () => {
    expect(formatBarRemaining(null)).toBe('no session');
  });

  it('returns the infinity glyph for non-finite values', () => {
    expect(formatBarRemaining(Infinity)).toBe('∞');
    expect(formatBarRemaining(NaN)).toBe('∞');
  });

  it('returns "expired" for non-positive seconds', () => {
    expect(formatBarRemaining(0)).toBe('expired');
    expect(formatBarRemaining(-30)).toBe('expired');
  });

  it('uses h+m for sessions with at least one hour', () => {
    expect(formatBarRemaining(2 * 3600 + 5 * 60 + 30)).toBe('2h 5m');
    expect(formatBarRemaining(3600)).toBe('1h 0m');
  });

  it('uses m+s under an hour but at least one minute', () => {
    expect(formatBarRemaining(125)).toBe('2m 5s');
    expect(formatBarRemaining(60)).toBe('1m 0s');
  });

  it('uses raw seconds under a minute', () => {
    expect(formatBarRemaining(45)).toBe('45s');
    expect(formatBarRemaining(1)).toBe('1s');
  });
});

describe('formatToastRemaining', () => {
  it('returns "expired" for non-positive seconds', () => {
    expect(formatToastRemaining(0)).toBe('expired');
    expect(formatToastRemaining(-1)).toBe('expired');
  });

  it('uses raw seconds under a minute', () => {
    expect(formatToastRemaining(45)).toBe('45s');
    expect(formatToastRemaining(1)).toBe('1s');
  });

  it('uses m+s when there is a remainder', () => {
    expect(formatToastRemaining(125)).toBe('2m 5s');
  });

  it('drops the "0s" when minutes are clean', () => {
    expect(formatToastRemaining(180)).toBe('3m');
    expect(formatToastRemaining(60)).toBe('1m');
  });
});
