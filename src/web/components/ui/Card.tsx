import React from 'react';

export interface CardProps { title?: string; description?: string; headerRight?: React.ReactNode; children: React.ReactNode; variant?: 'default' | 'raised' | 'bordered'; className?: string; }

export const Card: React.FC<CardProps> = ({ title, description, headerRight, children, variant = 'default', className = '' }) => {
  const border = variant === 'raised' ? 'border border-[#243365]/80 shadow-lg shadow-black/40' : variant === 'bordered' ? 'border border-[#2e4585]' : 'border border-[#243365]/50';
  return (
    <div className={`rounded-xl bg-[#131c39] ${border} ${className}`}>
      {title && (
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#243365]/50">
          <div>
            <h3 className="text-[13px] font-bold text-white uppercase tracking-wider">{title}</h3>
            {description && <p className="text-[11px] text-[#8a96c2] mt-0.5">{description}</p>}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
};

export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string; trend?: 'up' | 'down' | 'neutral'; className?: string; }> = ({ label, value, hint, trend, className = '' }) => (
  <div className={`rounded-xl border border-[#243365]/50 bg-[#131c39] px-4 py-3 ${className}`}>
    <div className="text-[10px] font-semibold text-[#8a96c2] uppercase tracking-wider">{label}</div>
    <div className="text-[22px] font-bold text-white tracking-tight mt-0.5">{value}</div>
    <div className="flex items-center gap-1.5 mt-1">
      {trend === 'up' && <span className="text-[10px] text-emerald-500">&#x2191;</span>}
      {trend === 'down' && <span className="text-[10px] text-red-500">&#x2193;</span>}
      {hint && <span className="text-[10px] text-[#5e6a91]">{hint}</span>}
    </div>
  </div>
);
