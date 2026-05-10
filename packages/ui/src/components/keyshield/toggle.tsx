import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';
import { Switch } from '../ui/switch';

interface ToggleButtonProps extends ComponentPropsWithoutRef<'button'> {
  active: boolean;
  label?: string;
  icon?: React.ReactNode;
}

export function ToggleButton({ active, label, icon, className, children, ...props }: ToggleButtonProps) {
  return (
    <button
      type="button"
      className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 cursor-pointer select-none', active ? 'bg-[hsl(240deg_6%_10%)] text-white border-[hsl(240deg_6%_10%)]' : 'bg-transparent text-[hsl(240deg_4%_46%)] border-[hsl(240deg_5%_89%)] hover:border-[hsl(240deg_4%_46%)]', className)}
      role="switch"
      aria-pressed={active}
      {...props}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
      {label || children}
    </button>
  );
}

interface ToggleGroupProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'onToggle'> {
  options: string[];
  activeIndex?: number;
  onToggle?: (index: number) => void;
  variant?: 'pill' | 'flat';
}

export function ToggleGroup({ options, activeIndex = 0, onToggle, variant = 'pill', className, ...props }: ToggleGroupProps) {
  if (variant === 'pill') {
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

  return (
    <div className={cn('inline-flex items-center gap-2', className)} {...props}>
      {options.map((label, i) => (
        <ToggleButton key={label} active={i === activeIndex} label={label} onClick={() => onToggle?.(i)} />
      ))}
    </div>
  );
}

interface SwitchRowProps extends ComponentPropsWithoutRef<'div'> {
  label: string;
  description?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function SwitchRow({ label, description, checked, onCheckedChange, className, ...props }: SwitchRowProps) {
  return (
    <div className={cn('flex items-center justify-between py-4', className)} {...props}>
      <div>
        <div className="text-sm font-medium text-[hsl(240deg_6%_8%)]">{label}</div>
        {description && <div className="text-xs text-[hsl(240deg_4%_46%)] mt-0.5">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
