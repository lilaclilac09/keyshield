import React from 'react';
export interface ToggleProps { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; label?: string; description?: string; }
export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled, label, description }) => (
  <div className="flex items-center justify-between">
    <div>{label && <div className="text-[12px] text-white">{label}</div>}{description && <div className="text-[10px] text-zinc-500 mt-0.5">{description}</div>}</div>
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => !disabled && onChange(!checked)} className={`relative w-9 h-5 rounded-[2px] transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-40 disabled:cursor-not-allowed ${checked ? 'bg-white' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-3.5 rounded-[1px] bg-black transition-transform duration-150 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  </div>
);
