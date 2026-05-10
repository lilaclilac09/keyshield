import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors border',
  {
    variants: {
      variant: {
        default: 'bg-[hsl(240deg_6%_10%)] text-white border-transparent',
        secondary: 'bg-[hsl(240deg_5%_96%)] text-[hsl(240deg_6%_8%)] border-transparent',
        destructive: 'bg-[hsl(356deg_62%_56%)/0.1] text-[hsl(356deg_62%_56%)] border-[hsl(356deg_62%_56%)/0.3]',
        outline: 'bg-transparent text-[hsl(240deg_6%_8%)] border-[hsl(240deg_5%_89%)]',
        success: 'bg-[hsl(144deg_71%_27%)/0.1] text-[hsl(144deg_71%_27%)] border-[hsl(144deg_71%_27%)/0.3]',
        warning: 'bg-[hsl(36deg_100%_92%)] text-[hsl(36deg_84%_39%)] border-[hsl(36deg_56%_74%)/0.5]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
