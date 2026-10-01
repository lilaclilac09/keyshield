import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
export interface SearchOverlayProps { query: string; onChange: (q: string) => void; onClose: () => void; }

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ query, onChange, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-[100] bg-[#0b1226]/95 flex flex-col items-center justify-center p-6 backdrop-blur-md">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between border-b border-[#243365] pb-4 mb-6">
          <span className="text-[10px] font-semibold text-[#8a96c2] uppercase tracking-wider">Search Vault</span>
          <button onClick={onClose} className="text-[#8a96c2] hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <input ref={inputRef} type="text" placeholder="Search agents, wallets, or vault keys…" className="w-full bg-transparent border-none text-2xl font-bold focus:outline-none placeholder:text-zinc-800 text-white" value={query} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === 'Escape' && onClose()} />
      </div>
    </div>
  );
};
