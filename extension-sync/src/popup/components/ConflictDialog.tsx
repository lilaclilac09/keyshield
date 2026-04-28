import React, { useState, useMemo } from 'react';
import type { ConflictChoice, KeyConflict } from '../../lib/conflict';

export interface ConflictDialogProps {
  conflicts: KeyConflict[];
  onResolve: (resolutions: Record<string, ConflictChoice>) => void;
  onCancel: () => void;
}

function maskValue(v: string): string {
  if (v.length <= 6) return '•'.repeat(v.length);
  return `${v.slice(0, 3)}${'•'.repeat(Math.max(4, v.length - 6))}${v.slice(-3)}`;
}

export function ConflictDialog(props: ConflictDialogProps) {
  // Default everything to 'theirs' — that's the value already on the
  // sync backend, so accepting it preserves what other devices saw
  // before our local edit.
  const initial = useMemo<Record<string, ConflictChoice>>(() => {
    const out: Record<string, ConflictChoice> = {};
    for (const c of props.conflicts) out[c.name] = 'theirs';
    return out;
  }, [props.conflicts]);

  const [picks, setPicks] = useState(initial);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const setAll = (choice: ConflictChoice) => {
    const next: Record<string, ConflictChoice> = {};
    for (const c of props.conflicts) next[c.name] = choice;
    setPicks(next);
  };

  const toggleReveal = (name: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 sm:items-center">
      <div className="flex h-[88%] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:h-auto sm:max-h-[80vh] sm:w-[420px] sm:rounded-xl">
        <header className="border-b border-stone-200 px-4 py-3">
          <div className="text-sm font-semibold">Vault out of sync</div>
          <div className="mt-0.5 text-[11px] text-stone-500">
            {props.conflicts.length} key{props.conflicts.length === 1 ? '' : 's'}{' '}
            differ between this device and your other devices. Pick what to
            keep.
          </div>
        </header>

        <div className="flex gap-2 border-b border-stone-200 px-4 py-2">
          <button
            onClick={() => setAll('mine')}
            className="flex-1 rounded-md border border-stone-300 py-1 text-xs"
          >
            Keep all mine
          </button>
          <button
            onClick={() => setAll('theirs')}
            className="flex-1 rounded-md border border-stone-300 py-1 text-xs"
          >
            Keep all theirs
          </button>
        </div>

        <ul className="flex-1 divide-y divide-stone-100 overflow-y-auto px-2">
          {props.conflicts.map((c) => {
            const choice = picks[c.name];
            const showReveal = revealed.has(c.name);
            return (
              <li key={c.name} className="px-2 py-3 text-xs">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-stone-800">{c.name}</span>
                  <button
                    onClick={() => toggleReveal(c.name)}
                    className="text-[10px] text-stone-500 hover:text-stone-900"
                  >
                    {showReveal ? 'hide' : 'reveal'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {(['mine', 'theirs'] as ConflictChoice[]).map((side) => {
                    const rec = side === 'mine' ? c.mine : c.theirs;
                    const label = side === 'mine' ? 'This device' : 'Other device';
                    return (
                      <label
                        key={side}
                        className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 ${
                          choice === side
                            ? 'border-stone-900 bg-stone-50'
                            : 'border-stone-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`conflict-${c.name}`}
                          value={side}
                          checked={choice === side}
                          onChange={() =>
                            setPicks((prev) => ({ ...prev, [c.name]: side }))
                          }
                          aria-label={`${label} for ${c.name}`}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="text-[10px] uppercase tracking-wide text-stone-500">
                            {label}
                          </div>
                          <div className="mt-0.5 break-all font-mono text-[11px] text-stone-700">
                            {showReveal ? rec.value : maskValue(rec.value)}
                          </div>
                          <div className="mt-0.5 text-[10px] text-stone-400">
                            updated{' '}
                            {new Date(rec.createdAt).toISOString().slice(0, 19)}
                            Z
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="flex gap-2 border-t border-stone-200 p-3">
          <button
            onClick={props.onCancel}
            className="flex-1 rounded-md border border-stone-300 py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            onClick={() => props.onResolve(picks)}
            className="flex-1 rounded-md bg-stone-900 py-1.5 text-xs font-medium text-white"
          >
            Save merged
          </button>
        </footer>
      </div>
    </div>
  );
}
