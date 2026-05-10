import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';

type PatternVariant = 'shield' | 'guilloche' | 'woven' | 'parametric' | 'topology';

const patterns: Record<PatternVariant, string> = {
  shield: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5 L45 15 L45 35 Q45 45 30 52 Q15 45 15 35 L15 15 Z' fill='none' stroke='%23d4d4dc' stroke-width='0.8'/%3E%3C/svg%3E")`,
  guilloche: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='40' cy='40' r='30' fill='none' stroke='%23d4d4dc' stroke-width='0.6'/%3E%3Ccircle cx='40' cy='40' r='24' fill='none' stroke='%23eeeff1' stroke-width='0.4'/%3E%3Ccircle cx='40' cy='40' r='18' fill='none' stroke='%23d4d4dc' stroke-width='0.6'/%3E%3C/svg%3E")`,
  woven: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0 L40 40 M40 0 L0 40' stroke='%23d4d4dc' stroke-width='0.5'/%3E%3C/svg%3E")`,
  parametric: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 5 Q30 15 55 5 M5 15 Q30 25 55 15 M5 25 Q30 35 55 25 M5 35 Q30 45 55 35 M5 45 Q30 55 55 45' fill='none' stroke='%23d4d4dc' stroke-width='0.6'/%3E%3C/svg%3E")`,
  topology: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 10 L30 5 L50 20 L70 8 M10 10 L15 30 L40 35 M30 5 L35 40 L60 45 M50 20 L55 50 L75 40 M70 8 L65 55 L70 80 M15 30 L25 60 L10 80 M40 35 L50 60 L70 70 M35 40 L30 70 L45 80' fill='none' stroke='%23d4d4dc' stroke-width='0.5'/%3E%3C/svg%3E")`,
};

interface PatternTextureProps extends ComponentPropsWithoutRef<'div'> {
  variant?: PatternVariant;
}

export function PatternTexture({ variant = 'shield', className, ...props }: PatternTextureProps) {
  return (
    <div className={cn('mt-pattern-shield h-24 w-full rounded-lg border border-[hsl(240deg_5%_89%)] bg-no-repeat bg-cover', className)} {...props} style={{ backgroundImage: patterns[variant] }} />
  );
}

export function PatternTextureGrid(props: ComponentPropsWithoutRef<'div'>) {
  const variants: PatternVariant[] = ['shield', 'guilloche', 'woven', 'parametric', 'topology'];
  return (
    <div className={cn('mt-square-grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4', props.className)}>
      {variants.map((v) => <PatternTexture key={v} variant={v} />)}
    </div>
  );
}
