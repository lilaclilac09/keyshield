/**
 * Sidebar — Institutional navigation
 *
 * Sharp corners, monochrome, Montserrat typography.
 * Includes wallet connection card at bottom.
 */
import React from 'react';
import { Logo } from './Logo';
import { Badge } from './Badge';
import { Button } from './Button';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

interface SidebarProps {
  items: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  walletAddress?: string;
  connected?: boolean;
  onCopyAddress?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  active,
  onNavigate,
  walletAddress,
  connected = false,
  onCopyAddress,
  onLogout,
}) => {
  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : '—';

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800/50 bg-[#050505] flex flex-col">
      {/* Logo */}
      <div className="h-14 px-5 flex items-center border-b border-zinc-800/50">
        <Logo size="sm" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`
              w-full flex items-center gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wider
              rounded-[2px] transition-all duration-100
              ${active === item.id
                ? 'bg-white text-black'
                : 'text-zinc-500 hover:text-white hover:bg-white/5'}
            `}
          >
            <span className={active === item.id ? 'text-black' : 'text-zinc-600'}>
              {item.icon}
            </span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                active === item.id ? 'bg-black/20' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Wallet card */}
      <div className="p-3 border-t border-zinc-800/50">
        <div className="rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <button
            onClick={onCopyAddress}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-[2px] bg-[#050505] border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <span className="text-[11px] font-mono text-zinc-300">{shortAddr}</span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            className="mt-2"
            onClick={onLogout}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </aside>
  );
};
