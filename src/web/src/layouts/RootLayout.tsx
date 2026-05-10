import { Suspense, useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router';
import {
  Key, Activity, Users, Share2, Monitor, Settings, Code, BookOpen,
  Menu, X, Search, Plus, ChevronDown, Copy, Bell, BarChart3, Server,
  ChevronLeft, ChevronRight, Wallet, LogOut, Plug
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

// ─── Sidebar Brand Logo (uses same SVG as landing page) ─────────────────────
function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="sidebar-brand">
      <div className="sidebar-brand-icon" style={{ background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Wallet connection state
  const [address, setAddress] = useState<string | null>(null);
  const [connectStep, setConnectStep] = useState<'idle' | 'select' | 'connecting' | 'done'>('idle');
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const connectMenuRef = useRef<HTMLDivElement>(null);
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);

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

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    authDisconnect();
    setAddress(null);
    setConnectStep('idle');
    setUserMenuOpen(false);
    // Don't navigate away — let them reconnect from the same page
    // Only redirect if no token at all
    if (!getToken()) {
      navigate('/login');
    }
  };

  const handleConnect = async (key: string) => {
    try {
      setConnectStep('connecting');
      setConnectMenuOpen(false);
      setUserMenuOpen(false);
      const walletInfo = await connectWalletByKey(key);
      const addr = walletInfo.address ?? null;
      setAddress(addr);
      const signatureBytes = await signWithWallet(VAULT_KEY_MESSAGE, walletInfo.provider);
      const token = await generateSessionToken(walletInfo.address!, signatureBytes);
      saveToken(token, true);
      setConnectStep('done');
    } catch (err) {
      console.error('[KeyShield] Wallet connect error:', err);
      setConnectStep('select');
    }
  };

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
      if (connectMenuOpen && connectMenuRef.current && !connectMenuRef.current.contains(e.target as Node)) {
        setConnectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen, addMenuOpen, connectMenuOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setUserMenuOpen(false);
        setAddMenuOpen(false);
        setConnectMenuOpen(false);
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
  const available = availableWallets.filter(w => w.isInstalled);

  return (
    <div className="app-shell">
      {/* ─── Desktop Sidebar ─── */}
      <aside className={`sidebar hidden md:flex ${collapsed ? 'collapsed' : ''}`}>
        {/* Brand */}
        <SidebarLogo collapsed={collapsed} />

        {/* Nav */}
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

        {/* Footer */}
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
        {/* Top bar */}
        <header className="top-bar">
          <div className="top-bar-left">
            {/* Mobile menu */}
            <button className="top-bar-toggle md:hidden" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            {/* Collapse toggle */}
            <button className="top-bar-toggle hidden md:flex" onClick={toggleSidebar} title="Toggle sidebar">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            {/* Breadcrumb */}
            <div className="top-bar-breadcrumb hidden sm:block">
              <span>{pageTitle}</span>
            </div>
          </div>

          {/* Search */}
          <div className="top-bar-search">
            <button className="search-command-btn" onClick={() => setSearchOpen(true)}>
              <Search className="h-3.5 w-3.5" />
              <span>Search anything\u2026</span>
              <kbd><span>\u2318</span><span>K</span></kbd>
            </button>
          </div>

          {/* Right controls */}
          <div className="top-bar-right">
            {/* Notifications */}
            <button className="top-bar-btn" title="Notifications">
              <Bell className="h-4 w-4" />
            </button>

            {/* Quick Add */}
            <div ref={addMenuRef} style={{ position: 'relative' }}>
              <button className="top-bar-add-btn" onClick={() => setAddMenuOpen(!addMenuOpen)}>
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
              {addMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border shadow-2xl z-50 overflow-hidden bg-[#141418]" style={{ borderColor: '#1e1e24' }}>
                  <div className="p-1.5">
                    {[
                      { label: 'New secret', icon: Key },
                      { label: 'Register agent', icon: Users },
                      { label: 'Share key', icon: Share2 },
                    ].map((item) => (
                      <button key={item.label}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#a0a0b0] hover:text-white hover:bg-white/5 transition-colors"
                        onClick={() => { setAddMenuOpen(false); navigate('/app/vault'); }}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Wallet / User menu */}
            <div ref={userMenuRef} style={{ position: 'relative' }}>
              {address ? (
                /* Connected: show avatar with disconnect option */
                <button className="user-avatar-btn" onClick={() => setUserMenuOpen(!userMenuOpen)}>
                  <div className="user-avatar">{address[0].toUpperCase()}</div>
                  <span className="hidden sm:inline">{shortAddr}</span>
                  <ChevronDown className="h-3 w-3 text-[#555]" />
                </button>
              ) : (
                /* Disconnected: show connect button */
                <div ref={connectMenuRef} style={{ position: 'relative' }}>
                  <button className="top-bar-add-btn" style={{ background: 'transparent', border: '1px solid #1e1e24', color: '#a0a0b0' }} onClick={() => setConnectMenuOpen(!connectMenuOpen)}>
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Connect</span>
                  </button>
                  {connectMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border shadow-2xl z-50 overflow-hidden bg-[#141418]" style={{ borderColor: '#1e1e24' }}>
                      <div className="p-3">
                        <p className="text-[10px] font-semibold text-[#4a4a56] uppercase tracking-wider mb-2">Select wallet</p>
                        {available.length > 0 ? (
                          available.map(w => (
                            <button key={w.key}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[#a0a0b0] hover:text-white hover:bg-white/5 transition-colors"
                              onClick={() => handleConnect(w.key)}
                            >
                              <Wallet className="h-4 w-4" />
                              <span>{w.name}</span>
                            </button>
                          ))
                        ) : (
                          <div className="py-4 text-center">
                            <Wallet className="h-6 w-6 mx-auto mb-2" style={{ color: '#4a4a56' }} />
                            <p className="text-xs text-[#6b6b7a]">No wallet detected</p>
                            <p className="text-[10px] text-[#4a4a56] mt-1">Install Phantom or Solflare</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User dropdown (when connected) */}
              {userMenuOpen && address && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border shadow-2xl z-50 overflow-hidden bg-[#141418]" style={{ borderColor: '#1e1e24' }}>
                  {/* Wallet info */}
                  <div className="p-4 border-b" style={{ borderColor: '#141418' }}>
                    <p className="text-[10px] font-semibold text-[#6b6b7a] uppercase tracking-wider mb-1">Connected wallet</p>
                    <p className="text-xs font-mono text-white break-all">{address}</p>
                    <button onClick={handleCopy} className="flex items-center gap-1.5 mt-2 text-[11px] text-[#a0a0b0] hover:text-white transition-colors">
                      {copied ? <Copy className="h-3 w-3 text-[#10b981]" /> : <Copy className="h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy address'}
                    </button>
                  </div>
                  {/* Disconnect */}
                  <button
                    onClick={handleDisconnect}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-[#ef4444] hover:bg-[#1a0808] transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
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

      {/* Search overlay */}
      {searchOpen && (
        <SearchOverlay query={searchQuery} onChange={setSearchQuery} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  );
}
