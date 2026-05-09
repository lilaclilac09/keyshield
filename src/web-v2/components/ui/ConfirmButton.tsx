import React, { useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from './Button';

interface ConfirmButtonProps extends Omit<ButtonProps, 'variant'> { onConfirm: () => void | Promise<void>; confirmLabel?: string; variant?: ButtonProps['variant']; armWindowMs?: number; }

export const ConfirmButton: React.FC<ConfirmButtonProps> = ({ onConfirm, children, confirmLabel = 'CONFIRM', variant = 'destructive', size = 'sm', className = '', disabled = false, title, armWindowMs = 5000, ...rest }) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onClick = async () => {
    if (disabled || busy) return;
    if (!armed) { setArmed(true); timer.current = window.setTimeout(() => setArmed(false), armWindowMs); return; }
    if (timer.current) clearTimeout(timer.current);
    setBusy(true); try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
  };
  return <Button variant={armed ? 'destructive' : variant} size={size} disabled={disabled || busy} title={title} className={className} onClick={onClick} {...rest}>{armed ? confirmLabel : children}</Button>;
};
