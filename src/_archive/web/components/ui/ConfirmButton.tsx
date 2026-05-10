/**
 * ConfirmButton — Two-step destructive action
 *
 * First click arms, second click within window commits.
 * Institutional styling with sharp corners.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

interface ConfirmButtonProps {
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
  confirmLabel?: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  title?: string;
  armWindowMs?: number;
}

export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  onConfirm,
  children,
  confirmLabel = 'CONFIRM',
  variant = 'destructive',
  size = 'sm',
  className = '',
  disabled = false,
  title,
  armWindowMs = 5000,
}) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = async () => {
    if (disabled || busy) return;
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), armWindowMs);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
  };

  return (
    <Button
      variant={armed ? 'destructive' : variant}
      size={size}
      disabled={disabled || busy}
      title={title}
      className={className}
      onClick={onClick}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
};
