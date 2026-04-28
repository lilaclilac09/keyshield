import React from 'react';

export interface LostDeviceDialogProps {
  /** "Restore from recovery phrase" — fires `flow.startRestore`. */
  onStartRestore: () => void;
  /** Close without taking action. */
  onClose: () => void;
}

/**
 * Walks a user through what to do when they've lost a device that
 * had KeyShield on it. The 3-step recovery here works without any
 * server intervention; immediately afterwards the user should also
 * use the seed-bound force-revoke flow (a button inside the
 * AddPasskeyBanner once the vault is restored) to drop the
 * registration server-side, so the lost device can't even pull
 * fresh ciphertext. That step needs to run while the seed is still
 * in memory (between restore and adding a new passkey here).
 */
export function LostDeviceDialog(props: LostDeviceDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lost-device-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 sm:items-center"
    >
      <div className="flex h-[88%] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:h-auto sm:max-h-[80vh] sm:w-[420px] sm:rounded-xl">
        <header className="border-b border-stone-200 px-4 py-3">
          <div id="lost-device-title" className="text-sm font-semibold">
            Lost a device with KeyShield?
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500">
            Here&apos;s how to recover access and limit what the lost device
            can still do.
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-xs leading-relaxed text-stone-700">
          <ol className="list-inside list-decimal space-y-3">
            <li>
              <strong className="font-semibold">Restore your vault here.</strong>{' '}
              Enter the 24-word recovery phrase you saved at setup. Your
              encrypted vault decrypts on this device using only the words —
              no passkey is needed.
            </li>
            <li>
              <strong className="font-semibold">Add a passkey to this device.</strong>{' '}
              Right after restoring, the popup will offer to register a new
              passkey via Face ID / Touch ID. Once you do, this device unlocks
              normally and any new vault changes are encrypted with a fresh
              key — the lost device will see stale data only.
            </li>
            <li>
              <strong className="font-semibold">Cut off the lost device.</strong>{' '}
              Sign out of iCloud Keychain (Apple) or Google Password Manager
              (Android / Chrome) on the lost device — Find My / Find My Device
              can do this remotely. That removes the synced passkey from the
              lost device and stops it reading your vault entirely.
            </li>
          </ol>

          <div className="mt-4 rounded-md bg-emerald-50 p-3 text-[11px] text-emerald-900">
            <strong className="font-semibold">Server-side lockout:</strong>{' '}
            after you restore here, a "Force-revoke other devices" button
            appears alongside the "Add passkey" prompt. Click it (still on
            the keep-device, while the seed is in memory) and KeyShield asks
            the sync server to wipe every existing passkey registration for
            this vault. The lost device's next sync attempt 404s — it can no
            longer pull fresh ciphertext or push edits.
          </div>
        </div>

        <footer className="flex gap-2 border-t border-stone-200 p-3">
          <button
            onClick={props.onClose}
            className="flex-1 rounded-md border border-stone-300 py-1.5 text-xs"
          >
            Close
          </button>
          <button
            onClick={props.onStartRestore}
            className="flex-1 rounded-md bg-stone-900 py-1.5 text-xs font-medium text-white"
          >
            Restore from phrase
          </button>
        </footer>
      </div>
    </div>
  );
}
