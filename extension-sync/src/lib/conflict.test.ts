import { describe, it, expect } from 'vitest';
import {
  applyResolutions,
  findConflicts,
  type ConflictReport,
} from './conflict';
import { LocalVault, type VaultPlain } from './vault';

function withKeys(...keys: Array<[string, string, number?, string[]?]>): VaultPlain {
  const base = LocalVault.emptyVault();
  for (const [name, value, createdAt = 1, tags] of keys) {
    base.apiKeys[name] = { value, createdAt, ...(tags ? { tags } : {}) };
  }
  return base;
}

describe('findConflicts', () => {
  it('returns no conflicts when both sides are identical', () => {
    const mine = withKeys(['openai', 'sk-1', 100]);
    const theirs = withKeys(['openai', 'sk-1', 100]);
    const r = findConflicts(mine, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.baseline.apiKeys.openai.value).toBe('sk-1');
  });

  it('keeps a key that exists only on mine', () => {
    const mine = withKeys(['openai', 'sk-mine', 100]);
    const theirs = withKeys();
    const r = findConflicts(mine, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.baseline.apiKeys.openai.value).toBe('sk-mine');
  });

  it('keeps a key that exists only on theirs', () => {
    const mine = withKeys();
    const theirs = withKeys(['stripe', 'sk-live', 50]);
    const r = findConflicts(mine, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.baseline.apiKeys.stripe.value).toBe('sk-live');
  });

  it('flags a value mismatch as a conflict', () => {
    const mine = withKeys(['openai', 'sk-mine', 200]);
    const theirs = withKeys(['openai', 'sk-theirs', 100]);
    const r = findConflicts(mine, theirs);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].name).toBe('openai');
    expect(r.conflicts[0].mine.value).toBe('sk-mine');
    expect(r.conflicts[0].theirs.value).toBe('sk-theirs');
  });

  it('flags a tags mismatch as a conflict (order-insensitive equality)', () => {
    const mine: VaultPlain = withKeys(['k', 'v', 1, ['a', 'b']]);
    const theirs: VaultPlain = withKeys(['k', 'v', 1, ['b', 'a']]);
    expect(findConflicts(mine, theirs).conflicts).toEqual([]);

    const mineDifferent: VaultPlain = withKeys(['k', 'v', 1, ['a', 'b']]);
    const theirsDifferent: VaultPlain = withKeys(['k', 'v', 1, ['b', 'c']]);
    expect(findConflicts(mineDifferent, theirsDifferent).conflicts).toHaveLength(1);
  });

  it('handles multi-key vaults with mixed conflicts and clean keys', () => {
    const mine = withKeys(
      ['openai', 'sk-mine'],
      ['stripe', 'sk_live_x'], // unique to mine
      ['anthropic', 'sk-ant-mine'],
    );
    const theirs = withKeys(
      ['openai', 'sk-theirs'], // conflicts
      ['github', 'ghp_x'],     // unique to theirs
      ['anthropic', 'sk-ant-mine'], // identical
    );
    const r = findConflicts(mine, theirs);
    expect(r.conflicts.map((c) => c.name).sort()).toEqual(['openai']);
    expect(Object.keys(r.baseline.apiKeys).sort()).toEqual([
      'anthropic',
      'github',
      'openai',
      'stripe',
    ]);
  });
});

describe('applyResolutions', () => {
  const mine = withKeys(['openai', 'sk-mine', 200], ['onlyMine', 'sk-m']);
  const theirs = withKeys(['openai', 'sk-theirs', 100], ['onlyTheirs', 'sk-t']);
  const report: ConflictReport = findConflicts(mine, theirs);

  it("'mine' resolution writes my value", () => {
    const out = applyResolutions(report, { openai: 'mine' });
    expect(out.apiKeys.openai.value).toBe('sk-mine');
    expect(out.apiKeys.openai.createdAt).toBe(200);
  });

  it("'theirs' resolution writes their value", () => {
    const out = applyResolutions(report, { openai: 'theirs' });
    expect(out.apiKeys.openai.value).toBe('sk-theirs');
    expect(out.apiKeys.openai.createdAt).toBe(100);
  });

  it("missing resolution defaults to 'theirs' (the remote, safer choice)", () => {
    const out = applyResolutions(report, {});
    expect(out.apiKeys.openai.value).toBe('sk-theirs');
  });

  it('non-conflicted keys are kept regardless of resolutions', () => {
    const out = applyResolutions(report, { openai: 'mine' });
    expect(out.apiKeys.onlyMine.value).toBe('sk-m');
    expect(out.apiKeys.onlyTheirs.value).toBe('sk-t');
  });

  it('ignores resolutions for keys that are not in the conflict list', () => {
    const out = applyResolutions(report, {
      openai: 'mine',
      bogus: 'theirs',
    });
    expect(out.apiKeys.openai.value).toBe('sk-mine');
    expect(out.apiKeys.bogus).toBeUndefined();
  });
});
