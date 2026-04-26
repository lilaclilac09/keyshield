/**
 * Per-key conflict detection + resolution between two VaultPlain
 * snapshots, with tombstone-aware delete-vs-edit handling (V1.1+).
 *
 * Used by `useVaultFlow.persist` when a sync push returns 409.
 *
 * Tombstone semantics:
 *   - VaultPlain.deletedKeys is `{ name: deletedAt (unix-ms) }`.
 *   - Tombstones merge by max(deletedAt) per name.
 *   - For each key name, the active record (mine.apiKeys[n] OR
 *     theirs.apiKeys[n] OR both) competes against the merged
 *     tombstone:
 *       - tombstone newer than the active record's createdAt →
 *         tombstone wins, key stays deleted.
 *       - tombstone older → re-add wins, tombstone is cleared.
 *   - Mutual edits to the same active key still surface as a
 *     ConflictDialog — tombstones don't change that path.
 *
 * No new UI surface is needed: delete-vs-edit is resolved entirely
 * by timestamp ordering, mirroring how iCloud Keychain resolves
 * the same situation silently.
 */

import type { ApiKeyRecord, VaultPlain } from './vault';

export type ConflictChoice = 'mine' | 'theirs';

export interface KeyConflict {
  name: string;
  mine: ApiKeyRecord;
  theirs: ApiKeyRecord;
}

export interface ConflictReport {
  conflicts: KeyConflict[];
  baseline: VaultPlain;
}

function recordsDiffer(a: ApiKeyRecord, b: ApiKeyRecord): boolean {
  if (a.value !== b.value) return true;
  if (a.createdAt !== b.createdAt) return true;
  const aTags = [...(a.tags ?? [])].sort();
  const bTags = [...(b.tags ?? [])].sort();
  if (aTags.length !== bTags.length) return true;
  for (let i = 0; i < aTags.length; i++) {
    if (aTags[i] !== bTags[i]) return true;
  }
  return false;
}

/** Merge the two sides' tombstone maps by max(deletedAt). */
function mergeTombstones(
  mine: VaultPlain,
  theirs: VaultPlain,
): Record<string, number> {
  const out: Record<string, number> = { ...(theirs.deletedKeys ?? {}) };
  for (const [name, t] of Object.entries(mine.deletedKeys ?? {})) {
    out[name] = Math.max(out[name] ?? 0, t);
  }
  return out;
}

export function findConflicts(mine: VaultPlain, theirs: VaultPlain): ConflictReport {
  const conflicts: KeyConflict[] = [];
  const baselineKeys: Record<string, ApiKeyRecord> = {};
  const tombstones = mergeTombstones(mine, theirs);

  const allNames = new Set<string>([
    ...Object.keys(mine.apiKeys),
    ...Object.keys(theirs.apiKeys),
  ]);

  for (const name of allNames) {
    const m = mine.apiKeys[name];
    const t = theirs.apiKeys[name];

    // Pick the candidate active record. Track whether mine and
    // theirs have a value-mismatch separately — we DON'T push the
    // conflict yet, because a newer tombstone may suppress the
    // whole key and make the conflict moot.
    let active: ApiKeyRecord | null = null;
    let bothDiffer = false;
    if (m && t) {
      if (recordsDiffer(m, t)) {
        bothDiffer = true;
        active = t; // safe default — applyResolutions can override
      } else {
        active = m;
      }
    } else if (m) {
      active = m;
    } else if (t) {
      active = t;
    }

    if (!active) continue;

    // Tombstone wins iff strictly newer than the latest "edit
    // intention" expressed on either side. If both sides have the
    // active record, compare against max(createdAt) — otherwise
    // compare against the lone side's createdAt.
    const tombstoneAt = tombstones[name];
    const latestActiveAt =
      m && t ? Math.max(m.createdAt, t.createdAt) : active.createdAt;
    if (tombstoneAt !== undefined && tombstoneAt > latestActiveAt) {
      continue; // suppressed
    }

    if (bothDiffer && m && t) {
      conflicts.push({ name, mine: m, theirs: t });
    }
    baselineKeys[name] = active;
  }

  // Keep tombstones only for names that aren't present in the
  // merged active map. Stale tombstones (where the active record
  // out-survived them) are dropped.
  const finalTombstones: Record<string, number> = {};
  for (const [name, ts] of Object.entries(tombstones)) {
    if (!baselineKeys[name]) finalTombstones[name] = ts;
  }

  const baseline: VaultPlain = {
    ...mine,
    apiKeys: baselineKeys,
  };
  if (Object.keys(finalTombstones).length > 0) {
    baseline.deletedKeys = finalTombstones;
  } else {
    // Don't carry an empty deletedKeys field around — keeps the
    // ciphertext smaller for users who never delete anything.
    delete baseline.deletedKeys;
  }

  return { conflicts, baseline };
}

export function applyResolutions(
  report: ConflictReport,
  resolutions: Record<string, ConflictChoice>,
): VaultPlain {
  const next: VaultPlain = {
    ...report.baseline,
    apiKeys: { ...report.baseline.apiKeys },
  };
  for (const c of report.conflicts) {
    const choice = resolutions[c.name];
    if (choice === 'mine') next.apiKeys[c.name] = c.mine;
    else if (choice === 'theirs') next.apiKeys[c.name] = c.theirs;
  }
  return next;
}
