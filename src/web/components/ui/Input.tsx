import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; monospace?: boolean; }
export const Input: React.FC<InputProps> = ({ label, error, monospace = false, className = '', id, ...props }) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && <label htmlFor={inputId} className="block text-[10px] font-semibold text-[#8a96c2] uppercase tracking-wider mb-1.5">{label}</label>}
      <input id={inputId} className={`w-full bg-[#0e1631] border rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 ${monospace ? 'font-mono text-[12px]' : 'font-sans'} ${error ? 'border-red-900/60 focus:border-red-700' : 'border-[#243365]'} ${className}`} {...props} />
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );
};

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }> = ({ label, className = '', id, ...props }) => {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && <label htmlFor={selectId} className="block text-[10px] font-semibold text-[#8a96c2] uppercase tracking-wider mb-1.5">{label}</label>}
      <select id={selectId} className={`w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-zinc-600 appearance-none cursor-pointer transition-all duration-150 ${className}`} {...props} />
    </div>
  );
};

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }> = ({ label, error, className = '', id, ...props }) => {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && <label htmlFor={textareaId} className="block text-[10px] font-semibold text-[#8a96c2] uppercase tracking-wider mb-1.5">{label}</label>}
      <textarea id={textareaId} className={`w-full bg-[#0e1631] border rounded-lg px-3 py-2 text-[12px] font-mono text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-zinc-600 resize-y transition-all duration-150 ${error ? 'border-red-900/60 focus:border-red-700' : 'border-[#243365]'} ${className}`} {...props} />
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );
};
