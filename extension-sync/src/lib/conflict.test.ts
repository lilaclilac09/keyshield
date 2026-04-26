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

function withTombstones(
  base: VaultPlain,
  ...tombstones: Array<[string, number]>
): VaultPlain {
  const out: VaultPlain = { ...base };
  out.deletedKeys = {};
  for (const [name, ts] of tombstones) out.deletedKeys[name] = ts;
  return out;
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

describe('tombstones (delete-vs-edit)', () => {
  it('mine deletes X, theirs has older X → X stays deleted', () => {
    const mine = withTombstones(withKeys(), ['openai', 200]);
    const theirs = withKeys(['openai', 'sk-old', 100]);
    const r = findConflicts(mine, theirs);
    expect(r.baseline.apiKeys.openai).toBeUndefined();
    expect(r.baseline.deletedKeys?.openai).toBe(200);
  });

  it('mine deletes X, theirs has newer X → X is resurrected, tombstone dropped', () => {
    const mine = withTombstones(withKeys(), ['openai', 100]);
    const theirs = withKeys(['openai', 'sk-new', 200]);
    const r = findConflicts(mine, theirs);
    expect(r.baseline.apiKeys.openai?.value).toBe('sk-new');
    expect(r.baseline.deletedKeys?.openai).toBeUndefined();
  });

  it('mine adds X, theirs has older tombstone for X → X stays', () => {
    const mine = withKeys(['openai', 'sk-mine', 200]);
    const theirs = withTombstones(withKeys(), ['openai', 100]);
    const r = findConflicts(mine, theirs);
    expect(r.baseline.apiKeys.openai?.value).toBe('sk-mine');
    expect(r.baseline.deletedKeys?.openai).toBeUndefined();
  });

  it('mine adds X, theirs has newer tombstone for X → tombstone wins', () => {
    const mine = withKeys(['openai', 'sk-mine', 100]);
    const theirs = withTombstones(withKeys(), ['openai', 200]);
    const r = findConflicts(mine, theirs);
    expect(r.baseline.apiKeys.openai).toBeUndefined();
    expect(r.baseline.deletedKeys?.openai).toBe(200);
  });

  it('both sides have tombstones → keep the latest deletedAt', () => {
    const mine = withTombstones(withKeys(), ['openai', 100]);
    const theirs = withTombstones(withKeys(), ['openai', 200]);
    const r = findConflicts(mine, theirs);
    expect(r.baseline.apiKeys.openai).toBeUndefined();
    expect(r.baseline.deletedKeys?.openai).toBe(200);
  });

  it('tombstones for keys that nobody has are preserved', () => {
    const mine = withTombstones(withKeys(), ['ghost', 50]);
    const theirs = withKeys();
    const r = findConflicts(mine, theirs);
    expect(r.baseline.apiKeys.ghost).toBeUndefined();
    expect(r.baseline.deletedKeys?.ghost).toBe(50);
  });

  it('does not surface a value-conflict when one side has tombstoned the disputed key', () => {
    // Same key, different values, but mine deleted it after theirs created it.
    const mine = withTombstones(
      withKeys(['shared', 'sk-mine', 50]),
      ['shared', 200],
    );
    const theirs = withKeys(['shared', 'sk-theirs', 100]);
    const r = findConflicts(mine, theirs);
    // Without the tombstone this would be a conflict (different values
    // on each side). With the tombstone, the active record is ours
    // (mine had value 'sk-mine' at 50), the tombstone (200) is newer
    // than mine.createdAt (50) AND newer than theirs.createdAt (100),
    // so the deletion wins everywhere — no conflict needed.
    expect(r.conflicts).toEqual([]);
    expect(r.baseline.apiKeys.shared).toBeUndefined();
    expect(r.baseline.deletedKeys?.shared).toBe(200);
  });

  it('drops empty deletedKeys field from baseline (keeps ciphertext small)', () => {
    const mine = withKeys(['k', 'v']);
    const theirs = withKeys(['k', 'v']);
    const r = findConflicts(mine, theirs);
    expect(r.baseline.deletedKeys).toBeUndefined();
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
