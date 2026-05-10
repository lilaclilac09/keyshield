import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-[hsl(240deg_6%_10%)] text-white border border-[hsl(240deg_6%_10%)] hover:bg-[hsl(240deg_6%_18%)]',
        destructive: 'bg-[hsl(356deg_62%_56%)] text-white border border-[hsl(356deg_62%_56%)] hover:bg-[hsl(356deg_62%_50%)]',
        outline: 'border border-[hsl(240deg_5%_89%)] bg-background hover:bg-[hsl(0deg_0%_100%)] hover:border-[hsl(240deg_4%_46%)]',
        secondary: 'bg-[hsl(240deg_5%_96%)] text-[hsl(240deg_6%_8%)] border border-[hsl(240deg_5%_89%)] hover:bg-white hover:border-[hsl(240deg_4%_46%)]',
        ghost: 'bg-transparent text-[hsl(240deg_4%_46%)] hover:bg-[hsl(240deg_5%_96%)] hover:text-[hsl(240deg_6%_8%)]',
        link: 'text-[hsl(240deg_6%_8%)] underline-offset-4 hover:underline bg-transparent border-transparent px-0 shadow-none',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-lg px-6 text-base',
        icon: 'h-9 w-9 p-0 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
