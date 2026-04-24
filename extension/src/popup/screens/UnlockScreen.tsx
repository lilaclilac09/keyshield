import React, { useState } from 'react';
import type { Services } from '../wiring';

export interface UnlockScreenProps {
  mode: 'firstRun' | 'locked';
  services: Services;
  onFirstRunComplete: () => Promise<void>;
  onUnlock: () => Promise<void>;
}

export function UnlockScreen(props: UnlockScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerAndSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      // Stable per-user-per-install identifier. 16 random bytes is fine
      // here because the passkey itself binds identity; this ID is only
      // used as the WebAuthn `user.id` handle.
      const userId = new Uint8Array(16);
      globalThis.crypto.getRandomValues(userId);

      const result = await props.services.auth.registerPasskey({
        userId,
        userName: 'keyshield-user',
        userDisplayName: 'KeyShield user',
      });
      if (!result.success) throw new Error(result.error);

      await props.onFirstRunComplete();
    } catch (e: any) {
      setError(e?.message ?? 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await props.services.auth.authenticateWithWebAuthn();
      if (!result.success) throw new Error(result.error);
      await props.onUnlock();
    } catch (e: any) {
      setError(e?.message ?? 'Unlock failed');
    } finally {
      setBusy(false);
    }
  };

  const onPrimary = props.mode === 'firstRun' ? registerAndSetup : unlock;
  const primaryLabel =
    props.mode === 'firstRun' ? 'Create vault with Face ID' : 'Unlock with Face ID';
  const heading =
    props.mode === 'firstRun'
      ? 'Set up your vault'
      : 'Welcome back';
  const body =
    props.mode === 'firstRun'
      ? 'KeyShield stores your API keys encrypted on this device. Face ID / Touch ID / Windows Hello unlocks them. Only this device can read them — moving to a new device means re-importing.'
      : 'Unlock your vault to view or use your stored API keys.';

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-6 text-4xl" aria-hidden>
        🛡️
      </div>
      <h1 className="mb-2 text-xl font-semibold">{heading}</h1>
      <p className="mb-6 max-w-xs text-sm text-stone-600">{body}</p>

      <button
        onClick={onPrimary}
        disabled={busy}
        className="mb-3 w-full max-w-xs rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Working…' : primaryLabel}
      </button>

      {error && (
        <div className="mt-4 w-full max-w-xs rounded-md bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <p className="mt-8 text-[10px] leading-relaxed text-stone-400">
        Your keys never leave this device. If you lose this device, you’ll
        need to re-import your keys — there’s no cloud backup by default.
      </p>
    </div>
  );
}
