import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';

interface BrandColorSwatchProps extends ComponentPropsWithoutRef<'div'> {
  name: string;
  color: string;
  hex: string;
}

export function BrandColorSwatch({ name, color, hex, className, ...props }: BrandColorSwatchProps) {
  return (
    <div className={cn('mt-swatch', className)} {...props}>
      <div className="mt-swatch-swatch" style={{ backgroundColor: color }} />
      <div>
        <div className="mt-swatch-name">{name}</div>
        <div className="mt-swatch-info">{hex}</div>
      </div>
    </div>
  );
}

export function BrandColorPalette(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-square-grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-6', props.className)}>
      <BrandColorSwatch name="Black" color="#000000" hex="#000000" />
      <BrandColorSwatch name="Deep" color="#0a0a0b" hex="#0A0A0B" />
      <BrandColorSwatch name="Ink" color="#111113" hex="#111113" />
      <BrandColorSwatch name="Charcoal" color="#1c1c20" hex="#1C1C20" />
      <BrandColorSwatch name="Slate" color="#2a2a2f" hex="#2A2A2F" />
      <BrandColorSwatch name="Mid" color="#525260" hex="#525260" />
      <BrandColorSwatch name="Muted" color="#8e8e9a" hex="#8E8E9A" />
      <BrandColorSwatch name="Border" color="#d4d4dc" hex="#D4D4DC" />
      <BrandColorSwatch name="Frost" color="#eeeff1" hex="#EEEFF1" />
      <BrandColorSwatch name="White" color="#f8f8fa" hex="#F8F8FA" />
    </div>
  );
}
