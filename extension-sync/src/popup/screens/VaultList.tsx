import React, { useMemo, useState } from 'react';
import type { ApiKeyRecord, VaultPlain } from '../../lib/vault';

export interface VaultListProps {
  vault: VaultPlain;
  onUpsertKey: (name: string, value: string, tags?: string[]) => Promise<void>;
  onRemoveKey: (name: string) => Promise<void>;
  /** Bump lastUsedAt — called when the user reveals a key value. */
  onTouchKey?: (name: string) => Promise<void>;
  onLock: () => void;
}

const NEVER_USED = 'never used';

function relativeTime(ts: number | undefined, now = Date.now()): string {
  if (!ts) return NEVER_USED;
  const diffSecs = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSecs < 60) return 'just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  if (diffSecs < 30 * 86400) return `${Math.floor(diffSecs / 86400)}d ago`;
  if (diffSecs < 365 * 86400) return `${Math.floor(diffSecs / (30 * 86400))}mo ago`;
  return `${Math.floor(diffSecs / (365 * 86400))}y ago`;
}

function parseTagsInput(raw: string): string[] | undefined {
  const tags = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tags.length > 0 ? tags : undefined;
}

export function VaultList(props: VaultListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newTags, setNewTags] = useState('');
  const [revealedName, setRevealedName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const rec of Object.values(props.vault.apiKeys)) {
      for (const t of rec.tags ?? []) set.add(t);
    }
    return [...set].sort();
  }, [props.vault.apiKeys]);

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(props.vault.apiKeys)
      .filter(([name, rec]) => {
        if (activeTag && !(rec.tags ?? []).includes(activeTag)) return false;
        if (!q) return true;
        if (name.toLowerCase().includes(q)) return true;
        return (rec.tags ?? []).some((t) => t.toLowerCase().includes(q));
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [props.vault.apiKeys, search, activeTag]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const value = newValue.trim();
    if (!name || !value) return;
    await props.onUpsertKey(name, value, parseTagsInput(newTags));
    setNewName('');
    setNewValue('');
    setNewTags('');
    setShowAdd(false);
  };

  const handleReveal = async (name: string) => {
    if (revealedName === name) {
      setRevealedName(null);
      return;
    }
    setRevealedName(name);
    if (props.onTouchKey) {
      // Fire-and-forget — the lastUsedAt update is best-effort.
      props.onTouchKey(name).catch(() => {});
    }
  };

  const totalCount = Object.keys(props.vault.apiKeys).length;
  const filtered = entries.length !== totalCount;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Your API keys</div>
          <div className="text-[10px] text-stone-500">
            {filtered
              ? `${entries.length} of ${totalCount} shown`
              : `${totalCount} stored on this device`}
          </div>
        </div>
        <button
          onClick={props.onLock}
          className="text-[11px] text-stone-500 hover:text-stone-900"
        >
          Lock
        </button>
      </header>

      {/* Search + tag filter */}
      {totalCount > 0 && (
        <div className="border-b border-stone-100 px-4 py-2">
          <input
            type="search"
            placeholder="Search by name or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search keys"
            className="w-full rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs"
          />
          {allTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {allTags.map((t) => {
                const active = activeTag === t;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTag(active ? null : t)}
                    aria-pressed={active}
                    className={`rounded-full border px-2 py-[1px] text-[10px] ${
                      active
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-600 hover:border-stone-500'
                    }`}
                  >
                    #{t}
                  </button>
                );
              })}
              {activeTag && (
                <button
                  onClick={() => setActiveTag(null)}
                  className="text-[10px] text-stone-500 underline-offset-2 hover:underline"
                >
                  clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {totalCount === 0 && !showAdd && (
          <div className="mt-8 text-center text-xs text-stone-500">
            No keys yet. Click <b>+ Add key</b> below.
          </div>
        )}
        {totalCount > 0 && entries.length === 0 && (
          <div className="mt-8 text-center text-xs text-stone-500">
            No matches. Adjust your search or clear the tag filter.
          </div>
        )}

        <ul className="space-y-2">
          {entries.map(([name, rec]) => {
            const revealed = revealedName === name;
            return (
              <li
                key={name}
                className="rounded-md border border-stone-200 bg-white p-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-stone-800">{name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReveal(name)}
                      className="text-[10px] text-stone-500 hover:text-stone-900"
                    >
                      {revealed ? 'hide' : 'reveal'}
                    </button>
                    <button
                      onClick={() => props.onRemoveKey(name)}
                      className="text-[10px] text-red-500 hover:text-red-700"
                    >
                      delete
                    </button>
                  </div>
                </div>
                <div className="mt-1 font-mono text-[11px] text-stone-600 break-all">
                  {revealed
                    ? rec.value
                    : '•'.repeat(Math.min(24, rec.value.length))}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-stone-400">
                  <span>{relativeTime(rec.lastUsedAt)}</span>
                  {rec.tags && rec.tags.length > 0 && (
                    <span className="space-x-1">
                      {rec.tags.map((t) => (
                        <span key={t} className="rounded bg-stone-100 px-1">
                          #{t}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-stone-200 p-3">
        {showAdd ? (
          <form onSubmit={handleAdd} className="space-y-2">
            <input
              autoFocus
              placeholder="Name (e.g. openai-prod)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="Key name"
              className="w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
            />
            <input
              type="password"
              placeholder="Value (sk-…)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              aria-label="Key value"
              className="w-full rounded-md border border-stone-300 px-2 py-1 font-mono text-xs"
            />
            <input
              placeholder="Tags (comma-separated, optional)"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              aria-label="Tags"
              className="w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-md bg-stone-900 py-1 text-xs font-medium text-white"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 rounded-md border border-stone-300 py-1 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full rounded-md border border-dashed border-stone-300 py-2 text-xs text-stone-600 hover:border-stone-500"
          >
            + Add key
          </button>
        )}
      </div>
    </div>
  );
}
