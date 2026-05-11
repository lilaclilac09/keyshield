import React from 'react';
import { Loader2 } from 'lucide-react';

const base = 'inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-wider transition-all duration-150 select-none focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-40 disabled:cursor-not-allowed';
const variants = {
  primary: 'bg-white text-black border border-white hover:bg-zinc-200 active:bg-zinc-300',
  secondary: 'bg-transparent text-white border border-zinc-600 hover:border-white hover:text-white active:bg-white/5',
  destructive: 'bg-transparent text-red-400 border border-red-900/60 hover:border-red-500 hover:text-red-300 active:bg-red-950/40',
  ghost: 'bg-transparent text-[#a8b3d8] hover:text-white hover:bg-white/5 active:bg-white/10',
  success: 'bg-transparent text-emerald-400 border border-emerald-900/60 hover:border-emerald-500 hover:text-emerald-300 active:bg-emerald-950/40',
} as const;
const sizes = { sm: 'text-[10px] px-3 py-1.5 rounded-lg', md: 'text-[11px] px-4 py-2 rounded-xl', lg: 'text-[12px] px-6 py-2.5 rounded-xl', xl: 'text-[13px] px-8 py-3 rounded-xl' } as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: keyof typeof variants; size?: keyof typeof sizes; loading?: boolean; fullWidth?: boolean; }

export const Button: React.FC<ButtonProps> = ({ variant = 'secondary', size = 'md', loading = false, fullWidth = false, disabled, children, className = '', ...props }) => (
  <button className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`} disabled={disabled || loading} {...props}>
    {loading ? <Loader2 size={14} className="animate-spin" /> : null}{children}
  </button>
);
