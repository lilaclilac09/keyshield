import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';

interface SquareGridProps extends ComponentPropsWithoutRef<'div'> {
  size?: number;
  gap?: string;
  children: React.ReactNode;
}

const gapMap: Record<string, string> = {
  none: 'gap-0', sm: 'gap-2', md: 'gap-4', lg: 'gap-6', xl: 'gap-8',
};

export function SquareGrid({ size = 3, gap = 'md', children, className, ...props }: SquareGridProps) {
  return (
    <div className={cn('mt-square-grid', `grid-cols-[repeat(${size},1fr)]`, gapMap[gap] || 'gap-4', className)} {...props} style={{ aspectRatio: size === 1 ? undefined : '1' }}>
      {children}
    </div>
  );
}

interface GridCellProps extends ComponentPropsWithoutRef<'div'> {
  span?: number;
}

export function GridCell({ span, className, children, ...props }: GridCellProps) {
  return (
    <div className={cn('rounded-lg border border-[hsl(240deg_5%_89%)] bg-white shadow-sm p-4 transition-all duration-150 hover:shadow-md', span && `col-span-${span}`, className)} {...props}>
      {children}
    </div>
  );
}
