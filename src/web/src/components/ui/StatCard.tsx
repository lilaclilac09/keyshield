import React from 'react';

export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: 'up' | 'down' | 'neutral';
}> = ({ label, value, hint, trend }) => (
  <div className="rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] px-4 py-3">
    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</div>
    <div className="text-[22px] font-bold text-white tracking-tight mt-0.5">{value}</div>
    <div className="flex items-center gap-1.5 mt-1">
      {trend === 'up' && <span className="text-[10px] text-emerald-500">↑</span>}
      {trend === 'down' && <span className="text-[10px] text-red-500">↓</span>}
      {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
    </div>
  </div>
);
