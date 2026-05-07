import React from 'react';

export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 px-5 py-4">
    <div className="text-[12px] text-zinc-500">{label}</div>
    <div className="text-[24px] font-semibold text-white tracking-tight mt-1">{value}</div>
    {hint && <div className="text-[11px] text-zinc-500 mt-1">{hint}</div>}
  </div>
);
