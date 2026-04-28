// Pure helpers extracted from VaultList so we can unit-test them in
// vitest without spinning up a React Native renderer. The screen
// imports these functions; nothing else should change behavior when
// the screen evolves.

import type { ApiKeyRecord, VaultPlain } from '@keyshield/extension-sync/src/lib/vault';

export const NEVER_USED = 'never used';

export function relativeTime(ts: number | undefined, now = Date.now()): string {
  if (!ts) return NEVER_USED;
  const diffSecs = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSecs < 60) return 'just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  if (diffSecs < 30 * 86400) return `${Math.floor(diffSecs / 86400)}d ago`;
  if (diffSecs < 365 * 86400)
    return `${Math.floor(diffSecs / (30 * 86400))}mo ago`;
  return `${Math.floor(diffSecs / (365 * 86400))}y ago`;
}

export function parseTagsInput(raw: string): string[] | undefined {
  const tags = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tags.length > 0 ? tags : undefined;
}

export function collectTags(vault: VaultPlain): string[] {
  const set = new Set<string>();
  for (const rec of Object.values(vault.apiKeys)) {
    for (const t of rec.tags ?? []) set.add(t);
  }
  return [...set].sort();
}

export function filterEntries(
  vault: VaultPlain,
  search: string,
  activeTag: string | null,
): Array<[string, ApiKeyRecord]> {
  const q = search.trim().toLowerCase();
  return Object.entries(vault.apiKeys)
    .filter(([name, rec]) => {
      if (activeTag && !(rec.tags ?? []).includes(activeTag)) return false;
      if (!q) return true;
      if (name.toLowerCase().includes(q)) return true;
      return (rec.tags ?? []).some((t) => t.toLowerCase().includes(q));
    })
    .sort(([a], [b]) => a.localeCompare(b));
}

/** Mask everything except the last few chars; used by the Conflict
 * dialog where we want users to recognise their values without
 * exposing them outright. */
export function maskValue(v: string): string {
  if (v.length <= 6) return '•'.repeat(v.length);
  return `${v.slice(0, 3)}${'•'.repeat(Math.max(4, v.length - 6))}${v.slice(-3)}`;
}

/** Mask the entire value with a fixed-width dot string, identical to
 * what the popup displays in the not-revealed state. */
export function maskedDots(v: string): string {
  return '•'.repeat(Math.min(24, v.length));
}
