import React, { useEffect, useRef, useState } from 'react';

interface Props {
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
  variant?: 'destructive' | 'default';
  confirmLabel?: string;
  className?: string;
  armedClassName?: string;
  disabled?: boolean;
  title?: string;
  armWindowMs?: number;
}

/**
 * Two-step button: first click arms, second click within `armWindowMs` (default 5s) commits.
 * Auto-disarms after the window. Use for destructive actions (delete vault item, revoke agent, etc).
 */
export const ConfirmButton: React.FC<Props> = ({
  onConfirm,
  children,
  variant = 'default',
  confirmLabel = 'Click again to confirm',
  className = '',
  armedClassName = '',
  disabled = false,
  title,
  armWindowMs = 5000,
}) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const onClick = async () => {
    if (disabled || busy) return;
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), armWindowMs);
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
  };

  const baseDestructive = 'border border-rose-900/60 bg-rose-950/30 text-rose-400 hover:bg-rose-950/60';
  const armedDestructive = 'border border-rose-500 bg-rose-600/30 text-rose-200 ring-2 ring-rose-500/40 animate-pulse';
  const baseDefault = 'border border-[#1c2238] bg-[#070912] text-zinc-400 hover:text-white';
  const armedDefault = 'border border-[#5b8cff] bg-[#0e1430] text-white ring-2 ring-[#5b8cff]/40';

  const stateClass = armed
    ? (variant === 'destructive' ? armedDestructive : armedDefault)
    : (variant === 'destructive' ? baseDestructive : baseDefault);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      aria-pressed={armed}
      className={`${stateClass} ${armed ? armedClassName : ''} ${className} disabled:opacity-50 transition-colors`}
    >
      {armed ? confirmLabel : children}
    </button>
  );
};
