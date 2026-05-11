import React from 'react';

export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-[#243365] bg-[#131c39]/60 px-5 py-4">
    <div className="text-[12px] text-[#8a96c2]">{label}</div>
    <div className="text-[24px] font-semibold text-white tracking-tight mt-1">{value}</div>
    {hint && <div className="text-[11px] text-[#8a96c2] mt-1">{hint}</div>}
  </div>
);
