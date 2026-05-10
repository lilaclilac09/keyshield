import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'secondary' | 'outlined' | 'outline' | 'ghost' | 'pill-primary' | 'pill-secondary' | 'auth' | 'auth-outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  const base = 'ks-btn inline-flex items-center justify-center gap-2 font-medium text-sm transition-all duration-150 cursor-pointer select-none active:scale-[0.98]';

  const normalizedVariant = variant === 'outline' ? 'outlined' : variant;

  const variants: Record<string, string> = {
    primary: 'bg-[hsl(240deg_6%_10%)] text-white border border-[hsl(240deg_6%_10%)] rounded-lg px-5 py-2 hover:bg-[hsl(240deg_6%_18%)]',
    secondary: 'bg-transparent text-[hsl(240deg_6%_8%)] border border-[hsl(240deg_5%_89%)] rounded-lg px-5 py-2 hover:bg-[hsl(0deg_0%_100%)] hover:border-[hsl(240deg_4%_46%)]',
    outlined: 'bg-transparent text-[hsl(240deg_6%_8%)] border border-[hsl(240deg_6%_18%)] rounded-lg px-5 py-2 hover:bg-[hsl(240deg_6%_18%)] hover:text-white',
    outline: 'bg-transparent text-[hsl(240deg_6%_8%)] border border-[hsl(240deg_6%_18%)] rounded-lg px-5 py-2 hover:bg-[hsl(240deg_6%_18%)] hover:text-white',
    ghost: 'bg-transparent text-[hsl(240deg_4%_46%)] rounded-lg px-5 py-2 hover:bg-[hsl(240deg_5%_96%)] hover:text-[hsl(240deg_6%_8%)]',
    'pill-primary': 'ks-btn-pill bg-[hsl(240deg_6%_10%)] text-white border border-[hsl(240deg_6%_10%)]',
    'pill-secondary': 'ks-btn-pill bg-transparent text-[hsl(240deg_6%_8%)] border border-[hsl(240deg_5%_89%)]',
    auth: 'bg-[hsl(240deg_6%_10%)] text-white border border-[hsl(240deg_6%_10%)] rounded-lg px-5 py-2 hover:bg-[hsl(240deg_6%_18%)]',
    'auth-outline': 'bg-transparent text-[hsl(240deg_4%_46%)] border border-[hsl(240deg_5%_89%)] rounded-lg px-5 py-2 hover:border-[hsl(240deg_4%_46%)]',
    destructive: 'bg-[hsl(356deg_62%_56%)] text-white border border-[hsl(356deg_62%_56%)] rounded-lg px-5 py-2 hover:bg-[hsl(356deg_62%_50%)]',
  };

  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-5 py-2',
    lg: 'px-6 py-3 text-base rounded-lg',
    icon: 'w-9 h-9 p-0 rounded-lg',
  };

  return (
    <button
      type="button"
      className={cn(base, variants[normalizedVariant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

interface SegmentedControlProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'onToggle'> {
  options: string[];
  activeIndex: number;
  onToggle?: (index: number) => void;
}

export function SegmentedControl({ options, activeIndex, onToggle, className, ...props }: SegmentedControlProps) {
  return (
    <div role="tablist" className={cn('ks-segmented', className)} {...props}>
      {options.map((label, i) => (
        <button
          key={label}
          role="tab"
          aria-selected={i === activeIndex}
          type="button"
          onClick={() => onToggle?.(i)}
          className={cn('ks-segmented-item', i === activeIndex ? 'ks-segmented-active' : 'ks-segmented-inactive')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface ChipProps extends ComponentPropsWithoutRef<'span'> {
  variant?: 'success' | 'warning' | 'error' | 'default';
  dot?: boolean;
}

export function Chip({ variant = 'default', dot, className, children, ...props }: ChipProps) {
  const variants: Record<string, string> = {
    success: 'bg-[hsl(144deg_71%_27%)/0.1] text-[hsl(144deg_71%_27%)] border border-[hsl(144deg_71%_27%)/0.3]',
    warning: 'bg-[hsl(36deg_100%_92%)] text-[hsl(36deg_84%_39%)] border border-[hsl(36deg_56%_74%)/0.5]',
    error: 'bg-[hsl(356deg_62%_56%)/0.1] text-[hsl(356deg_62%_56%)] border border-[hsl(356deg_62%_56%)/0.3]',
    default: 'bg-[hsl(240deg_5%_96%)] text-[hsl(240deg_6%_8%)] border border-[hsl(240deg_5%_89%)]',
  };

  return (
    <span className={cn('ks-chip', variants[variant], dot && 'pl-1.5', className)} {...props}>
      {dot && <span className="ks-chip-dot bg-current" />}
      {children}
    </span>
  );
}

interface AuthStatusProps extends ComponentPropsWithoutRef<'span'> {
  status: 'active' | 'pending' | 'inactive';
  label?: string;
}

export function AuthStatus({ status, label = status, className, ...props }: AuthStatusProps) {
  const variants: Record<string, string> = {
    active: 'bg-[hsl(144deg_71%_27%)/0.1] text-[hsl(144deg_71%_27%)] border-[hsl(144deg_71%_27%)/0.3]',
    pending: 'bg-[hsl(36deg_100%_92%)] text-[hsl(36deg_84%_39%)] border-[hsl(36deg_56%_74%)/0.5]',
    inactive: 'bg-[hsl(356deg_62%_56%)/0.1] text-[hsl(356deg_62%_56%)] border-[hsl(356deg_62%_56%)/0.3]',
  };

  return (
    <span className={cn('ks-badge-active ks-chip', variants[status], className)} {...props}>
      {label}
    </span>
  );
}
