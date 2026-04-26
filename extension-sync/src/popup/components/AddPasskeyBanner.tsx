import React, { useState } from 'react';
import type { Services } from '../wiring';
import type { AuthResult } from '../../lib/auth';

export interface AddPasskeyBannerProps {
  services: Services;
  /** Called with the AuthResult once the user accepts the platform
   *  passkey prompt. Triggers `useVaultFlow.registerPasskeyAfterRestore`
   *  which re-wraps the in-memory seed under the new PRF. */
  onRegistered: (result: AuthResult) => Promise<void>;
}

/**
 * Shown above the SessionBar after a mnemonic restore, while the
 * user is in the no-passkey state. Tapping the button runs the same
 * passkey-registration flow as first-run, then promotes the device
 * out of recovery mode. Until then, sync still works (writes go to
 * the seed-derived backup slot) but daily unlock requires retyping
 * the 24-word phrase.
 */
export function AddPasskeyBanner(props: AddPasskeyBannerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const userId = new Uint8Array(16);
      globalThis.crypto.getRandomValues(userId);
      const result = await props.services.auth.registerPasskey({
        userId,
        userName: 'keyshield-user',
        userDisplayName: 'KeyShield user',
      });
      if (!result.success) throw new Error(result.error);
      await props.onRegistered(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add passkey');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-amber-900">
          <strong>Restored from recovery phrase.</strong> Add a passkey on this
          device so you don&apos;t have to retype your phrase next time.
        </div>
        <button
          onClick={onClick}
          disabled={busy}
          className="shrink-0 rounded-md bg-amber-700 px-3 py-1 text-[11px] font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add passkey'}
        </button>
      </div>
      {error && (
        <div className="mt-1 text-[10px] text-red-700">{error}</div>
      )}
    </div>
  );
}
