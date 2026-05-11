import React from 'react';
import { Logo } from './Logo';
import { Button } from './Button';

interface NavItem { id: string; label: string; icon: React.ReactNode; badge?: string; }

interface SidebarProps { items: NavItem[]; active: string; onNavigate: (id: string) => void; walletAddress?: string; connected?: boolean; onCopyAddress?: () => void; onLogout?: () => void; }

export const Sidebar: React.FC<SidebarProps> = ({ items, active, onNavigate, walletAddress, connected = false, onCopyAddress, onLogout }) => {
  const shortAddr = walletAddress ? `${walletAddress.slice(0, 4)}\u2026${walletAddress.slice(-4)}` : '\u2014';
  return (
    <aside className="w-56 shrink-0 border-r border-[#243365]/50 bg-[#0e1631] flex flex-col">
      <div className="h-14 px-5 flex items-center border-b border-[#243365]/50"><Logo size="sm" /></div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {items.map(item => (
          <button key={item.id} onClick={() => onNavigate(item.id)} className={`w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wider rounded-lg transition-all duration-100 ${active === item.id ? 'bg-white text-black' : 'text-[#8a96c2] hover:text-white hover:bg-white/5'}`}>
            <span className={active === item.id ? 'text-black' : 'text-[#5e6a91]'}>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${active === item.id ? 'bg-[#0b1226]/20' : 'bg-zinc-800 text-[#8a96c2]'}`}>{item.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-[#243365]/50">
        <div className="rounded-xl border border-[#243365]/50 bg-[#131c39] p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <span className="text-[9px] font-semibold text-[#8a96c2] uppercase tracking-wider">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <button onClick={onCopyAddress} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#0e1631] border border-[#243365] hover:border-zinc-600 transition-colors">
            <span className="text-[11px] font-mono text-[#e8ecff]">{shortAddr}</span>
          </button>
          <Button variant="ghost" size="sm" fullWidth className="mt-2" onClick={onLogout}>Sign Out</Button>
        </div>
      </div>
    </aside>
  );
};
