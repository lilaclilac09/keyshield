import React, { useEffect, useState } from 'react';
import type { SessionCountdown } from '../hooks/useSessionCountdown';

export interface SessionExpiryToastProps {
  countdown: SessionCountdown;
  /** Triggered when the user taps "Renew" — typically the same
   *  handler the SessionBar uses. */
  onRenew: () => void | Promise<void>;
}

function formatRemaining(secs: number): string {
  if (secs <= 0) return 'expired';
  if (secs < 60) return `${Math.floor(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Modal toast that appears when the on-chain session is within the
 * SessionManager's warning window (default 5 minutes pre-expiry).
 *
 * Distinct from `SessionBar`, which is always visible and changes
 * colour at the same threshold. The toast forces the user's
 * attention with a centred prompt + one-tap renew, and stays out
 * of the way otherwise. Dismissed-once-per-session: once the user
 * dismisses, we don't pop up again until a fresh session starts.
 */
export function SessionExpiryToast(props: SessionExpiryToastProps) {
  const { countdown } = props;
  const remaining = countdown.secondsRemaining ?? null;
  const sessionId = countdown.session?.ephemeralPubkey ?? null;

  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  // Re-arm the toast every time a new session starts.
  useEffect(() => {
    if (sessionId && sessionId !== dismissedFor) {
      // Different session ID than the one we dismissed for → forget
      // the dismissal so the warning can re-appear.
      setDismissedFor((prev) => (prev === sessionId ? prev : null));
    }
  }, [sessionId, dismissedFor]);

  if (
    !countdown.nearExpiry ||
    remaining === null ||
    !Number.isFinite(remaining) ||
    !sessionId ||
    dismissedFor === sessionId
  ) {
    return null;
  }

  const dismiss = () => setDismissedFor(sessionId);
  const renew = async () => {
    await props.onRenew();
    dismiss();
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby="session-expiry-title"
      aria-describedby="session-expiry-body"
      className="fixed inset-x-3 top-3 z-40 rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-md"
    >
      <div className="flex items-start gap-2">
        <div className="text-base" aria-hidden>
          ⏳
        </div>
        <div className="flex-1">
          <div id="session-expiry-title" className="text-xs font-semibold text-amber-900">
            Session expires in {formatRemaining(remaining)}
          </div>
          <div id="session-expiry-body" className="mt-0.5 text-[10px] leading-relaxed text-amber-800">
            Renew now to keep using your vault without re-entering Face ID
            or your recovery phrase.
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={renew}
              className="rounded-md bg-amber-700 px-2.5 py-1 text-[10px] font-medium text-white"
            >
              Renew now
            </button>
            <button
              onClick={dismiss}
              className="rounded-md border border-amber-300 px-2.5 py-1 text-[10px] text-amber-900"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
