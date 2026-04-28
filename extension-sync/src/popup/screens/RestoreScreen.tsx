import React, { useMemo, useState } from 'react';
import { isValidMnemonic, normalizePhrase } from '../../lib/mnemonic';

export interface RestoreScreenProps {
  /** Submit handler — receives the normalised 24-word phrase. May
   *  throw (e.g. no matching vault on the sync backend); the screen
   *  surfaces the message. */
  onRestore: (phrase: string) => Promise<void>;
  /** Back to first-run / unlock entry. */
  onCancel: () => void;
}

export function RestoreScreen(props: RestoreScreenProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalised = useMemo(() => normalizePhrase(input), [input]);
  const wordCount = normalised ? normalised.split(' ').length : 0;
  const valid = wordCount === 24 && isValidMnemonic(normalised);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await props.onRestore(normalised);
    } catch (e: any) {
      setError(e?.message ?? 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-3 text-center">
        <div className="mb-1 text-2xl" aria-hidden>
          🌱
        </div>
        <h1 className="text-base font-semibold">Restore from recovery phrase</h1>
        <p className="mt-1 text-xs text-stone-600">
          Enter the 24-word phrase you saved when you set up your vault.
          The vault will decrypt locally — KeyShield never sees the phrase.
        </p>
      </header>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={6}
        placeholder="word1 word2 word3 ... word24"
        aria-label="Recovery phrase input"
        className="mb-2 w-full resize-none rounded-md border border-stone-300 p-2 font-mono text-xs"
      />

      <div className="mb-3 flex items-center justify-between text-[10px] text-stone-500">
        <span>
          {wordCount} / 24 words
          {wordCount === 24 && !valid ? ' (checksum failed — check spelling)' : ''}
        </span>
        {valid && <span className="text-emerald-600">phrase looks good ✓</span>}
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-2 text-[11px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={props.onCancel}
          className="flex-1 rounded-md border border-stone-300 py-2 text-xs"
        >
          Back
        </button>
        <button
          onClick={submit}
          disabled={!valid || busy}
          className="flex-1 rounded-md bg-stone-900 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Restoring…' : 'Restore vault'}
        </button>
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-stone-400">
        After restoring, register a new passkey so future unlocks don&apos;t
        require typing the phrase again.
      </p>
    </div>
  );
}
