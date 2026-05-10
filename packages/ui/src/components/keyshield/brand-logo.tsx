import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';
import { Shield, Key } from 'lucide-react';

export function BrandLogo(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div {...props} className={cn('flex items-center gap-3', props.className)}>
      <div className="w-12 h-12 rounded-lg bg-[hsl(240deg_6%_8%)] text-white flex items-center justify-center">
        <Shield size={22} strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[20px] font-semibold tracking-[0.06em] leading-none text-[hsl(240deg_6%_8%)]">KEYSHIELD</span>
        <span className="text-[9px] tracking-[0.35em] font-medium uppercase text-[hsl(240deg_4%_46%)]">Protect what matters</span>
      </div>
    </div>
  );
}

export function BrandLogoMark(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div {...props} className={cn('w-8 h-8 rounded-lg bg-[hsl(240deg_6%_8%)] text-white flex items-center justify-center', props.className)}>
      <Shield size={16} strokeWidth={1.5} />
    </div>
  );
}

export function BrandLogoOutline(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div {...props} className={cn('w-12 h-12 rounded-lg border border-[hsl(240deg_5%_89%)] flex items-center justify-center text-[hsl(240deg_4%_46%)]', props.className)}>
      <Shield size={20} strokeWidth={1.5} />
    </div>
  );
}
