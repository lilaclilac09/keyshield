/**
 * SearchOverlay — Full-screen search overlay
 */
import React, { useRef } from 'react';
import { X } from 'lucide-react';

export interface SearchOverlayProps {
  query: string;
  onChange: (q: string) => void;
  onClose: () => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ query, onChange, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 backdrop-blur-md">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Search Vault</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search by name, domain, or tag…"
          className="w-full bg-transparent border-none text-2xl font-bold focus:outline-none placeholder:text-zinc-800 text-white"
          value={query}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />
      </div>
    </div>
  );
};
