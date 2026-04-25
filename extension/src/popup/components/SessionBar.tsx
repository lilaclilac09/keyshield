import React from 'react';
import type { SessionCountdown } from '../hooks/useSessionCountdown';

export interface SessionBarProps {
  countdown: SessionCountdown;
  onRenew: () => void;
  onRevokeAll: () => void;
  /** When true, both buttons are dimmed and unclickable (e.g. mid-tx). */
  disabled?: boolean;
}

function formatRemaining(secs: number | null): string {
  if (secs === null) return 'no session';
  if (!Number.isFinite(secs)) return '∞';
  if (secs <= 0) return 'expired';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function SessionBar(props: SessionBarProps) {
  const { countdown } = props;
  const active = countdown.session != null && (countdown.secondsRemaining ?? 0) > 0;
  const nearExpiry = countdown.nearExpiry;

  const bg = nearExpiry
    ? 'bg-amber-50 border-amber-200'
    : active
    ? 'bg-emerald-50 border-emerald-200'
    : 'bg-stone-100 border-stone-200';

  return (
    <div className={`border-t px-4 py-2 text-[11px] ${bg}`}>
      <div className="flex items-center justify-between">
        <div className="text-stone-700">
          {active ? (
            <>
              Session:{' '}
              <span className="font-mono">
                {formatRemaining(countdown.secondsRemaining)}
              </span>{' '}
              on{' '}
              <span className="text-stone-500">
                {countdown.session?.deviceLabel ?? 'this device'}
              </span>
            </>
          ) : (
            <span className="text-stone-500">No active on-chain session</span>
          )}
        </div>
        <div className="flex gap-3">
          {active && nearExpiry && (
            <button
              onClick={props.onRenew}
              disabled={props.disabled}
              className="text-[11px] font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
            >
              Renew
            </button>
          )}
          {active && (
            <button
              onClick={props.onRevokeAll}
              disabled={props.disabled}
              className="text-[11px] text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              Revoke all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
