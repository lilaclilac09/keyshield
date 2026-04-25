import React from 'react';
import { getUpgradeMessage } from '../../lib/platform';

export interface UpgradeScreenProps {
  /** Called when the user clicks "Try again" — typically re-runs the
   *  platform check in case they upgraded the browser since the popup
   *  loaded. */
  onRetry: () => void;
}

export function UpgradeScreen({ onRetry }: UpgradeScreenProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 text-4xl" aria-hidden>
        🛑
      </div>
      <h1 className="mb-2 text-xl font-semibold">Browser not supported</h1>
      <p className="mb-6 max-w-xs text-sm text-stone-600">
        {getUpgradeMessage()}
      </p>

      <button
        onClick={onRetry}
        className="mb-3 w-full max-w-xs rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>

      <p className="mt-8 text-[10px] leading-relaxed text-stone-400">
        KeyShield uses the WebAuthn PRF extension to derive an
        end-to-end-encryption key from your passkey. Older browsers
        don&apos;t expose the PRF output, so we can&apos;t safely sync
        your vault across devices.
      </p>
    </div>
  );
}
