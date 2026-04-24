import React, { useState } from 'react';
import type { VaultPlain } from '../../lib/vault';

export interface VaultListProps {
  vault: VaultPlain;
  onUpsertKey: (name: string, value: string, tags?: string[]) => Promise<void>;
  onRemoveKey: (name: string) => Promise<void>;
  onLock: () => void;
}

export function VaultList(props: VaultListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [revealedName, setRevealedName] = useState<string | null>(null);

  const entries = Object.entries(props.vault.apiKeys).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const value = newValue.trim();
    if (!name || !value) return;
    await props.onUpsertKey(name, value);
    setNewName('');
    setNewValue('');
    setShowAdd(false);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Your API keys</div>
          <div className="text-[10px] text-stone-500">
            {entries.length} stored on this device
          </div>
        </div>
        <button
          onClick={props.onLock}
          className="text-[11px] text-stone-500 hover:text-stone-900"
        >
          Lock
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 && !showAdd && (
          <div className="mt-8 text-center text-xs text-stone-500">
            No keys yet. Click <b>+ Add key</b> below.
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
                      onClick={() =>
                        setRevealedName(revealed ? null : name)
                      }
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
                  {revealed ? rec.value : '•'.repeat(Math.min(24, rec.value.length))}
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
              className="w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
            />
            <input
              type="password"
              placeholder="Value (sk-…)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full rounded-md border border-stone-300 px-2 py-1 font-mono text-xs"
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
