import { Suspense, useState, useEffect } from 'react';

import { Outlet, NavLink, useLocation, useNavigate } from 'react-router';
import { Shield, Key, Activity, Users, Share2, Monitor, Settings, Code, BookOpen, Menu, X, Search, Plus, Wallet, ChevronDown, Copy, BarChart3, Server } from 'lucide-react';
import { Badge, Skeleton, Button as ShadButton } from '@keyshield/ui';
import { HealthBadge } from '../components/HealthBadge';
import { SearchOverlay } from '../components/ui/SearchOverlay';
import { useUiLayoutStore } from '@keyshield/shared/stores';
import { useHealth } from '@keyshield/shared/hooks/use-health';
import { isAuthenticated, disconnectWallet, getToken } from '@keyshield/shared/auth';

// Keyboard shortcut: Ctrl/Cmd+K for search

const navItems = [
  { to: '/app/vault', icon: Key, label: 'Vault' },
  { to: '/app/activity', icon: Activity, label: 'Activity' },
  { to: '/app/agents', icon: Users, label: 'Agents' },
  { to: '/app/sharing', icon: Share2, label: 'Sharing' },
  { to: '/app/sessions', icon: Monitor, label: 'Sessions' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
  { to: '/app/developer', icon: Code, label: 'Developer' },
  { to: '/app/reports', icon: BarChart3, label: 'Reports' },
  { to: '/app/ephemeral-wallets', icon: Server, label: 'Ephemeral' },
  { to: '/app/docs', icon: BookOpen, label: 'Docs' },
];

export default function RootLayout() {
  const { sidebarCollapsed, toggleSidebar } = useUiLayoutStore();
  const { data: health, isLoading } = useHealth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const authenticated = isAuthenticated();

  // Get connected address from token
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setAddress(payload.sub ?? payload.address ?? null);
      } catch { /* ignore */ }
    }
  }, []);

  const shortAddr = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : '';

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = () => {
    disconnectWallet();
    navigate('/login');
  };

  // Close menus on outside click
  useEffect(() => {
    if (!userMenuOpen && !mobileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuOpen) {
        const el = document.querySelector('.user-menu-wrap');
        if (el && !el.contains(e.target as Node)) setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen, mobileMenuOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const pageTitle = (() => {
    const path = location.pathname.split('/').pop();
    const map: Record<string, string> = {
      vault: 'Vault', activity: 'Activity', agents: 'Agents',
      sharing: 'Sharing', sessions: 'Sessions', settings: 'Settings',
      developer: 'Developer', docs: 'Docs',
    };
    return map[path ?? ''] || 'Vault';
  })();

  return (
    <div className="flex h-screen overflow-hidden bg-[#030303]">
      {/* Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r transition-all duration-300 ${
          sidebarCollapsed ? 'w-[var(--sidebar-width-collapsed)] bg-black' : 'w-[var(--sidebar-width)] bg-black'
        }`}
        style={{ borderRightColor: '#0a0a0a' }}
      >
        <div className="flex items-center gap-2 px-4 py-5 border-b" style={{ borderColor: '#0f0f0f' }}>
          <Shield className="h-6 w-6 text-white" />
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-[0.15em] text-white">KEYSHIELD</span>
              <span className="text-[9px] tracking-[0.3em] text-[#444] font-medium uppercase mt-0.5">Agentic Key Infrastructure</span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/app/vault'} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="px-2.5 py-4 border-t" style={{ borderTopColor: '#0f0f0f' }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a0a0a]">
            {isLoading ? (
              <Skeleton className="h-2 w-16" />
            ) : (
              <>
                <Badge variant={health?.status === 'healthy' ? 'success' : 'destructive'} className="text-[10px]">{health?.status ?? 'unknown'}</Badge>
                {!sidebarCollapsed && <span className="text-[10px] font-mono text-[#505050]">{health?.version}</span>}
              </>
            )}
          </div>
          {!sidebarCollapsed && <HealthBadge />}
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-[280px] h-full bg-black p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-white" />
                <span className="font-semibold text-white tracking-wide">KEYSHIELD</span>
              </div>
              <ShadButton variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)}>
                <X className="h-5 w-5 text-[#666]" />
              </ShadButton>
            </div>
            <nav className="space-y-0.5">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                  <Icon className="h-[18px] w-[18px]" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-[var(--header-height)] flex items-center justify-between px-4 md:px-6 border-b bg-[#080808]" style={{ borderBottomColor: '#0a0a0a' }}>
          <div className="flex items-center gap-3">
            <ShadButton variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5 text-[#999]" />
            </ShadButton>
            <ShadButton variant="ghost" size="icon" className="hidden md:flex" onClick={toggleSidebar}>
              <Menu className="h-[18px] w-[18px] text-[#999]" />
            </ShadButton>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white capitalize">{pageTitle}</span>
              <span className="text-[9px] tracking-[0.25em] uppercase text-[#525260]">KeyShield</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <ShadButton variant="ghost" size="icon" className="text-[#999]" onClick={() => setSearchOpen(true)}>
              <Search className="h-[18px] w-[18px]" />
            </ShadButton>

            {/* Wallet address / user menu */}
            {authenticated && address && (
              <div className="user-menu-wrap" style={{ position: 'relative' }}>
                <button
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-[#0a0a0a] hover:bg-[#0f0f0f] transition-colors"
                  style={{ borderColor: '#141414' }}
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <Wallet className="h-3.5 w-3.5 text-[#34d399]" />
                  <span className="text-xs font-mono text-[#c4c4d0]">{shortAddr}</span>
                  <ChevronDown className="h-3 w-3 text-[#555]" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border bg-[#0d0d10] shadow-2xl z-50 overflow-hidden" style={{ borderColor: '#1a1a20' }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: '#141414' }}>
                      <p className="text-[10px] font-semibold text-[#666] uppercase tracking-wider mb-1">Connected</p>
                      <p className="text-xs font-mono text-[#e0e0e0] break-all">{address}</p>
                      <button onClick={handleCopy} className="flex items-center gap-1.5 mt-2 text-[11px] text-[#888] hover:text-white transition-colors">
                        <Copy className="h-3 w-3" />
                        {copied ? 'Copied!' : 'Copy address'}
                      </button>
                    </div>
                    <div className="py-2">
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-left text-sm text-[#c62232] hover:bg-[#1a0808] transition-colors"
                      >
                        Disconnect & Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <ShadButton size="sm" variant="primary" className="gap-1.5 bg-white text-black border border-white hover:bg-[#f0f0f0]">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add</span>
            </ShadButton>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-[#030303]">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>}>
            <Outlet />
          </Suspense>
        </main>
        </Suspense>
      </div>

      {/* Search overlay */}
      {searchOpen && <SearchOverlay query={searchQuery} onChange={setSearchQuery} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
