import { Suspense, useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router';
import {
  Key, Activity, Users, Share2, Monitor, Settings, Code, BookOpen,
  Menu, X, Search, Plus, ChevronDown, Copy, Bell, BarChart3, Server,
  ChevronLeft, ChevronRight, Wallet, LogOut
} from 'lucide-react';
import { Badge, Skeleton, Button as ShadButton } from '@keyshield/ui';
import { HealthBadge } from '../components/HealthBadge';
import { SearchOverlay } from '../components/ui/SearchOverlay';
import { useUiLayoutStore } from '@keyshield/shared/stores';
import { useHealth } from '@keyshield/shared/hooks/use-health';
import {
  detectWallets,
  connectWalletByKey,
  signWithWallet,
  generateSessionToken,
  saveToken,
  disconnectWallet as authDisconnect,
  getToken,
  VAULT_KEY_MESSAGE,
  type WalletInfo,
} from '@keyshield/shared/auth';

// ─── Nav sections ───────────────────────────────────────────────────────────
const primaryNav = [
  { to: '/app/vault', icon: Key, label: 'Vault' },
  { to: '/app/agents', icon: Users, label: 'Agents' },
  { to: '/app/activity', icon: Activity, label: 'Activity' },
  { to: '/app/sessions', icon: Monitor, label: 'Sessions' },
];

const middleNav = [
  { to: '/app/sharing', icon: Share2, label: 'Sharing' },
  { to: '/app/ephemeral-wallets', icon: Server, label: 'Ephemeral' },
];

const bottomNav = [
  { to: '/app/docs', icon: BookOpen, label: 'Docs' },
  { to: '/app/developer', icon: Code, label: 'Developer' },
  { to: '/app/reports', icon: BarChart3, label: 'Reports' },
  { to: '/app/settings', icon: Settings, label: 'Settings' },
];

// ─── Sidebar Nav Item ───────────────────────────────────────────────────────
function SidebarItem({ to, icon: Icon, label, collapsed }: {
  to: string; icon: any; label: string; collapsed: boolean;
}) {
  return (
    <NavLink to={to} className={({ isActive }) =>
      `sidebar-nav-item ${isActive ? 'active' : ''}`
    }>
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="sidebar-nav-item-label">{label}</span>}
    </NavLink>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return null;
  return <div className="sidebar-section-label">{children}</div>;
}

// ─── Sidebar Brand Logo ─────────────────────────────────────────────────────
function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="sidebar-brand">
      <div className="sidebar-brand-icon">
        <img src="/keyshield.svg" alt="KeyShield" className="sidebar-logo-img" />
      </div>
      {!collapsed && <span className="sidebar-brand-text">KEYSHIELD</span>}
    </div>
  );
}

// ─── RootLayout ─────────────────────────────────────────────────────────────
export default function RootLayout() {
  const { sidebarCollapsed, toggleSidebar } = useUiLayoutStore();
  const { data: health, isLoading: healthLoading } = useHealth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Wallet state
  const [address, setAddress] = useState<string | null>(null);
  const [connectStep, setConnectStep] = useState<'idle' | 'connecting' | 'done'>('idle');
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);

  // Separate refs — NOT nested
  const addMenuRef = useRef<HTMLDivElement>(null);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  // Scan for available wallets
  useEffect(() => {
    const scan = () => setAvailableWallets(detectWallets());
    scan();
    const iv = setInterval(scan, 3000);
    return () => clearInterval(iv);
  }, []);

  // Restore address from token on mount
  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const addr = payload.sub ?? payload.address ?? null;
        setAddress(addr);
        setConnectStep(addr ? 'done' : 'idle');
      } catch { /* ignore */ }
    }
  }, []);

  const shortAddr = address ? `${address.slice(0, 4)}\u2026${address.slice(-4)}` : '';
  const available = availableWallets.filter(w => w.isInstalled);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };
  const [copySuccess, setCopySuccess] = useState(false);

  const handleDisconnect = () => {
    authDisconnect();
    setAddress(null);
    setConnectStep('idle');
    setWalletMenuOpen(false);
    if (!getToken()) {
      navigate('/login');
    }
  };

  const handleConnect = async (key: string) => {
    try {
      setConnectStep('connecting');
      setWalletMenuOpen(false);
      const walletInfo = await connectWalletByKey(key);
      const addr = walletInfo.address ?? null;
      setAddress(addr);
      const signatureBytes = await signWithWallet(VAULT_KEY_MESSAGE, walletInfo.provider);
      const token = await generateSessionToken(walletInfo.address!, signatureBytes);
      saveToken(token, true);
      setConnectStep('done');
    } catch (err) {
      console.error('[KeyShield] Wallet connect error:', err);
      setConnectStep('idle');
    }
  };

  // Close all menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addMenuRef.current && !addMenuRef.current.contains(target)) setAddMenuOpen(false);
      if (walletMenuRef.current && !walletMenuRef.current.contains(target)) setWalletMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setWalletMenuOpen(false);
        setAddMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const pageTitle = (() => {
    const path = location.pathname.split('/').pop() || 'vault';
    const map: Record<string, string> = {
      vault: 'Vault', activity: 'Activity', agents: 'Agents',
      sharing: 'Sharing', sessions: 'Sessions', settings: 'Settings',
      developer: 'Developer', docs: 'Docs', 'ephemeral-wallets': 'Ephemeral Wallets', reports: 'Reports',
    };
    return map[path] || 'Vault';
  })();

  const collapsed = sidebarCollapsed;

  return (
    <div className="app-shell">
      {/* ─── Desktop Sidebar ─── */}
      <aside className={`sidebar hidden md:flex ${collapsed ? 'collapsed' : ''}`}>
        <SidebarLogo collapsed={collapsed} />

        <nav className="sidebar-nav">
          <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>
          {primaryNav.map(item => (
            <SidebarItem key={item.to} {...item} collapsed={collapsed} />
          ))}

          <SectionLabel collapsed={collapsed}>Collaborate</SectionLabel>
          {middleNav.map(item => (
            <SidebarItem key={item.to} {...item} collapsed={collapsed} />
          ))}

          <SectionLabel collapsed={collapsed}>System</SectionLabel>
          {bottomNav.map(item => (
            <SidebarItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-content">
            {healthLoading ? (
              <Skeleton className="h-2 w-16 bg-[#1a1a1a]" />
            ) : (
              <>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  health?.status === 'healthy' ? 'bg-[#10b981]' : 'bg-[#ef4444]'
                }`} />
                <span>{health?.status ?? 'unknown'}</span>
                <span style={{ color: '#2a2a30' }}>\u00B7</span>
                <span>{health?.version}</span>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* ─── Mobile sidebar overlay ─── */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-sidebar" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <img src="/keyshield.svg" alt="KeyShield" style={{ width: 28, height: 28, filter: 'brightness(0) invert(1)' }} />
                <span className="font-semibold text-white tracking-wide text-sm">KEYSHIELD</span>
              </div>
              <ShadButton variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)}>
                <X className="h-5 w-5 text-[#888]" />
              </ShadButton>
            </div>
            <nav className="space-y-1">
              {[...primaryNav, ...middleNav, ...bottomNav].map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} onClick={() => setMobileMenuOpen(false)} className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-white/10 text-white' : 'text-[#6b6b7a] hover:text-white hover:bg-white/5'
                  }`
                }>
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ─── Main area ─── */}
      <div className="app-main">
        <header className="top-bar">
          <div className="top-bar-left">
            <button className="top-bar-toggle md:hidden" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <button className="top-bar-toggle hidden md:flex" onClick={toggleSidebar} title="Toggle sidebar">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <div className="top-bar-breadcrumb hidden sm:block">
              <span>{pageTitle}</span>
            </div>
          </div>

          <div className="top-bar-search">
            <button className="search-command-btn" onClick={() => setSearchOpen(true)}>
              <Search className="h-3.5 w-3.5" />
              <span>Search anything\u2026</span>
              <kbd><span>\u2318</span><span>K</span></kbd>
            </button>
          </div>

          <div className="top-bar-right">
            {/* Notifications */}
            <button className="top-bar-btn" title="Notifications">
              <Bell className="h-4 w-4" />
            </button>

            {/* Quick Add — separate ref container */}
            <div ref={addMenuRef} style={{ position: 'relative' }}>
              <button className="top-bar-add-btn" onClick={() => setAddMenuOpen(!addMenuOpen)}>
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
              {addMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border shadow-2xl z-50 overflow-hidden bg-[#141418]" style={{ borderColor: '#1e1e24' }}>
                  <div className="p-1.5">
                    {[
                      { label: 'New secret', icon: Key, action: () => { setAddMenuOpen(false); navigate('/app/vault'); } },
                      { label: 'Register agent', icon: Users, action: () => { setAddMenuOpen(false); navigate('/app/agents'); } },
                      { label: 'Share key', icon: Share2, action: () => { setAddMenuOpen(false); navigate('/app/sharing'); } },
                    ].map((item) => (
                      <button key={item.label}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#a0a0b0] hover:text-white hover:bg-white/5 transition-colors"
                        onClick={item.action}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Wallet / User menu — separate ref container, NOT nested */}
            <div ref={walletMenuRef} style={{ position: 'relative' }}>
              {address ? (
                /* Connected: avatar button */
                <button className="user-avatar-btn" onClick={() => setWalletMenuOpen(!walletMenuOpen)}>
                  <div className="user-avatar">{address[0].toUpperCase()}</div>
                  <span className="hidden sm:inline">{shortAddr}</span>
                  <ChevronDown className="h-3 w-3 text-[#555]" />
                </button>
              ) : (
                /* Disconnected: connect button */
                <button className="top-bar-add-btn" style={{ background: 'transparent', border: '1px solid #1e1e24', color: '#a0a0b0' }} onClick={() => setWalletMenuOpen(!walletMenuOpen)}>
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Connect</span>
                </button>
              )}

              {/* Single dropdown — shows either wallets or user info */}
              {walletMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border shadow-2xl z-50 overflow-hidden bg-[#141418]" style={{ borderColor: '#1e1e24' }}>
                  {address ? (
                    /* Connected: wallet info + disconnect */
                    <>
                      <div className="p-4 border-b" style={{ borderColor: '#141418' }}>
                        <p className="text-[10px] font-semibold text-[#6b6b7a] uppercase tracking-wider mb-1">Connected wallet</p>
                        <p className="text-xs font-mono text-white break-all">{address}</p>
                        <button onClick={handleCopy} className="flex items-center gap-1.5 mt-2 text-[11px] text-[#a0a0b0] hover:text-white transition-colors">
                          {copySuccess ? <Copy className="h-3 w-3 text-[#10b981]" /> : <Copy className="h-3 w-3" />}
                          {copySuccess ? 'Copied!' : 'Copy address'}
                        </button>
                      </div>
                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-[#ef4444] hover:bg-[#1a0808] transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Disconnect
                      </button>
                    </>
                  ) : connectStep === 'connecting' ? (
                    /* Connecting state */
                    <div className="p-4 text-center">
                      <div className="animate-spin h-5 w-5 mx-auto mb-2 border-2 border-[#6366f1] border-t-transparent rounded-full" />
                      <p className="text-xs text-[#a0a0b0]">Connecting\u2026</p>
                    </div>
                  ) : available.length > 0 ? (
                    /* Wallet picker */
                    <div className="p-3">
                      <p className="text-[10px] font-semibold text-[#4a4a56] uppercase tracking-wider mb-2">Select wallet</p>
                      {available.map(w => (
                        <button key={w.key}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[#a0a0b0] hover:text-white hover:bg-white/5 transition-colors"
                          onClick={() => handleConnect(w.key)}
                        >
                          <Wallet className="h-4 w-4" />
                          <span>{w.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* No wallet */
                    <div className="p-4 text-center">
                      <Wallet className="h-6 w-6 mx-auto mb-2" style={{ color: '#4a4a56' }} />
                      <p className="text-xs text-[#6b6b7a]">No wallet detected</p>
                      <p className="text-[10px] text-[#4a4a56] mt-1">Install Phantom or Solflare</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-content">
          <Suspense fallback={
            <div className="space-y-4">
              <div className="ks-skeleton h-8 w-48" />
              <div className="ks-skeleton h-32 w-full" />
              <div className="ks-skeleton h-32 w-full" />
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {searchOpen && (
        <SearchOverlay query={searchQuery} onChange={setSearchQuery} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  );
}
