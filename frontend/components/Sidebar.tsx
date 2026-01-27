
import React from 'react';
import { Home, Key, Network, Settings, Shield } from 'lucide-react';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface Props {
  activeItem: string;
  onItemClick: (itemId: string) => void;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'home', label: 'Home', icon: <Home size={18} /> },
  { id: 'vault', label: 'Vault Keys', icon: <Key size={18} /> },
  { id: 'rpcs', label: 'RPCs', icon: <Network size={18} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

export const Sidebar: React.FC<Props> = ({ activeItem, onItemClick }) => {
  return (
    <aside className="w-64 min-h-screen bg-[#0f001f] border-r border-[#1e0a3c]/50 flex flex-col p-6">
      <div className="flex items-center gap-3 mb-12">
        <div className="w-10 h-10 bg-gradient-to-br from-[#ff2e63] to-[#9d4edd] rounded-lg flex items-center justify-center">
          <Shield size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#ffd6f5] tracking-tight">KeyShield</h1>
          <p className="text-[10px] text-[#e0aaff]/60 uppercase tracking-widest">Vault</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {SIDEBAR_ITEMS.map((item) => {
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-[#ff2e63]/20 to-[#9d4edd]/20 text-[#ff2e63] border border-[#ff2e63]/30 shadow-[0_0_15px_rgba(255,46,99,0.3)]'
                  : 'text-[#e0aaff]/70 hover:text-[#ffd6f5] hover:bg-[#1e0a3c]/50'
              }`}
            >
              <span className={isActive ? 'text-[#ff2e63]' : 'text-[#e0aaff]/70'}>
                {item.icon}
              </span>
              <span className="text-sm font-medium">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#ff2e63] shadow-[0_0_8px_rgba(255,46,99,0.8)]" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 border-t border-[#1e0a3c]/50">
        <div className="px-4 py-2">
          <p className="text-[10px] text-[#e0aaff]/40 uppercase tracking-widest mb-2">Version</p>
          <p className="text-xs font-mono text-[#ff2e63]">v4.0.0</p>
        </div>
      </div>
    </aside>
  );
};
