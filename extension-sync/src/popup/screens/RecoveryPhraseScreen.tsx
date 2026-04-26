import React, { useState } from 'react';

export interface RecoveryPhraseScreenProps {
  /** 24-word BIP-39 phrase. Already stored encrypted on the sync
   *  backend; this is the only time it'll be shown plaintext. */
  mnemonic: string;
  /** Called once the user types in the confirmation box and clicks
   *  the button. Transitions the popup into the unlocked state. */
  onAcknowledge: () => void;
}

const CONFIRMATION_TEXT = 'I have saved my phrase';

export function RecoveryPhraseScreen(props: RecoveryPhraseScreenProps) {
  const words = props.mnemonic.split(' ');
  const [confirmation, setConfirmation] = useState('');
  const [revealed, setRevealed] = useState(true);

  const canProceed = confirmation.trim() === CONFIRMATION_TEXT;

  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-3 text-center">
        <div className="mb-1 text-2xl" aria-hidden>
          🔑
        </div>
        <h1 className="text-base font-semibold">Save your recovery phrase</h1>
        <p className="mt-1 text-xs text-stone-600">
          These 24 words are the only way to recover your vault if you lose
          every device with your passkey. Write them down or store them in a
          password manager. Anyone with these words can access your vault.
        </p>
      </header>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-stone-500">
          Recovery phrase
        </span>
        <button
          onClick={() => setRevealed((r) => !r)}
          className="text-[10px] text-stone-500 hover:text-stone-900"
        >
          {revealed ? 'hide' : 'reveal'}
        </button>
      </div>

      <ol className="mb-4 grid grid-cols-3 gap-1.5 rounded-md border border-stone-200 bg-stone-50 p-2 font-mono text-[11px]">
        {words.map((word, i) => (
          <li
            key={i}
            className="flex items-baseline gap-1.5 rounded bg-white px-1.5 py-1"
          >
            <span className="w-4 text-right text-[9px] text-stone-400">
              {i + 1}
            </span>
            <span className="text-stone-800">
              {revealed ? word : '••••••'}
            </span>
          </li>
        ))}
      </ol>

      <label className="mb-2 block text-[10px] uppercase tracking-wide text-stone-500">
        Type "{CONFIRMATION_TEXT}" to confirm
      </label>
      <input
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder={CONFIRMATION_TEXT}
        aria-label="Confirmation text"
        className="mb-3 w-full rounded-md border border-stone-300 px-2 py-1.5 text-xs"
      />

      <button
        onClick={props.onAcknowledge}
        disabled={!canProceed}
        className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Continue to vault
      </button>

      <p className="mt-3 text-[10px] leading-relaxed text-stone-400">
        KeyShield does not keep a copy of these words. Lose them and lose
        every device with your passkey, and your vault is unrecoverable.
      </p>
    </div>
  );
}
