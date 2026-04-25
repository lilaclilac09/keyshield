/**
 * Per-key conflict detection + resolution between two VaultPlain
 * snapshots.
 *
 * Used by `useVaultFlow.persist` when a sync push returns 409. The
 * naïve "later-write-wins" merge silently overwrote whichever side
 * lost the race — that's bad for the case where two devices changed
 * the same API key roughly simultaneously. This module makes the
 * conflict explicit so the UI can ask the user.
 *
 * Scope (V1):
 *   - Detects key-value conflicts only (a key exists in both sides
 *     with different value/createdAt/tags).
 *   - Treats "key only on one side" as a non-conflict — the merge
 *     keeps it. (Deletion-vs-edit conflicts are V1.1 work; for now
 *     a remote add will silently override a local delete.)
 */

import type { ApiKeyRecord, VaultPlain } from './vault';

export type ConflictChoice = 'mine' | 'theirs';

export interface KeyConflict {
  name: string;
  mine: ApiKeyRecord;
  theirs: ApiKeyRecord;
}

export interface ConflictReport {
  /** Conflicts the UI must resolve before persist can finish. */
  conflicts: KeyConflict[];
  /** Pre-merged shape for non-conflicted keys (union, mine wins on
   *  exact-equal entries). The UI doesn't need this — it's the input
   *  to applyResolutions. */
  baseline: VaultPlain;
}

function recordsDiffer(a: ApiKeyRecord, b: ApiKeyRecord): boolean {
  if (a.value !== b.value) return true;
  if (a.createdAt !== b.createdAt) return true;
  // Tag arrays: order-insensitive equality.
  const aTags = [...(a.tags ?? [])].sort();
  const bTags = [...(b.tags ?? [])].sort();
  if (aTags.length !== bTags.length) return true;
  for (let i = 0; i < aTags.length; i++) {
    if (aTags[i] !== bTags[i]) return true;
  }
  return false;
}

/** Compute the conflict report between `mine` and `theirs`. */
export function findConflicts(mine: VaultPlain, theirs: VaultPlain): ConflictReport {
  const conflicts: KeyConflict[] = [];
  const baselineKeys: Record<string, ApiKeyRecord> = {};

  // Start from theirs so any key absent from mine survives the merge.
  for (const [name, t] of Object.entries(theirs.apiKeys)) {
    baselineKeys[name] = t;
  }
  for (const [name, m] of Object.entries(mine.apiKeys)) {
    const t = theirs.apiKeys[name];
    if (!t) {
      baselineKeys[name] = m;
      continue;
    }
    if (recordsDiffer(m, t)) {
      conflicts.push({ name, mine: m, theirs: t });
      // Don't pre-resolve — applyResolutions will fill these in.
      // Leave baseline pointing at theirs as a safe default if the
      // caller forgets to provide a resolution.
      baselineKeys[name] = t;
    } else {
      baselineKeys[name] = m;
    }
  }

  // Settings: take mine (the latest local intent). Conflict resolution
  // for settings would warrant its own UX; settings rarely diverge
  // between devices and the user can always toggle them after merging.
  return {
    conflicts,
    baseline: { ...mine, apiKeys: baselineKeys },
  };
}

/**
 * Apply the user's per-key resolutions to a baseline, producing the
 * VaultPlain to push back to the sync backend.
 *
 * Resolutions for keys not present in `report.conflicts` are ignored
 * (defensive — the UI shouldn't send them, but if it does we don't
 * blow up).
 */
export function applyResolutions(
  report: ConflictReport,
  resolutions: Record<string, ConflictChoice>,
): VaultPlain {
  const next = { ...report.baseline, apiKeys: { ...report.baseline.apiKeys } };
  for (const c of report.conflicts) {
    const choice = resolutions[c.name];
    if (choice === 'mine') next.apiKeys[c.name] = c.mine;
    else if (choice === 'theirs') next.apiKeys[c.name] = c.theirs;
    // No resolution → leave the baseline (theirs by default) — safer
    // because it preserves the most recently sync'd value.
  }
  return next;
}
