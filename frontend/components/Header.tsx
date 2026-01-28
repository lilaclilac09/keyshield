
import React from 'react';
import { Search, Plus, Shield } from 'lucide-react';

interface Props {
  title: string;
  count: number;
  subtitle: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateClick: () => void;
}

export const Header: React.FC<Props> = ({
  title,
  count,
  subtitle,
  searchQuery,
  onSearchChange,
  onCreateClick,
}) => {
  return (
    <header className="bg-[#0f001f] border-b border-[#1e0a3c]/50 px-8 py-6">
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-[#ffd6f5]">{title}</h1>
            <div className="px-3 py-1 bg-gradient-to-r from-[#ff2e63] to-[#9d4edd] rounded-full flex items-center gap-2">
              <Shield size={14} className="text-white" />
              <span className="text-sm font-bold text-white">{count}</span>
            </div>
          </div>
          <p className="text-sm text-[#e0aaff]/70">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#e0aaff]/50" />
          <input
            type="text"
            placeholder="Search keys..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-[#1e0a3c] border border-[#9d4edd]/20 rounded-lg text-[#ffd6f5] placeholder:text-[#e0aaff]/40 focus:outline-none focus:border-[#ff2e63]/50 focus:ring-2 focus:ring-[#ff2e63]/20 transition-all duration-200"
          />
        </div>
        <button
          onClick={onCreateClick}
          className="px-6 py-3 bg-gradient-to-r from-[#ff2e63] to-[#9d4edd] hover:from-[#ff2e63]/90 hover:to-[#9d4edd]/90 text-white rounded-lg font-medium text-sm transition-all duration-200 shadow-[0_0_15px_rgba(255,46,99,0.3)] hover:shadow-[0_0_20px_rgba(255,46,99,0.5)] flex items-center gap-2"
        >
          <Plus size={18} />
          Create Key
        </button>
      </div>
    </header>
  );
};
