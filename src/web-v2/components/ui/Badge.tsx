import React from 'react';
const base = 'inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5';
const variants = { default: 'bg-zinc-800 text-zinc-400 border border-zinc-700', success: 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/60', warning: 'bg-amber-950/60 text-amber-400 border border-amber-900/60', danger: 'bg-red-950/60 text-red-400 border border-red-900/60', info: 'bg-blue-950/60 text-blue-400 border border-blue-900/60', neutral: 'bg-zinc-900 text-zinc-500 border border-zinc-800' } as const;

export interface BadgeProps { variant?: keyof typeof variants; dot?: boolean; children: React.ReactNode; className?: string; }
export const Badge: React.FC<BadgeProps> = ({ variant = 'default', dot = false, children, className = '' }) => (
  <span className={`${base} ${variants[variant]} ${className}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${variant === 'success' ? 'bg-emerald-400' : variant === 'warning' ? 'bg-amber-400' : variant === 'danger' ? 'bg-red-400' : variant === 'info' ? 'bg-blue-400' : 'bg-zinc-500'}`} />}
    {children}
  </span>
);
