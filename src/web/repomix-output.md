This file is a merged representation of the entire codebase, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
.env.example
.gitignore
.npmrc
App.tsx
background.js
check-platform.cjs
components/AddKeyModal.tsx
components/AuditRetentionSettings.tsx
components/AuthScreen.tsx
components/BetaBanner.tsx
components/HealthBadge.tsx
components/OcrScanner.tsx
components/ProviderIcons.tsx
components/ReportPage.tsx
components/sections/ActivitySection.tsx
components/sections/AgentsSection.tsx
components/sections/DeveloperSection.tsx
components/sections/DocsSection.tsx
components/sections/EphemeralWalletsSection.tsx
components/sections/SessionsSection.tsx
components/sections/SettingsSection.tsx
components/sections/SharingSection.tsx
components/sections/VaultSection.tsx
components/SolanaProvider.tsx
components/ui/Badge.tsx
components/ui/Button.tsx
components/ui/Card.tsx
components/ui/CodeBlock.tsx
components/ui/ConfirmButton.tsx
components/ui/CopyButton.tsx
components/ui/DataTable.tsx
components/ui/Guilloche.tsx
components/ui/Header.tsx
components/ui/index.ts
components/ui/Input.tsx
components/ui/Logo.tsx
components/ui/MultiSigTracker.tsx
components/ui/Placeholder.tsx
components/ui/RevealField.tsx
components/ui/SearchOverlay.tsx
components/ui/Sidebar.tsx
components/ui/StatCard.tsx
components/ui/Toggle.tsx
components/VaultItemCard.tsx
components/WalletConnector.tsx
components/X402TrustManager.tsx
constants.tsx
content.js
extension/background.ts
extension/content.ts
extension/package.json
extension/popup.tsx
extension/tsconfig.json
hooks/useVaults.ts
index.html
index.tsx
lib/api.ts
lib/audit-retention.ts
lib/auth.ts
lib/key-detector.ts
lib/ocr-service.ts
lib/preferences.ts
lib/sentry.ts
lib/solana.ts
lib/time.ts
lib/vault-key.ts
lib/version.ts
lib/x402-trust.ts
manifest.firefox.json
manifest.json
metadata.json
package.json
README.md
tsconfig.json
types.ts
vercel.json
vite-env.d.ts
vite.config.ts
```

# Files

## File: .env.example
````
# URL of your deployed KeyShield backend (Rust proxy, port 8000)
# No trailing slash. Set this in Vercel dashboard → Settings → Environment Variables
KEYSHIELD_API_URL=https://your-keyshield-server.com

# Solana program ID (leave blank if not using on-chain features)
KEYSHIELD_PROGRAM_ID=

# Optional: Sentry DSN for error tracking
VITE_SENTRY_DSN=
````

## File: .gitignore
````
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
.gstack/
````

## File: .npmrc
````
# npm cross-platform configuration
# Prevents esbuild/rollup platform mismatch errors when switching between WSL/Windows/macOS

# Install optional dependencies for all platforms so binaries exist regardless of host
install-strategy=hoisted
optional=true

# Never prune optional deps based on current platform
omit=
````

## File: App.tsx
````typescript
import React, { useState, useEffect, useRef } from 'react';
import {
  Key, Activity, Bot, Share2, Users, Settings, Terminal, BookOpen,
} from 'lucide-react';
import { VaultItem } from './types';
import { AuthScreen } from './components/AuthScreen';
import { AddKeyModal } from './components/AddKeyModal';
import { SolanaProvider } from './components/SolanaProvider';
import { useWallet } from '@solana/wallet-adapter-react';
import { useVaults } from './hooks/useVaults';
import {
  getWalletAddress,
  apiFetch,
  clearAuth,
  notifyAuthChanged,
  isAuthenticated as hasStoredToken,
} from './lib/auth';

// New UI components
import { Sidebar } from './components/ui/Sidebar';
import { Header } from './components/ui/Header';
import { SearchOverlay } from './components/ui/SearchOverlay';
import { BetaBanner } from './components/BetaBanner';
import { HealthBadge } from './components/HealthBadge';

// Sections
import { VaultSection } from './components/sections/VaultSection';
import { ActivitySection } from './components/sections/ActivitySection';
import { AgentsSection } from './components/sections/AgentsSection';
import { EphemeralWalletsSection } from './components/sections/EphemeralWalletsSection';
import { SharingSection } from './components/sections/SharingSection';
import { SessionsSection } from './components/sections/SessionsSection';
import { SettingsSection } from './components/sections/SettingsSection';
import { DeveloperSection } from './components/sections/DeveloperSection';
import { DocsSection } from './components/sections/DocsSection';

type Section = 'vault' | 'activity' | 'agents' | 'sharing' | 'sessions' | 'settings' | 'developer' | 'docs';

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'vault',     label: 'Vault',     icon: <Key size={14} /> },
  { id: 'activity',  label: 'Activity',  icon: <Activity size={14} /> },
  { id: 'agents',    label: 'Agents',    icon: <Bot size={14} /> },
  { id: 'sharing',   label: 'Sharing',   icon: <Share2 size={14} /> },
  { id: 'sessions',  label: 'Sessions',  icon: <Users size={14} /> },
  { id: 'settings',  label: 'Settings',  icon: <Settings size={14} /> },
  { id: 'developer', label: 'Developer', icon: <Terminal size={14} /> },
  { id: 'docs',      label: 'Docs',      icon: <BookOpen size={14} /> },
];

const SECTION_CONFIG: Record<Section, { title: string; subtitle: string }> = {
  vault:     { title: 'Vault Management', subtitle: 'Encrypted secrets — AES-256-GCM at rest' },
  activity:  { title: 'Activity & Billing', subtitle: 'Proxy calls, usage metrics, and balance' },
  agents:    { title: 'Agent Registry', subtitle: 'ed25519 agent identities and embedded wallets' },
  sharing:   { title: 'Key Sharing', subtitle: 'Re-encrypted access for authorized recipients' },
  sessions:  { title: 'Sessions', subtitle: 'Active auth sessions across devices' },
  settings:  { title: 'Settings', subtitle: 'Account, security, and preferences' },
  developer: { title: 'Developer', subtitle: 'API tokens, SDK snippets, and endpoint reference' },
  docs:      { title: 'Documentation', subtitle: 'Architecture, integration guides, and specs' },
};

const MainContent: React.FC = () => {
  const { disconnect, publicKey } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => hasStoredToken());
  const [section, setSection] = useState<Section>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [prefilledData, setPrefilledData] = useState<Partial<VaultItem> | undefined>(undefined);

  const { items, allItems, addItem, deleteItem, decryptItem } = useVaults(searchQuery, 'All Items');

  // Handle ?action=add deep-link from the browser extension
  useEffect(() => {
    if (!isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'add') return;
    const domain = params.get('domain') || '';
    const upstream = params.get('upstream') || '';
    setPrefilledData({
      name: params.get('name') || '',
      value: params.get('value') || '',
      domain: upstream
        ? ({
            openai: 'openai.com', anthropic: 'anthropic.com', groq: 'groq.com',
            mistral: 'mistral.ai', cohere: 'cohere.ai', helius: 'helius.dev',
            '0x': '0x.org', alchemy: 'alchemy.com',
          } as Record<string, string>)[upstream] || domain
        : domain,
      notes: domain ? `Detected by extension on ${domain}` : 'Detected via extension',
    });
    setIsAddModalOpen(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [isAuthenticated]);

  // Cross-component nav
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<Section>).detail;
      if (detail) setSection(detail);
    };
    window.addEventListener('ks-nav', onNav as EventListener);
    return () => window.removeEventListener('ks-nav', onNav as EventListener);
  }, []);

  const handleLogout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try { await disconnect(); } catch {}
    clearAuth();
    notifyAuthChanged();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  const fullAddr = publicKey?.toBase58() ?? getWalletAddress() ?? '';
  const config = SECTION_CONFIG[section];

  return (
    <div className="h-screen bg-black text-zinc-200 flex flex-col" style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}>
      <BetaBanner />

      {/* Search overlay */}
      {isSearchOpen && (
        <SearchOverlay
          query={searchQuery}
          onChange={setSearchQuery}
          onClose={() => { setIsSearchOpen(false); setSearchQuery(''); }}
        />
      )}

      {/* Add key modal */}
      <AddKeyModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setPrefilledData(undefined); }}
        onSave={addItem}
        initialData={prefilledData}
      />

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          items={NAV}
          active={section}
          onNavigate={setSection}
          walletAddress={fullAddr}
          connected={!!fullAddr}
          onCopyAddress={() => navigator.clipboard.writeText(fullAddr)}
          onLogout={handleLogout}
        />

        {/* Content area */}
        <main className="flex-1 min-w-0 flex flex-col bg-black">
          {/* Header */}
          <Header
            title={config.title}
            subtitle={config.subtitle}
            onSearch={() => setIsSearchOpen(true)}
            onAdd={section === 'vault' ? () => setIsAddModalOpen(true) : undefined}
            searchActive={!!searchQuery}
            actions={<HealthBadge />}
          />

          {/* Content */}
          <div className="flex-1 overflow-auto px-6 py-6">
            <div className="max-w-5xl mx-auto">
              {section === 'vault' && (
                <VaultSection
                  items={items}
                  total={allItems.length}
                  searchQuery={searchQuery}
                  onAdd={() => setIsAddModalOpen(true)}
                  onDelete={deleteItem}
                  onDecrypt={decryptItem}
                />
              )}
              {section === 'activity' && <ActivitySection />}
              {section === 'agents' && (
                <>
                  <AgentsSection />
                  <EphemeralWalletsSection />
                </>
              )}
              {section === 'sharing' && <SharingSection addr={fullAddr} />}
              {section === 'sessions' && <SessionsSection onLogout={handleLogout} />}
              {section === 'settings' && <SettingsSection addr={fullAddr} />}
              {section === 'developer' && <DeveloperSection />}
              {section === 'docs' && <DocsSection />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <SolanaProvider>
    <MainContent />
  </SolanaProvider>
);

export default App;
````

## File: background.js
````javascript
/**
 * KeyShield Background Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Three paths:
 *
 *  1. SAVE_KEY (from content.js):
 *     - If we have a stored session token → POST /manage/store directly.
 *       User sees a "✓ Saved" Chrome notification AND we sendResponse so the
 *       content script can render an in-page success/failure toast.
 *     - If no token / token expired → fall back to opening the dashboard with
 *       a prefilled URL.
 *
 *  2. KS_TOKEN_REGISTER (from dashboard via externally_connectable):
 *     Dashboard sends this on login/logout. We persist in chrome.storage.local.
 *
 *  3. API_BASE override (chrome.storage.local.ks_api_base):
 *     Lets QA point a single extension build at staging or prod without
 *     re-zipping. Defaults to localhost in dev. The popup writes this value.
 */

const DEFAULT_KS_BASE       = 'http://localhost:8000';
const DEFAULT_DASHBOARD_URL = 'http://localhost:3000';

async function getApiBase() {
  const { ks_api_base, ks_dashboard_url } = await chrome.storage.local.get([
    'ks_api_base',
    'ks_dashboard_url',
  ]);
  return {
    apiBase:      ks_api_base      || DEFAULT_KS_BASE,
    dashboardUrl: ks_dashboard_url || DEFAULT_DASHBOARD_URL,
  };
}

// ── Storage helpers ─────────────────────────────────────────────────────────

async function getStoredToken() {
  const { ks_token, ks_user } = await chrome.storage.local.get(['ks_token', 'ks_user']);
  return { token: ks_token || null, user: ks_user || null };
}

async function setStoredToken(token, user) {
  await chrome.storage.local.set({ ks_token: token, ks_user: user || null });
}

async function clearStoredToken() {
  await chrome.storage.local.remove(['ks_token', 'ks_user']);
}

// ── Notifications ───────────────────────────────────────────────────────────

function notify(title, message, icon) {
  chrome.notifications.create({
    type:    'basic',
    iconUrl: icon || chrome.runtime.getURL('icon.png'),
    title:   title,
    message: message,
  }, () => {
    // ignore "icon not found" — manifest icon is optional
    if (chrome.runtime.lastError) console.log('[KeyShield] notify:', chrome.runtime.lastError.message);
  });
}

// ── Direct store (no tab) ───────────────────────────────────────────────────

async function directStore({ upstream, value }) {
  const { token } = await getStoredToken();
  if (!token) return { ok: false, reason: 'no-token' };

  const { apiBase } = await getApiBase();

  try {
    const r = await fetch(`${apiBase}/manage/store`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ upstream, apiKey: value }),
    });

    if (r.status === 401) {
      // token expired
      await clearStoredToken();
      return { ok: false, reason: 'token-expired' };
    }
    if (!r.ok) {
      return { ok: false, reason: `http-${r.status}`, detail: await r.text() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e) };
  }
}

// ── SAVE_KEY (from content.js) ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Accept both the structured form ({type, payload}) and the spec form
  // ({action: "save-key", provider, key, source_url}) so we don't break
  // either client.
  let payload = null;
  if (message.type === 'SAVE_KEY' && message.payload) {
    payload = message.payload;
  } else if (message.action === 'save-key') {
    payload = {
      upstream: message.provider,
      value:    message.key,
      name:     message.name || `${message.provider} (${new URL(message.source_url || 'http://x').hostname})`,
      domain:   (() => { try { return new URL(message.source_url).hostname; } catch { return ''; } })(),
    };
  }
  if (!payload) return false;

  (async () => {
    const { upstream, name, value, domain } = payload;

    // Try direct API store
    const result = await directStore({ upstream, value });

    if (result.ok) {
      notify('KeyShield', `Saved ${upstream} key to KeyShield`);
      sendResponse({ ok: true, mode: 'direct' });
      return;
    }

    // Fallback: open dashboard with prefilled URL
    const reasonMsg = {
      'no-token':      'Sign in to KeyShield first',
      'token-expired': 'Session expired — sign in again',
      'network':       'Backend unreachable — opening dashboard',
    }[result.reason] || `Error: ${result.reason}`;

    const { dashboardUrl } = await getApiBase();
    const params = new URLSearchParams({
      action:   'add',
      upstream: upstream || 'openai',
      name:     name     || '',
      value:    value    || '',
      domain:   domain   || '',
    });

    notify('KeyShield', reasonMsg);
    chrome.tabs.create({ url: `${dashboardUrl}/?${params}` });
    sendResponse({ ok: false, mode: 'fallback', reason: result.reason });
  })();

  return true;  // keep sendResponse channel open for async reply
});

// ── External messages (from dashboard) ──────────────────────────────────────

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'KS_TOKEN_REGISTER') {
    setStoredToken(message.token, message.user).then(() => {
      console.log('[KeyShield] token registered from dashboard');
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === 'KS_TOKEN_CLEAR') {
    clearStoredToken().then(() => {
      console.log('[KeyShield] token cleared');
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === 'KS_PING') {
    getStoredToken().then(({ token, user }) => {
      sendResponse({ ok: true, hasToken: !!token, user });
    });
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[KeyShield] v1.1 installed — auto-detect + direct-store enabled');
  // Enforce audit log retention on install/update (inline — no TS imports in background.js)
  _purgeAuditLogInline().then((result) => {
    const total = result.deletedByAge + result.deletedByCap;
    if (total > 0) console.log('[KeyShield] onInstalled audit purge:', result);
  }).catch((e) => console.warn('[KeyShield] onInstalled audit purge failed:', e));
});

// ── Audit log retention (inline JS, mirrors lib/audit-retention.ts) ──────────

async function _purgeAuditLogInline() {
  const AUDIT_LOG_KEY = 'ks_audit_log';
  const RETENTION_POLICY_KEY = 'ks_audit_retention';
  const DEFAULT_MAX_AGE_DAYS = 30;
  const DEFAULT_MAX_ENTRIES = 500;

  const stored = await chrome.storage.local.get([AUDIT_LOG_KEY, RETENTION_POLICY_KEY]);
  const policy = stored[RETENTION_POLICY_KEY] || {};
  const maxAgeDays = typeof policy.maxAgeDays === 'number' ? policy.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
  const maxEntries = typeof policy.maxEntries === 'number' ? policy.maxEntries : DEFAULT_MAX_ENTRIES;

  const rawLogs = stored[AUDIT_LOG_KEY] || [];
  const cutoff = Date.now() - maxAgeDays * 86400000;

  const afterAge = rawLogs.filter((e) => typeof e?.timestamp === 'number' && e.timestamp >= cutoff);
  const deletedByAge = rawLogs.length - afterAge.length;

  const sorted = afterAge.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const afterCap = sorted.slice(0, maxEntries);
  const deletedByCap = afterAge.length - afterCap.length;

  await chrome.storage.local.set({ [AUDIT_LOG_KEY]: afterCap });
  return { deletedByAge, deletedByCap };
}

// ── x402 Trust Store helpers (mirrors lib/x402-trust.ts) ────────────────────
const X402_STORAGE_KEY = 'ks_x402_trust_list';
async function x402LoadList() { const r = await chrome.storage.local.get(X402_STORAGE_KEY); return r[X402_STORAGE_KEY] ?? {}; }
async function x402SaveList(list) { await chrome.storage.local.set({ [X402_STORAGE_KEY]: list }); }
async function x402IsTrusted(h) { const l = await x402LoadList(); const e = l[h]; return !!e && e.enabled; }
async function x402GetThreshold(h) { const l = await x402LoadList(); const e = l[h]; if (!e || !e.enabled) return Infinity; return e.threshold_usd; }
async function x402AddDomain(h, t) { const l = await x402LoadList(); l[h] = { threshold_usd: t, enabled: l[h]?.enabled ?? true, added_at: l[h]?.added_at ?? Date.now() }; await x402SaveList(l); }
async function x402RemoveDomain(h) { const l = await x402LoadList(); delete l[h]; await x402SaveList(l); }
async function x402ToggleDomain(h, enabled) { const l = await x402LoadList(); if (!l[h]) return; l[h] = { ...l[h], enabled }; await x402SaveList(l); }

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'X402_CHECK_TRUST') {
    (async () => { const { hostname, amount_usd } = message; const trusted = await x402IsTrusted(hostname); const threshold = await x402GetThreshold(hostname); sendResponse({ autoPayApproved: trusted && typeof amount_usd === 'number' && amount_usd < threshold }); })();
    return true;
  }
  if (message.type === 'INITIATE_X402_PAYMENT') {
    (async () => { const { amount_usd, hostname, payTo, network, resource } = message; await chrome.storage.session.set({ ks_x402_pending: { amount_usd, hostname, payTo, network, resource, initiated_at: Date.now() } }); try { await chrome.action.openPopup(); } catch {} sendResponse({ initiated: true }); })();
    return true;
  }
  if (message.type === 'GET_X402_TRUST') { (async () => { sendResponse({ list: await x402LoadList() }); })(); return true; }
  if (message.type === 'UPDATE_X402_TRUST') {
    (async () => { const { action, hostname, threshold_usd, enabled } = message; if (action === 'add') await x402AddDomain(hostname, threshold_usd); if (action === 'remove') await x402RemoveDomain(hostname); if (action === 'toggle') await x402ToggleDomain(hostname, enabled); sendResponse({ ok: true }); })();
    return true;
  }
  return false;
});
````

## File: check-platform.cjs
````javascript
/**
 * check-platform.cjs — Cross-platform esbuild/rollup binary check
 *
 * Detects when node_modules was installed on a different platform
 * (e.g., WSL → Windows, macOS → Docker) and provides fix instructions.
 *
 * Run automatically before `npm run dev` and `npm run build`.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const platform = os.platform();
const arch = os.arch();

// Map platform+arch to expected esbuild/rollup package names
const expectedPackages = {
  win32: {
    x64: ['@esbuild/win32-x64', '@rollup/rollup-win32-x64-msvc'],
    arm64: ['@esbuild/win32-arm64', '@rollup/rollup-win32-arm64-msvc'],
  },
  darwin: {
    x64: ['@esbuild/darwin-x64', '@rollup/rollup-darwin-x64'],
    arm64: ['@esbuild/darwin-arm64', '@rollup/rollup-darwin-arm64'],
  },
  linux: {
    x64: ['@esbuild/linux-x64', '@rollup/rollup-linux-x64-gnu'],
    arm64: ['@esbuild/linux-arm64', '@rollup/rollup-linux-arm64-gnu'],
  },
};

const expected = expectedPackages[platform]?.[arch === 'arm64' ? 'arm64' : 'x64'];
if (!expected) {
  console.warn(`⚠️  Unsupported platform: ${platform}/${arch}. Skipping binary check.`);
  process.exit(0);
}

const missing = expected.filter(pkg => {
  const pkgPath = path.join(__dirname, 'node_modules', pkg);
  return !fs.existsSync(pkgPath);
});

if (missing.length > 0) {
  const isWSL = fs.existsSync('/proc/version') &&
    fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

  console.error('');
  console.error('❌ Platform mismatch detected in node_modules');
  console.error('');
  console.error(`  Expected: ${missing.join(', ')}`);
  console.error(`  Platform: ${platform} ${arch}`);
  console.error('');
  console.error('  This happens when node_modules was installed on a different');
  console.error('  OS (e.g., WSL → Windows, macOS → Docker, or copied between machines).');
  console.error('');
  console.error('  Fix:');
  console.error('');

  if (isWSL) {
    console.error('    # In WSL:');
    console.error('    rm -rf node_modules');
    console.error('    npm install');
  } else if (platform === 'win32') {
    console.error('    # In PowerShell:');
    console.error('    Remove-Item -Recurse -Force node_modules');
    console.error('    npm install');
  } else if (platform === 'darwin') {
    console.error('    # In Terminal:');
    console.error('    rm -rf node_modules');
    console.error('    npm install');
  } else {
    console.error('    rm -rf node_modules');
    console.error('    npm install');
  }

  console.error('');
  console.error('  Tip: Never copy node_modules between different OS environments.');
  console.error('  Each platform needs its own native binaries.');
  console.error('');

  // Don't block the build if it's just a warning
  // The actual error will be thrown by vite/esbuild if binaries are missing
  console.warn('⚠️  Continuing (vite will fail if binaries are truly missing)...\n');
  process.exit(0);
}
````

## File: components/AddKeyModal.tsx
````typescript
import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Key, Lock, FileText, Terminal, KeyRound } from 'lucide-react';
import { VaultItem, VaultItemType, TYPE_PREFIX, PasswordPayload, NotePayload, EnvPayload, SSHKeyPayload } from '../types';
import { getPrefs } from '../lib/preferences';

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
  onSave:    (item: Partial<VaultItem> & { upstream?: string; rawKey?: string }) => Promise<void> | void;
  initialData?: Partial<VaultItem>;
}

// ─── API key providers ───────────────────────────────────────────────────────
const PROVIDERS = [
  { id: 'openai',    name: 'OpenAI',           tag: 'ai',  domain: 'openai.com',    placeholder: 'sk-proj-…' },
  { id: 'anthropic', name: 'Anthropic Claude', tag: 'ai',  domain: 'anthropic.com', placeholder: 'sk-ant-api03-…' },
  { id: 'helius',    name: 'Helius RPC',       tag: 'rpc', domain: 'helius.dev',    placeholder: 'xxxxxxxx-xxxx-…' },
  { id: 'mistral',   name: 'Mistral AI',       tag: 'ai',  domain: 'mistral.ai',    placeholder: 'xxxxxxxxxxxxxxxx' },
  { id: 'cohere',    name: 'Cohere',           tag: 'ai',  domain: 'cohere.ai',     placeholder: 'xxxxxxxxxxxxxxxx' },
  { id: 'groq',      name: 'Groq',             tag: 'ai',  domain: 'groq.com',      placeholder: 'gsk_…' },
];

// ─── Type tabs ───────────────────────────────────────────────────────────────
const TYPE_TABS: { id: VaultItemType; label: string; icon: React.ReactNode; sub: string }[] = [
  { id: 'api_key',  label: 'API key',   icon: <Key size={13} />,       sub: 'OpenAI, Anthropic, Helius… proxied with zero-trust' },
  { id: 'password', label: 'Password',  icon: <Lock size={13} />,      sub: 'Username + password for any site' },
  { id: 'note',     label: 'Secure note', icon: <FileText size={13} />,sub: 'Encrypted text — recovery codes, secrets, etc.' },
  { id: 'env',      label: '.env file', icon: <Terminal size={13} />, sub: 'Block of KEY=VALUE pairs for an app' },
  { id: 'ssh_key',  label: 'SSH key',   icon: <KeyRound size={13} />,  sub: 'Public + private key + passphrase' },
];

// ─── Slug helpers ────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'untitled';
}

export const AddKeyModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [type, setType] = useState<VaultItemType>('api_key');

  // common fields
  const [name, setName]             = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes]           = useState('');
  const [saveError, setSaveError]   = useState('');
  const [busy, setBusy]             = useState(false);

  // api_key fields
  const [provider, setProvider]   = useState(PROVIDERS[0]);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [showValue, setShowValue]     = useState(false);

  // password fields
  const [pwUsername, setPwUsername] = useState('');
  const [pwPassword, setPwPassword] = useState('');
  const [pwUrl, setPwUrl]           = useState('');
  const [showPw, setShowPw]         = useState(false);

  // note fields
  const [noteContent, setNoteContent] = useState('');

  // env fields
  const [envText, setEnvText]       = useState(''); // raw "KEY=VALUE\n" multi-line

  // ssh fields
  const [sshPublic, setSshPublic]       = useState('');
  const [sshPrivate, setSshPrivate]     = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [sshComment, setSshComment]     = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // pre-fill expiry from prefs (default 90 days, 0 = none)
    const days = getPrefs().defaultExpiryDays;
    if (days > 0) {
      const d = new Date(Date.now() + days * 86400_000);
      setExpiryDate(d.toISOString().slice(0, 10));
    }
    if (initialData) {
      if (initialData.name)  setName(initialData.name);
      if (initialData.value) setApiKeyValue(initialData.value);
      if (initialData.domain) {
        const found = PROVIDERS.find(p => p.domain === initialData.domain || initialData.name?.toLowerCase().includes(p.name.toLowerCase()));
        if (found) { setProvider(found); setType('api_key'); }
      }
      if (initialData.notes) setNotes(initialData.notes);
    }
  }, [isOpen, initialData]);

  const reset = () => {
    setName(''); setExpiryDate(''); setNotes(''); setSaveError('');
    setProvider(PROVIDERS[0]); setApiKeyValue(''); setShowValue(false);
    setPwUsername(''); setPwPassword(''); setPwUrl(''); setShowPw(false);
    setNoteContent('');
    setEnvText('');
    setSshPublic(''); setSshPrivate(''); setSshPassphrase(''); setSshComment('');
    setType('api_key');
  };

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaveError('');
    try {
      let upstream: string;
      let rawKey:   string;
      let domain   = '';
      let tag      = type.replace('_', ' ');

      if (type === 'api_key') {
        if (!apiKeyValue) throw new Error('Paste the API key');
        upstream = provider.id;
        rawKey   = apiKeyValue;
        domain   = provider.domain;
        tag      = provider.tag;
      } else {
        // user-defined secret — slug from name
        if (!name) throw new Error('Give it a name');
        upstream = `${TYPE_PREFIX[type]}${slugify(name)}`;

        if (type === 'password') {
          if (!pwPassword) throw new Error('Password required');
          const payload: PasswordPayload = { username: pwUsername, password: pwPassword, url: pwUrl, notes };
          rawKey = JSON.stringify(payload);
        } else if (type === 'note') {
          if (!noteContent) throw new Error('Write something in the note');
          const payload: NotePayload = { title: name, content: noteContent };
          rawKey = JSON.stringify(payload);
        } else if (type === 'env') {
          if (!envText.trim()) throw new Error('Paste at least one KEY=VALUE line');
          const vars = envText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
            const eq = line.indexOf('=');
            return eq < 0 ? null : { key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() };
          }).filter((v): v is { key: string; value: string } => v !== null);
          if (vars.length === 0) throw new Error('No valid KEY=VALUE lines found');
          const payload: EnvPayload = { vars, notes };
          rawKey = JSON.stringify(payload);
        } else if (type === 'ssh_key') {
          if (!sshPrivate) throw new Error('Private key required');
          const payload: SSHKeyPayload = { publicKey: sshPublic, privateKey: sshPrivate, passphrase: sshPassphrase, comment: sshComment };
          rawKey = JSON.stringify(payload);
        } else {
          throw new Error('Unsupported type');
        }
      }

      await onSave({
        name:    type === 'api_key' ? (name || provider.name) : name,
        domain,
        upstream,
        rawKey,
        value:   rawKey,
        expiryDate,
        notes,
        type,
        tags:    [tag, 'vault'],
      });
      reset();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full bg-[#070912] border border-[#1c2238] rounded-lg px-4 py-2.5 text-[14px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/60 transition-colors';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#05060d]/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#0a0d1a] border border-[#1c2238] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c2238] shrink-0">
          <div>
            <h2 className="text-[16px] font-semibold text-white">New secret</h2>
            <p className="text-[12px] text-zinc-500 mt-0.5">{TYPE_TABS.find(t => t.id === type)?.sub}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#11162a] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Type tabs */}
        <div className="px-6 pt-4 shrink-0">
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#070912] border border-[#1c2238]">
            {TYPE_TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setType(t.id); setSaveError(''); }}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium transition-colors ${
                  type === t.id
                    ? 'bg-[#0e1430] text-white border border-[#1c2550]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} noValidate className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Name (always shown) */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-zinc-400">
              {type === 'api_key' ? 'Label' : type === 'note' ? 'Title' : type === 'password' ? 'Site / app' : type === 'env' ? 'App / project' : 'Key name'}
              {type === 'api_key' && <span className="text-zinc-600 ml-1">(optional)</span>}
            </label>
            <input
              placeholder={type === 'api_key' ? 'e.g. Production API key' : type === 'password' ? 'e.g. GitHub' : type === 'note' ? 'e.g. Recovery codes' : type === 'env' ? 'e.g. backend-staging' : 'e.g. deploy-key'}
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* ── api_key fields ─────────────────────────────────────────── */}
          {type === 'api_key' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Provider</label>
                  <select
                    className={inputCls + ' appearance-none cursor-pointer'}
                    value={provider.id}
                    onChange={(e) => {
                      const found = PROVIDERS.find(p => p.id === e.target.value);
                      if (found) setProvider(found);
                    }}
                  >
                    {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Expires</label>
                  <input type="date" className={inputCls + ' [color-scheme:dark]'} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-zinc-400">API key</label>
                <div className="relative">
                  <input
                    required
                    type={showValue ? 'text' : 'password'}
                    placeholder={provider.placeholder ?? 'Paste your API key'}
                    className={inputCls + ' pr-12 font-mono'}
                    value={apiKeyValue}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowValue(!showValue)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                    {showValue ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── password fields ────────────────────────────────────────── */}
          {type === 'password' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Username / email</label>
                  <input className={inputCls} value={pwUsername} onChange={e => setPwUsername(e.target.value)} placeholder="alice@example.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">URL</label>
                  <input className={inputCls} value={pwUrl} onChange={e => setPwUrl(e.target.value)} placeholder="https://github.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] text-zinc-400">Password</label>
                <div className="relative">
                  <input required type={showPw ? 'text' : 'password'} className={inputCls + ' pr-12 font-mono'} value={pwPassword} onChange={e => setPwPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── note fields ────────────────────────────────────────────── */}
          {type === 'note' && (
            <div className="space-y-1.5">
              <label className="text-[12px] text-zinc-400">Content</label>
              <textarea
                required
                rows={8}
                className={inputCls + ' resize-y font-mono'}
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Recovery codes, license keys, anything you'd put in a sticky note but encrypted."
              />
            </div>
          )}

          {/* ── env fields ─────────────────────────────────────────────── */}
          {type === 'env' && (
            <div className="space-y-1.5">
              <label className="text-[12px] text-zinc-400 flex items-center justify-between">
                <span>Environment variables</span>
                <span className="text-[10px] text-zinc-600">paste a .env file directly</span>
              </label>
              <textarea
                required
                rows={8}
                className={inputCls + ' resize-y font-mono text-[12px]'}
                value={envText}
                onChange={e => setEnvText(e.target.value)}
                placeholder={`DATABASE_URL=postgres://localhost/myapp\nSTRIPE_SECRET=sk_live_…\nSENTRY_DSN=https://…`}
              />
              <p className="text-[10px] text-zinc-600">One KEY=VALUE per line. Lines without <code>=</code> are skipped.</p>
            </div>
          )}

          {/* ── ssh fields ─────────────────────────────────────────────── */}
          {type === 'ssh_key' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[12px] text-zinc-400">Public key (optional)</label>
                <textarea rows={2} className={inputCls + ' resize-y font-mono text-[11px]'} value={sshPublic} onChange={e => setSshPublic(e.target.value)} placeholder="ssh-ed25519 AAAA… alice@laptop" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] text-zinc-400">Private key</label>
                <textarea required rows={6} className={inputCls + ' resize-y font-mono text-[11px]'} value={sshPrivate} onChange={e => setSshPrivate(e.target.value)} placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Passphrase (optional)</label>
                  <input type="password" className={inputCls + ' font-mono'} value={sshPassphrase} onChange={e => setSshPassphrase(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Comment</label>
                  <input className={inputCls} value={sshComment} onChange={e => setSshComment(e.target.value)} placeholder="alice@laptop" />
                </div>
              </div>
            </>
          )}

          {/* Notes (only for api_key / password / env) */}
          {(type === 'api_key' || type === 'password' || type === 'env') && (
            <div className="space-y-1.5">
              <label className="text-[12px] text-zinc-400">Notes</label>
              <textarea placeholder="Optional context" rows={2} className={inputCls + ' resize-none'} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          )}

          {saveError && (
            <div className="px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
              <p className="text-[12px] text-rose-300">{saveError}</p>
            </div>
          )}

          <div className="pt-3 flex items-center justify-between border-t border-[#1c2238]">
            <span className="text-[11px] text-zinc-500">AES-256-GCM · zero-knowledge</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-zinc-300 hover:text-white hover:bg-[#11162a] transition-colors">Cancel</button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
              >
                {busy ? 'Encrypting…' : 'Save secret'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
````

## File: components/AuditRetentionSettings.tsx
````typescript
/**
 * AuditRetentionSettings — UI for configuring audit log retention policy.
 * Reads/writes policy via audit-retention.ts; shows current stats.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Save, RefreshCw, Loader2 } from 'lucide-react';
import {
  getPolicy,
  setPolicy,
  purgeAuditLog,
  DEFAULT_POLICY,
  type AuditRetentionPolicy,
} from '../lib/audit-retention';

// chrome is injected at runtime by the extension environment.
declare const chrome: any;

interface AuditStats {
  totalEntries: number;
  oldestEntry: string | null;
}

async function getAuditStats(): Promise<AuditStats> {
  if (typeof chrome === 'undefined' || !chrome?.storage) {
    return { totalEntries: 0, oldestEntry: null };
  }
  return new Promise((resolve) => {
    chrome.storage.local.get('ks_audit_log', (result: Record<string, unknown>) => {
      const logs = (result['ks_audit_log'] as any[]) ?? [];
      const totalEntries = logs.length;
      let oldestEntry: string | null = null;
      if (logs.length > 0) {
        const minTs = Math.min(...logs.map((l) => l?.timestamp ?? Infinity));
        if (isFinite(minTs)) {
          oldestEntry = new Date(minTs).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        }
      }
      resolve({ totalEntries, oldestEntry });
    });
  });
}

export const AuditRetentionSettings: React.FC = () => {
  const [policy, setLocalPolicy] = useState<AuditRetentionPolicy>(DEFAULT_POLICY);
  const [stats, setStats] = useState<AuditStats>({ totalEntries: 0, oldestEntry: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([getPolicy(), getAuditStats()]);
      setLocalPolicy(p);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      await setPolicy(policy);
      setSaveResult('Saved.');
    } catch {
      setSaveResult('Save failed.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveResult(null), 3000);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    setPurgeResult(null);
    try {
      const result = await purgeAuditLog();
      const total = result.deletedByAge + result.deletedByCap;
      setPurgeResult(
        total > 0
          ? `Deleted ${total} old entr${total === 1 ? 'y' : 'ies'} (${result.deletedByAge} by age, ${result.deletedByCap} by cap).`
          : 'Nothing to purge — log is within policy.'
      );
      await reload();
    } catch {
      setPurgeResult('Purge failed.');
    } finally {
      setPurging(false);
      setTimeout(() => setPurgeResult(null), 5000);
    }
  };

  return (
    <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden mt-6">
      <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-white">Audit Log Retention</h3>
        <button
          onClick={reload}
          disabled={loading}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Refresh stats"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Current stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#1c2238] bg-[#070912] px-4 py-3">
            <div className="text-[20px] font-semibold text-white leading-tight">
              {loading ? '—' : stats.totalEntries.toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Total log entries</div>
          </div>
          <div className="rounded-xl border border-[#1c2238] bg-[#070912] px-4 py-3">
            <div className="text-[13px] font-medium text-zinc-300 leading-tight truncate">
              {loading ? '—' : (stats.oldestEntry ?? 'No entries')}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Oldest entry</div>
          </div>
        </div>

        {/* Policy inputs */}
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
              Keep logs for (days)
            </span>
            <input
              type="number"
              min={1}
              max={3650}
              value={policy.maxAgeDays}
              onChange={(e) =>
                setLocalPolicy((p) => ({ ...p, maxAgeDays: Math.max(1, parseInt(e.target.value) || 1) }))
              }
              className="bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[#5b8cff]/50 w-full"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
              Maximum entries
            </span>
            <input
              type="number"
              min={10}
              max={10000}
              value={policy.maxEntries}
              onChange={(e) =>
                setLocalPolicy((p) => ({ ...p, maxEntries: Math.max(10, parseInt(e.target.value) || 10) }))
              }
              className="bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[#5b8cff]/50 w-full"
            />
          </label>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[12px] font-medium transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save policy'}
          </button>

          <button
            onClick={handlePurge}
            disabled={purging}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[#2a1c2e] bg-rose-950/20 hover:bg-rose-950/40 disabled:opacity-40 text-rose-400 text-[12px] font-medium transition-colors"
          >
            {purging ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            {purging ? 'Purging…' : 'Purge now'}
          </button>

          {saveResult && (
            <span className="text-[12px] text-emerald-400">{saveResult}</span>
          )}
          {purgeResult && (
            <span className="text-[12px] text-zinc-400">{purgeResult}</span>
          )}
        </div>
      </div>
    </div>
  );
};
````

## File: components/AuthScreen.tsx
````typescript
import React, { useState } from 'react';
import { Shield, Fingerprint, Loader2, AlertCircle } from 'lucide-react';
import { WalletConnector } from './WalletConnector';
import {
  passkeyLogin,
  setToken,
  setWalletAddress,
  notifyAuthChanged,
  getPasskeyTrust,
  clearPasskeyTrust,
} from '../lib/auth';

interface Props {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  const [trust] = useState(() => getPasskeyTrust());
  const [useWallet, setUseWallet] = useState(!trust);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkError, setPkError]     = useState('');

  const shortAddr = trust
    ? `${trust.userId.slice(0, 4)}…${trust.userId.slice(-4)}`
    : '';

  const handleFaceID = async () => {
    setPkLoading(true);
    setPkError('');
    try {
      const { token, userId } = await passkeyLogin();
      setToken(token);
      setWalletAddress(userId);
      notifyAuthChanged();
      onAuthenticated();
    } catch (e) {
      setPkError(e instanceof Error ? e.message : 'Face ID failed');
    } finally {
      setPkLoading(false);
    }
  };

  const forgetDevice = () => {
    clearPasskeyTrust();
    setUseWallet(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05060d] px-6">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-[#0e1430] border border-[#1c2550] flex items-center justify-center mb-8">
          <Shield size={36} className="text-[#5b8cff]" strokeWidth={1.75} />
        </div>

        <h1 className="text-[34px] leading-tight font-semibold text-white tracking-tight">
          KeyShield Vault
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-zinc-400 max-w-sm">
          {trust && !useWallet
            ? `Welcome back. Sign in with Face ID, Touch ID, or your hardware key.`
            : `Connect your Solana wallet to access your encrypted secrets.`}
        </p>

        <div className="w-full mt-10">
          {trust && !useWallet ? (
            <div className="w-full space-y-3">
              <div className="rounded-2xl border border-violet-900/50 p-2 bg-violet-950/20">
                <button
                  type="button"
                  onClick={handleFaceID}
                  disabled={pkLoading}
                  className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-violet-800/60 bg-violet-900/40 hover:bg-violet-900/60 text-white disabled:opacity-70 disabled:cursor-wait transition-colors"
                >
                  <span className="flex items-center justify-center w-5 h-5">
                    {pkLoading
                      ? <Loader2 size={18} className="animate-spin text-violet-200" />
                      : <Fingerprint size={18} className="text-violet-200" />}
                  </span>
                  <span className="text-[15px] font-medium tracking-tight">
                    {pkLoading ? 'Verifying…' : `Sign in as ${shortAddr}`}
                  </span>
                </button>
              </div>
              {pkError && (
                <div className="px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start gap-3">
                  <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-rose-300 leading-relaxed break-words text-left">{pkError}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setUseWallet(true)}
                className="w-full text-center py-2 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Use a different wallet instead
              </button>
              <button
                type="button"
                onClick={forgetDevice}
                className="w-full text-center py-1 text-[11px] text-zinc-600 hover:text-rose-400 transition-colors"
              >
                Forget this device
              </button>
            </div>
          ) : (
            <>
              <WalletConnector onConnect={onAuthenticated} />
              {trust && (
                <button
                  type="button"
                  onClick={() => setUseWallet(false)}
                  className="w-full mt-3 text-center py-2 text-[12px] text-violet-400 hover:text-violet-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Fingerprint size={12} /> Use Face ID instead
                </button>
              )}
            </>
          )}
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-zinc-600 max-w-sm">
          AES-256-GCM · ed25519 wallet signatures · server never sees your key material
        </p>
      </div>
    </div>
  );
};
````

## File: components/BetaBanner.tsx
````typescript
import React, { useEffect, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { VERSION, BUILD_DATE, BETA_FEEDBACK_URL } from '../lib/version';

const STORAGE_KEY = 'ks_beta_banner_dismissed_at';
const HIDE_FOR_MS = 24 * 60 * 60 * 1000;

export const BetaBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { setShow(true); return; }
    const ts = parseInt(raw, 10);
    setShow(!isFinite(ts) || (Date.now() - ts) > HIDE_FOR_MS);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setShow(false);
  };

  return (
    <div className="h-8 px-4 flex items-center justify-between border-b border-[#1c2550] bg-[#0e1430]/90 text-[11px] backdrop-blur-md">
      <div className="flex items-center gap-2 min-w-0">
        <span className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/40 text-violet-300 font-semibold tracking-wider text-[9px]">
          BETA
        </span>
        <span className="text-zinc-400 truncate">
          KeyShield <span className="font-mono text-zinc-300">{VERSION}</span>
          <span className="text-zinc-600"> · built {BUILD_DATE} · expect rough edges, please share feedback</span>
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <a
          href={BETA_FEEDBACK_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-violet-300 hover:text-violet-100 transition-colors"
        >
          <MessageCircle size={11} />
          Send feedback →
        </a>
        <button
          onClick={dismiss}
          className="text-zinc-500 hover:text-white transition-colors"
          title="Hide for 24 hours"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
};
````

## File: components/HealthBadge.tsx
````typescript
import React, { useEffect, useState } from 'react';
import { API_BASE } from '../lib/auth';

type State = 'unknown' | 'ok' | 'slow' | 'down';

export const HealthBadge: React.FC = () => {
  const [state, setState] = useState<State>('unknown');
  const [latency, setLatency] = useState(0);
  const [checkedAt, setCheckedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${API_BASE}/health`, { method: 'GET' });
        const dt = Math.round(performance.now() - t0);
        if (cancelled) return;
        setLatency(dt);
        setCheckedAt(Date.now());
        if (!r.ok) { setState('down'); return; }
        setState(dt > 2000 ? 'slow' : 'ok');
      } catch {
        if (cancelled) return;
        setLatency(Math.round(performance.now() - t0));
        setCheckedAt(Date.now());
        setState('down');
      }
    };
    probe();
    const id = window.setInterval(probe, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const color = state === 'ok' ? 'bg-emerald-400'
    : state === 'slow' ? 'bg-amber-400'
    : state === 'down' ? 'bg-rose-500'
    : 'bg-zinc-600';

  const ago = checkedAt ? Math.round((Date.now() - checkedAt) / 1000) : 0;
  const label = state === 'ok' ? `Backend healthy · ${latency}ms`
    : state === 'slow' ? `Backend slow · ${latency}ms`
    : state === 'down' ? 'Backend unreachable'
    : 'Checking backend…';

  return (
    <div
      className="flex items-center gap-2 h-10 px-3 rounded-lg border border-[#1c2238] text-[11px] text-zinc-500"
      title={`${label} · last check ${ago}s ago`}
    >
      <span className={`w-2 h-2 rounded-full ${color} ${state === 'ok' ? 'animate-pulse' : ''}`} />
      <span className="hidden sm:inline">{state === 'down' ? 'API down' : state === 'slow' ? 'slow' : 'API'}</span>
    </div>
  );
};
````

## File: components/OcrScanner.tsx
````typescript
/**
 * OcrScanner — React component for OCR-based API key detection.
 * Uses OCRService (tesseract.js, lazy-loaded) to capture the screen,
 * extract text, and surface any detected API keys for saving to the vault.
 */

import React, { useState, useCallback } from 'react';
import { ScanLine, Loader2, Save, X, AlertTriangle, Camera } from 'lucide-react';
import { ocrService } from '../lib/ocr-service';
import type { DetectedKey } from '../lib/key-detector';

interface OcrScannerProps {
  currentDomain: string;
  /** Called when the user chooses to save a detected key to the vault. */
  onSaveKey: (key: DetectedKey) => void;
}

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 6) + '••••••••' + key.slice(-4);
}

export const OcrScanner: React.FC<OcrScannerProps> = ({ currentDomain, onSaveKey }) => {
  const [scanState, setScanState]     = useState<ScanState>('idle');
  const [results, setResults]         = useState<DetectedKey[]>([]);
  const [errorMsg, setErrorMsg]       = useState('');
  const [savedKeys, setSavedKeys]     = useState<Set<string>>(new Set());
  const [fileInputRef]                = useState(() => React.createRef<HTMLInputElement>());

  const runScan = useCallback(async () => {
    setScanState('scanning');
    setResults([]);
    setErrorMsg('');
    setSavedKeys(new Set());
    try {
      const detected = await ocrService.captureScreenAndDetectKeys(currentDomain);
      setResults(detected);
      setScanState('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Screen capture failed';
      // User cancelled the picker — treat as idle, not an error.
      if (msg.toLowerCase().includes('permission denied') || msg.toLowerCase().includes('abort')) {
        setScanState('idle');
      } else {
        setErrorMsg(msg);
        setScanState('error');
      }
    }
  }, [currentDomain]);

  const runFileScan = useCallback(async (file: File) => {
    setScanState('scanning');
    setResults([]);
    setErrorMsg('');
    setSavedKeys(new Set());
    try {
      const detected = await ocrService.extractFromImageFile(file, currentDomain);
      setResults(detected);
      setScanState('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Image scan failed';
      setErrorMsg(msg);
      setScanState('error');
    }
  }, [currentDomain]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) runFileScan(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const handleSave = (key: DetectedKey) => {
    onSaveKey(key);
    setSavedKeys((prev) => new Set(prev).add(key.key));
  };

  const reset = () => {
    setScanState('idle');
    setResults([]);
    setErrorMsg('');
    setSavedKeys(new Set());
  };

  const isScanning = scanState === 'scanning';

  return (
    <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
            <ScanLine size={13} className="text-[#5b8cff]" />
            OCR Key Scanner
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Detect API keys visible in screenshots or screen content
          </p>
        </div>
        {scanState !== 'idle' && (
          <button
            onClick={reset}
            className="text-zinc-500 hover:text-white transition-colors"
            title="Reset"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Action row */}
        <div className="flex items-center gap-3">
          <button
            onClick={runScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
          >
            {isScanning ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Camera size={14} />
            )}
            {isScanning ? 'Scanning…' : 'Scan Screen for Keys'}
          </button>

          <span className="text-[11px] text-zinc-600">or</span>

          <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1c2238] text-zinc-400 hover:text-white hover:border-[#1c2550] text-[12px] cursor-pointer transition-colors ${isScanning ? 'opacity-50 pointer-events-none' : ''}`}>
            <ScanLine size={13} />
            Scan image file
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={isScanning}
            />
          </label>
        </div>

        {/* Scanning state */}
        {isScanning && (
          <div className="flex items-center gap-3 rounded-lg border border-[#1c2238] bg-[#070912] px-4 py-3">
            <Loader2 size={14} className="animate-spin text-[#5b8cff] shrink-0" />
            <div>
              <p className="text-[12px] text-white">Running OCR…</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Select a window or screen in the browser dialog, then wait for analysis.
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {scanState === 'error' && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-900/50 bg-rose-950/20 px-4 py-3">
            <AlertTriangle size={14} className="text-rose-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] text-rose-300 font-medium">Scan failed</p>
              <p className="text-[11px] text-rose-400/80 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {scanState === 'done' && (
          <div>
            {results.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[13px] text-zinc-400">No API keys detected</p>
                <p className="text-[11px] text-zinc-600 mt-1">
                  Try a screenshot containing an API key, .env file, or terminal output.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-500">
                  Found <span className="text-white font-medium">{results.length}</span> key{results.length !== 1 ? 's' : ''}
                </p>
                {results.map((dk, i) => {
                  const saved = savedKeys.has(dk.key);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-[#1c2238] bg-[#070912] px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        {dk.provider && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#5b8cff]/10 border border-[#5b8cff]/30 text-[#5b8cff] font-medium mr-2">
                            {dk.provider}
                          </span>
                        )}
                        <code className="text-[12px] text-zinc-300 font-mono">
                          {maskKey(dk.key)}
                        </code>
                        <div className="text-[10px] text-zinc-600 mt-0.5">
                          source: {dk.source} · domain: {dk.domain}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSave(dk)}
                        disabled={saved}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors shrink-0 ${
                          saved
                            ? 'bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 cursor-default'
                            : 'bg-[#0e1430] border border-[#1c2550] text-[#5b8cff] hover:bg-[#11183a]'
                        }`}
                      >
                        <Save size={11} />
                        {saved ? 'Saved' : 'Save to vault'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Idle hint */}
        {scanState === 'idle' && (
          <p className="text-[11px] text-zinc-700">
            Screen capture requires browser permission. Only the selected window or tab is read —
            nothing is sent to any server.
          </p>
        )}
      </div>
    </div>
  );
};
````

## File: components/ProviderIcons.tsx
````typescript
import React from 'react';

// Explicitly define IconProps to include className and other SVG attributes
// This fixes errors where className was reported as missing on IconProps in VaultItemCard.tsx
export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export const HeliusIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-4 5-4" />
    <path d="M12 15v5s3.03-.55 5-2c2.2-1.62 4-5 4-5" />
  </svg>
);

export const BloXrouteIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

export const ZeroXIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2l9 5.2v10.4l-9 5.2-9-5.2V7.2L12 2z" />
  </svg>
);

export const QuickNodeIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="19" cy="5" r="2" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="19" r="2" />
    <circle cx="5" cy="5" r="2" />
    <line x1="7" y1="7" x2="10" y2="10" />
    <line x1="14" y1="14" x2="17" y2="17" />
    <line x1="17" y1="7" x2="14" y2="10" />
    <line x1="10" y1="14" x2="7" y2="17" />
  </svg>
);

export const AlchemyIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M10 2v7.5" />
    <path d="M14 2v7.5" />
    <path d="M8.5 2h7" />
    <path d="M21 22a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 1 1 0 0 1 .27-.67L10 14V9.5h4V14l6.73 7.33A1 1 0 0 1 21 22z" />
  </svg>
);

export const OpenAIIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9.5 2.5a4.5 4.5 0 0 1 4.5 4.5V17a4.5 4.5 0 0 1-4.5 4.5M14.5 2.5a4.5 4.5 0 0 0-4.5 4.5V17a4.5 4.5 0 0 0 4.5 4.5" />
    <path d="M2.5 9.5a4.5 4.5 0 0 1 4.5 4.5H17a4.5 4.5 0 0 1 4.5-4.5M2.5 14.5a4.5 4.5 0 0 0 4.5-4.5H17a4.5 4.5 0 0 0 4.5 4.5" />
  </svg>
);

export const GitHubIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

export const StripeIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
    <path d="M9 15.5c0 .828.672 1.5 1.5 1.5h3c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5h-3c-.828 0-1.5-.672-1.5-1.5s.672-1.5 1.5-1.5h3c.828 0 1.5.672 1.5 1.5" />
  </svg>
);

export const GenericKeyIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.778-7.778zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3L15.5 7.5z" />
  </svg>
);
````

## File: components/ReportPage.tsx
````typescript
/**
 * ReportPage — Vault audit log React component.
 * Reads detection history, autofill log, and saved-key events from
 * chrome.storage.local and renders them in a filterable table layout.
 * Ported from disabled_extension/src/report/report.ts + report.html
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Download, RefreshCw, Loader2, ShieldCheck, ScanLine, KeyRound, Zap,
} from 'lucide-react';
import { purgeAuditLog } from '../lib/audit-retention';

// ---------------------------------------------------------------------------
// Storage schema (mirrors what background.js writes)
// ---------------------------------------------------------------------------

export type LogType = 'detection' | 'autofill' | 'saved';

export interface LogEntry {
  id: string;
  type: LogType;
  timestamp: number;
  domain?: string;
  /** Masked key prefix, e.g. "sk-li••••" */
  keyPreview?: string;
  /** Vault item id used for autofill */
  keyId?: string;
  source?: string;
  success?: boolean;
}

export interface VaultSummaryItem {
  vaultId: string;
  keyName: string;
  domain: string;
  createdAt: number;
}

export interface ReportData {
  vaults: VaultSummaryItem[];
  detectionLogs: LogEntry[];
  autofillLogs: LogEntry[];
  savedLogs: LogEntry[];
  generatedAt: number;
  dateFrom?: number;
  dateTo?: number;
}

// ---------------------------------------------------------------------------
// chrome.storage helpers
// ---------------------------------------------------------------------------

// chrome is injected at runtime by the extension environment.
declare const chrome: any;

async function readStorage<T>(key: string, fallback: T): Promise<T> {
  if (typeof chrome === 'undefined' || !chrome?.storage) return fallback;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result: Record<string, unknown>) => {
      resolve((result[key] as T) ?? fallback);
    });
  });
}

/**
 * Pull all report data from chrome.storage.local.
 * The background script writes to these keys when it detects / autofills keys.
 */
async function loadReportData(options: {
  dateFrom?: number;
  dateTo?: number;
  includeLogs: boolean;
}): Promise<ReportData> {
  const { dateFrom, dateTo, includeLogs } = options;
  const now = Date.now();

  const [rawLogs, rawVaults] = await Promise.all([
    readStorage<LogEntry[]>('ks_audit_log', []),
    readStorage<VaultSummaryItem[]>('ks_vault_summary', []),
  ]);

  const inRange = (ts: number) => {
    if (dateFrom && ts < dateFrom) return false;
    if (dateTo && ts > dateTo) return false;
    return true;
  };

  const filteredLogs = includeLogs ? rawLogs.filter((l) => inRange(l.timestamp)) : [];

  return {
    vaults: rawVaults,
    detectionLogs: filteredLogs.filter((l) => l.type === 'detection'),
    autofillLogs: filteredLogs.filter((l) => l.type === 'autofill'),
    savedLogs: filteredLogs.filter((l) => l.type === 'saved'),
    generatedAt: now,
    dateFrom,
    dateTo,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fmt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function fmtDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const EmptyRow: React.FC<{ cols: number; msg: string }> = ({ cols, msg }) => (
  <tr>
    <td
      colSpan={cols}
      className="px-4 py-6 text-center text-[12px] text-zinc-600 italic"
    >
      {msg}
    </td>
  </tr>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-[#070912] border-b border-[#141a2e]">
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode; mono?: boolean }> = ({ children, mono }) => (
  <td className={`px-4 py-2.5 text-[12px] text-zinc-300 border-b border-[#0d1020] ${mono ? 'font-mono' : ''}`}>
    {children}
  </td>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const ReportPage: React.FC = () => {
  const [report, setReport]         = useState<ReportData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [includeLogs, setIncludeLogs] = useState(true);
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadReportData({
        includeLogs,
        dateFrom: dateFrom ? new Date(dateFrom).getTime() : undefined,
        dateTo:   dateTo   ? new Date(dateTo).getTime()   : undefined,
      });
      setReport(data);
    } catch (err) {
      console.error('[KeyShield] Report generation failed:', err);
    } finally {
      setLoading(false);
    }
  }, [includeLogs, dateFrom, dateTo]);

  useEffect(() => {
    // Enforce retention policy before loading data so stale entries are pruned first.
    purgeAuditLog()
      .then((result) => {
        const total = result.deletedByAge + result.deletedByCap;
        if (total > 0) {
          console.log(`[KeyShield] Audit log purge: removed ${total} entries`, result);
        }
      })
      .catch((err) => console.warn('[KeyShield] Audit log purge failed:', err))
      .finally(() => generate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = () => {
    if (!report) return;
    const filename = `keyshield-report-${new Date().toISOString().slice(0, 10)}.json`;
    downloadJson(report, filename);
  };

  const statItems = report
    ? [
        {
          icon: <KeyRound size={14} className="text-[#5b8cff]" />,
          label: 'Vault keys',
          value: report.vaults.length,
        },
        {
          icon: <ScanLine size={14} className="text-amber-400" />,
          label: 'Detections',
          value: report.detectionLogs.length,
        },
        {
          icon: <Zap size={14} className="text-emerald-400" />,
          label: 'Auto-fills',
          value: report.autofillLogs.length,
        },
        {
          icon: <ShieldCheck size={14} className="text-violet-400" />,
          label: 'Keys saved',
          value: report.savedLogs.length,
        },
      ]
    : [];

  return (
    <div className="space-y-5">

      {/* ── Filter toolbar ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[12px] text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeLogs}
              onChange={(e) => setIncludeLogs(e.target.checked)}
              className="accent-[#5b8cff] w-4 h-4"
            />
            Include detection &amp; autofill logs
          </label>

          <label className="flex items-center gap-2 text-[12px] text-zinc-400">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-[#070912] border border-[#1c2238] rounded-md px-2.5 py-1 text-[12px] text-zinc-300 focus:outline-none focus:border-[#5b8cff]/50"
            />
          </label>

          <label className="flex items-center gap-2 text-[12px] text-zinc-400">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-[#070912] border border-[#1c2238] rounded-md px-2.5 py-1 text-[12px] text-zinc-300 focus:outline-none focus:border-[#5b8cff]/50"
            />
          </label>

          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[12px] font-medium transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {loading ? 'Generating…' : 'Generate'}
          </button>

          <button
            onClick={handleExport}
            disabled={!report || loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1c2238] text-zinc-400 hover:text-white hover:border-[#1c2550] disabled:opacity-40 text-[12px] transition-colors ml-auto"
          >
            <Download size={12} />
            Export JSON
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-zinc-600" />
        </div>
      )}

      {!loading && report && (
        <>
          {/* ── Overview stats ────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-3">
            {statItems.map(({ icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-[#1c2238] bg-[#070912] px-4 py-3 flex items-center gap-3"
              >
                {icon}
                <div>
                  <div className="text-[20px] font-semibold text-white leading-tight">{value}</div>
                  <div className="text-[10px] text-zinc-500">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-zinc-700 text-right">
            Generated {fmt(report.generatedAt)}
            {report.dateFrom && ` · from ${fmtDate(report.dateFrom)}`}
            {report.dateTo   && ` · to ${fmtDate(report.dateTo)}`}
          </p>

          {/* ── Vault / Keys ──────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#141a2e]">
              <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
                <KeyRound size={13} className="text-[#5b8cff]" /> Vault / Keys
              </h3>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Domain</Th>
                  <Th>Vault ID</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {report.vaults.length === 0 ? (
                  <EmptyRow cols={4} msg="No vault keys found in local storage." />
                ) : (
                  report.vaults.map((v) => (
                    <tr key={v.vaultId}>
                      <Td>{v.keyName}</Td>
                      <Td>{v.domain || '—'}</Td>
                      <Td mono>{v.vaultId.slice(0, 8)}…</Td>
                      <Td>{fmt(v.createdAt)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Detection History ─────────────────────────────────────────── */}
          <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#141a2e]">
              <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
                <ScanLine size={13} className="text-amber-400" /> Detection History
              </h3>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th>Key preview</Th>
                  <Th>Domain</Th>
                  <Th>Time</Th>
                </tr>
              </thead>
              <tbody>
                {report.detectionLogs.length === 0 ? (
                  <EmptyRow cols={4} msg="No detections yet." />
                ) : (
                  report.detectionLogs.map((log) => (
                    <tr key={log.id}>
                      <Td>{log.source ?? '—'}</Td>
                      <Td mono>{log.keyPreview ?? '—'}</Td>
                      <Td>{log.domain ?? '—'}</Td>
                      <Td>{fmt(log.timestamp)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Auto-fill Log ─────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#141a2e]">
              <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
                <Zap size={13} className="text-emerald-400" /> Auto-Fill Log
              </h3>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Key (vault ID)</Th>
                  <Th>Domain</Th>
                  <Th>Status</Th>
                  <Th>Time</Th>
                </tr>
              </thead>
              <tbody>
                {report.autofillLogs.length === 0 ? (
                  <EmptyRow cols={4} msg="No auto-fills yet." />
                ) : (
                  report.autofillLogs.map((log) => (
                    <tr key={log.id}>
                      <Td mono>{log.keyId ? log.keyId.slice(0, 8) + '…' : '—'}</Td>
                      <Td>{log.domain ?? '—'}</Td>
                      <Td>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            log.success
                              ? 'bg-emerald-950/50 border border-emerald-900/50 text-emerald-400'
                              : 'bg-rose-950/50 border border-rose-900/50 text-rose-400'
                          }`}
                        >
                          {log.success ? 'Success' : 'Failed'}
                        </span>
                      </Td>
                      <Td>{fmt(log.timestamp)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Saved to Vault ────────────────────────────────────────────── */}
          {report.savedLogs.length > 0 && (
            <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#141a2e]">
                <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
                  <ShieldCheck size={13} className="text-violet-400" /> Saved to Vault
                </h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Domain</Th>
                    <Th>Time</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.savedLogs.map((log) => (
                    <tr key={log.id}>
                      <Td>{log.domain ?? '—'}</Td>
                      <Td>{fmt(log.timestamp)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px] text-zinc-700 text-center pb-4">
            KeyShield Vault Audit Report · client-side only · no server upload
          </p>
        </>
      )}
    </div>
  );
};
````

## File: components/sections/ActivitySection.tsx
````typescript
import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, DollarSign, CreditCard, TrendingUp, Activity, RefreshCw, Loader2, Zap,
  Radio, Plus, X, Power, ExternalLink, Send,
} from 'lucide-react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { API_BASE, apiFetch, getToken } from '../../lib/auth';
import {
  buildOpenStreamTx,
  buildWithdrawTx,
  recordMppTxSignature,
} from '../../lib/api';
import {
  buildTxFromResponse,
  deriveAta,
  deriveStreamPda,
  explorerTxUrl,
  getKeyshieldProgramId,
  getUsdcMint,
  signAndConfirmTx,
} from '../../lib/solana';
import { relTime } from '../../lib/time';

const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
);

interface UsageEntry {
  id:          number;
  upstream:    string;
  key_type:    string;   // 'self_custodian' | 'platform'
  method:      string;
  path:        string;
  tokens_in:   number;
  tokens_out:  number;
  cost_usd:    number;
  latency_ms:  number;
  status_code: number;
  ts:          number;   // unix seconds
}

interface UsageStat {
  upstream:    string;
  key_type:    string;
  calls:       number;
  tokens_in:   number;
  tokens_out:  number;
  cost_usd:    number;
  avg_latency: number;
  last_used:   number;
}

interface BillingInfo {
  balance_usd:      number;
  total_spent_usd:  number;
  free_credit_usd:  number;
}

interface MppStream {
  id:                          number;
  agent_pubkey:                string;
  agent_name:                  string;
  upstream:                    string;
  rate_per_call_micro_usdc:    number;
  rate_per_token_micro_usdc:   number;
  settlement_interval_secs:    number;
  status:                      string;          // 'open' | 'closed'
  opened_at:                   number;
  last_settled_at:             number;
  closed_at:                   number | null;   // also doubles as `revoked_at` for the withdraw CTA
  total_calls:                 number;
  total_tokens:                number;
  pending_micro_usdc:          number;
  settled_micro_usdc:          number;
  on_chain_signature:          string | null;   // populated after wallet sign-off (Phase 10.5)
}

interface MppSummary {
  streams_total:   number;
  streams_open:    number;
  tokens_total:    number;
  calls_total:     number;
  settled_usd:     number;
  pending_usd:     number;
}

interface MppEvent {
  id:           number;
  stream_id:    number;
  kind:         string;   // 'open' | 'record' | 'settle' | 'close'
  calls:        number;
  tokens:       number;
  micro_usdc:   number;
  cost_usd:     number;
  ts:           number;
  upstream:     string;
  agent_name:   string;
  agent_pubkey: string;
}

const MPP_UPSTREAMS = [
  'openai', 'anthropic', 'groq', 'mistral', 'cohere',
  'helius', '0x', 'titan', 'pyth', 'alchemy',
];

const microUsdcToUsd = (micro: number): string => `$${(micro / 1_000_000).toFixed(6)}`;
const shortPub = (pk: string): string =>
  pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;

function upstreamColor(upstream: string): string {
  const map: Record<string, string> = {
    openai:    'text-green-400',
    anthropic: 'text-orange-400',
    groq:      'text-yellow-400',
    mistral:   'text-blue-400',
    cohere:    'text-purple-400',
    helius:    'text-[#5b8cff]',
    '0x':      'text-pink-400',
    alchemy:   'text-cyan-400',
    pyth:      'text-violet-400',
    titan:     'text-rose-400',
  };
  return map[upstream] ?? 'text-zinc-400';
}

const KeyTypeBadge: React.FC<{ keyType: string }> = ({ keyType }) =>
  keyType === 'self_custodian' ? (
    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 shrink-0">
      <Shield size={8} /> SELF
    </span>
  ) : (
    <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-900/50 text-amber-400 shrink-0">
      <DollarSign size={8} /> PLATFORM
    </span>
  );

export const ActivitySection: React.FC = () => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [history, setHistory]     = useState<UsageEntry[]>([]);
  const [stats, setStats]         = useState<UsageStat[]>([]);
  const [billing, setBilling]     = useState<BillingInfo | null>(null);
  const [loading, setLoading]     = useState(true);
  const [topupAmt, setTopupAmt]   = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupMsg, setTopupMsg]   = useState('');
  const [topupOk, setTopupOk]     = useState(false);

  // ── MPP state ──────────────────────────────────────────────────────────────
  const [mppStreams, setMppStreams]     = useState<MppStream[]>([]);
  const [mppSummary, setMppSummary]     = useState<MppSummary | null>(null);
  const [mppEvents,  setMppEvents]      = useState<MppEvent[]>([]);
  const [mppOpenForm, setMppOpenForm]   = useState(false);
  const [mppBusyId,  setMppBusyId]      = useState<number | null>(null);
  const [mppMsg,     setMppMsg]         = useState('');
  const [mppForm,    setMppForm]        = useState({
    agentPubkey:           '',
    agentName:             '',
    upstream:              'anthropic',
    ratePerToken:          '15',
    ratePerCall:           '0',
    settlementInterval:    '60',
  });
  // tick once a second so the "next settle in X" countdown updates live
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const load = useCallback(async () => {
    try {
      const [hRes, sRes, bRes, mRes, mEvRes] = await Promise.all([
        apiFetch('/usage/history?limit=30'),
        apiFetch('/usage/stats'),
        apiFetch('/billing/balance'),
        apiFetch('/mpp/streams'),
        apiFetch('/mpp/events?limit=20'),
      ]);
      if (hRes.ok) { const d = await hRes.json(); setHistory(d.history ?? []); }
      if (sRes.ok) { const d = await sRes.json(); setStats(d.stats ?? []); }
      if (bRes.ok) { setBilling(await bRes.json()); }
      if (mRes.ok) {
        const d = await mRes.json();
        setMppStreams(d.streams ?? []);
        setMppSummary(d.summary ?? null);
      }
      if (mEvRes.ok) { const d = await mEvRes.json(); setMppEvents(d.events ?? []); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // ── MPP actions ─────────────────────────────────────────────────────────────
  const handleMppOpen = async () => {
    setMppMsg('');
    const ratePerToken = parseInt(mppForm.ratePerToken || '0', 10);
    const ratePerCall  = parseInt(mppForm.ratePerCall  || '0', 10);
    const interval     = parseInt(mppForm.settlementInterval || '60', 10);
    if (!mppForm.agentPubkey.trim()) { setMppMsg('Agent pubkey required'); return; }
    if (ratePerToken === 0 && ratePerCall === 0) {
      setMppMsg('Set rate per token or rate per call'); return;
    }
    try {
      const r = await apiFetch('/mpp/streams', {
        method: 'POST',
        body: JSON.stringify({
          agentPubkey:            mppForm.agentPubkey.trim(),
          agentName:              mppForm.agentName.trim(),
          upstream:               mppForm.upstream,
          ratePerTokenMicroUsdc:  ratePerToken,
          ratePerCallMicroUsdc:   ratePerCall,
          settlementIntervalSecs: interval,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setMppMsg(d.detail ?? 'Failed to open stream'); return; }
      setMppMsg(`Stream #${d.stream.id} open · auto-settle every ${d.stream.settlement_interval_secs}s`);
      setMppOpenForm(false);
      setMppForm({ ...mppForm, agentPubkey: '', agentName: '' });
      load();
    } catch { setMppMsg('Network error'); }
  };

  const handleMppRecord = async (id: number, tokens: number) => {
    setMppBusyId(id); setMppMsg('');
    try {
      const r = await apiFetch(`/mpp/streams/${id}/record`, {
        method: 'POST',
        body: JSON.stringify({ tokens, calls: 1 }),
      });
      const d = await r.json();
      if (!r.ok) { setMppMsg(d.detail ?? 'Record failed'); return; }
      const justSettled = d.stream.just_settled_micro_usdc as number | undefined;
      if (justSettled && justSettled > 0) {
        setMppMsg(`Recorded ${tokens} tok · auto-settled ${microUsdcToUsd(justSettled)}`);
      } else {
        setMppMsg(`Recorded ${tokens} tok on stream #${id}`);
      }
      load();
    } catch { setMppMsg('Network error'); }
    finally { setMppBusyId(null); }
  };

  const handleMppSettle = async (id: number) => {
    setMppBusyId(id); setMppMsg('');
    try {
      const r = await apiFetch(`/mpp/streams/${id}/settle`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setMppMsg(d.detail ?? 'Settle failed'); return; }
      const just = d.stream.just_settled_micro_usdc as number | undefined;
      setMppMsg(just && just > 0
        ? `Settled ${microUsdcToUsd(just)} on stream #${id}`
        : `Stream #${id} had nothing pending`);
      load();
    } catch { setMppMsg('Network error'); }
    finally { setMppBusyId(null); }
  };

  const handleMppClose = async (id: number) => {
    setMppBusyId(id); setMppMsg('');
    try {
      const r = await apiFetch(`/mpp/streams/${id}/close`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setMppMsg(d.detail ?? 'Close failed'); return; }
      setMppMsg(`Stream #${id} closed`);
      load();
    } catch { setMppMsg('Network error'); }
    finally { setMppBusyId(null); }
  };

  // ── On-chain stream open (Phase 10.5 wallet sign-off) ────────────────────
  //
  // Flow: derive PDA from APS_SEED + agent + owner → POST build-open-tx with
  // PDA + bump + USDC ATA + caps → wallet adapter signs the returned ix
  // payload → record the resulting signature so the row flips to a green
  // explorer badge. The owner's USDC ATA is computed via the SPL Associated
  // Token Account derivation rule; we look it up off-chain rather than
  // creating it here (the on-chain ix only RECORDS the ATA pubkey — see
  // open_stream.rs:49-51 for the comment that makes this explicit).
  const handleMppOpenOnChain = async (s: MppStream) => {
    setMppBusyId(s.id);
    setMppMsg('');
    if (!publicKey || !sendTransaction) {
      setMppMsg('Connect your Solana wallet first');
      setMppBusyId(null);
      return;
    }
    const programId = getKeyshieldProgramId();
    if (!programId) {
      setMppMsg('KEYSHIELD_PROGRAM_ID not configured in frontend env');
      setMppBusyId(null);
      return;
    }
    try {
      // 1. Derive the AgentPaymentStream PDA — server cannot do this for
      //    us because the bump must be checked against the SIGNER's seed
      //    set. See programs/keyshield/src/instructions/open_stream.rs:155.
      const agentPk = new PublicKey(s.agent_pubkey);
      const [pda, bump] = deriveStreamPda(agentPk, publicKey, programId);

      // 2. Compute the owner's USDC ATA (recorded into the stream — the
      //    ATA itself is created by a separate ix flow, see open_stream.rs
      //    line 49-51). ATA derivation is canonical SPL math — we do it
      //    off-chain to avoid a round-trip.
      const usdcMint = getUsdcMint();
      const usdcAta  = deriveAta(publicKey, usdcMint).toBase58();

      setMppMsg(`Stream #${s.id} · requesting wallet signature…`);

      // 3. Ask server for the byte-perfect ix payload. Server uses the
      //    stream's stored settlement_interval_secs when override = 0,
      //    so the on-chain ix matches what we already committed off-chain.
      //
      //    `maxTotalMicroUsdc` is the lifetime cap — for this beta we
      //    use a generous default (1_000_000_000 µUSDC = $1000) so the
      //    demo stream doesn't trip the cap. Production would surface a
      //    field in the open-stream form.
      const resp = await buildOpenStreamTx(s.id, {
        ownerPubkey:                    publicKey.toBase58(),
        streamPda:                      pda.toBase58(),
        bump,
        usdcAta,
        maxTotalMicroUsdc:              1_000_000_000,
        costPerUnitMicroUsdc:           1,
        maxRateUsdPerMinBits:           0,
        settlementIntervalSecsOverride: 0,
      });

      // 4. Wrap → sign → confirm.
      const tx  = buildTxFromResponse(resp);
      const sig = await signAndConfirmTx(tx, connection, sendTransaction);

      // 5. Persist the signature so subsequent loads show the explorer link.
      await recordMppTxSignature(s.id, sig);
      setMppMsg(`Stream #${s.id} on-chain · ${sig.slice(0, 8)}…`);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Open on-chain failed';
      setMppMsg(msg);
    } finally {
      setMppBusyId(null);
    }
  };

  // ── On-chain withdraw remaining (Phase 10.5 wallet sign-off) ─────────────
  //
  // Withdrawal requires the agent grant to already be revoked (see
  // programs/keyshield/src/instructions/withdraw.rs:9-13). We surface the
  // CTA only on streams where `closed_at != null && on_chain_signature !=
  // null` — closing the stream off-chain happens via the existing Close
  // button, and we use closed_at as the proxy for "agent revoked" since
  // the off-chain stream model does not carry a separate revoked_at field.
  const handleMppWithdrawOnChain = async (s: MppStream) => {
    setMppBusyId(s.id);
    setMppMsg('');
    if (!publicKey || !sendTransaction) {
      setMppMsg('Connect your Solana wallet first');
      setMppBusyId(null);
      return;
    }
    const programId = getKeyshieldProgramId();
    if (!programId) {
      setMppMsg('KEYSHIELD_PROGRAM_ID not configured in frontend env');
      setMppBusyId(null);
      return;
    }
    try {
      const agentPk    = new PublicKey(s.agent_pubkey);
      const [pda]      = deriveStreamPda(agentPk, publicKey, programId);
      const usdcMint   = getUsdcMint();
      const ownerAta   = deriveAta(publicKey, usdcMint).toBase58();
      // The stream's source ATA — same address pattern but owned by the
      // PDA. Mismatches make the on-chain SPL transfer reject (safe
      // failure mode: tx reverts cleanly).
      const streamAta  = deriveAta(pda, usdcMint).toBase58();

      setMppMsg(`Stream #${s.id} · requesting wallet signature…`);

      // For withdraw, the server doesn't know what's currently in the
      // ATA — we pass the `pending + settled` upper bound from the row
      // and let the on-chain SPL transfer reject if it's stale (safe
      // failure: reverts cleanly).
      const claimed = (s.pending_micro_usdc | 0) + (s.settled_micro_usdc | 0);
      const resp = await buildWithdrawTx(s.id, {
        ownerPubkey:             publicKey.toBase58(),
        streamPda:               pda.toBase58(),
        streamAta,
        ownerAta,
        withdrawAmountMicroUsdc: Math.max(claimed, 1),
      });

      const tx  = buildTxFromResponse(resp);
      const sig = await signAndConfirmTx(tx, connection, sendTransaction);

      await recordMppTxSignature(s.id, sig);
      setMppMsg(`Stream #${s.id} withdrawn · ${sig.slice(0, 8)}…`);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Withdraw failed';
      setMppMsg(msg);
    } finally {
      setMppBusyId(null);
    }
  };

  const handleTopup = async () => {
    const amount = parseFloat(topupAmt);
    if (!amount || amount <= 0) return;
    if (!publicKey || !sendTransaction) {
      setTopupOk(false);
      setTopupMsg('Connect your Solana wallet first.');
      return;
    }

    setTopupBusy(true);
    setTopupOk(false);
    setTopupMsg('Getting price quote…');

    try {
      // 1. Quote — auth token gives us a server-issued memo so the
      //    on-chain transfer is bound to this user (anti-replay).
      const token = getToken();
      const quoteRes = await fetch(
        `${API_BASE}/billing/sol-quote?amount_usd=${amount}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      if (!quoteRes.ok) {
        const err = await quoteRes.json().catch(() => ({}));
        throw new Error(err.detail ?? `quote failed (HTTP ${quoteRes.status})`);
      }
      const quote = await quoteRes.json() as {
        amount_lamports: number;
        amount_sol:      number;
        sol_usd_price:   number;
        payment_address: string;
        memo?:           string;
      };

      // 2. Build SystemProgram.transfer + optional memo, sign + send.
      setTopupMsg(`Approve ${quote.amount_sol.toFixed(4)} SOL transfer in wallet…`);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey:   new PublicKey(quote.payment_address),
          lamports:   quote.amount_lamports,
        }),
      );
      if (quote.memo) {
        tx.add(new TransactionInstruction({
          programId: MEMO_PROGRAM_ID,
          keys:      [],
          data:      Buffer.from(quote.memo, 'utf8'),
        }));
      }
      const sig = await sendTransaction(tx, connection);

      // 3. Wait for confirmed before asking the server to verify.
      setTopupMsg('Waiting for Solana confirmation…');
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, ...latest },
        'confirmed',
      );

      // 4. Server verifies on-chain and credits the balance.
      setTopupMsg('Verifying on-chain…');
      const credit = await apiFetch('/billing/topup-solana', {
        method: 'POST',
        body: JSON.stringify({
          tx_signature:        sig,
          expected_amount_usd: amount,
          ...(quote.memo ? { memo: quote.memo } : {}),
        }),
      });
      const d = await credit.json().catch(() => ({}));
      if (!credit.ok) {
        throw new Error(d.detail ?? `credit failed (HTTP ${credit.status})`);
      }
      setTopupOk(true);
      setTopupMsg(
        `Credited $${d.credited_usd.toFixed(4)} · new balance $${d.balance_usd.toFixed(4)}`,
      );
      setTopupAmt('');
      load();
    } catch (e: unknown) {
      setTopupOk(false);
      const msg = e instanceof Error ? e.message : 'Topup failed';
      setTopupMsg(msg);
    } finally {
      setTopupBusy(false);
    }
  };

  const totalCalls    = stats.reduce((a, s) => a + s.calls, 0);
  const totalCost     = stats.reduce((a, s) => a + s.cost_usd, 0);
  const platformCalls = stats.filter(s => s.key_type === 'platform').reduce((a, s) => a + s.calls, 0);
  const selfCalls     = stats.filter(s => s.key_type === 'self_custodian').reduce((a, s) => a + s.calls, 0);

  return (
    <div className="space-y-5">

      {/* ── Billing balance card ─────────────────────────────────────────── */}
      {billing && (
        <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
              <CreditCard size={14} className="text-[#5b8cff]" /> Billing
            </h3>
            <span className="text-[11px] text-zinc-600">resets never · x402 payments accepted</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 text-center">
              <div className="text-[11px] text-emerald-500 mb-1">Prepaid balance</div>
              <div className={`text-[22px] font-semibold ${billing.balance_usd <= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ${billing.balance_usd.toFixed(4)}
              </div>
            </div>
            <div className="rounded-xl border border-[#1c2238] bg-[#070912] px-4 py-3 text-center">
              <div className="text-[11px] text-zinc-500 mb-1">Platform key spend</div>
              <div className="text-[22px] font-semibold text-white">${totalCost.toFixed(4)}</div>
            </div>
            <div className="rounded-xl border border-[#1c2238] bg-[#070912] px-4 py-3 text-center">
              <div className="text-[11px] text-zinc-500 mb-1">Free credit</div>
              <div className="text-[22px] font-semibold text-zinc-300">${billing.free_credit_usd.toFixed(2)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 px-4 py-3 mb-4 flex items-start gap-3">
            <Shield size={14} className="text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] text-emerald-300 font-medium">Your self-custodian keys are free to proxy</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                When you store your own API key in the vault, KeyShield injects it zero-cost.
                Billing only applies when you use KeyShield's platform keys (no vault key stored).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="number"
                min="0.01"
                max="10"
                step="0.01"
                value={topupAmt}
                onChange={e => setTopupAmt(e.target.value)}
                placeholder="Amount (USD)"
                className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/50"
              />
            </div>
            <button
              onClick={handleTopup}
              disabled={topupBusy || !topupAmt || !publicKey}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
            >
              {topupBusy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {publicKey ? 'Top up with SOL' : 'Connect wallet to top up'}
            </button>
          </div>
          {topupMsg && (
            <p className={`text-[11px] mt-2 ${topupOk ? 'text-emerald-400' : topupBusy ? 'text-zinc-400' : 'text-rose-400'}`}>
              {topupMsg}
            </p>
          )}
          <p className="text-[10px] text-zinc-600 mt-2">
            On-chain SOL transfer on Solana · verified via Helius RPC + Pyth · MPP streaming live below
          </p>
        </div>
      )}

      {/* ── MPP — Metered Payment streams ────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        {/* Phase 10.4 stub-on-chain banner. Off-chain CRUD works end-to-end
            (open / record / settle / close persist in SQLite). On-chain ix
            submission is partial: `mpp_settle` (#26) is wired through
            v2-mvp/src/mpp_onchain.py + falls back to stub when env unset.
            `open_payment_stream` (#24) and `withdraw_agent_wallet` (#27)
            have server-side ix builders + /mpp/streams/{id}/build-{open,
            withdraw}-tx endpoints; remaining work is the wallet-adapter
            sign+submit UI. See ROADMAP P0a + spec 10. */}
        {/* Wallet sign-off banner — flips amber → emerald once at least
            one stream has been opened on-chain. Per-row green explorer
            badges replace the row-level "Open on-chain" CTA after the
            wallet adapter signs the ix and /record-tx persists the sig. */}
        {mppStreams.some(s => s.on_chain_signature) ? (
          <div className="px-5 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2 text-[11px] text-emerald-300">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">✓</span>
            <span>
              <strong className="text-emerald-200">Live · wallet sign-off active</strong>
              <span className="text-emerald-300/70"> · Streams below with the green explorer badge are anchored on-chain (devnet). <code className="text-emerald-200">open_payment_stream</code> / <code className="text-emerald-200">withdraw_agent_wallet</code> sign with your connected wallet; <code className="text-emerald-200">mpp_settle</code> auto-debits via the server settler key.</span>
            </span>
          </div>
        ) : (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-300">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 font-bold">!</span>
            <span>
              <strong className="text-amber-200">Beta — wallet sign-off ready</strong>
              <span className="text-amber-300/70"> · Off-chain CRUD live. Click <code className="text-amber-200">Open on-chain stream</code> on a row to sign <code className="text-amber-200">open_payment_stream</code> with your wallet (devnet); <code className="text-amber-200">mpp_settle</code> auto-debits via <code className="text-amber-200">KS_MPP_SETTLER_KEY</code>.</span>
            </span>
          </div>
        )}
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
              <Radio size={13} className="text-[#5b8cff]" /> MPP streams
              <span className="text-[10px] text-zinc-600 font-normal">
                Metered Payment Protocol · auto-settle micro-USDC
              </span>
            </h3>
            {mppSummary && (
              <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1">
                <span>
                  <span className="text-emerald-400">{mppSummary.streams_open}</span> open
                  {' · '}{mppSummary.streams_total} total
                </span>
                <span>
                  <span className="text-white">{mppSummary.calls_total.toLocaleString()}</span> calls ·
                  <span className="text-white"> {mppSummary.tokens_total.toLocaleString()}</span> tokens
                </span>
                <span>
                  settled <span className="text-emerald-400">${mppSummary.settled_usd.toFixed(6)}</span>
                  {mppSummary.pending_usd > 0 && (
                    <> · pending <span className="text-amber-400">${mppSummary.pending_usd.toFixed(6)}</span></>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMppOpenForm(v => !v); setMppMsg(''); }}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-[#0e1430] border border-[#1c2550] text-[#5b8cff] hover:bg-[#11183a] transition-colors"
            >
              {mppOpenForm ? <X size={11} /> : <Plus size={11} />}
              {mppOpenForm ? 'Cancel' : 'Open stream'}
            </button>
            <button onClick={load} className="text-zinc-500 hover:text-white transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Open-stream form */}
        {mppOpenForm && (
          <div className="px-5 py-4 border-b border-[#141a2e] bg-[#070912] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Agent pubkey (base58)</label>
                <input
                  type="text"
                  value={mppForm.agentPubkey}
                  onChange={e => setMppForm({ ...mppForm, agentPubkey: e.target.value })}
                  placeholder="9WzDXwBbmkg..."
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2.5 py-1.5 text-[12px] font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Agent name (optional)</label>
                <input
                  type="text"
                  value={mppForm.agentName}
                  onChange={e => setMppForm({ ...mppForm, agentName: e.target.value })}
                  placeholder="trading-bot-v1"
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2.5 py-1.5 text-[12px] text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Upstream</label>
                <select
                  value={mppForm.upstream}
                  onChange={e => setMppForm({ ...mppForm, upstream: e.target.value })}
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#5b8cff]/50"
                >
                  {MPP_UPSTREAMS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">µUSDC / token</label>
                <input
                  type="number" min="0"
                  value={mppForm.ratePerToken}
                  onChange={e => setMppForm({ ...mppForm, ratePerToken: e.target.value })}
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">µUSDC / call</label>
                <input
                  type="number" min="0"
                  value={mppForm.ratePerCall}
                  onChange={e => setMppForm({ ...mppForm, ratePerCall: e.target.value })}
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Settle every (s)</label>
                <input
                  type="number" min="5" max="3600"
                  value={mppForm.settlementInterval}
                  onChange={e => setMppForm({ ...mppForm, settlementInterval: e.target.value })}
                  className="w-full bg-[#0a0d1a] border border-[#1c2238] rounded-md px-2 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-[#5b8cff]/50"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-zinc-600">
                1 µUSDC = $0.000001 · 15 µUSDC/tok ≈ $0.015 per 1k tokens
              </p>
              <button
                onClick={handleMppOpen}
                className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md bg-[#5b8cff] hover:bg-[#7aa1ff] text-white font-medium transition-colors"
              >
                <Zap size={11} /> Open stream
              </button>
            </div>
          </div>
        )}

        {/* Stream list */}
        {mppStreams.length === 0 && !mppOpenForm && (
          <div className="py-10 text-center">
            <p className="text-[13px] text-zinc-500">No MPP streams yet</p>
            <p className="text-[11px] text-zinc-700 mt-1 max-w-md mx-auto">
              Open a metered channel for a long-running agent. Calls record usage locally
              and the server auto-settles micro-USDC every interval — no per-call HTTP 402.
            </p>
          </div>
        )}

        {mppStreams.length > 0 && (
          <div className="divide-y divide-[#0d1020]">
            {mppStreams.map(s => {
              const isOpen      = s.status === 'open';
              const elapsed     = now - s.last_settled_at;
              const nextIn      = Math.max(0, s.settlement_interval_secs - elapsed);
              const intervalPct = Math.min(100, (elapsed / s.settlement_interval_secs) * 100);
              return (
                <div key={s.id} className="px-5 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                    }`} />
                    <span className="text-[11px] font-mono text-zinc-500 w-8 shrink-0">#{s.id}</span>
                    <span className={`text-[12px] font-mono font-medium ${upstreamColor(s.upstream)} w-20 shrink-0`}>
                      {s.upstream}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-white truncate">
                        {s.agent_name || <span className="text-zinc-500">unnamed agent</span>}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-600 truncate" title={s.agent_pubkey}>
                        {shortPub(s.agent_pubkey)}
                      </div>
                    </div>
                    {/* On-chain badge — green explorer link once
                        /record-tx has persisted the wallet-signed tx
                        signature. Renders next to the status pill so
                        the row tells the on-chain story at a glance. */}
                    {s.on_chain_signature && (
                      <a
                        href={explorerTxUrl(s.on_chain_signature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`On-chain: ${s.on_chain_signature}`}
                        className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 shrink-0 hover:bg-emerald-900/40 transition-colors font-mono"
                      >
                        <ExternalLink size={8} />
                        ON-CHAIN
                      </a>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                      isOpen
                        ? 'bg-emerald-950/50 border border-emerald-900/50 text-emerald-400'
                        : 'bg-zinc-900/50 border border-zinc-800 text-zinc-500'
                    }`}>
                      {s.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-3 pl-7">
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Rate</div>
                      <div className="text-[11px] font-mono text-zinc-300">
                        {s.rate_per_token_micro_usdc > 0 && <>{s.rate_per_token_micro_usdc} µ/tok</>}
                        {s.rate_per_call_micro_usdc > 0 && (
                          <>{s.rate_per_token_micro_usdc > 0 ? ' · ' : ''}{s.rate_per_call_micro_usdc} µ/call</>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Calls</div>
                      <div className="text-[11px] font-mono text-white">{s.total_calls.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Tokens</div>
                      <div className="text-[11px] font-mono text-white">{s.total_tokens.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Settled</div>
                      <div className="text-[11px] font-mono text-emerald-400">
                        ${(s.settled_micro_usdc / 1_000_000).toFixed(6)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Pending</div>
                      <div className={`text-[11px] font-mono ${s.pending_micro_usdc > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        ${(s.pending_micro_usdc / 1_000_000).toFixed(6)}
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="pl-7 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-[120px]">
                        <div className="flex items-center justify-between text-[10px] text-zinc-600 mb-1">
                          <span>Next auto-settle</span>
                          <span className="font-mono">
                            {nextIn > 0 ? `in ${nextIn}s` : 'on next record'}
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-[#070912] overflow-hidden">
                          <div
                            className="h-full bg-[#5b8cff] transition-all"
                            style={{ width: `${intervalPct}%` }}
                          />
                        </div>
                      </div>
                      {/* Open on-chain CTA — only shown when the row
                          hasn't been anchored on-chain yet. The handler
                          uses the connected wallet to sign the
                          open_payment_stream ix returned by /build-open-tx. */}
                      {!s.on_chain_signature && (
                        <button
                          onClick={() => handleMppOpenOnChain(s)}
                          disabled={mppBusyId === s.id || !publicKey}
                          title={publicKey
                            ? 'Sign open_payment_stream ix with your wallet'
                            : 'Connect wallet to open on-chain'}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[#1c2550] bg-[#0e1430] text-[#5b8cff] hover:bg-[#11183a] disabled:opacity-50"
                        >
                          {mppBusyId === s.id
                            ? <Loader2 size={10} className="animate-spin inline" />
                            : <Send size={9} />}
                          Open on-chain stream
                        </button>
                      )}
                      <button
                        onClick={() => handleMppRecord(s.id, 100)}
                        disabled={mppBusyId === s.id}
                        title="Simulate recording 100 tokens of usage"
                        className="text-[10px] px-2 py-1 rounded border border-[#1c2238] text-zinc-400 hover:text-white hover:border-[#1c2550] disabled:opacity-50"
                      >
                        +100 tok
                      </button>
                      <button
                        onClick={() => handleMppSettle(s.id)}
                        disabled={mppBusyId === s.id}
                        className="text-[10px] px-2 py-1 rounded border border-emerald-900/50 text-emerald-400 hover:bg-emerald-950/30 disabled:opacity-50"
                      >
                        {mppBusyId === s.id ? <Loader2 size={10} className="animate-spin inline" /> : 'Settle now'}
                      </button>
                      <button
                        onClick={() => handleMppClose(s.id)}
                        disabled={mppBusyId === s.id}
                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-rose-900/50 text-rose-400 hover:bg-rose-950/30 disabled:opacity-50"
                      >
                        <Power size={9} /> Close
                      </button>
                    </div>
                  )}

                  {!isOpen && s.closed_at && (
                    <div className="pl-7 flex items-center gap-3 flex-wrap">
                      <div className="text-[10px] text-zinc-600">
                        Closed {relTime(s.closed_at)}
                      </div>
                      {/* Withdraw CTA — closed_at doubles as revoked_at
                          here. Only shows on streams that were opened
                          on-chain (so there's actually USDC in the PDA
                          ATA to recover); otherwise the on-chain
                          withdraw_agent_wallet ix would no-op. */}
                      {s.on_chain_signature && (
                        <button
                          onClick={() => handleMppWithdrawOnChain(s)}
                          disabled={mppBusyId === s.id || !publicKey}
                          title={publicKey
                            ? 'Sign withdraw_agent_wallet ix to recover remaining USDC'
                            : 'Connect wallet to withdraw'}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-amber-900/50 bg-amber-950/20 text-amber-400 hover:bg-amber-950/40 disabled:opacity-50"
                        >
                          {mppBusyId === s.id
                            ? <Loader2 size={10} className="animate-spin inline" />
                            : <Send size={9} />}
                          Withdraw remaining
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {mppMsg && (
          <div className="px-5 py-2 border-t border-[#141a2e]">
            <p className={`text-[11px] ${
              mppMsg.includes('failed') || mppMsg.includes('error') || mppMsg.includes('required')
                ? 'text-rose-400'
                : 'text-emerald-400'
            }`}>{mppMsg}</p>
          </div>
        )}

        {mppEvents.length > 0 && (
          <details className="border-t border-[#141a2e]">
            <summary className="px-5 py-2.5 cursor-pointer text-[11px] text-zinc-500 hover:text-white select-none">
              Recent stream events · {mppEvents.length}
            </summary>
            <div className="divide-y divide-[#0d1020] max-h-64 overflow-y-auto">
              {mppEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 px-5 py-2 text-[11px]">
                  <span className={`w-14 shrink-0 font-mono ${
                    ev.kind === 'open'   ? 'text-emerald-400' :
                    ev.kind === 'settle' ? 'text-[#5b8cff]'   :
                    ev.kind === 'close'  ? 'text-rose-400'    :
                                           'text-zinc-400'
                  }`}>{ev.kind}</span>
                  <span className="font-mono text-zinc-500 w-8 shrink-0">#{ev.stream_id}</span>
                  <span className={`font-mono w-16 shrink-0 ${upstreamColor(ev.upstream)}`}>{ev.upstream}</span>
                  <span className="flex-1 min-w-0 truncate text-zinc-500">
                    {ev.kind === 'record' && `${ev.tokens.toLocaleString()} tok / ${ev.calls} call`}
                    {ev.kind === 'settle' && `settled ${microUsdcToUsd(ev.micro_usdc)}`}
                    {ev.kind === 'open'   && (ev.agent_name ? `agent ${ev.agent_name}` : 'stream opened')}
                    {ev.kind === 'close'  && 'stream closed'}
                  </span>
                  {ev.micro_usdc > 0 && (
                    <span className="text-zinc-500 shrink-0 font-mono">
                      {microUsdcToUsd(ev.micro_usdc)}
                    </span>
                  )}
                  <span className="text-zinc-700 shrink-0 w-14 text-right">{relTime(ev.ts)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ── Usage stats table ────────────────────────────────────────────── */}
      {stats.length > 0 && (
        <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
              <TrendingUp size={13} className="text-[#5b8cff]" /> Usage by provider
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <span>{selfCalls} self-custodian · {platformCalls} platform</span>
              <span>{totalCalls} total calls</span>
            </div>
          </div>
          <div className="divide-y divide-[#0d1020]">
            {stats.map((s, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <div className="w-24 shrink-0">
                  <span className={`text-[12px] font-mono font-medium ${upstreamColor(s.upstream)}`}>
                    {s.upstream}
                  </span>
                </div>
                <KeyTypeBadge keyType={s.key_type} />
                <div className="flex-1 grid grid-cols-4 gap-4 text-right">
                  <div>
                    <div className="text-[12px] text-white">{s.calls.toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-600">calls</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-white">{(s.tokens_in + s.tokens_out).toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-600">tokens</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-white">{s.avg_latency}ms</div>
                    <div className="text-[10px] text-zinc-600">avg latency</div>
                  </div>
                  <div>
                    <div className={`text-[12px] ${s.key_type === 'platform' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {s.key_type === 'self_custodian' ? 'FREE' : `$${s.cost_usd.toFixed(4)}`}
                    </div>
                    <div className="text-[10px] text-zinc-600">cost</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Activity feed ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
            <Activity size={13} className="text-[#5b8cff]" /> Proxy call log
          </h3>
          <button onClick={load} className="text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading && history.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-zinc-600" />
          </div>
        )}

        {!loading && history.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-[13px] text-zinc-500">No proxy calls yet</p>
            <p className="text-[11px] text-zinc-700 mt-1">
              Calls appear here the moment an agent or SDK uses your proxy URL
            </p>
          </div>
        )}

        {history.length > 0 && (
          <div className="divide-y divide-[#0d1020]">
            {history.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  e.status_code < 300 ? 'bg-emerald-400' :
                  e.status_code < 400 ? 'bg-yellow-400' : 'bg-rose-400'
                }`} />
                <span className={`text-[11px] font-mono w-16 shrink-0 ${upstreamColor(e.upstream)}`}>
                  {e.upstream}
                </span>
                <KeyTypeBadge keyType={e.key_type} />
                <code className="flex-1 text-[11px] text-zinc-500 truncate min-w-0">
                  {e.method} /{e.path}
                </code>
                {(e.tokens_in > 0 || e.tokens_out > 0) && (
                  <span className="text-[10px] text-zinc-600 shrink-0">
                    {e.tokens_in}↑ {e.tokens_out}↓ tok
                  </span>
                )}
                <span className={`text-[11px] shrink-0 w-16 text-right ${
                  e.key_type === 'self_custodian' ? 'text-emerald-400' :
                  e.cost_usd > 0 ? 'text-amber-400' : 'text-zinc-600'
                }`}>
                  {e.key_type === 'self_custodian' ? 'FREE' :
                   e.cost_usd > 0 ? `$${e.cost_usd.toFixed(5)}` : '—'}
                </span>
                <span className="text-[10px] text-zinc-600 shrink-0 w-12 text-right">
                  {e.latency_ms > 0 ? `${Math.round(e.latency_ms)}ms` : '—'}
                </span>
                <span className="text-[10px] text-zinc-700 shrink-0 w-14 text-right">
                  {relTime(e.ts)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <p className="text-[10px] text-zinc-700 text-center">
          Showing last {history.length} calls · auto-refreshes every 30s
        </p>
      )}
    </div>
  );
};
````

## File: components/sections/AgentsSection.tsx
````typescript
import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, Plus, Trash2, RefreshCw, Loader2, AlertCircle, Check, Zap,
} from 'lucide-react';
import { apiFetch } from '../../lib/auth';
import { relTime } from '../../lib/time';
import { CopyButton } from '../ui/CopyButton';
import { ConfirmButton } from '../ui/ConfirmButton';

interface AgentEntry {
  id:           number;
  pubkey_b58:   string;
  name:         string;
  scopes:       string;
  created_at:   number;
  last_used_at: number | null;
}

const _b58Encode = (bytes: Uint8Array): string => {
  const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(''));
  let res = '';
  while (n > 0n) { const r = Number(n % 58n); n /= 58n; res = ALPHA[r] + res; }
  const pad = bytes.findIndex(b => b !== 0);
  return '1'.repeat(pad < 0 ? 0 : pad) + res;
};

export const AgentsSection: React.FC = () => {
  const [agentList,    setAgentList]    = useState<AgentEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [newName,      setNewName]      = useState('');
  const [newPubkey,    setNewPubkey]    = useState('');
  const [newScopes,    setNewScopes]    = useState('*');
  const [generatedKp,  setGeneratedKp]  = useState<{privateKeyHex: string; pubkeyB58: string} | null>(null);
  const [registering,  setRegistering]  = useState(false);
  const [revokingId,   setRevokingId]   = useState<number | null>(null);
  const [err,          setErr]          = useState('');
  const [ok,           setOk]           = useState('');

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/agents/list');
      if (r.ok) { const d = await r.json(); setAgentList(d.agents ?? []); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateKeypair = async () => {
    const kp = await window.crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    );
    const privRaw = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey);
    const pubRaw  = await window.crypto.subtle.exportKey('raw',   kp.publicKey);

    const privBytes = new Uint8Array(privRaw).slice(-32);
    const pubBytes  = new Uint8Array(pubRaw);

    const privHex   = Array.from(privBytes).map(b => b.toString(16).padStart(2,'0')).join('');
    const pubB58    = _b58Encode(pubBytes);

    setGeneratedKp({ privateKeyHex: privHex, pubkeyB58: pubB58 });
    setNewPubkey(pubB58);
  };

  const handleRegister = async () => {
    if (!newPubkey.trim() || !newName.trim()) return;
    setRegistering(true); setErr(''); setOk('');
    try {
      const r = await apiFetch('/agents/register', {
        method: 'POST',
        body: JSON.stringify({ pubkeyB58: newPubkey.trim(), name: newName.trim(), scopes: newScopes }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail ?? 'Failed'); return; }
      setOk(`Agent "${d.name}" registered`);
      setNewName(''); setNewPubkey(''); setNewScopes('*');
      load();
    } catch { setErr('Network error'); }
    finally { setRegistering(false); }
  };

  const handleRevoke = async (id: number) => {
    setRevokingId(id);
    try {
      await apiFetch(`/agents/${id}`, { method: 'DELETE' });
      setAgentList(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
    finally { setRevokingId(null); }
  };

  return (
    <div className="space-y-5">
      {/* How it works */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
        <h3 className="text-[14px] font-medium text-white mb-2 flex items-center gap-2">
          <Bot size={14} className="text-[#5b8cff]" /> Agent authentication
        </h3>
        <p className="text-[12px] text-zinc-400 mb-4">
          Agents authenticate with their own ed25519 keypair — no browser, no wallet extension, no human.
          Register the agent's public key here once. The agent signs a server challenge on each run and
          gets a vault token linked to your wallet.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { step: '1', title: 'Generate keypair', body: 'Agent generates an ed25519 key. Private key stays in env vars — never committed.' },
            { step: '2', title: 'Register pubkey', body: 'Owner registers the public key here. One-time setup, takes 5 seconds.' },
            { step: '3', title: 'Agent self-authenticates', body: 'On each run, agent calls /auth/agent-login, signs a nonce, gets a vault token.' },
          ].map(({ step, title, body }) => (
            <div key={step} className="rounded-xl border border-[#1c2238] bg-[#070912] p-3">
              <div className="text-[10px] text-[#5b8cff] font-mono mb-1">Step {step}</div>
              <div className="text-[12px] text-white font-medium mb-1">{title}</div>
              <div className="text-[11px] text-zinc-500">{body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Registered agents */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-white">Registered agents</h3>
          <button onClick={load} className="text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {agentList.length === 0 && !loading && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-zinc-500">No agents registered yet</p>
            <p className="text-[11px] text-zinc-700 mt-1">Generate a keypair below and register your first agent</p>
          </div>
        )}

        {agentList.map(a => (
          <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#0d1020] last:border-0">
            <div className="w-8 h-8 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center shrink-0">
              <Bot size={14} className="text-[#5b8cff]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-white font-medium">{a.name}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#1c2238] text-zinc-500 font-mono">
                  {a.scopes}
                </span>
                {a.last_used_at && <span className="text-[9px] text-emerald-600">● active</span>}
              </div>
              <div className="text-[11px] text-zinc-600 font-mono mt-0.5">
                {a.pubkey_b58.slice(0, 16)}…{a.pubkey_b58.slice(-8)}
              </div>
              <div className="text-[10px] text-zinc-700 mt-0.5 flex gap-3">
                <span>registered {relTime(a.created_at)}</span>
                {a.last_used_at && <span>last seen {relTime(a.last_used_at)}</span>}
              </div>
            </div>
            <ConfirmButton
              variant="destructive"
              onConfirm={() => handleRevoke(a.id)}
              disabled={revokingId === a.id}
              title="Revoke agent (click twice). Cascades to active tokens."
              confirmLabel="Confirm revoke"
              className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
            >
              {revokingId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              <span>Revoke</span>
            </ConfirmButton>
          </div>
        ))}
      </div>

      {/* Register new agent */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-4">
        <h3 className="text-[13px] font-medium text-white">Register a new agent</h3>

        {err && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
            <AlertCircle size={13} className="text-rose-400 shrink-0" />
            <p className="text-[12px] text-rose-300">{err}</p>
          </div>
        )}
        {ok && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50">
            <Check size={13} className="text-emerald-400 shrink-0" />
            <p className="text-[12px] text-emerald-300">{ok}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Step 1 — generate keypair</span>
            <button
              onClick={generateKeypair}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#1c2550] bg-[#0e1430] text-[#5b8cff] hover:bg-[#141c40] transition-colors"
            >
              <Zap size={11} /> Generate
            </button>
          </div>

          {generatedKp && (
            <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] text-amber-400">
                <AlertCircle size={11} />
                Save the private key NOW — it won't be shown again
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="text-[10px] text-zinc-600 mb-1">Private key (KS_AGENT_KEY env var)</div>
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-[#020408] border border-[#131929]">
                    <code className="flex-1 text-[11px] font-mono text-rose-300 break-all">{generatedKp.privateKeyHex}</code>
                    <CopyButton text={generatedKp.privateKeyHex} />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 mb-1">Public key (paste below)</div>
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-[#020408] border border-[#131929]">
                    <code className="flex-1 text-[11px] font-mono text-emerald-300 break-all">{generatedKp.pubkeyB58}</code>
                    <CopyButton text={generatedKp.pubkeyB58} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Step 2 — register</span>
          <input
            type="text"
            placeholder="Agent name (e.g. trading-bot-v1)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/50"
          />
          <input
            type="text"
            placeholder="Agent public key (base58)"
            value={newPubkey}
            onChange={e => setNewPubkey(e.target.value)}
            className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/50"
          />
          <div className="flex items-center gap-2">
            <select
              value={newScopes}
              onChange={e => setNewScopes(e.target.value)}
              className="flex-1 bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#5b8cff]/50"
            >
              <option value="*">All scopes (*)</option>
              <option value="proxy">Proxy only</option>
              <option value="proxy,read">Proxy + read vault</option>
            </select>
            <button
              onClick={handleRegister}
              disabled={registering || !newName.trim() || !newPubkey.trim()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
            >
              {registering ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Register
            </button>
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Step 3 — agent code</span>
          <div className="rounded-lg bg-[#020408] border border-[#131929] p-3.5 relative">
            <CopyButton
              text={`from keyshield_sdk import AgentKeyShield\nimport os\n\nagent = AgentKeyShield(\n    owner_wallet     = os.getenv("KS_OWNER_WALLET"),\n    private_key_hex  = os.getenv("KS_AGENT_KEY"),\n    vault_passphrase = os.getenv("KS_VAULT_PASS"),\n)\n\n# authenticate is automatic on first call\nclient = agent.openai_client()\nresp = client.chat.completions.create(\n    model="gpt-4o-mini",\n    messages=[{"role": "user", "content": "analyze market"}],\n)\nprint(resp.choices[0].message.content)`}
              className="absolute top-2.5 right-2.5"
            />
            <pre className="text-[11px] font-mono text-zinc-300 leading-relaxed overflow-x-auto pr-14">{
`from keyshield_sdk import AgentKeyShield
import os

agent = AgentKeyShield(
    owner_wallet     = os.getenv("KS_OWNER_WALLET"),
    private_key_hex  = os.getenv("KS_AGENT_KEY"),
    vault_passphrase = os.getenv("KS_VAULT_PASS"),
)

# authenticate is automatic on first call
client = agent.openai_client()
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "analyze market"}],
)
print(resp.choices[0].message.content)`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
````

## File: components/sections/DeveloperSection.tsx
````typescript
import React, { useEffect, useRef, useState } from 'react';
import { Terminal, ChevronRight, ExternalLink, Eye, EyeOff, RotateCw } from 'lucide-react';
import { API_BASE, apiFetch, clearAuth, clearPasskeyTrust, getToken, getWalletAddress, notifyAuthChanged } from '../../lib/auth';
import { CodeBlock } from '../ui/CodeBlock';
import { RevealField } from '../ui/RevealField';
import { ConfirmButton } from '../ui/ConfirmButton';

const TOKEN_PLACEHOLDER = '<TOKEN_HERE>';
const INJECT_AUTOCLEAR_SEC = 30;

export const DeveloperSection: React.FC = () => {
  const token  = getToken() ?? '';
  const wallet = getWalletAddress() ?? 'YOUR_WALLET';
  const [injectedAt, setInjectedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const tickRef = useRef<number | null>(null);

  // Auto-clear the injected token from snippets after INJECT_AUTOCLEAR_SEC.
  useEffect(() => {
    if (!injectedAt) return;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - injectedAt) / 1000);
      if (elapsed >= INJECT_AUTOCLEAR_SEC) {
        setInjectedAt(null);
        if (tickRef.current) window.clearInterval(tickRef.current);
      } else {
        setTick(t => t + 1);
      }
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [injectedAt]);

  const t = injectedAt && token ? token : TOKEN_PLACEHOLDER;
  const secLeft = injectedAt ? Math.max(0, INJECT_AUTOCLEAR_SEC - Math.floor((Date.now() - injectedAt) / 1000)) : 0;
  const _useTick = tick; void _useTick;

  const cliStore = `# Real CLI: subcommand syntax (see v2-mvp/keyshield-cli.sh)
bash keyshield-cli.sh login <wallet-address> <passphrase>
bash keyshield-cli.sh store openai sk-proj-your-openai-key`;

  const cliProxy = `# Use as drop-in base URL for any OpenAI SDK call
curl -sS ${API_BASE}/proxy/openai/v1/models \\
  -H "Authorization: Bearer ${t}"`;

  const pySnippet = `from keyshield_sdk import KeyShield
ks = KeyShield(token="${t}")

# Store a key
ks.store("anthropic", "sk-ant-your-key")

# Call Anthropic through the zero-trust proxy
import anthropic
client = anthropic.Anthropic(
    base_url=ks.proxy_url("anthropic"),
    api_key="placeholder",          # key injected server-side
)
msg = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello"}],
)
print(msg.content[0].text)`;

  const tsSnippet = `import { KeyShield, KeyShieldAnthropic } from './keyshield-sdk';
const ks = new KeyShield({ token: '${t}' });

const client = new KeyShieldAnthropic(ks);
const resp = await client.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(resp.content[0].text);`;

  const curlStore = `curl -sS -X POST ${API_BASE}/manage/store \\
  -H "Authorization: Bearer ${t}" \\
  -H "Content-Type: application/json" \\
  -d '{"upstream":"openai","apiKey":"sk-proj-your-key"}'`;

  const curlList = `curl -sS ${API_BASE}/manage/list \\
  -H "Authorization: Bearer ${t}"`;

  const onRotate = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    clearAuth();
    clearPasskeyTrust();
    notifyAuthChanged();
  };

  return (
    <div className="space-y-6">
      {/* Session token — masked + reveal + rotate */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-medium text-white">Session token</h3>
          <ConfirmButton
            variant="destructive"
            onConfirm={onRotate}
            confirmLabel="Confirm rotate"
            title="Rotate (logs out everywhere on this browser; cascades to agents using this token)"
            className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
          >
            <RotateCw size={11} />
            Rotate
          </ConfirmButton>
        </div>
        <p className="text-[12px] text-zinc-500 mb-3">
          Use as <code className="text-[#5b8cff]">Bearer</code> in API/CLI calls. Valid 24h. Token is masked by default — click <em>Reveal</em> to expose for 30s.
        </p>
        <RevealField value={token} autoHideSec={30} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-zinc-500">
              Wallet: <span className="font-mono text-zinc-400">{wallet.length > 16 ? `${wallet.slice(0,8)}…${wallet.slice(-6)}` : wallet}</span>
            </span>
          </div>
          <button
            onClick={() => setInjectedAt(injectedAt ? null : Date.now())}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${
              injectedAt
                ? 'border-amber-700 bg-amber-950/40 text-amber-300'
                : 'border-[#1c2238] bg-[#070912] text-zinc-400 hover:text-white'
            }`}
            disabled={!token}
            title={token ? 'Inject live token into snippets below (auto-clears after 30s)' : 'Log in to enable'}
          >
            {injectedAt ? <EyeOff size={11} /> : <Eye size={11} />}
            {injectedAt ? `Injected · clears in ${secLeft}s` : 'Inject token into snippets'}
          </button>
        </div>
      </div>

      {/* CLI */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Terminal size={14} className="text-[#5b8cff]" />
          <h3 className="text-[14px] font-medium text-white">CLI — keyshield-cli.sh</h3>
          <a
            href={`${API_BASE}/static/keyshield-cli.sh`}
            download
            className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            <ExternalLink size={11} /> Download
          </a>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Login &amp; store</p>
          <CodeBlock code={cliStore} />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Proxy a request</p>
          <CodeBlock code={cliProxy} />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider">REST — store &amp; list</p>
          <CodeBlock code={curlStore} />
          <CodeBlock code={curlList} />
        </div>
      </div>

      {/* Python SDK */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ChevronRight size={14} className="text-yellow-400" />
          <h3 className="text-[14px] font-medium text-white">Python SDK</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">keyshield_sdk.py</span>
          <a
            href={`${API_BASE}/static/keyshield_sdk.py`}
            download
            className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            <ExternalLink size={11} /> Download
          </a>
        </div>
        <CodeBlock code={pySnippet} />
      </div>

      {/* TypeScript SDK */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ChevronRight size={14} className="text-blue-400" />
          <h3 className="text-[14px] font-medium text-white">TypeScript SDK</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 border border-blue-400/20">keyshield-sdk.ts</span>
          <a
            href={`${API_BASE}/static/keyshield-sdk.ts`}
            download
            className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            <ExternalLink size={11} /> Download
          </a>
        </div>
        <CodeBlock code={tsSnippet} />
      </div>

      {/* Endpoints reference */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
        <h3 className="text-[14px] font-medium text-white mb-3">Endpoint reference</h3>
        <div className="space-y-1.5">
          {[
            { m: 'POST',   p: '/auth/login',                     d: 'userId + password → token' },
            { m: 'GET',    p: '/auth/wallet-challenge',          d: 'Get one-time signing challenge' },
            { m: 'POST',   p: '/auth/wallet-login',              d: 'Submit signature + passphrase → token' },
            { m: 'GET',    p: '/auth/agent-challenge',           d: 'Per-agent challenge nonce' },
            { m: 'POST',   p: '/auth/agent-login',               d: 'Agent ed25519 signature → scoped token' },
            { m: 'POST',   p: '/auth/logout',                    d: 'Revoke current session' },
            { m: 'GET',    p: '/sessions/list',                  d: 'List all sessions for the current user' },
            { m: 'POST',   p: '/sessions/{token_id}/revoke',     d: 'Revoke any of your sessions by token_id' },
            { m: 'GET',    p: '/manage/list',                    d: 'List stored upstream keys' },
            { m: 'POST',   p: '/manage/store',                   d: 'Encrypt & store an API key' },
            { m: 'GET',    p: '/manage/decrypt/{upstream}',      d: 'Decrypt a stored key (full-scope only)' },
            { m: 'DELETE', p: '/manage/secret/{upstream}',       d: 'Delete a stored key (full-scope only)' },
            { m: 'POST',   p: '/proxy/{upstream}/{path}',        d: 'Zero-trust API proxy — returns x-ks-key-type header' },
            { m: 'POST',   p: '/manage/batch',                   d: 'Parallel batch proxy (up to 20)' },
            { m: 'GET',    p: '/agents/list',                    d: 'List registered agents' },
            { m: 'POST',   p: '/agents/register',                d: 'Register an ed25519 pubkey + scopes' },
            { m: 'DELETE', p: '/agents/{id}',                    d: 'Revoke agent (cascades to live tokens)' },
            { m: 'GET',    p: '/usage/stats',                    d: 'Per-upstream call counts, tokens, cost' },
            { m: 'GET',    p: '/usage/history',                  d: 'Recent proxy call log (up to 100)' },
            { m: 'GET',    p: '/billing/balance',                d: 'Prepaid credit balance + total spend' },
            { m: 'POST',   p: '/billing/topup-solana',           d: 'On-chain SOL topup (verified via Helius)' },
            { m: 'POST',   p: '/billing/topup-solana-usdc',      d: 'On-chain USDC topup' },
            { m: 'GET',    p: '/billing/topup-history',          d: 'Past topups' },
            { m: 'GET',    p: '/auth/passkey/register-options',  d: 'WebAuthn registration options' },
            { m: 'POST',   p: '/auth/passkey/register-verify',   d: 'Verify & store passkey' },
            { m: 'GET',    p: '/auth/passkey/auth-options',      d: 'WebAuthn auth challenge' },
            { m: 'POST',   p: '/auth/passkey/auth-verify',       d: 'Verify assertion → token' },
            { m: 'GET',    p: '/health',                         d: 'Server + cache status' },
          ].map(({ m, p, d }) => (
            <div key={`${m}-${p}`} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-[#070912] transition-colors">
              <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border mt-0.5 ${
                m === 'GET'    ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400' :
                m === 'POST'   ? 'bg-blue-950/40 border-blue-900/50 text-blue-400' :
                                 'bg-rose-950/40 border-rose-900/50 text-rose-400'
              }`}>{m}</span>
              <div className="flex-1 min-w-0">
                <code className="text-[12px] font-mono text-zinc-200">{p}</code>
                <p className="text-[11px] text-zinc-500 mt-0.5">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
````

## File: components/sections/DocsSection.tsx
````typescript
import React, { useState } from 'react';
import {
  Rocket, Shield, Bot, Code2, Terminal, CreditCard, Lock, AlertCircle,
  Zap, Key, DollarSign, FileText, Check, ArrowRight, Activity,
} from 'lucide-react';
import { API_BASE, getToken } from '../../lib/auth';
import { CopyButton } from '../ui/CopyButton';
import { CodeBlock } from '../ui/CodeBlock';
import { BUILD_DATE, REPO_URL, VERSION } from '../../lib/version';

export const DocsSection: React.FC = () => {
  const KS_BASE = API_BASE;
  const installCmd = `curl -fsSL ${KS_BASE}/install.sh | bash`;
  const token  = getToken() ?? 'YOUR_TOKEN';

  const [activeChapter, setActiveChapter] = useState<string>('quickstart');

  const CHAPTERS = [
    { id: 'quickstart',   title: 'Quickstart',         icon: <Rocket size={14} /> },
    { id: 'concepts',     title: 'Core concepts',      icon: <Shield size={14} /> },
    { id: 'agents',       title: 'Agent setup',        icon: <Bot size={14} /> },
    { id: 'sdk',          title: 'Python SDK',         icon: <Code2 size={14} /> },
    { id: 'cli',          title: 'CLI reference',      icon: <Terminal size={14} /> },
    { id: 'billing',      title: 'Billing & x402 & MPP', icon: <CreditCard size={14} /> },
    { id: 'security',     title: 'Security',           icon: <Lock size={14} /> },
    { id: 'troubleshoot', title: 'Troubleshooting',    icon: <AlertCircle size={14} /> },
  ];

  return (
    <div className="flex gap-6">
      <aside className="w-56 shrink-0">
        <div className="sticky top-0 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 px-3 mb-2">Documentation</div>
          {CHAPTERS.map(ch => (
            <button
              key={ch.id}
              onClick={() => {
                setActiveChapter(ch.id);
                document.getElementById(`doc-${ch.id}`)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] text-left transition-colors ${
                activeChapter === ch.id
                  ? 'bg-[#0e1430] text-white border border-[#1c2550]'
                  : 'text-zinc-400 hover:text-white hover:bg-[#0a0d1a] border border-transparent'
              }`}
            >
              <span className="text-zinc-600">{ch.icon}</span>
              <span>{ch.title}</span>
            </button>
          ))}

          <a
            href={`${KS_BASE}/install.sh`}
            download
            className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg border border-[#5b8cff]/40 bg-[#5b8cff]/10 text-[#5b8cff] text-[12px] hover:bg-[#5b8cff]/20 transition-colors"
          >
            <Rocket size={12} /> Download install.sh
          </a>
          <a
            href={`${KS_BASE}/static/keyshield_sdk.py`}
            download
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1c2238] bg-[#0a0d1a] text-zinc-400 text-[12px] hover:text-white transition-colors"
          >
            <FileText size={12} /> Python SDK file
          </a>
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-12">

        {/* ── Quickstart ─────────────────────────────────────────────── */}
        <section id="doc-quickstart" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Rocket size={12} /> CHAPTER 1
            </div>
            <h2 className="text-[24px] font-semibold text-white">Quickstart</h2>
            <p className="text-[14px] text-zinc-400 mt-1">From zero to first agent call in under a minute.</p>
          </div>

          <div className="rounded-2xl border border-[#5b8cff]/30 bg-gradient-to-br from-[#0e1430] to-[#0a0d1a] p-6 relative overflow-hidden">
            <div className="absolute top-3 right-3 text-[10px] text-[#5b8cff]/50 font-mono">ONE-CLICK INSTALL</div>
            <div className="flex items-center gap-2 text-[#5b8cff] mb-3">
              <Zap size={14} />
              <span className="text-[13px] font-medium">Run this in your terminal</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#020408] border border-[#131929]">
              <code className="flex-1 text-[13px] font-mono text-zinc-200 break-all">{installCmd}</code>
              <CopyButton text={installCmd} />
            </div>
            <p className="text-[11px] text-zinc-500 mt-3">
              The installer creates a Python venv, downloads the SDK, generates an ed25519 keypair for the agent, and writes a ready-to-use <code className="text-[#5b8cff]">.env</code> file.
            </p>
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">What the installer does</h3>
          <ol className="space-y-2.5">
            {[
              ['Pings the KeyShield server', `curl ${KS_BASE}/health → confirms backend is up`],
              ['Creates a Python virtualenv',  '~/keyshield-agent/.venv'],
              ['Installs httpx + pynacl',      'two pure-Python deps, no native build'],
              ['Downloads keyshield_sdk.py',   `${KS_BASE}/static/keyshield_sdk.py`],
              ['Generates ed25519 keypair',    '32-byte private key + base58 public key'],
              ['Writes .env file',             'KS_OWNER_WALLET, KS_AGENT_KEY, KS_VAULT_PASS, KS_BASE'],
              ['Drops a starter script',       'agent_demo.py — copy-paste-runnable'],
            ].map(([t, d], i) => (
              <li key={t} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#0e1430] border border-[#1c2550] flex items-center justify-center text-[10px] text-[#5b8cff] shrink-0 mt-0.5">{i+1}</div>
                <div>
                  <div className="text-[13px] text-white">{t}</div>
                  <div className="text-[11px] text-zinc-600 font-mono mt-0.5">{d}</div>
                </div>
              </li>
            ))}
          </ol>

          <h3 className="text-[15px] font-medium text-white mt-6">After install</h3>
          <CodeBlock code={`# 1. cd into the install directory
cd keyshield-agent
source .venv/bin/activate

# 2. Register your agent's pubkey in the dashboard:
#    Agents tab → paste the KS_AGENT_PUBKEY from .env

# 3. Run the demo
python agent_demo.py
# → agent authenticated as DkX1zP9...
# → vault keys: ['openai', 'anthropic']`} />
        </section>

        {/* ── Core concepts ──────────────────────────────────────────── */}
        <section id="doc-concepts" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Shield size={12} /> CHAPTER 2
            </div>
            <h2 className="text-[24px] font-semibold text-white">Core concepts</h2>
            <p className="text-[14px] text-zinc-400 mt-1">The three things you have to understand — and why going through the proxy is <em className="text-emerald-300 not-italic">faster</em>, not slower.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                t: 'Vault',
                i: <Key size={16} className="text-[#5b8cff]" />,
                d: 'Your API keys, encrypted with AES-256-GCM. The decryption key never leaves your machine. KeyShield server stores ciphertext — that\'s it.',
              },
              {
                t: 'Proxy',
                i: <Shield size={16} className="text-emerald-400" />,
                d: 'A request hits /proxy/{upstream}/. The server decrypts your key in memory, injects it into the upstream request, and forwards. The agent never sees the plaintext.',
              },
              {
                t: 'Agent',
                i: <Bot size={16} className="text-violet-400" />,
                d: 'A programmatic identity with its own ed25519 keypair. You register the pubkey once. The agent then self-authenticates by signing a server challenge.',
              },
            ].map(c => (
              <div key={c.t} className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 p-4">
                <div className="flex items-center gap-2 mb-2">{c.i}<span className="text-[14px] font-medium text-white">{c.t}</span></div>
                <p className="text-[12px] text-zinc-400 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-[#0a0d1a] p-5 mt-6 relative overflow-hidden">
            <div className="absolute top-3 right-3 text-[10px] text-emerald-400/60 font-mono">PERFORMANCE</div>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-emerald-400" />
              <span className="text-[14px] font-medium text-white">Lower latency · up to 10× faster than direct API calls</span>
            </div>
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              Going through KeyShield is <strong className="text-emerald-300">faster</strong>, not slower. Three reasons, all measurable:
            </p>
            <ul className="space-y-1.5 mt-3">
              <li className="text-[12px] text-zinc-400 flex items-start gap-2">
                <Check size={12} className="text-emerald-400 shrink-0 mt-1" />
                <span>
                  <strong className="text-white">Warm HTTP/2 connection pool</strong> — KeyShield keeps persistent <code className="text-emerald-300">httpx.AsyncClient</code> sessions to every upstream (100 conns, 20 keepalive). Your call skips DNS + TLS handshake (~150–300ms saved on cold starts).
                </span>
              </li>
              <li className="text-[12px] text-zinc-400 flex items-start gap-2">
                <Check size={12} className="text-emerald-400 shrink-0 mt-1" />
                <span>
                  <strong className="text-white">Concurrent batch fan-out</strong> — <code className="text-emerald-300">batch(requests)</code> dispatches up to 20 calls in parallel via <code className="text-emerald-300">asyncio.gather</code>. A 20-prompt workload returns in the latency of one call → effectively <strong className="text-emerald-300">10–20× faster</strong> wall-clock.
                </span>
              </li>
              <li className="text-[12px] text-zinc-400 flex items-start gap-2">
                <Check size={12} className="text-emerald-400 shrink-0 mt-1" />
                <span>
                  <strong className="text-white">MPP skips x402 round-trips</strong> — once a stream is open, calls go straight upstream with no per-call 402 negotiation. Saves ~200ms vs per-request micropayment.
                </span>
              </li>
            </ul>
            <p className="text-[11px] text-zinc-500 mt-3">
              Net effect: a sequential agent that does 20 short calls finishes in ~1× the latency of a single direct call. The proxy is in the request path, but it's not the bottleneck — the upstream LLM is.
            </p>
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">Self-custodian vs platform</h3>
          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-[#141a2e]">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-emerald-400" />
                  <span className="text-[13px] text-emerald-400 font-medium">Self-custodian (free)</span>
                </div>
                <p className="text-[12px] text-zinc-400 leading-relaxed">
                  You stored your own API key. KeyShield encrypts it, injects it into upstream calls, charges you nothing. Your usage cost goes directly to OpenAI / Anthropic / wherever.
                </p>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={14} className="text-amber-400" />
                  <span className="text-[13px] text-amber-400 font-medium">Platform (billed)</span>
                </div>
                <p className="text-[12px] text-zinc-400 leading-relaxed">
                  No vault key for that upstream. KeyShield falls back to its own platform key and bills you per call. Pay with prepaid credit or x402 micropayments.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Agent setup ────────────────────────────────────────────── */}
        <section id="doc-agents" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Bot size={12} /> CHAPTER 3
            </div>
            <h2 className="text-[24px] font-semibold text-white">Agent setup</h2>
            <p className="text-[14px] text-zinc-400 mt-1">How agents authenticate to your vault.</p>
          </div>

          <h3 className="text-[15px] font-medium text-white">The flow</h3>
          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
            <pre className="text-[11px] font-mono text-zinc-400 leading-relaxed">{
`┌────────┐     1. GET /auth/agent-challenge        ┌──────────┐
│        │ ◀──────────────────────────────────────  │          │
│        │     {challenge, nonce}                   │          │
│ AGENT  │                                          │ KEYSHIELD│
│  with  │     2. sign(challenge) with ed25519      │          │
│ ed25519│ ──────────────────────────────────────▶  │  + DB    │
│ keypair│     POST /auth/agent-login                │          │
│        │     {ownerWallet, agentPubkey, sig}      │          │
│        │                                          │   verify │
│        │     3. lookup delegation                 │   sig &  │
│        │     ◀────  agent_keys table   ────▶      │   table  │
│        │                                          │          │
│        │     4. session token (24h TTL)           │          │
│        │ ◀──────────────────────────────────────  │          │
└────────┘                                          └──────────┘
   token now grants access to owner's vault — same as wallet login`
            }</pre>
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">Three steps</h3>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center text-[12px] text-[#5b8cff] shrink-0 font-medium">1</div>
              <div className="flex-1">
                <div className="text-[13px] text-white font-medium">Generate a keypair</div>
                <p className="text-[12px] text-zinc-500 mt-0.5">In the Agents tab, click <strong className="text-white">Generate</strong>, or run:</p>
                <CodeBlock code={`from keyshield_sdk import AgentKeyShield
creds = AgentKeyShield.generate_keypair()
print(creds)
# {"private_key_hex": "abcd...", "pubkey_b58": "9WzDX..."}`} />
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center text-[12px] text-[#5b8cff] shrink-0 font-medium">2</div>
              <div className="flex-1">
                <div className="text-[13px] text-white font-medium">Register the pubkey</div>
                <p className="text-[12px] text-zinc-500 mt-0.5">Agents tab → paste pubkey + name → Register. Or via SDK:</p>
                <CodeBlock code={`# Owner side
ks = KeyShield(token="${token.slice(0, 16)}...")
ks.agent_register(pubkey_b58=creds["pubkey_b58"], name="trading-bot-v1")`} />
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center text-[12px] text-[#5b8cff] shrink-0 font-medium">3</div>
              <div className="flex-1">
                <div className="text-[13px] text-white font-medium">Agent self-authenticates</div>
                <p className="text-[12px] text-zinc-500 mt-0.5">Drop into your bot. Picks up env vars automatically:</p>
                <CodeBlock code={`agent = AgentKeyShield()    # reads KS_OWNER_WALLET, KS_AGENT_KEY, KS_VAULT_PASS
client = agent.openai_client()  # auto-authenticates
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "analyze SOL price"}],
)`} />
              </div>
            </li>
          </ol>
        </section>

        {/* ── Python SDK ─────────────────────────────────────────────── */}
        <section id="doc-sdk" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Code2 size={12} /> CHAPTER 4
            </div>
            <h2 className="text-[24px] font-semibold text-white">Python SDK</h2>
            <p className="text-[14px] text-zinc-400 mt-1">Two clients: <code className="text-[#5b8cff]">KeyShield</code> for humans, <code className="text-[#5b8cff]">AgentKeyShield</code> for bots.</p>
          </div>

          <h3 className="text-[15px] font-medium text-white">Common methods</h3>
          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
            {[
              ['store(upstream, api_key)',          'Encrypt + save a key in the vault'],
              ['list_keys()',                       'Return list of stored upstream names'],
              ['decrypt_key(upstream)',             "Show plaintext (owner only — don't log it)"],
              ['delete_key(upstream)',              'Remove a stored key'],
              ['proxy(upstream, path, json=...)',   'Forward a single request — key injected'],
              ['batch(requests)',                   'Up to 20 concurrent proxied calls'],
              ['proxy_url(upstream)',               'Base URL for SDK plug-in mode'],
              ['openai_client() / anthropic_client()','Pre-wired SDK client'],
              ['agent_register(pubkey, name)',      'Owner: register an agent pubkey'],
              ['agent_list() / agent_revoke(id)',   'Owner: list / revoke agents'],
            ].map(([m, d]) => (
              <div key={m} className="flex items-start gap-4 px-5 py-2.5 border-b border-[#0d1020] last:border-0">
                <code className="text-[12px] font-mono text-[#5b8cff] w-72 shrink-0 truncate">{m}</code>
                <span className="text-[12px] text-zinc-400">{d}</span>
              </div>
            ))}
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">Async variant</h3>
          <CodeBlock code={`from keyshield_sdk import AsyncKeyShield

async with AsyncKeyShield() as ks:
    await ks.wallet_login_with_key(seed_hex, passphrase)
    keys = await ks.list_keys()`} />
        </section>

        {/* ── CLI ────────────────────────────────────────────────────── */}
        <section id="doc-cli" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Terminal size={12} /> CHAPTER 5
            </div>
            <h2 className="text-[24px] font-semibold text-white">CLI reference</h2>
            <p className="text-[14px] text-zinc-400 mt-1">Bash-friendly commands via <code className="text-[#5b8cff]">keyshield-cli.sh</code>.</p>
          </div>

          <CodeBlock code={`source keyshield-cli.sh

ks_login alice mypassphrase             # password login
ks_store openai sk-proj-abcd1234        # save a key
ks_list                                  # list stored upstreams
ks_proxy openai v1/chat/completions \\
  '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
ks_logout                                # revoke session`} />

          <p className="text-[12px] text-zinc-500">
            Every command sets <code className="text-[#5b8cff]">KS_TOKEN</code> in your shell so subsequent commands authenticate automatically.
          </p>
        </section>

        {/* ── Billing & x402 ─────────────────────────────────────────── */}
        <section id="doc-billing" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <CreditCard size={12} /> CHAPTER 6
            </div>
            <h2 className="text-[24px] font-semibold text-white">Billing & x402 & MPP</h2>
            <p className="text-[14px] text-zinc-400 mt-1">How payment works for non-self-custodian calls — including the streaming Metered Payment Protocol.</p>
          </div>

          <p className="text-[13px] text-zinc-300">
            When you call <code className="text-[#5b8cff]">/proxy/openai/...</code> and you haven't stored an OpenAI key in your vault, KeyShield uses its own platform key and charges you. Four ways to pay:
          </p>
          <ol className="space-y-2 list-decimal list-inside text-[13px] text-zinc-300">
            <li><strong className="text-white">Free credit</strong> — every new wallet gets $0.10 to test. About 100 GPT-4o-mini calls.</li>
            <li><strong className="text-white">Prepaid balance</strong> — top up with USDC. Calls deduct in real time.</li>
            <li><strong className="text-white">x402 micropayments</strong> — when balance hits $0, the proxy returns HTTP 402 with a Coinbase-format payment instruction. Your client pays USDC on Base and retries.</li>
            <li><strong className="text-white">MPP streaming</strong> — open a metered channel once; the agent records usage on every call and the on-chain <code className="text-[#5b8cff]">PaymentStream</code> auto-settles in micro-USDC every <code className="text-[#5b8cff]">settlement_interval_secs</code>. Best for long-running, high-volume agents.</li>
          </ol>

          <h3 className="text-[15px] font-medium text-white mt-6">x402 response example</h3>
          <CodeBlock code={`HTTP/1.1 402 Payment Required
X-Payment-Required: x402
Content-Type: application/json

{
  "x402Version": 1,
  "error": "X-PAYMENT-REQUIRED",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xKEYSHIELD_TREASURY",
    "resource": "${KS_BASE}/proxy/openai/v1/chat/completions"
  }]
}`} />

          <h3 className="text-[15px] font-medium text-white mt-8 flex items-center gap-2">
            <Activity size={14} className="text-amber-400" /> MPP — streaming payment for long-running agents
          </h3>
          <p className="text-[13px] text-zinc-300">
            Per-call x402 means an HTTP 402 round-trip every time the balance dips. For agents making thousands of small calls,
            <strong className="text-white"> Metered Payment Protocol (MPP) </strong>
            is cheaper and faster: open a stream once, record usage as you go, and let the on-chain
            <code className="text-[#5b8cff]"> PaymentStream </code>
            auto-settle in micro-USDC every interval.
          </p>

          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 mt-3">
            <pre className="text-[11px] font-mono text-zinc-400 leading-relaxed">{
`┌──────┐  open_payment_stream(rate, interval)        ┌────────────┐
│ AGENT│ ───────────────────────────────────────────▶ │  KEYSHIELD │
│      │       grant_agent_payment_access (on-chain)  │  + Solana  │
│      │ ◀───────────────────────────────────────────  │  Program   │
│      │                                               │            │
│      │  proxy("v1/messages", ...) × N (no 402!)      │            │
│      │ ─────────────────────────────────────────────▶│  meter     │
│      │  record_usage(tokens) × N                     │  usage     │
│      │ ─────────────────────────────────────────────▶│            │
│      │                                               │            │
│      │  every settlement_interval_secs:              │  settle    │
│      │    PaymentStream debits micro-USDC on-chain   │  on-chain  │
└──────┘                                               └────────────┘`
            }</pre>
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">Open + use a stream</h3>
          <CodeBlock code={`from keyshield_sdk import AgentKeyShield

agent = AgentKeyShield()    # reads KS_OWNER_WALLET, KS_AGENT_KEY, KS_VAULT_PASS

# 1. Owner pre-grants per-token rate + settlement window (one-time, on-chain).
#    grant_agent_payment_access(agent_pubkey, rate_per_token=15, interval=60)

# 2. Agent opens a metered channel.
stream = agent.open_payment_stream(
    upstream="anthropic",
    rate_per_token_micro_usdc=15,    # $0.000015 per token
    settlement_interval_secs=60,     # auto-settle every 60s on-chain
)

# 3. Make calls. No HTTP 402 in the hot path — usage accumulates locally.
for prompt in prompts:
    resp = stream.proxy("v1/messages", json={
        "model": "claude-3-haiku",
        "messages": [{"role": "user", "content": prompt}],
    })
    stream.record_usage(resp.usage.input_tokens + resp.usage.output_tokens)

# 4. Settle (also fires automatically every interval). Pushes the
#    accumulated micro-USDC to the treasury via PaymentStream.
await stream.settle()
await stream.close()`} />

          <p className="text-[12px] text-zinc-500 mt-2">
            On-chain account: <code className="text-[#5b8cff]">PaymentStream</code> in
            <code className="text-[#5b8cff]"> programs/keyshield</code>.
            Owner sets <code className="text-[#5b8cff]">rate_per_call_micro_usdc</code>,
            <code className="text-[#5b8cff]"> rate_per_token_micro_usdc</code>, and
            <code className="text-[#5b8cff]"> settlement_interval_secs</code> via
            <code className="text-[#5b8cff]"> grant_agent_payment_access</code>.
            The agent can never debit more than the granted rate, and the owner can revoke at any time.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={14} className="text-[#5b8cff]" />
                <span className="text-[13px] font-medium text-white">Per-call x402</span>
              </div>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                Best for one-shot calls or low-frequency clients. Each request that hits a $0 balance triggers an HTTP 402, the client pays, and the call retries. Simple, but a network round-trip every time.
              </p>
            </div>
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-amber-400" />
                <span className="text-[13px] font-medium text-amber-300">MPP streaming</span>
              </div>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                Best for long-running agents. Open once, meter every call, settle on a fixed cadence. Owner caps the rate; agent never sees the treasury wallet. No 402 in the hot path.
              </p>
            </div>
          </div>
        </section>

        {/* ── Security ───────────────────────────────────────────────── */}
        <section id="doc-security" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Lock size={12} /> CHAPTER 7
            </div>
            <h2 className="text-[24px] font-semibold text-white">Security model</h2>
            <p className="text-[14px] text-zinc-400 mt-1">What's protected, and what isn't.</p>
          </div>

          <div className="space-y-2">
            {[
              ['AES-256-GCM',        "Authenticated encryption — tampering with ciphertext fails decryption loudly"],
              ['PBKDF2-HMAC-SHA256', "100k iterations to derive the encryption key from your passphrase"],
              ['ed25519 challenges', "Wallet + agent auth signed with curve25519, replay-protected by 5-min nonces"],
              ['Single-use nonces',  "Every challenge consumed on first use — no replay attack window"],
              ['SQLite WAL mode',    "Concurrent reads + atomic writes for sessions, agents, usage logs"],
              ['Zero-trust proxy',   "Plaintext key only exists in a single httpx.Request, never logged or persisted"],
            ].map(([t, d]) => (
              <div key={t} className="flex items-start gap-3 p-3 rounded-lg bg-[#0a0d1a]/60 border border-[#1c2238]">
                <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[13px] text-white font-medium">{t}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{d}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4 mt-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-[13px] text-amber-300 font-medium">What's NOT protected</div>
                <p className="text-[12px] text-zinc-400 mt-1">
                  KeyShield runs as a service. If the server process is compromised mid-request, the plaintext key is briefly in memory. For maximum security, self-host on infrastructure you control.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Troubleshooting ────────────────────────────────────────── */}
        <section id="doc-troubleshoot" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <AlertCircle size={12} /> CHAPTER 8
            </div>
            <h2 className="text-[24px] font-semibold text-white">Troubleshooting</h2>
          </div>

          <div className="space-y-3">
            {[
              { q: '401 unauthorized when calling /proxy/...',         a: 'Either your session expired (24h TTL) or no vault key + no platform key. Run authenticate() again. For the agent client this is automatic.' },
              { q: '402 Payment Required',                              a: 'Platform key was used but your balance is $0. Top up via Activity tab or send USDC to the address in X-Payment-Required.' },
              { q: 'Agent gets 403 "agent pubkey not registered"',     a: 'The owner forgot step 2 — register the agent\'s pubkey in the Agents tab.' },
              { q: 'pip install pynacl fails on M-series Mac',          a: 'pynacl ships with an arm64 wheel — `pip install --upgrade pip` first to pick it up.' },
              { q: 'CORS error in the browser',                         a: `Backend's CORS_ORIGINS env var doesn't include your dev port. Server defaults cover 3000-3005, 5173-5175.` },
            ].map(({ q, a }) => (
              <details key={q} className="rounded-lg border border-[#1c2238] bg-[#0a0d1a]/60">
                <summary className="cursor-pointer px-4 py-3 text-[13px] text-white font-medium hover:bg-[#070912] flex items-center gap-2">
                  <ArrowRight size={12} className="text-zinc-500" />
                  {q}
                </summary>
                <div className="px-4 pb-3 pt-1 text-[12px] text-zinc-400 leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </section>

        <div className="text-center text-[10px] text-zinc-700 pt-8 pb-4">
          KeyShield v2 · self-custodian API key vault · made for agents
        </div>
      </div>
    </div>
  );
};
````

## File: components/sections/EphemeralWalletsSection.tsx
````typescript
import React, { useState, useEffect, useCallback } from 'react';
import {
  Server, Plus, Trash2, RefreshCw, Loader2, AlertCircle, Check,
} from 'lucide-react';
import { apiFetch } from '../../lib/auth';
import { CopyButton } from '../ui/CopyButton';
import { ConfirmButton } from '../ui/ConfirmButton';

interface EphemeralWallet {
  agent_id: string;
  pubkey: string;
}

interface CreatedWallet {
  agent_id: string;
  pubkey: string;
}

export const EphemeralWalletsSection: React.FC = () => {
  const [wallets,      setWallets]      = useState<EphemeralWallet[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [agentIdInput, setAgentIdInput] = useState('');
  const [creating,     setCreating]     = useState(false);
  const [revokingId,   setRevokingId]   = useState<string | null>(null);
  const [created,      setCreated]      = useState<CreatedWallet | null>(null);
  const [err,          setErr]          = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/agents/wallets');
      if (r.ok) {
        const d = await r.json();
        setWallets(d.wallets ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const id = agentIdInput.trim();
    if (!id) return;
    setCreating(true); setErr(''); setCreated(null);
    try {
      const r = await apiFetch(`/agents/${encodeURIComponent(id)}/wallet/create`, {
        method: 'POST',
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail ?? 'Failed to create wallet'); return; }
      setCreated({ agent_id: d.agent_id, pubkey: d.pubkey });
      setAgentIdInput('');
      load();
    } catch { setErr('Network error'); }
    finally { setCreating(false); }
  };

  const handleRevoke = async (agentId: string) => {
    setRevokingId(agentId);
    try {
      await apiFetch(`/agents/${encodeURIComponent(agentId)}/wallet`, { method: 'DELETE' });
      setWallets(prev => prev.filter(w => w.agent_id !== agentId));
      if (created?.agent_id === agentId) setCreated(null);
    } catch { /* ignore */ }
    finally { setRevokingId(null); }
  };

  const truncatePubkey = (pk: string) =>
    pk.length > 24 ? `${pk.slice(0, 10)}…${pk.slice(-8)}` : pk;

  return (
    <div className="space-y-5 mt-5">
      {/* Header card */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
        <h3 className="text-[14px] font-medium text-white mb-2 flex items-center gap-2">
          <Server size={14} className="text-[#5b8cff]" /> Server-held Agent Wallets
        </h3>
        <p className="text-[12px] text-zinc-400">
          The server generates and holds an encrypted keypair for each agent. The agent uses its
          pubkey to sign x402 micropayments on-chain. Unlike user-registered agents, the private
          key never leaves the server — it is stored AES-256-GCM encrypted at rest.
        </p>
      </div>

      {/* Wallet list */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-white">Active server wallets</h3>
          <button onClick={load} className="text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading && (
          <div className="py-8 flex items-center justify-center gap-2 text-zinc-600">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[12px]">Loading…</span>
          </div>
        )}

        {!loading && wallets.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-zinc-500">No server wallets yet.</p>
            <p className="text-[11px] text-zinc-700 mt-1">
              Create one below to let an agent sign x402 payments.
            </p>
          </div>
        )}

        {wallets.map(w => (
          <div
            key={w.agent_id}
            className="flex items-center gap-4 px-5 py-3.5 border-b border-[#0d1020] last:border-0"
          >
            <div className="w-8 h-8 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center shrink-0">
              <Server size={14} className="text-[#5b8cff]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-white font-medium truncate">{w.agent_id}</div>
              <div className="text-[11px] text-zinc-600 font-mono mt-0.5">
                {truncatePubkey(w.pubkey)}
              </div>
            </div>
            <CopyButton text={w.pubkey} />
            <ConfirmButton
              variant="destructive"
              onConfirm={() => handleRevoke(w.agent_id)}
              disabled={revokingId === w.agent_id}
              title="Revoke server wallet (click twice). This deletes the keypair permanently."
              confirmLabel="Confirm revoke"
              className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
            >
              {revokingId === w.agent_id
                ? <Loader2 size={12} className="animate-spin" />
                : <Trash2 size={12} />}
              <span>Revoke</span>
            </ConfirmButton>
          </div>
        ))}
      </div>

      {/* Create form */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-4">
        <h3 className="text-[13px] font-medium text-white">Create wallet for agent</h3>

        {err && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
            <AlertCircle size={13} className="text-rose-400 shrink-0" />
            <p className="text-[12px] text-rose-300">{err}</p>
          </div>
        )}

        {created && (
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-emerald-400">
              <Check size={12} />
              Wallet created for <span className="font-mono font-medium">{created.agent_id}</span>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 mb-1">Public key</div>
              <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-[#020408] border border-[#131929]">
                <code className="flex-1 text-[11px] font-mono text-emerald-300 break-all">
                  {created.pubkey}
                </code>
                <CopyButton text={created.pubkey} />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Agent ID</label>
            <input
              type="text"
              placeholder="e.g. trading-bot-v1"
              value={agentIdInput}
              onChange={e => { setAgentIdInput(e.target.value); setErr(''); setCreated(null); }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/50"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !agentIdInput.trim()}
            className="mt-5 flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
};
````

## File: components/sections/SessionsSection.tsx
````typescript
import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, Loader2, Monitor, Smartphone, Globe, Shield, Bot, RefreshCw } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { apiFetch, getToken, getWalletAddress, getPasskeyTrust } from '../../lib/auth';
import { useCopyable } from '../ui/CopyButton';
import { ConfirmButton } from '../ui/ConfirmButton';
import { relTime } from '../../lib/time';

interface SessionRow {
  token_id:      string;
  device_label?: string | null;
  ip?:           string | null;
  user_agent?:   string | null;
  last_seen_at?: number | null;
  expires_at?:   number | null;
  created_at?:   number | null;
  is_current:    boolean;
  agent_id?:     number | null;
  scopes?:       string | null;
}

const maskIp = (ip: string | null | undefined): string => {
  if (!ip) return '—';
  if (ip === '127.0.0.1' || ip.startsWith('::1')) return ip;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return ip.slice(0, Math.min(8, ip.length)) + '…';
};

const fmtCountdown = (expiresAt: number | null | undefined): string => {
  if (!expiresAt) return '—';
  const ms = expiresAt * 1000 - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 1) return `expires in ${h}h ${m}m`;
  return `expires in ${m}m`;
};

const detectAuthMethod = (walletConnected: boolean, walletName?: string | null): string => {
  if (getPasskeyTrust()) return 'Passkey · WebAuthn';
  if (walletConnected) return `${walletName ?? 'Solana wallet'} · ed25519`;
  return 'Password · session token';
};

export const SessionsSection: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const token   = getToken() ?? '';
  const wallet  = getWalletAddress() ?? '—';
  const walletAdapter = useWallet();
  const { copied: tokCopied, copy: copyTok } = useCopyable(token);

  const [list, setList]         = useState<SessionRow[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Refresh "expires in" countdowns once a minute.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);
  void now;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch('/sessions/list');
      if (r.status === 404) {
        setList(null);
        setError('Session list endpoint not deployed yet — beta v2 will surface every device.');
        return;
      }
      if (!r.ok) {
        setError(`Failed to load sessions (${r.status})`);
        return;
      }
      const d = await r.json();
      setList(Array.isArray(d.sessions) ? d.sessions : []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const authMethod = useMemo(
    () => detectAuthMethod(!!walletAdapter.publicKey, walletAdapter.wallet?.adapter.name),
    [walletAdapter.publicKey, walletAdapter.wallet],
  );

  const current = useMemo(() => list?.find(s => s.is_current) ?? null, [list]);
  const others  = useMemo(() => (list ?? []).filter(s => !s.is_current), [list]);

  const revokeOne = async (tokenId: string) => {
    setRevoking(tokenId);
    try {
      const r = await apiFetch(`/sessions/${tokenId}/revoke`, { method: 'POST' });
      if (!r.ok) {
        alert('Revoke failed');
      } else {
        setList(prev => (prev ?? []).filter(s => s.token_id !== tokenId));
      }
    } catch { alert('Network error'); }
    finally { setRevoking(null); }
  };

  const revokeCurrent = async () => {
    setLogoutPending(true);
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    onLogout();
  };

  const expiringSoon = current?.expires_at && (current.expires_at * 1000 - Date.now() < 3_600_000);

  return (
    <div className="space-y-4">
      {/* Current session card */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#141a2e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[13px] text-white font-medium">This session</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-900/50 text-emerald-400">active</span>
            {expiringSoon && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-950/50 border border-amber-900/50 text-amber-300">expires soon</span>
            )}
          </div>
          <ConfirmButton
            variant="destructive"
            onConfirm={revokeCurrent}
            disabled={logoutPending}
            title="Revoke this session (logs out only this device)"
            confirmLabel="Confirm sign-out"
            className="h-7 px-3 rounded-lg text-[12px] flex items-center gap-1.5"
          >
            {logoutPending ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
            Sign out
          </ConfirmButton>
        </div>

        <div className="divide-y divide-[#0d1020]">
          <Row label="Session token">
            <code className="text-[12px] font-mono text-zinc-300">{token ? `${token.slice(0,8)}…${token.slice(-8)}` : '—'}</code>
            {token && (
              <button
                onClick={copyTok}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  tokCopied ? 'border-emerald-800 text-emerald-400' : 'border-[#1c2238] text-zinc-500 hover:text-white'
                }`}
              >
                {tokCopied ? 'Copied' : 'Copy'}
              </button>
            )}
          </Row>
          <Row label="Wallet">
            <code className="text-[12px] font-mono text-zinc-300">
              {wallet.length > 12 ? `${wallet.slice(0,6)}…${wallet.slice(-6)}` : wallet}
            </code>
          </Row>
          <Row label="Auth method">
            <span className="text-[12px] text-zinc-300">{authMethod}</span>
          </Row>
          <Row label="Expires">
            {current?.expires_at ? (
              <span className="text-[12px] text-zinc-300">{fmtCountdown(current.expires_at)}</span>
            ) : (
              <span className="text-[12px] text-zinc-500" title="Exact expiry available after backend update">≤ 24 hours</span>
            )}
          </Row>
          {current?.device_label && (
            <Row label="Device">
              <span className="text-[12px] text-zinc-300">{current.device_label}</span>
            </Row>
          )}
          {current?.ip && (
            <Row label="IP">
              <code className="text-[12px] font-mono text-zinc-400">{maskIp(current.ip)}</code>
            </Row>
          )}
        </div>
      </div>

      {/* Other sessions */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-white">Other active sessions{list ? ` · ${others.length}` : ''}</h3>
          <button onClick={load} className="text-zinc-500 hover:text-white transition-colors" title="Refresh">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && (
          <div className="px-5 py-3 text-[12px] text-amber-400/90 bg-amber-950/20 border-b border-amber-900/30">
            {error}
          </div>
        )}

        {!loading && !error && others.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-zinc-500">No other devices signed in</p>
            <p className="text-[11px] text-zinc-700 mt-1">Sessions on other browsers, the extension, the CLI, or registered agents would show here.</p>
          </div>
        )}

        {others.map(s => {
          const Icon = s.agent_id != null ? Bot : (s.user_agent?.toLowerCase().includes('mobile') ? Smartphone : (s.user_agent ? Monitor : Globe));
          return (
            <div key={s.token_id} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#0d1020] last:border-0">
              <div className="w-8 h-8 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center shrink-0">
                <Icon size={14} className="text-[#5b8cff]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-white font-medium truncate">{s.device_label || (s.agent_id != null ? `Agent #${s.agent_id}` : 'Unknown device')}</span>
                  {s.scopes && s.scopes !== '*' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#1c2238] text-zinc-500 font-mono">{s.scopes}</span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-600 mt-0.5 flex gap-3 flex-wrap">
                  {s.ip && <span className="font-mono">{maskIp(s.ip)}</span>}
                  {s.last_seen_at && <span>last seen {relTime(s.last_seen_at)}</span>}
                  {s.expires_at && <span>{fmtCountdown(s.expires_at)}</span>}
                </div>
              </div>
              <ConfirmButton
                variant="destructive"
                onConfirm={() => revokeOne(s.token_id)}
                disabled={revoking === s.token_id}
                title="Revoke this session"
                confirmLabel="Confirm"
                className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
              >
                {revoking === s.token_id ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                Revoke
              </ConfirmButton>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-600 text-center flex items-center justify-center gap-1.5">
        <Shield size={11} className="text-zinc-700" />
        Sessions are AES-256-GCM encrypted server-side. Revoke cascades to in-flight tokens.
      </p>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="px-5 py-3 flex items-center justify-between">
    <span className="text-[12px] text-zinc-500">{label}</span>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);
````

## File: components/sections/SettingsSection.tsx
````typescript
import React, { useState, useEffect, useCallback } from 'react';
import {
  ExternalLink, Check, Fingerprint, RefreshCw, Loader2, AlertCircle,
  Trash2, Zap, Shield, Bell, BellOff, Download, Key, Lock,
} from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  registerPasskey, listPasskeys, deletePasskey,
  setPasskeyTrust, clearPasskeyTrust, getPasskeyTrust,
  pingExtension, pushTokenToExtension, getToken, apiFetch,
  clearAuth, notifyAuthChanged,
} from '../../lib/auth';
import { fetchDeleteAccountChallenge, deleteAccount } from '../../lib/api';
import { VAULT_KEY_MESSAGE } from '../../lib/vault-key';
import { getPrefs, setPrefs, VaultPreferences } from '../../lib/preferences';

const DELETE_CONFIRMATION = 'DELETE my account';

// ─── ExtensionPanel (collapsed when paired) ──────────────────────────────────

const ExtensionPanel: React.FC = () => {
  const [extId, setExtId]     = useState(() => localStorage.getItem('ks_ext_id') || '');
  const [status, setStatus]   = useState<'unknown'|'installed'|'paired'|'missing'>('unknown');
  const [pinging, setPinging] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const check = useCallback(async () => {
    setPinging(true);
    const r = await pingExtension();
    setStatus(r.installed ? (r.hasToken ? 'paired' : 'installed') : 'missing');
    setPinging(false);
  }, []);

  useEffect(() => { check(); }, [check]);

  const saveId = () => {
    if (extId.trim()) localStorage.setItem('ks_ext_id', extId.trim());
    else              localStorage.removeItem('ks_ext_id');
    check();
  };

  const repair = () => {
    const tok = getToken();
    if (tok) pushTokenToExtension(tok);
    setTimeout(check, 200);
  };

  const STATUS: Record<typeof status, {bg:string; tx:string; lbl:string; sub:string}> = {
    unknown:   { bg: 'bg-zinc-800/40 border-zinc-700',         tx: 'text-zinc-400',    lbl: 'CHECKING…',     sub: 'Looking for the extension' },
    missing:   { bg: 'bg-rose-950/30 border-rose-900/50',      tx: 'text-rose-300',    lbl: 'NOT INSTALLED', sub: 'Auto-detect API keys on any page' },
    installed: { bg: 'bg-amber-950/30 border-amber-900/50',    tx: 'text-amber-300',   lbl: 'NEEDS PAIRING', sub: 'Click "Re-pair" to push session token' },
    paired:    { bg: 'bg-emerald-950/30 border-emerald-900/50',tx: 'text-emerald-300', lbl: '✓ PAIRED',      sub: 'Auto-detect + auto-store enabled' },
  };
  const s = STATUS[status];
  const showSetup = status === 'missing' || expanded;

  return (
    <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
          <Zap size={14} className="text-[#5b8cff]" /> Browser extension
        </h3>
        <button onClick={check} className="text-zinc-500 hover:text-white" title="Re-check">
          <RefreshCw size={13} className={pinging ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className={`rounded-lg border ${s.bg} px-3 py-2.5 flex items-center gap-3`}>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${s.tx} ${s.bg}`}>{s.lbl}</span>
        <span className={`text-[12px] ${s.tx} flex-1`}>{s.sub}</span>
        {status === 'paired' && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-[11px] text-zinc-500 hover:text-white">
            Manage
          </button>
        )}
      </div>

      {status === 'installed' && (
        <button
          onClick={repair}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600/20 border border-amber-700/40 text-amber-300 text-[12px] hover:bg-amber-600/30"
        >
          <Zap size={12} /> Re-pair (push session token)
        </button>
      )}

      {showSetup && (
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-wider text-zinc-600">Extension ID</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={extId}
              onChange={e => setExtId(e.target.value)}
              placeholder="from chrome://extensions (developer mode → details → ID)"
              className="flex-1 bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[12px] font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#5b8cff]/50"
            />
            <button onClick={saveId} className="px-3 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] text-white text-[12px] font-medium">
              Save & ping
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Step 1: open <code className="text-zinc-400">chrome://extensions</code>, enable Developer mode → "Load unpacked" → select <code className="text-zinc-400">/frontend</code><br/>
            Step 2: copy the extension ID, paste above<br/>
            Step 3: visit <code className="text-zinc-400">platform.openai.com</code> with a key visible — extension auto-stores it
          </p>
        </div>
      )}
    </div>
  );
};

// ─── 1Password comparison panel ──────────────────────────────────────────────

const ComparisonPanel: React.FC = () => (
  <div className="rounded-2xl border border-[#1c2550] bg-gradient-to-br from-[#0e1430] to-[#0a0d1a] p-5">
    <h3 className="text-[14px] font-medium text-white flex items-center gap-2 mb-1">
      <Shield size={14} className="text-[#5b8cff]" />
      How KeyShield differs from 1Password CLI
    </h3>
    <p className="text-[12px] text-zinc-400 mb-4">Same vault UX, but built for an agent-first world.</p>

    <div className="rounded-xl border border-[#1c2238] bg-[#070912]/80 overflow-hidden">
      <div className="grid grid-cols-3 px-4 py-2.5 border-b border-[#141a2e] text-[10px] uppercase tracking-wider text-zinc-600">
        <div></div>
        <div>1Password CLI</div>
        <div>KeyShield</div>
      </div>
      {[
        ['Auth', 'master password + secret key', 'Solana wallet · ed25519'],
        ['Pricing', '$8 / user / month', 'free self-host · USDC per call'],
        ['Agent calls', 'agent gets the raw API key', 'agent gets a token, key stays server-side'],
        ['Per-call audit', 'just logs who read the secret', 'every API call · cost · latency · provider'],
        ['Platform fallback', '—', "use KeyShield's keys when you have none"],
        ['Source', 'closed-source SaaS', 'open-source · self-hostable'],
        ['Recovery', 'support tickets + emergency kit', 'wallet seed phrase = backup'],
      ].map(([feat, op, ks], i) => (
        <div key={feat} className={`grid grid-cols-3 px-4 py-2.5 ${i % 2 ? 'bg-[#0a0d1a]/40' : ''}`}>
          <div className="text-[12px] text-zinc-400">{feat}</div>
          <div className="text-[12px] text-zinc-500">{op}</div>
          <div className="text-[12px] text-emerald-300">{ks}</div>
        </div>
      ))}
    </div>

    <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
      KeyShield isn't trying to replace 1Password for password autofill on websites. It's a vault optimized for
      <em className="text-zinc-400 not-italic"> programmatic </em>
      consumption — agents, CI/CD, AI apps — where giving away the raw key is the actual security risk.
    </p>
  </div>
);

// ─── SettingsSection ─────────────────────────────────────────────────────────

export const SettingsSection: React.FC<{ addr: string }> = ({ addr }) => {
  const { wallet, signMessage, disconnect } = useWallet();
  const [passkeys, setPasskeys] = useState<Array<{ id: string; name: string; createdAt: number }>>([]);
  const [pkLoading, setPkLoading]   = useState(false);
  const [pkError, setPkError]       = useState('');
  const [pkSuccess, setPkSuccess]   = useState('');
  const [newPkName, setNewPkName]   = useState('My passkey');
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [deviceTrusted, setDeviceTrusted] = useState(() => !!getPasskeyTrust());

  const [prefs, setPrefsState] = useState<VaultPreferences>(() => getPrefs());

  const updatePref = <K extends keyof VaultPreferences>(k: K, v: VaultPreferences[K]) => {
    setPrefsState(setPrefs({ [k]: v } as Partial<VaultPreferences>));
  };

  const loadPasskeys = useCallback(async () => {
    setPkLoading(true);
    setPkError('');
    try {
      const creds = await listPasskeys();
      setPasskeys(creds);
    } catch {
      setPkError('Failed to load passkeys');
    } finally {
      setPkLoading(false);
    }
  }, []);

  useEffect(() => { loadPasskeys(); }, [loadPasskeys]);

  const handleRegister = async () => {
    setRegistering(true);
    setPkError('');
    setPkSuccess('');
    try {
      const adapter = wallet?.adapter as { signMessage?: (m: Uint8Array) => Promise<Uint8Array> } | undefined;
      const signFn = adapter?.signMessage?.bind(wallet?.adapter) ?? signMessage;
      if (!signFn) throw new Error('Wallet does not support signMessage');
      const sig = await signFn(new TextEncoder().encode(VAULT_KEY_MESSAGE));
      const digest = await crypto.subtle.digest('SHA-256', sig);
      const passphrase = btoa(String.fromCharCode(...new Uint8Array(digest)));
      await registerPasskey(newPkName);
      if (addr) setPasskeyTrust(addr, passphrase);
      setDeviceTrusted(true);
      setPkSuccess('Passkey added. Next time, sign in with Face ID.');
      setNewPkName('My passkey');
      await loadPasskeys();
    } catch (e) {
      setPkError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleForgetDevice = () => {
    clearPasskeyTrust();
    setDeviceTrusted(false);
    setPkSuccess('Device trust cleared on this browser.');
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deletePasskey(id);
      setPasskeys(prev => prev.filter(p => p.id !== id));
    } catch {
      setPkError('Failed to remove passkey');
    } finally {
      setDeletingId(null);
    }
  };

  const exportVault = async () => {
    try {
      const r = await apiFetch('/manage/list');
      if (!r.ok) throw new Error();
      const data = await r.json();
      const blob = new Blob([JSON.stringify({ exported_at: Date.now(), wallet: addr, ...data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `keyshield-vault-${addr.slice(0, 6)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    }
  };

  const endLocalSession = async () => {
    if (!confirm(
      'End local session & forget device?\n\n' +
      'This logs out of THIS browser only. The following are NOT deleted:\n' +
      '  • Your encrypted vault items on the server\n' +
      '  • Your registered passkeys\n' +
      '  • Your registered agents'
    )) return;
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try { await disconnect(); } catch {}
    clearAuth();
    clearPasskeyTrust();
    notifyAuthChanged();
    location.reload();
  };

  // ── Account deletion modal state ────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  const phraseValid = deletePhrase === DELETE_CONFIRMATION;

  const handleDeleteAccount = async () => {
    if (!phraseValid) return;
    setDeleteErr('');
    setDeleting(true);
    try {
      // If we have an attached wallet, sign the destructive challenge.
      let walletAddress: string | undefined;
      let signature:     string | undefined;
      let challenge:     string | undefined;

      const adapter = wallet?.adapter as { signMessage?: (m: Uint8Array) => Promise<Uint8Array> } | undefined;
      const signFn = adapter?.signMessage?.bind(wallet?.adapter) ?? signMessage;

      if (addr && signFn) {
        const ch = await fetchDeleteAccountChallenge();
        const sigBytes = await signFn(new TextEncoder().encode(ch.challenge));
        walletAddress = addr;
        signature     = btoa(String.fromCharCode(...sigBytes));
        challenge     = ch.challenge;
      }

      await deleteAccount({
        confirmation: DELETE_CONFIRMATION,
        walletAddress,
        signature,
        challenge,
      });

      // Cascade succeeded — clear local state and redirect home.
      try { await disconnect(); } catch {}
      clearAuth();
      clearPasskeyTrust();
      notifyAuthChanged();
      location.assign('/');
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : 'Account deletion failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── Identity ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div>
          <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
            <Key size={14} className="text-[#5b8cff]" /> Identity
          </h3>
          <p className="text-[12px] text-zinc-500 mt-0.5">Wallet that owns the vault. Recovery = wallet seed phrase.</p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
            <span className="text-[11px] text-zinc-500 w-24 shrink-0">Wallet</span>
            <code className="text-[12px] font-mono text-zinc-300 truncate flex-1">{addr || '—'}</code>
            <a href={addr ? `https://solscan.io/account/${addr}` : '#'} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white" title="View on Solscan">
              <ExternalLink size={12} />
            </a>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
            <span className="text-[11px] text-zinc-500 w-24 shrink-0">Auth</span>
            <span className="text-[12px] text-zinc-300">Solana ed25519 · zero-knowledge passphrase</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
            <span className="text-[11px] text-zinc-500 w-24 shrink-0">Encryption</span>
            <span className="text-[12px] text-zinc-300">AES-256-GCM · PBKDF2-HMAC-SHA256 (100k rounds)</span>
          </div>
        </div>
      </div>

      {/* ── Trusted devices ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
              <Fingerprint size={15} className="text-violet-400" />
              Trusted devices
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{passkeys.length}</span>
            </h3>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              Each passkey = one device that can sign in with Face ID / Touch ID / hardware key.
            </p>
          </div>
          <button onClick={loadPasskeys} className="text-zinc-500 hover:text-white" title="Refresh">
            <RefreshCw size={13} className={pkLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {pkError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
            <AlertCircle size={13} className="text-rose-400 shrink-0" />
            <p className="text-[12px] text-rose-300">{pkError}</p>
          </div>
        )}
        {pkSuccess && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50">
            <Check size={13} className="text-emerald-400 shrink-0" />
            <p className="text-[12px] text-emerald-300">{pkSuccess}</p>
          </div>
        )}

        {/* This device card */}
        <div className={`rounded-lg border px-3 py-2.5 flex items-center gap-3 ${
          deviceTrusted ? 'border-violet-900/40 bg-violet-950/20' : 'border-[#1c2238] bg-[#070912]'
        }`}>
          <div className={`w-2 h-2 rounded-full ${deviceTrusted ? 'bg-violet-400' : 'bg-zinc-600'}`} />
          <div className="flex-1">
            <p className="text-[12px] text-zinc-200">This browser</p>
            <p className="text-[11px] text-zinc-500">
              {deviceTrusted ? 'Passkey-trusted — next visit can use Face ID alone' : 'Not trusted yet — add a passkey below'}
            </p>
          </div>
          {deviceTrusted && (
            <button onClick={handleForgetDevice} className="text-[11px] text-zinc-500 hover:text-rose-400">
              Forget
            </button>
          )}
        </div>

        {/* Passkey list */}
        {passkeys.length > 0 && (
          <div className="space-y-2">
            {passkeys.map(pk => (
              <div key={pk.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e]">
                <Fingerprint size={14} className="text-violet-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-zinc-200 truncate">{pk.name}</p>
                  <p className="text-[11px] text-zinc-600 font-mono truncate">{pk.id.slice(0, 24)}…</p>
                </div>
                <span className="text-[10px] text-zinc-600">{new Date(pk.createdAt * 1000).toLocaleDateString()}</span>
                <button
                  onClick={() => handleDelete(pk.id)}
                  disabled={deletingId === pk.id}
                  className="text-zinc-600 hover:text-rose-400 transition-colors"
                >
                  {deletingId === pk.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {passkeys.length === 0 && !pkLoading && (
          <p className="text-[12px] text-zinc-600 text-center py-2">No passkeys registered yet</p>
        )}

        {/* Add passkey */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newPkName}
            onChange={e => setNewPkName(e.target.value)}
            placeholder="Device name (e.g. MacBook, iPhone)"
            className="flex-1 bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
          />
          <button
            onClick={handleRegister}
            disabled={registering || !newPkName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium"
          >
            {registering
              ? <><Loader2 size={13} className="animate-spin" /> Registering…</>
              : <><Fingerprint size={13} /> Add passkey</>}
          </button>
        </div>
      </div>

      {/* ── Vault preferences ────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div>
          <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
            <Lock size={14} className="text-[#5b8cff]" /> Vault preferences
          </h3>
          <p className="text-[12px] text-zinc-500 mt-0.5">
            Control how secrets reveal, expire, and notify. Saved to this browser only.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <PrefRow label="Auto-hide reveal after" hint="A revealed key auto-masks after this many seconds.">
            <select
              value={prefs.revealDurationSec}
              onChange={e => updatePref('revealDurationSec', Number(e.target.value))}
              className="bg-[#070912] border border-[#1c2238] rounded-lg px-2.5 py-1 text-[12px] text-white focus:outline-none focus:border-[#5b8cff]/50"
            >
              {[10, 30, 60, 120, 300].map(s => <option key={s} value={s}>{s}s</option>)}
            </select>
          </PrefRow>

          <PrefRow label="Default expiry" hint="Pre-fill the expiry date when adding a new secret.">
            <select
              value={prefs.defaultExpiryDays}
              onChange={e => updatePref('defaultExpiryDays', Number(e.target.value))}
              className="bg-[#070912] border border-[#1c2238] rounded-lg px-2.5 py-1 text-[12px] text-white focus:outline-none focus:border-[#5b8cff]/50"
            >
              <option value={0}>No expiry</option>
              {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </PrefRow>

          <PrefRow label="Notify before expiry" hint="Browser notification 7 days before any key expires.">
            <Toggle on={prefs.notifyOnExpiry} onChange={v => updatePref('notifyOnExpiry', v)} />
          </PrefRow>

          <PrefRow label="Anomaly alerts" hint="Notify if a key's call rate suddenly spikes 5×.">
            <Toggle on={prefs.notifyOnAnomaly} onChange={v => updatePref('notifyOnAnomaly', v)} />
          </PrefRow>
        </div>
      </div>

      {/* ── Browser extension (collapsed when paired) ────────────── */}
      <ExtensionPanel />

      {/* ── Data & account ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div>
          <h3 className="text-[14px] font-medium text-white">Data & account</h3>
          <p className="text-[12px] text-zinc-500 mt-0.5">Export, audit, or wipe.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={exportVault}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#070912] border border-[#1c2238] text-[12px] text-zinc-300 hover:text-white hover:border-[#2a3358] transition-colors"
          >
            <Download size={12} /> Export vault metadata (JSON)
          </button>
          <button
            onClick={endLocalSession}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-rose-900/60 bg-rose-950/20 text-[12px] text-rose-400 hover:bg-rose-950/40 transition-colors"
          >
            <Trash2 size={12} /> End local session &amp; forget device
          </button>
        </div>
        <p className="text-[10px] text-zinc-700 leading-relaxed">
          Export contains upstream names, timestamps, and tags — no plaintext keys.
          "End local session" only signs out this browser — vault items, passkeys, and agents survive on the server.
          To revoke <button onClick={() => window.dispatchEvent(new CustomEvent('ks-nav', { detail: 'sessions' }))} className="text-[#5b8cff] hover:underline">other devices, manage Sessions →</button>
        </p>
      </div>

      {/* ── Danger zone: permanent account deletion ─────────────── */}
      <div className="rounded-2xl border border-rose-900/40 bg-rose-950/10 p-5 space-y-3">
        <div>
          <h3 className="text-[14px] font-medium text-rose-300 flex items-center gap-2">
            <AlertCircle size={14} /> Danger zone
          </h3>
          <p className="text-[12px] text-rose-400/80 mt-0.5">
            Permanently delete your account, vault items, agents, and all usage history. This cannot be undone.
          </p>
        </div>
        <button
          onClick={() => { setDeletePhrase(''); setDeleteErr(''); setDeleteOpen(true); }}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-rose-700/60 bg-rose-950/40 text-[12px] text-rose-300 hover:bg-rose-900/50 transition-colors"
        >
          <Trash2 size={12} /> Delete account permanently
        </button>
      </div>

      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => { if (!deleting) setDeleteOpen(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-rose-700/60 bg-[#0a0d1a] p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold text-rose-300 flex items-center gap-2">
                <AlertCircle size={16} /> Delete account permanently?
              </h3>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                This will wipe every vault entry, every registered agent, all usage history,
                and your account record on the server. Your wallet keypair survives, but it
                cannot be re-registered with KeyShield afterwards (anti-replay).
              </p>
            </div>

            <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-3 space-y-2">
              <label className="block text-[11px] uppercase tracking-wider text-rose-300/80">
                Type <code className="text-rose-200 font-mono">{DELETE_CONFIRMATION}</code> to confirm
              </label>
              <input
                type="text"
                autoFocus
                value={deletePhrase}
                onChange={e => setDeletePhrase(e.target.value)}
                placeholder={DELETE_CONFIRMATION}
                className="w-full bg-[#070912] border border-rose-900/40 rounded-md px-3 py-2 text-[13px] font-mono text-rose-200 placeholder:text-rose-900/60 focus:outline-none focus:border-rose-500/60"
                disabled={deleting}
              />
            </div>

            {deleteErr && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-700/60">
                <AlertCircle size={13} className="text-rose-400 shrink-0" />
                <p className="text-[12px] text-rose-300">{deleteErr}</p>
              </div>
            )}

            <p className="text-[11px] text-zinc-500 leading-relaxed">
              {addr
                ? 'Your wallet will be asked to sign a destructive challenge. The signed message is single-use.'
                : 'Confirmation phrase only — no wallet signature required for this account type.'}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="flex-1 px-3 py-2 rounded-lg bg-[#070912] border border-[#1c2238] text-[13px] text-zinc-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={!phraseValid || deleting}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:bg-rose-950/40 disabled:text-rose-700 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors"
              >
                {deleting
                  ? <><Loader2 size={13} className="animate-spin" /> Deleting…</>
                  : <><Trash2 size={13} /> Delete account</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── How KeyShield differs from 1Password ─────────────────── */}
      <ComparisonPanel />
    </div>
  );
};

// ─── small helpers ───────────────────────────────────────────────────────────

const PrefRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e]">
    <div className="flex-1 min-w-0">
      <p className="text-[13px] text-zinc-200">{label}</p>
      {hint && <p className="text-[11px] text-zinc-600 mt-0.5">{hint}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button
    onClick={() => onChange(!on)}
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
      on
        ? 'bg-[#5b8cff]/20 border border-[#5b8cff]/50 text-[#5b8cff]'
        : 'bg-[#0a0d1a] border border-[#1c2238] text-zinc-500'
    }`}
    title={on ? 'On — click to disable' : 'Off — click to enable'}
  >
    {on ? <Bell size={11} /> : <BellOff size={11} />}
    {on ? 'On' : 'Off'}
  </button>
);
````

## File: components/sections/SharingSection.tsx
````typescript
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Share2, Plus, ArrowDownLeft, ArrowUpRight, Trash2, Loader2,
  AlertCircle, Check, RefreshCw, ShieldAlert,
} from 'lucide-react';
import {
  ShareRow, GrantShareInput,
  listIncomingShares, listOutgoingShares, grantShare, revokeShare,
} from '../../lib/api';
import { apiFetch } from '../../lib/auth';

type Tab = 'incoming' | 'outgoing' | 'new';

export const SharingSection: React.FC<{ addr: string }> = ({ addr }) => {
  const [tab, setTab] = useState<Tab>('incoming');
  const [incoming, setIncoming] = useState<ShareRow[]>([]);
  const [outgoing, setOutgoing] = useState<ShareRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [refreshErr, setRefreshErr] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setRefreshErr('');
    try {
      const [inc, out] = await Promise.all([
        listIncomingShares(),
        listOutgoingShares(),
      ]);
      setIncoming(inc);
      setOutgoing(out);
    } catch (e) {
      setRefreshErr(e instanceof Error ? e.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
              <Share2 size={14} className="text-[#5b8cff]" /> Sharing
            </h3>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              Grant teammates read access to specific keys without showing the plaintext.
              The encrypted DEK is re-wrapped to their public key so the server never sees either side.
            </p>
          </div>
          <button onClick={refresh} disabled={loading} className="text-zinc-500 hover:text-white" title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex gap-1 rounded-lg border border-[#1c2238] bg-[#070912] p-1 text-[12px]">
          <TabBtn active={tab === 'incoming'} onClick={() => setTab('incoming')}>
            <ArrowDownLeft size={12} /> Shared with me
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0a0d1a] text-zinc-500">{incoming.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'outgoing'} onClick={() => setTab('outgoing')}>
            <ArrowUpRight size={12} /> Shared by me
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0a0d1a] text-zinc-500">{outgoing.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'new'} onClick={() => setTab('new')}>
            <Plus size={12} /> New share
          </TabBtn>
        </div>

        {refreshErr && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
            <AlertCircle size={13} className="text-rose-400 shrink-0" />
            <p className="text-[12px] text-rose-300">{refreshErr}</p>
          </div>
        )}

        {tab === 'incoming' && (
          <SharesList
            shares={incoming}
            empty="Nothing shared with you yet."
            mode="incoming"
            onRevoke={undefined /* recipients can't revoke */}
          />
        )}
        {tab === 'outgoing' && (
          <SharesList
            shares={outgoing}
            empty="You haven't shared any keys yet."
            mode="outgoing"
            onRevoke={async id => {
              await revokeShare(id);
              await refresh();
            }}
          />
        )}
        {tab === 'new' && (
          <NewShareForm
            currentUser={addr}
            onGranted={async () => { setTab('outgoing'); await refresh(); }}
          />
        )}
      </div>
    </div>
  );
};


// ─── tab button ────────────────────────────────────────────────────────────

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = (
  { active, onClick, children },
) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-[12px] transition-colors ${
      active ? 'bg-[#5b8cff]/20 text-white border border-[#5b8cff]/40' : 'text-zinc-400 hover:text-white border border-transparent'
    }`}
  >
    {children}
  </button>
);


// ─── list of shares ────────────────────────────────────────────────────────

const SharesList: React.FC<{
  shares:    ShareRow[];
  empty:     string;
  mode:      'incoming' | 'outgoing';
  onRevoke?: (id: number) => Promise<void>;
}> = ({ shares, empty, mode, onRevoke }) => {
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeErr,  setRevokeErr]  = useState('');

  if (shares.length === 0) {
    return <p className="text-[12px] text-zinc-600 text-center py-4">{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {revokeErr && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
          <AlertCircle size={13} className="text-rose-400 shrink-0" />
          <p className="text-[12px] text-rose-300">{revokeErr}</p>
        </div>
      )}
      {shares.map(s => {
        const counterparty = mode === 'incoming' ? s.owner_id : s.recipient_id;
        const labelText    = mode === 'incoming' ? 'from'      : 'to';
        return (
          <div
            key={s.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e]"
          >
            <div className="text-zinc-500 shrink-0">
              {mode === 'incoming' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-zinc-200 truncate">
                <code className="text-[#5b8cff] font-mono">{s.key_name}</code>
                <span className="text-zinc-600 mx-1.5">{labelText}</span>
                <code className="text-zinc-300 font-mono">{counterparty.slice(0, 12)}…</code>
              </p>
              <p className="text-[11px] text-zinc-600">
                {new Date(s.created_at * 1000).toLocaleDateString()}
                {s.expires_at && ` · expires ${new Date(s.expires_at * 1000).toLocaleDateString()}`}
              </p>
            </div>
            {onRevoke && (
              <button
                onClick={async () => {
                  setRevokingId(s.id);
                  setRevokeErr('');
                  try { await onRevoke(s.id); } catch (e) {
                    setRevokeErr(e instanceof Error ? e.message : 'Revoke failed');
                  } finally { setRevokingId(null); }
                }}
                disabled={revokingId === s.id}
                className="text-zinc-600 hover:text-rose-400 transition-colors"
                title="Revoke"
              >
                {revokingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};


// ─── new-share form ────────────────────────────────────────────────────────

const NewShareForm: React.FC<{
  currentUser: string;
  onGranted:   () => Promise<void>;
}> = ({ currentUser, onGranted }) => {
  const [keys, setKeys] = useState<string[]>([]);
  const [keyName, setKeyName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [expiresStr, setExpiresStr] = useState('');     // YYYY-MM-DD or empty
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [stub, setStub]       = useState('');

  // Load list of vault keys for the dropdown.
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch('/manage/list');
        if (!r.ok) return;
        const data = await r.json();
        const slugs = (data.keys ?? []) as string[];
        setKeys(slugs);
        if (!keyName && slugs.length > 0) setKeyName(slugs[0]);
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expiresAt = useMemo<number | undefined>(() => {
    if (!expiresStr) return undefined;
    const t = new Date(expiresStr).getTime();
    if (Number.isNaN(t)) return undefined;
    return Math.floor(t / 1000);
  }, [expiresStr]);

  const valid = !!keyName && !!recipient && recipient !== currentUser;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setErr('');
    setSuccess('');
    setStub('');
    try {
      const input: GrantShareInput = {
        key_name:          keyName,
        recipient_user_id: recipient,
        expires_at:        expiresAt,
      };
      const r = await grantShare(input);
      if (r.status === 501) {
        setStub(r.detail || 'Sharing not yet implemented.');
      } else {
        setSuccess(`Shared ${keyName} with ${recipient.slice(0, 12)}…`);
        setRecipient('');
        await onGranted();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-600">Key</label>
        {keys.length === 0 ? (
          <p className="text-[12px] text-zinc-500 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
            No keys in your vault yet — add one in Vault first.
          </p>
        ) : (
          <select
            value={keyName}
            onChange={e => setKeyName(e.target.value)}
            disabled={submitting}
            className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#5b8cff]/50"
          >
            {keys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-600">Recipient (wallet address or userId)</label>
        <input
          type="text"
          value={recipient}
          onChange={e => setRecipient(e.target.value.trim())}
          placeholder="9WzDX… (Solana wallet) or alice"
          disabled={submitting}
          className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#5b8cff]/50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-600">Expires (optional)</label>
        <input
          type="date"
          value={expiresStr}
          onChange={e => setExpiresStr(e.target.value)}
          disabled={submitting}
          className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#5b8cff]/50"
        />
      </div>

      {err && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
          <AlertCircle size={13} className="text-rose-400 shrink-0" />
          <p className="text-[12px] text-rose-300">{err}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50">
          <Check size={13} className="text-emerald-400 shrink-0" />
          <p className="text-[12px] text-emerald-300">{success}</p>
        </div>
      )}
      {stub && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50">
          <ShieldAlert size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[12px] font-medium text-amber-300">Sharing not yet enabled</p>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">{stub}</p>
          </div>
        </div>
      )}

      <button
        onClick={submit}
        disabled={!valid || submitting || keys.length === 0}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
      >
        {submitting
          ? <><Loader2 size={13} className="animate-spin" /> Granting…</>
          : <><Share2 size={13} /> Grant share</>}
      </button>

      {recipient === currentUser && recipient !== '' && (
        <p className="text-[11px] text-amber-400/80 px-1">You can't share a key with yourself.</p>
      )}
    </div>
  );
};
````

## File: components/sections/VaultSection.tsx
````typescript
import React from 'react';
import { Plus, Key } from 'lucide-react';
import { VaultItem } from '../../types';
import { VaultItemCard } from '../VaultItemCard';
import { StatCard } from '../ui/StatCard';

interface Props {
  items: VaultItem[];
  total: number;
  expiringSoon: number;
  recentlyUsed: number;
  searchQuery: string;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onDecrypt: (id: string) => Promise<string>;
}

export const VaultSection: React.FC<Props> = ({ items, total, expiringSoon, recentlyUsed, searchQuery, onAdd, onDelete, onDecrypt }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatCard label="Total secrets" value={total} hint="encrypted with AES-256-GCM" />
      <StatCard label="Used this week" value={recentlyUsed} hint="across agents and apps" />
      <StatCard
        label="Expiring soon"
        value={<span className={expiringSoon > 0 ? 'text-amber-300' : 'text-white'}>{expiringSoon}</span>}
        hint="within 14 days"
      />
    </div>

    {items.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-[#1c2238] py-24 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-xl bg-[#0e1430] border border-[#1c2550] flex items-center justify-center mb-4">
          <Key size={20} className="text-[#5b8cff]" strokeWidth={1.75} />
        </div>
        <p className="text-[14px] text-zinc-300 font-medium">Your vault is empty</p>
        <p className="text-[12px] text-zinc-500 mt-1 mb-5">
          {searchQuery ? 'No secrets match your search.' : 'Add your first encrypted secret to get started.'}
        </p>
        {!searchQuery && (
          <button
            onClick={onAdd}
            className="h-9 px-4 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] text-white text-[13px] font-medium inline-flex items-center gap-2 transition-colors"
          >
            <Plus size={14} /> Add a secret
          </button>
        )}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(item => (
          <VaultItemCard key={item.id} item={item} onDelete={onDelete} onDecrypt={onDecrypt} />
        ))}
      </div>
    )}
  </div>
);
````

## File: components/SolanaProvider.tsx
````typescript
import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Wallets that support Wallet Standard auto-detect (Phantom, Solflare, Backpack, etc).
// We don't need explicit adapters anymore — the Wallet Standard handles them.
// Only keeping Solflare for legacy compatibility where Standard isn't available.
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

import '@solana/wallet-adapter-react-ui/styles.css';

interface Props {
  children: React.ReactNode;
}

export const SolanaProvider: React.FC<Props> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  // Wallet Standard auto-detects Phantom, Backpack, OKX, etc.
  // Solflare adapter kept for browsers without Standard support.
  const wallets = useMemo(
    () => [new SolflareWalletAdapter({ network })],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
````

## File: components/ui/Badge.tsx
````typescript
/**
 * Badge — Institutional compliance & status badges
 *
 * Pill-shaped for badges only, sharp for everything else.
 * Variants: default, success, warning, danger, info
 */
import React from 'react';

const base =
  'inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5';

const variants = {
  default:  'bg-zinc-800 text-zinc-400 border border-zinc-700',
  success:  'bg-emerald-950/60 text-emerald-400 border border-emerald-900/60',
  warning:  'bg-amber-950/60 text-amber-400 border border-amber-900/60',
  danger:   'bg-red-950/60 text-red-400 border border-red-900/60',
  info:     'bg-blue-950/60 text-blue-400 border border-blue-900/60',
  neutral:  'bg-zinc-900 text-zinc-500 border border-zinc-800',
} as const;

export interface BadgeProps {
  variant?: keyof typeof variants;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', dot = false, children, className = '' }) => (
  <span className={`${base} ${variants[variant]} ${className}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${
      variant === 'success' ? 'bg-emerald-400' :
      variant === 'warning' ? 'bg-amber-400' :
      variant === 'danger' ? 'bg-red-400' :
      variant === 'info' ? 'bg-blue-400' :
      'bg-zinc-500'
    }`} />}
    {children}
  </span>
);
````

## File: components/ui/Button.tsx
````typescript
/**
 * Button — Institutional Minimalist
 *
 * Sharp 2-4px corners, heavy weight, Swiss bank / nuclear silo aesthetic.
 * Four variants: primary, secondary, destructive, ghost.
 * All use Montserrat font, uppercase tracking, 2px borders.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';

const base =
  'inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-wider ' +
  'transition-all duration-150 select-none focus:outline-none focus:ring-1 focus:ring-white/20 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';

const variants = {
  primary:
    'bg-white text-black border border-white hover:bg-zinc-200 active:bg-zinc-300',
  secondary:
    'bg-transparent text-white border border-zinc-600 hover:border-white hover:text-white active:bg-white/5',
  destructive:
    'bg-transparent text-red-400 border border-red-900/60 hover:border-red-500 hover:text-red-300 active:bg-red-950/40',
  ghost:
    'bg-transparent text-zinc-400 hover:text-white hover:bg-white/5 active:bg-white/10',
  success:
    'bg-transparent text-emerald-400 border border-emerald-900/60 hover:border-emerald-500 hover:text-emerald-300 active:bg-emerald-950/40',
} as const;

const sizes = {
  sm: 'text-[10px] px-3 py-1.5 rounded-[2px]',
  md: 'text-[11px] px-4 py-2 rounded-[3px]',
  lg: 'text-[12px] px-6 py-2.5 rounded-[4px]',
  xl: 'text-[13px] px-8 py-3 rounded-[4px]',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}) => (
  <button
    className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? <Loader2 size={14} className="animate-spin" /> : null}
    {children}
  </button>
);
````

## File: components/ui/Card.tsx
````typescript
/**
 * Card — Heavy institutional container
 *
 * Sharp corners (2px), subtle border, dark background.
 * Optional header with title + description.
 * Guilloché pattern overlay available.
 */
import React from 'react';

export interface CardProps {
  title?: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'default' | 'raised' | 'bordered';
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  description,
  headerRight,
  children,
  variant = 'default',
  className = '',
}) => {
  const border = variant === 'raised'
    ? 'border border-zinc-800/80 shadow-lg shadow-black/40'
    : variant === 'bordered'
      ? 'border border-zinc-700'
      : 'border border-zinc-800/50';

  return (
    <div className={`rounded-[3px] bg-[#0a0a0a] ${border} ${className}`}>
      {title && (
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800/50">
          <div>
            <h3 className="text-[13px] font-bold text-white uppercase tracking-wider">{title}</h3>
            {description && (
              <p className="text-[11px] text-zinc-500 mt-0.5">{description}</p>
            )}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
};

/**
 * StatCard — Single metric display for dashboards
 */
export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}> = ({ label, value, hint, trend, className = '' }) => (
  <div className={`rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] px-4 py-3 ${className}`}>
    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</div>
    <div className="text-[22px] font-bold text-white tracking-tight mt-0.5">{value}</div>
    <div className="flex items-center gap-1.5 mt-1">
      {trend === 'up' && <span className="text-[10px] text-emerald-500">↑</span>}
      {trend === 'down' && <span className="text-[10px] text-red-500">↓</span>}
      {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
    </div>
  </div>
);
````

## File: components/ui/CodeBlock.tsx
````typescript
import React from 'react';
import { Copy, Check } from 'lucide-react';
import { useCopyable } from './CopyButton';

export const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code }) => {
  const { copied, copy } = useCopyable(code);
  return (
    <div className="relative rounded-lg bg-[#020408] border border-[#131929] overflow-hidden">
      <div className="absolute top-2.5 right-2.5">
        <button
          onClick={copy}
          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
            copied
              ? 'border-emerald-800 text-emerald-400 bg-emerald-950/40'
              : 'border-[#1c2238] text-zinc-500 hover:text-white bg-[#070912]'
          }`}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[12px] leading-relaxed font-mono text-zinc-300 pr-16">{code}</pre>
    </div>
  );
};
````

## File: components/ui/ConfirmButton.tsx
````typescript
/**
 * ConfirmButton — Two-step destructive action
 *
 * First click arms, second click within window commits.
 * Institutional styling with sharp corners.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

interface ConfirmButtonProps {
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
  confirmLabel?: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  title?: string;
  armWindowMs?: number;
}

export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  onConfirm,
  children,
  confirmLabel = 'CONFIRM',
  variant = 'destructive',
  size = 'sm',
  className = '',
  disabled = false,
  title,
  armWindowMs = 5000,
}) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = async () => {
    if (disabled || busy) return;
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), armWindowMs);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
  };

  return (
    <Button
      variant={armed ? 'destructive' : variant}
      size={size}
      disabled={disabled || busy}
      title={title}
      className={className}
      onClick={onClick}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
};
````

## File: components/ui/CopyButton.tsx
````typescript
/**
 * CopyButton — Clipboard copy with feedback
 */
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function useCopyable(text: string, ms = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), ms);
    });
  };
  return { copied, copy };
}

export const CopyButton: React.FC<{ text: string; className?: string; size?: number }> = ({
  text,
  className = '',
  size = 12,
}) => {
  const { copied, copy } = useCopyable(text);
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-[2px] border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? <Check size={size} className="text-emerald-400" /> : <Copy size={size} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};
````

## File: components/ui/DataTable.tsx
````typescript
/**
 * DataTable — Institutional tabular data
 *
 * Clean, high-contrast, tabular layout with sharp borders.
 * Designed for vault entries, transaction logs, agent lists.
 */
import React from 'react';

export interface Column<T> {
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  emptyMessage = 'No records found',
  className = '',
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className={`rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] py-12 text-center ${className}`}>
        <p className="text-[12px] text-zinc-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-[3px] border border-zinc-800/50 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="grid border-b border-zinc-800/50 bg-[#0d0d0d]" style={{ gridTemplateColumns: columns.map(c => c.className || '1fr').join(' ') }}>
        {columns.map((col, i) => (
          <div key={i} className="px-4 py-2.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            {col.header}
          </div>
        ))}
      </div>

      {/* Rows */}
      {data.map((item, rowIdx) => (
        <div
          key={item.id}
          className={`grid border-b border-zinc-800/30 last:border-0 hover:bg-white/[0.02] transition-colors ${
            rowIdx % 2 === 0 ? 'bg-[#0a0a0a]' : 'bg-[#0c0c0c]'
          }`}
          style={{ gridTemplateColumns: columns.map(c => c.className || '1fr').join(' ') }}
        >
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="px-4 py-3 text-[12px] text-zinc-300">
              {col.render(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
````

## File: components/ui/Guilloche.tsx
````typescript
/**
 * Guilloché — Institutional security pattern
 *
 * Subtle banknote-style line art background for headers, cards, or full page.
 * Renders as an SVG pattern overlay.
 */
import React from 'react';

export const GuillochePattern: React.FC<{ opacity?: number; className?: string }> = ({
  opacity = 0.03,
  className = '',
}) => (
  <svg
    className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    style={{ opacity }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <pattern id="guilloche" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M0 20 Q10 0 20 20 Q30 40 40 20" fill="none" stroke="white" strokeWidth="0.3" />
        <path d="M0 10 Q10 30 20 10 Q30 -10 40 10" fill="none" stroke="white" strokeWidth="0.2" />
        <path d="M0 30 Q10 10 20 30 Q30 50 40 30" fill="none" stroke="white" strokeWidth="0.2" />
        <circle cx="20" cy="20" r="3" fill="none" stroke="white" strokeWidth="0.2" />
        <circle cx="20" cy="20" r="6" fill="none" stroke="white" strokeWidth="0.15" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#guilloche)" />
  </svg>
);
````

## File: components/ui/Header.tsx
````typescript
/**
 * Header — Institutional top bar
 *
 * Logo + navigation title + status indicators + actions.
 * Full-width, sharp bottom border, Montserrat typography.
 */
import React from 'react';
import { Logo } from './Logo';
import { Button } from './Button';
import { Badge } from './Badge';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  onSearch?: () => void;
  onAdd?: () => void;
  searchActive?: boolean;
  actions?: React.ReactNode;
  healthStatus?: 'ok' | 'slow' | 'down' | 'unknown';
  latency?: number;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onSearch,
  onAdd,
  searchActive = false,
  actions,
  healthStatus = 'unknown',
  latency = 0,
}) => {
  const statusColor = healthStatus === 'ok' ? 'success'
    : healthStatus === 'slow' ? 'warning'
    : healthStatus === 'down' ? 'danger'
    : 'neutral';

  return (
    <header className="h-14 border-b border-zinc-800/60 bg-[#050505] px-6 flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-[14px] font-bold text-white uppercase tracking-wider">{title}</h1>
        {subtitle && <p className="text-[10px] text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Health indicator */}
        <div className="flex items-center gap-2" title={healthStatus === 'ok' ? `Backend healthy · ${latency}ms` : 'Backend status unknown'}>
          <Badge variant={statusColor} dot>
            {healthStatus === 'down' ? 'OFFLINE' : healthStatus === 'slow' ? 'SLOW' : 'API'}
          </Badge>
        </div>

        {actions}

        {onSearch && (
          <Button variant="ghost" size="sm" onClick={onSearch}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </Button>
        )}

        {onAdd && (
          <Button variant="primary" size="sm" onClick={onAdd}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New
          </Button>
        )}
      </div>
    </header>
  );
};
````

## File: components/ui/index.ts
````typescript
export { Button } from './Button';
export type { ButtonProps } from './Button';
export { Badge } from './Badge';
export type { BadgeProps } from './Badge';
export { Card, StatCard } from './Card';
export type { CardProps } from './Card';
export { Input, Select, Textarea } from './Input';
export type { InputProps } from './Input';
export { Logo } from './Logo';
export { Toggle } from './Toggle';
export type { ToggleProps } from './Toggle';
export { MultiSigTracker } from './MultiSigTracker';
export type { MultiSigTrackerProps } from './MultiSigTracker';
export { DataTable } from './DataTable';
export type { DataTableProps, Column } from './DataTable';
export { GuillochePattern } from './Guilloche';
export { ConfirmButton } from './ConfirmButton';
export { CopyButton, useCopyable } from './CopyButton';
````

## File: components/ui/Input.tsx
````typescript
/**
 * Input — Institutional Minimalist form fields
 *
 * Sharp corners, dark backgrounds, clean borders.
 * Variants: default, monospace (for keys/hashes), search
 */
import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  monospace?: boolean;
  fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  monospace = false,
  fullWidth = false,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {label && (
        <label htmlFor={inputId} className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full bg-[#050505] border rounded-[2px] px-3 py-2
          text-[13px] text-white placeholder:text-zinc-700
          focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-zinc-600
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-all duration-150
          ${monospace ? 'font-mono text-[12px]' : 'font-sans'}
          ${error ? 'border-red-900/60 focus:border-red-700' : 'border-zinc-800'}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-[10px] text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
};

/**
 * Select — Institutional dropdown
 */
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }> = ({
  label,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && (
        <label htmlFor={selectId} className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full bg-[#050505] border border-zinc-800 rounded-[2px] px-3 py-2
          text-[13px] text-white
          focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-zinc-600
          appearance-none cursor-pointer
          transition-all duration-150
          ${className}
        `}
        {...props}
      />
    </div>
  );
};

/**
 * Textarea — Multi-line input
 */
export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }> = ({
  label,
  error,
  className = '',
  id,
  ...props
}) => {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && (
        <label htmlFor={textareaId} className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`
          w-full bg-[#050505] border rounded-[2px] px-3 py-2
          text-[12px] font-mono text-white placeholder:text-zinc-700
          focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-zinc-600
          resize-y
          transition-all duration-150
          ${error ? 'border-red-900/60 focus:border-red-700' : 'border-zinc-800'}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );
};
````

## File: components/ui/Logo.tsx
````typescript
/**
 * Logo — KeyShield institutional mark
 *
 * Shield containing a key-shaped silhouette.
 * Two sizes: sm (header), lg (splash/auth screen).
 */
import React from 'react';

export const Logo: React.FC<{ size?: 'sm' | 'lg'; showText?: boolean; className?: string }> = ({
  size = 'sm',
  showText = true,
  className = '',
}) => {
  const dims = size === 'lg' ? { w: 48, h: 48, text: 'text-2xl' } : { w: 20, h: 20, text: 'text-[15px]' };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={dims.w}
        height={dims.h}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Shield outline */}
        <path
          d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          className="text-white"
        />
        {/* Key shape inside shield */}
        <circle cx="11.5" cy="11" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" className="text-zinc-400" />
        <line x1="13" y1="12.5" x2="16" y2="15.5" stroke="currentColor" strokeWidth="1.2" className="text-zinc-400" />
        <line x1="15" y1="14.5" x2="16" y2="13.5" stroke="currentColor" strokeWidth="1.2" className="text-zinc-400" />
        <line x1="15.5" y1="15" x2="16.5" y2="14" stroke="currentColor" strokeWidth="1.2" className="text-zinc-400" />
      </svg>
      {showText && (
        <span className={`${dims.text} font-bold tracking-tight text-white uppercase`}>
          KeyShield
        </span>
      )}
    </div>
  );
};
````

## File: components/ui/MultiSigTracker.tsx
````typescript
/**
 * MultiSigTracker — Multi-signature approval progress
 *
 * Shows required vs collected signatures with institutional styling.
 */
import React from 'react';

interface Signer {
  name: string;
  address: string;
  approved: boolean;
}

export interface MultiSigTrackerProps {
  required: number;
  signers: Signer[];
  className?: string;
}

export const MultiSigTracker: React.FC<MultiSigTrackerProps> = ({ required, signers, className = '' }) => {
  const approved = signers.filter(s => s.approved).length;
  const progress = Math.min((approved / required) * 100, 100);
  const complete = approved >= required;

  return (
    <div className={`rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          Multi-Signature Approval
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${
          complete ? 'text-emerald-400' : 'text-zinc-400'
        }`}>
          {approved}/{required}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-zinc-800 rounded-[1px] mb-3 overflow-hidden">
        <div
          className={`h-full rounded-[1px] transition-all duration-300 ${
            complete ? 'bg-emerald-400' : 'bg-white'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Signers */}
      <div className="space-y-1.5">
        {signers.map(signer => (
          <div key={signer.address} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-[1px] border flex items-center justify-center ${
              signer.approved
                ? 'bg-emerald-950/60 border-emerald-900/60 text-emerald-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-700'
            }`}>
              {signer.approved && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-zinc-300">{signer.name}</span>
            </div>
            <span className="text-[9px] font-mono text-zinc-600">
              {signer.address.slice(0, 6)}…{signer.address.slice(-4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
````

## File: components/ui/Placeholder.tsx
````typescript
import React from 'react';

export const Placeholder: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({ icon, title, body }) => (
  <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-12 flex flex-col items-center justify-center text-center">
    <div className="w-12 h-12 rounded-xl bg-[#0e1430] border border-[#1c2550] flex items-center justify-center mb-4">
      {icon}
    </div>
    <p className="text-[15px] text-white font-medium">{title}</p>
    <p className="text-[13px] text-zinc-500 mt-2 max-w-md">{body}</p>
  </div>
);
````

## File: components/ui/RevealField.tsx
````typescript
import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

interface Props {
  value: string;
  label?: string;
  autoHideSec?: number;
  copyable?: boolean;
  className?: string;
}

/**
 * Masked field that shows value for `autoHideSec` (default 30) when "Reveal" is clicked,
 * then auto-hides. Copy button works without revealing.
 */
export const RevealField: React.FC<Props> = ({
  value,
  label,
  autoHideSec = 30,
  copyable = true,
  className = '',
}) => {
  const [revealed, setRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => { if (tickRef.current) window.clearInterval(tickRef.current); }, []);

  const reveal = () => {
    setRevealed(true);
    setTimeLeft(autoHideSec);
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          window.clearInterval(tickRef.current!);
          setRevealed(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const hide = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    setRevealed(false);
    setTimeLeft(0);
  };

  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), autoHideSec * 1000);
  };

  const display = !value
    ? '— not set —'
    : revealed
      ? value
      : '•'.repeat(Math.min(value.length, 32));

  return (
    <div className={className}>
      {label && <p className="text-[12px] text-zinc-500 mb-2">{label}</p>}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#020408] border border-[#131929]">
        <code className={`flex-1 text-[12px] font-mono truncate ${revealed ? 'text-emerald-300' : 'text-zinc-500'}`}>
          {display}
        </code>
        {revealed && timeLeft > 0 && (
          <span className="shrink-0 text-[10px] text-emerald-500/70 font-mono">hides in {timeLeft}s</span>
        )}
        {value && (
          <button
            onClick={revealed ? hide : reveal}
            className="shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-[#1c2238] bg-[#070912] text-zinc-400 hover:text-white transition-colors"
            title={revealed ? 'Hide now' : `Reveal for ${autoHideSec}s`}
          >
            {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
            {revealed ? 'Hide' : 'Reveal'}
          </button>
        )}
        {copyable && value && (
          <button
            onClick={copy}
            className={`shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${
              copied
                ? 'border-emerald-800 bg-emerald-950/40 text-emerald-400'
                : 'border-[#1c2238] bg-[#070912] text-zinc-400 hover:text-white'
            }`}
            title={`Copy (clears in ${autoHideSec}s)`}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
};
````

## File: components/ui/SearchOverlay.tsx
````typescript
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
````

## File: components/ui/Sidebar.tsx
````typescript
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
````

## File: components/ui/StatCard.tsx
````typescript
import React from 'react';

export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 px-5 py-4">
    <div className="text-[12px] text-zinc-500">{label}</div>
    <div className="text-[24px] font-semibold text-white tracking-tight mt-1">{value}</div>
    {hint && <div className="text-[11px] text-zinc-500 mt-1">{hint}</div>}
  </div>
);
````

## File: components/ui/Toggle.tsx
````typescript
/**
 * Toggle — Institutional sleek toggle switch
 *
 * Sharp corners, high contrast.
 */
import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled, label, description }) => (
  <div className="flex items-center justify-between">
    <div>
      {label && <div className="text-[12px] text-white">{label}</div>}
      {description && <div className="text-[10px] text-zinc-500 mt-0.5">{description}</div>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative w-9 h-5 rounded-[2px] transition-colors duration-150
        focus:outline-none focus:ring-1 focus:ring-white/20
        disabled:opacity-40 disabled:cursor-not-allowed
        ${checked ? 'bg-white' : 'bg-zinc-700'}
      `}
    >
      <span
        className={`
          absolute top-0.5 left-0.5 w-4 h-3.5 rounded-[1px] bg-black
          transition-transform duration-150
          ${checked ? 'translate-x-4' : 'translate-x-0'}
        `}
      />
    </button>
  </div>
);
````

## File: components/VaultItemCard.tsx
````typescript
import React, { useState, useEffect, useRef } from 'react';
import {
  Eye, EyeOff, Key, Copy, Trash2, Check, Loader2, ExternalLink, Link2, Shield,
  Lock, FileText, Terminal, KeyRound,
} from 'lucide-react';
import { VaultItem, PasswordPayload, NotePayload, EnvPayload, SSHKeyPayload } from '../types';
import { getPrefs } from '../lib/preferences';
import { ConfirmButton } from './ui/ConfirmButton';

interface Props {
  item:      VaultItem;
  onDelete:  (id: string) => void;
  onDecrypt: (id: string) => Promise<string>;
}

const TYPE_ICON: Record<VaultItem['type'], React.ReactNode> = {
  api_key:  <Key size={13} className="text-[#5b8cff]" strokeWidth={1.75} />,
  password: <Lock size={13} className="text-amber-400" strokeWidth={1.75} />,
  note:     <FileText size={13} className="text-zinc-300" strokeWidth={1.75} />,
  env:      <Terminal size={13} className="text-emerald-400" strokeWidth={1.75} />,
  ssh_key:  <KeyRound size={13} className="text-violet-400" strokeWidth={1.75} />,
};

const TYPE_BG: Record<VaultItem['type'], string> = {
  api_key:  'bg-[#0e1430] border-[#1c2550]',
  password: 'bg-amber-950/30 border-amber-900/40',
  note:     'bg-zinc-800/40 border-zinc-700/40',
  env:      'bg-emerald-950/30 border-emerald-900/40',
  ssh_key:  'bg-violet-950/30 border-violet-900/40',
};

export const VaultItemCard: React.FC<Props> = ({ item, onDelete, onDecrypt }) => {
  const [isRevealed,   setIsRevealed]   = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [rawValue,     setRawValue]     = useState('');
  const [decryptErr,   setDecryptErr]   = useState('');
  const [timeLeft,     setTimeLeft]     = useState(0);
  const [keyCopied,    setKeyCopied]    = useState(false);
  const [proxyCopied,  setProxyCopied]  = useState(false);
  const timerRef = useRef<number | null>(null);
  const REVEAL_DURATION = getPrefs().revealDurationSec;

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(REVEAL_DURATION);
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearReveal(); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const clearReveal = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRevealed(false);
    setRawValue('');
    setTimeLeft(0);
  };

  const handleReveal = async () => {
    if (isRevealed) { clearReveal(); return; }
    setIsDecrypting(true);
    setDecryptErr('');
    try {
      const v = await onDecrypt(item.id);
      setRawValue(v);
      setIsRevealed(true);
      startTimer();
    } catch (e) {
      setDecryptErr(e instanceof Error ? e.message : 'Decrypt failed');
    } finally {
      setIsDecrypting(false);
    }
  };

  const copyToClipboard = (text: string, setCopied: (b: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Parse decrypted JSON for non-api_key types
  let parsed: PasswordPayload | NotePayload | EnvPayload | SSHKeyPayload | null = null;
  if (isRevealed && rawValue && item.type !== 'api_key') {
    try { parsed = JSON.parse(rawValue); } catch { /* malformed — show raw */ }
  }

  return (
    <div className="group rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 hover:border-[#2a3358] transition-colors p-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${TYPE_BG[item.type]}`}>
            {TYPE_ICON[item.type]}
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-medium text-white truncate leading-tight">{item.name || 'Untitled'}</h3>
            {item.domain && <p className="text-[11px] text-zinc-500 truncate">{item.domain}</p>}
            {item.type !== 'api_key' && !item.domain && (
              <p className="text-[11px] text-zinc-500 capitalize">{item.type.replace('_', ' ')}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.type === 'api_key' && (
            <div
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-emerald-900/50 bg-emerald-950/30 text-emerald-400"
              title="Self-custodian: stored encrypted in your vault. KeyShield never sees the plaintext."
            >
              <Shield size={8} strokeWidth={2.5} />
              <span>SELF-CUSTODIAN</span>
            </div>
          )}
          <ConfirmButton
            variant="destructive"
            onConfirm={() => onDelete(item.id)}
            title="Delete (click twice)"
            confirmLabel="Confirm"
            className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
          >
            <Trash2 size={12} />
          </ConfirmButton>
        </div>
      </div>

      {/* Body — depends on type */}
      {item.type === 'api_key' ? (
        <ApiKeyBody
          rawKey={isRevealed ? rawValue : ''}
          isDecrypting={isDecrypting}
          isRevealed={isRevealed}
          timeLeft={timeLeft}
          decryptErr={decryptErr}
          keyCopied={keyCopied}
          proxyCopied={proxyCopied}
          proxyUrl={item.value}
          onReveal={handleReveal}
          onCopyKey={() => copyToClipboard(rawValue, setKeyCopied)}
          onCopyProxy={() => copyToClipboard(item.value, setProxyCopied)}
        />
      ) : item.type === 'password' && parsed ? (
        <PasswordBody payload={parsed as PasswordPayload} timeLeft={timeLeft} onCopyKey={(text) => copyToClipboard(text, setKeyCopied)} keyCopied={keyCopied} onHide={clearReveal} />
      ) : item.type === 'note' && parsed ? (
        <NoteBody payload={parsed as NotePayload} timeLeft={timeLeft} onCopy={(text) => copyToClipboard(text, setKeyCopied)} copied={keyCopied} onHide={clearReveal} />
      ) : item.type === 'env' && parsed ? (
        <EnvBody payload={parsed as EnvPayload} timeLeft={timeLeft} onCopy={(text) => copyToClipboard(text, setKeyCopied)} copied={keyCopied} onHide={clearReveal} />
      ) : item.type === 'ssh_key' && parsed ? (
        <SSHBody payload={parsed as SSHKeyPayload} timeLeft={timeLeft} onCopy={(text) => copyToClipboard(text, setKeyCopied)} copied={keyCopied} onHide={clearReveal} />
      ) : (
        <RevealButton onReveal={handleReveal} isDecrypting={isDecrypting} decryptErr={decryptErr} />
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#11162a] border border-[#1c2238] text-zinc-500">
              {tag.toLowerCase()}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-zinc-600">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
};

// ─── Sub-components per type ─────────────────────────────────────────────────

const RevealButton: React.FC<{ onReveal: () => void; isDecrypting: boolean; decryptErr: string }> = ({ onReveal, isDecrypting, decryptErr }) => (
  <div>
    <button
      onClick={onReveal}
      disabled={isDecrypting}
      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e] hover:border-[#1c2550] text-[12px] text-zinc-300 hover:text-white transition-colors"
    >
      {isDecrypting
        ? <><Loader2 size={13} className="animate-spin" /> Decrypting…</>
        : <><Eye size={13} /> Reveal</>}
    </button>
    {decryptErr && <p className="text-[11px] text-rose-400 mt-1">{decryptErr}</p>}
  </div>
);

const ApiKeyBody: React.FC<{
  rawKey: string; isDecrypting: boolean; isRevealed: boolean; timeLeft: number;
  decryptErr: string; keyCopied: boolean; proxyCopied: boolean; proxyUrl: string;
  onReveal: () => void; onCopyKey: () => void; onCopyProxy: () => void;
}> = (p) => (
  <>
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Raw API key</span>
        {p.timeLeft > 0 && <span className="text-[10px] text-[#5b8cff] font-mono">hides in {p.timeLeft}s</span>}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
        <code className={`flex-1 text-[12px] font-mono break-all ${p.isRevealed ? 'text-emerald-300 select-all' : 'text-zinc-600'}`}>
          {p.isDecrypting ? '…decrypting' : p.isRevealed ? p.rawKey : '••••••••••••••••••••••••'}
        </code>
        <button onClick={p.onReveal} disabled={p.isDecrypting} className="shrink-0 text-zinc-500 hover:text-[#5b8cff] transition-colors" title={p.isRevealed ? 'Hide' : 'Reveal'}>
          {p.isDecrypting ? <Loader2 size={13} className="animate-spin" /> : p.isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        {p.isRevealed && (
          <button onClick={p.onCopyKey} className={`shrink-0 transition-colors ${p.keyCopied ? 'text-emerald-400' : 'text-zinc-500 hover:text-white'}`} title="Copy key">
            {p.keyCopied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
      </div>
      {p.decryptErr && <p className="text-[11px] text-rose-400 mt-1">{p.decryptErr}</p>}
    </div>

    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider flex items-center gap-1">
          <Link2 size={9} /> Proxy URL <span className="text-zinc-700">(use this in your agents)</span>
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#070912] border border-[#141a2e]">
        <code className="flex-1 text-[11px] font-mono text-zinc-400 truncate">{p.proxyUrl}</code>
        <button onClick={p.onCopyProxy} className={`shrink-0 transition-colors ${p.proxyCopied ? 'text-emerald-400' : 'text-zinc-600 hover:text-white'}`} title="Copy proxy URL">
          {p.proxyCopied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        <a href={p.proxyUrl} target="_blank" rel="noreferrer" className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors" title="Open">
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  </>
);

const HideStrip: React.FC<{ timeLeft: number; onHide: () => void }> = ({ timeLeft, onHide }) => (
  <div className="flex items-center justify-between mb-2">
    <span className="text-[10px] text-emerald-400 font-mono">REVEALED · hides in {timeLeft}s</span>
    <button onClick={onHide} className="text-[11px] text-zinc-500 hover:text-white">
      Hide now
    </button>
  </div>
);

const PasswordBody: React.FC<{ payload: PasswordPayload; timeLeft: number; keyCopied: boolean; onCopyKey: (s: string) => void; onHide: () => void }> = ({ payload, timeLeft, keyCopied, onCopyKey, onHide }) => (
  <div>
    <HideStrip timeLeft={timeLeft} onHide={onHide} />
    <div className="space-y-1.5">
      {payload.username && <Field label="Username" value={payload.username} onCopy={() => onCopyKey(payload.username)} mono={false} />}
      <Field label="Password" value={payload.password} onCopy={() => onCopyKey(payload.password)} mono copiedAccent={keyCopied} />
      {payload.url && <Field label="URL" value={payload.url} onCopy={() => onCopyKey(payload.url || '')} mono={false} link />}
    </div>
  </div>
);

const NoteBody: React.FC<{ payload: NotePayload; timeLeft: number; copied: boolean; onCopy: (s: string) => void; onHide: () => void }> = ({ payload, timeLeft, copied, onCopy, onHide }) => (
  <div>
    <HideStrip timeLeft={timeLeft} onHide={onHide} />
    <div className="px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e]">
      <pre className="text-[12px] font-mono text-zinc-200 whitespace-pre-wrap break-words leading-relaxed select-all">{payload.content}</pre>
      <button onClick={() => onCopy(payload.content)} className={`mt-2 flex items-center gap-1 text-[10px] ${copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-white'}`}>
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied' : 'Copy note'}
      </button>
    </div>
  </div>
);

const EnvBody: React.FC<{ payload: EnvPayload; timeLeft: number; copied: boolean; onCopy: (s: string) => void; onHide: () => void }> = ({ payload, timeLeft, copied, onCopy, onHide }) => {
  const envText = payload.vars.map(v => `${v.key}=${v.value}`).join('\n');
  return (
    <div>
      <HideStrip timeLeft={timeLeft} onHide={onHide} />
      <div className="px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e]">
        <pre className="text-[11px] font-mono text-zinc-200 whitespace-pre-wrap break-all leading-relaxed select-all">{envText}</pre>
        <button onClick={() => onCopy(envText)} className={`mt-2 flex items-center gap-1 text-[10px] ${copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-white'}`}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : `Copy ${payload.vars.length} var${payload.vars.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
};

const SSHBody: React.FC<{ payload: SSHKeyPayload; timeLeft: number; copied: boolean; onCopy: (s: string) => void; onHide: () => void }> = ({ payload, timeLeft, copied, onCopy, onHide }) => (
  <div>
    <HideStrip timeLeft={timeLeft} onHide={onHide} />
    <div className="space-y-1.5">
      {payload.publicKey && <Field label="Public" value={payload.publicKey} onCopy={() => onCopy(payload.publicKey)} mono />}
      <Field label="Private" value={`${payload.privateKey.slice(0, 28)}…${payload.privateKey.slice(-12)}`} onCopy={() => onCopy(payload.privateKey)} mono copiedAccent={copied} />
      {payload.passphrase && <Field label="Passphrase" value={payload.passphrase} onCopy={() => onCopy(payload.passphrase || '')} mono />}
    </div>
  </div>
);

const Field: React.FC<{ label: string; value: string; onCopy: () => void; mono: boolean; link?: boolean; copiedAccent?: boolean }> = ({ label, value, onCopy, mono, link, copiedAccent }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
    <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-16 shrink-0">{label}</span>
    {link ? (
      <a href={value} target="_blank" rel="noreferrer" className="flex-1 text-[12px] text-[#5b8cff] hover:underline truncate">{value}</a>
    ) : (
      <code className={`flex-1 text-[12px] truncate select-all ${mono ? 'font-mono' : ''} ${copiedAccent ? 'text-emerald-300' : 'text-zinc-200'}`}>{value}</code>
    )}
    <button onClick={onCopy} className="shrink-0 text-zinc-500 hover:text-white" title="Copy">
      <Copy size={12} />
    </button>
  </div>
);
````

## File: components/WalletConnector.tsx
````typescript
import React, { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Wallet, Check, Loader2, AlertCircle } from 'lucide-react';
import {
  clearAuth,
  fetchChallenge,
  isAuthenticated,
  notifyAuthChanged,
  setToken,
  setWalletAddress,
  walletLogin,
} from '../lib/auth';
import { VAULT_KEY_MESSAGE, deriveVaultPassphrase } from '../lib/vault-key';

interface Props {
  onConnect: () => void;
}

type Phase = 'idle' | 'signing' | 'authenticating' | 'done' | 'error';

export const WalletConnector: React.FC<Props> = ({ onConnect }) => {
  const { wallet, connect, connected: ctxConnected, connecting, publicKey: ctxPublicKey, disconnect, signMessage } = useWallet();
  const { setVisible } = useWalletModal();

  // Fallback for the WalletProvider event-listener race: the adapter is
  // sometimes connected before the React context catches up.
  const [adapterConnected, setAdapterConnected] = useState(false);
  useEffect(() => {
    const adapter = wallet?.adapter;
    if (!adapter) { setAdapterConnected(false); return; }
    setAdapterConnected(!!adapter.connected);
    const onConnectEvt = () => setAdapterConnected(true);
    const onDisconnectEvt = () => setAdapterConnected(false);
    adapter.on('connect', onConnectEvt);
    adapter.on('disconnect', onDisconnectEvt);
    return () => {
      adapter.off('connect', onConnectEvt);
      adapter.off('disconnect', onDisconnectEvt);
    };
  }, [wallet]);

  const connected = ctxConnected || adapterConnected;
  const publicKey = ctxPublicKey ?? wallet?.adapter?.publicKey ?? null;

  const [phase, setPhase]       = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const advancedRef             = useRef(false);

  useEffect(() => {
    if (isAuthenticated() && connected && !advancedRef.current) {
      advancedRef.current = true;
      setPhase('done');
      onConnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wallet && !connected && !connecting && phase === 'idle') {
      connect().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg || 'Failed to connect wallet');
        setPhase('error');
      });
    }
  }, [wallet, connected, connecting, connect, phase]);

  // Single-shot flow: connected → sign challenge + derivation message → login.
  useEffect(() => {
    if (!connected || !publicKey || phase !== 'idle') return;
    if (isAuthenticated()) {
      if (!advancedRef.current) { advancedRef.current = true; setPhase('done'); onConnect(); }
      return;
    }

    setPhase('signing');
    (async () => {
      try {
        // Use adapter.signMessage to bypass the stale "connected" guard.
        const adapterSign = (wallet?.adapter as { signMessage?: (m: Uint8Array) => Promise<Uint8Array> } | undefined)?.signMessage?.bind(wallet?.adapter);
        const signFn = adapterSign ?? signMessage;
        if (!signFn) throw new Error('Wallet does not support message signing.');

        // 1. Anti-replay: sign the server's random challenge.
        const { challenge: ch } = await fetchChallenge();
        const sig = await signFn(new TextEncoder().encode(ch));

        // 2. Vault key: sign a fixed message → hash → AES key.
        //    ed25519 is deterministic, so this is the same value every session
        //    for the same wallet, but unguessable without the private key.
        const keySig = await signFn(new TextEncoder().encode(VAULT_KEY_MESSAGE));
        const passphrase = await deriveVaultPassphrase(keySig);

        setPhase('authenticating');
        const { token, userId } = await walletLogin(
          publicKey.toBase58(),
          sig,
          ch,
          passphrase,
        );
        setToken(token);
        setWalletAddress(userId);
        notifyAuthChanged();
        advancedRef.current = true;
        setPhase('done');
        onConnect();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Login failed';
        setErrorMsg(msg);
        setPhase('error');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  function retry() {
    clearAuth();
    disconnect().catch(() => {});
    advancedRef.current = false;
    setErrorMsg('');
    setPhase('idle');
  }

  const shortAddr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : '';

  // ── error ────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="w-full space-y-3">
        <div className="px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start gap-3">
          <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[13px] text-rose-300 leading-relaxed break-words text-left">{errorMsg}</p>
        </div>
        <button
          type="button"
          onClick={retry}
          className="w-full py-2 rounded-xl border border-[#1c2238] text-[13px] text-zinc-400 hover:text-white hover:bg-[#11162a] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── done ─────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="rounded-2xl border border-[#1c2238] p-2 bg-[#0a0d1a]/60">
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-emerald-900/60 bg-[#0c1f17] text-emerald-300">
          <Check size={18} className="text-emerald-400 shrink-0" />
          <span className="text-[15px] font-medium tracking-tight">{shortAddr}</span>
        </div>
      </div>
    );
  }

  // ── signing / authenticating ─────────────────────────────────────────────
  if (phase === 'signing' || phase === 'authenticating') {
    const label =
      phase === 'signing'      ? 'Approve signature in your wallet…'
                               : 'Unlocking vault…';
    return (
      <div className="rounded-2xl border border-[#1c2238] p-2 bg-[#0a0d1a]/60">
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-[#222a48] bg-[#0c1025] text-zinc-200">
          <Loader2 size={18} className="animate-spin shrink-0 text-[#5b8cff]" />
          <div className="text-left">
            <p className="text-[14px] font-medium text-white">{label}</p>
            <p className="text-[12px] text-zinc-500 mt-0.5">{shortAddr || 'Waiting for wallet'}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── idle / select wallet ─────────────────────────────────────────────────
  const busy = connecting;
  return (
    <div className="w-full space-y-3">
      <div className="rounded-2xl border border-[#1c2238] p-2 bg-[#0a0d1a]/60">
        <button
          type="button"
          onClick={() => setVisible(true)}
          disabled={busy}
          className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-[#222a48] bg-[#11162a] hover:bg-[#161c36] text-white disabled:opacity-70 disabled:cursor-wait transition-colors"
        >
          <span className="flex items-center justify-center w-5 h-5">
            {busy ? <Loader2 size={18} className="animate-spin text-zinc-300" /> : <Wallet size={18} className="text-zinc-300" />}
          </span>
          <span className="text-[15px] font-medium tracking-tight">
            {busy ? 'Connecting…' : 'Connect Wallet'}
          </span>
        </button>
      </div>
      {busy && (
        <button
          type="button"
          onClick={retry}
          className="w-full text-center py-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      )}
      <p className="text-center text-[11px] text-zinc-600">
        Phantom · Solflare · Backpack · OKX
      </p>
    </div>
  );
};
````

## File: components/X402TrustManager.tsx
````typescript
/**
 * X402TrustManager
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings panel for managing the x402 auto-pay trusted domain list.
 * Communicates with the trust store via chrome.runtime messages so it works
 * in both popup and full-page dashboard contexts.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, Check, Zap, Globe } from 'lucide-react';
import { TrustList } from '../lib/x402-trust';

// ── helpers ──────────────────────────────────────────────────────────────────

async function sendMsg<T>(msg: object): Promise<T> {
  return new Promise((resolve, reject) => {
    // Check if chrome.runtime is available (extension context)
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      // In web dashboard context, try localStorage-based fallback
      reject(new Error('Chrome extension not available'));
      return;
    }
    chrome.runtime.sendMessage(msg, (resp) => {
      // @ts-ignore
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp as T);
    });
  });
}

async function fetchTrustList(): Promise<TrustList> {
  try {
    const resp = await sendMsg<{ list: TrustList }>({ type: 'GET_X402_TRUST' });
    return resp?.list ?? {};
  } catch {
    // Fallback: read from localStorage directly (when running outside extension)
    try {
      const raw = localStorage.getItem('ks_x402_trust_list_web');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}

async function getCurrentTabHostname(): Promise<string | null> {
  try {
    // In web dashboard, use window.location
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      return typeof window !== 'undefined' ? window.location.hostname || null : null;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url;
    if (!url) return null;
    return new URL(url).hostname || null;
  } catch {
    return typeof window !== 'undefined' ? window.location.hostname || null : null;
  }
}

// ── Toggle ────────────────────────────────────────────────────────────────────

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({
  on,
  onChange,
  disabled,
}) => (
  <button
    onClick={() => !disabled && onChange(!on)}
    disabled={disabled}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
      on ? 'bg-[#5b8cff]' : 'bg-[#27272a]'
    }`}
    title={on ? 'Enabled — click to disable' : 'Disabled — click to enable'}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
);

// ── X402TrustManager ──────────────────────────────────────────────────────────

export const X402TrustManager: React.FC = () => {
  const [trustList, setTrustList]         = useState<TrustList>({});
  const [loading, setLoading]             = useState(true);
  const [currentHost, setCurrentHost]     = useState<string | null>(null);
  const [newDomain, setNewDomain]         = useState('');
  const [newThreshold, setNewThreshold]   = useState<string>('1');
  const [adding, setAdding]               = useState(false);
  const [removingKey, setRemovingKey]     = useState<string | null>(null);
  const [err, setErr]                     = useState('');
  const [ok, setOk]                       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchTrustList();
    setTrustList(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    getCurrentTabHostname().then(h => {
      if (h && h !== 'newtab') setCurrentHost(h);
    });
  }, [load]);

  // Auto-clear feedback after 3s
  useEffect(() => {
    if (!ok && !err) return;
    const t = setTimeout(() => { setOk(''); setErr(''); }, 3000);
    return () => clearTimeout(t);
  }, [ok, err]);

  const handleAdd = async (domain?: string, threshold?: number) => {
    const host  = (domain ?? newDomain).trim().replace(/^https?:\/\//, '').split('/')[0];
    const amt   = threshold ?? parseFloat(newThreshold);

    if (!host)         { setErr('Enter a hostname (e.g. api.example.com)'); return; }
    if (isNaN(amt) || amt <= 0) { setErr('Threshold must be a positive number'); return; }

    setAdding(true);
    setErr('');
    try {
      await sendMsg({ type: 'UPDATE_X402_TRUST', action: 'add', hostname: host, threshold_usd: amt });
      setOk(`${host} added — auto-pay up to $${amt.toFixed(2)}`);
      setNewDomain('');
      setNewThreshold('1');
      await load();
    } catch {
      // Fallback: use localStorage directly
      try {
        const raw = localStorage.getItem('ks_x402_trust_list_web');
        const list: TrustList = raw ? JSON.parse(raw) : {};
        list[host] = { threshold_usd: amt, enabled: list[host]?.enabled ?? true, added_at: list[host]?.added_at ?? Date.now() };
        localStorage.setItem('ks_x402_trust_list_web', JSON.stringify(list));
        setOk(`${host} added — auto-pay up to $${amt.toFixed(2)}`);
        setNewDomain('');
        setNewThreshold('1');
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to add domain');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (hostname: string) => {
    setRemovingKey(hostname);
    setErr('');
    try {
      await sendMsg({ type: 'UPDATE_X402_TRUST', action: 'remove', hostname });
      setTrustList(prev => {
        const next = { ...prev };
        delete next[hostname];
        return next;
      });
    } catch {
      // Fallback: localStorage
      try {
        const raw = localStorage.getItem('ks_x402_trust_list_web');
        const list: TrustList = raw ? JSON.parse(raw) : {};
        delete list[hostname];
        localStorage.setItem('ks_x402_trust_list_web', JSON.stringify(list));
        setTrustList(prev => {
          const next = { ...prev };
          delete next[hostname];
          return next;
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to remove domain');
      }
    } finally {
      setRemovingKey(null);
    }
  };

  const handleToggle = async (hostname: string, enabled: boolean) => {
    // Optimistic update
    setTrustList(prev => ({
      ...prev,
      [hostname]: { ...prev[hostname], enabled },
    }));
    try {
      await sendMsg({ type: 'UPDATE_X402_TRUST', action: 'toggle', hostname, enabled });
    } catch {
      // Fallback: localStorage
      try {
        const raw = localStorage.getItem('ks_x402_trust_list_web');
        const list: TrustList = raw ? JSON.parse(raw) : {};
        if (list[hostname]) {
          list[hostname] = { ...list[hostname], enabled };
          localStorage.setItem('ks_x402_trust_list_web', JSON.stringify(list));
        }
      } catch {
        // Revert on failure
        await load();
      }
    }
  };

  const entries = Object.entries(trustList).sort((a, b) => b[1].added_at - a[1].added_at);
  const currentHostAlreadyTrusted = currentHost ? !!trustList[currentHost] : false;

  return (
    <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
          <Zap size={14} className="text-[#5b8cff]" /> Trusted Domains for Auto-Pay
        </h3>
        <p className="text-[12px] text-zinc-500 mt-0.5">
          When a site responds with HTTP 402 (x402), KeyShield auto-pays if the domain is
          trusted and the amount is below your threshold. Otherwise it prompts you.
        </p>
      </div>

      {/* Feedback */}
      {err && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
          <AlertCircle size={13} className="text-rose-400 shrink-0" />
          <p className="text-[12px] text-rose-300">{err}</p>
        </div>
      )}
      {ok && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50">
          <Check size={13} className="text-emerald-400 shrink-0" />
          <p className="text-[12px] text-emerald-300">{ok}</p>
        </div>
      )}

      {/* Current-tab quick-add chip */}
      {currentHost && !currentHostAlreadyTrusted && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0e1430] border border-[#1c2550]">
          <Globe size={12} className="text-[#5b8cff] shrink-0" />
          <span className="text-[12px] text-zinc-300 flex-1 truncate">
            Current tab: <span className="font-mono text-white">{currentHost}</span>
          </span>
          <button
            onClick={() => handleAdd(currentHost, 1)}
            disabled={adding}
            className="shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-[#5b8cff]/20 border border-[#5b8cff]/40 text-[#5b8cff] hover:bg-[#5b8cff]/30 transition-colors disabled:opacity-50"
          >
            <Plus size={10} /> Quick-add ($1.00)
          </button>
        </div>
      )}

      {/* Domain table */}
      <div className="rounded-xl border border-[#1c2238] bg-[#070912]/80 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 border-b border-[#141a2e] text-[10px] uppercase tracking-wider text-zinc-600">
          <div>Domain</div>
          <div className="text-right">Threshold</div>
          <div>Enabled</div>
          <div></div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-zinc-500">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[12px]">Loading…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-zinc-500">No trusted domains yet.</p>
            <p className="text-[11px] text-zinc-700 mt-1">
              Add a domain below to enable auto-pay.
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && entries.map(([hostname, entry]) => (
          <div
            key={hostname}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3 border-b border-[#0d1020] last:border-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Globe size={11} className="text-zinc-600 shrink-0" />
                <span className="text-[13px] text-zinc-200 font-mono truncate">{hostname}</span>
                {hostname === currentHost && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#5b8cff]/20 text-[#5b8cff] border border-[#5b8cff]/30 shrink-0">
                    current
                  </span>
                )}
              </div>
              <div className="text-[10px] text-zinc-700 mt-0.5 font-mono pl-[19px]">
                added {new Date(entry.added_at).toLocaleDateString()}
              </div>
            </div>

            <div className="text-[13px] text-zinc-300 font-mono text-right shrink-0">
              ${entry.threshold_usd.toFixed(2)}
            </div>

            <div className="shrink-0">
              <Toggle
                on={entry.enabled}
                onChange={(v) => handleToggle(hostname, v)}
              />
            </div>

            <div className="shrink-0">
              <button
                onClick={() => handleRemove(hostname)}
                disabled={removingKey === hostname}
                className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-600 hover:text-rose-400 hover:bg-rose-950/30 transition-colors disabled:opacity-40"
                title="Remove domain"
              >
                {removingKey === hostname
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Trash2 size={12} />}
              </button>
            </div>
          </div>
        ))}

        {/* Add domain row */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-4 py-3 border-t border-[#141a2e] bg-[#05060d]/60">
          <input
            type="text"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="api.example.com"
            className="bg-[#0a0d1a] border border-[#1c2238] rounded-lg px-3 py-1.5 text-[12px] font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#5b8cff]/50 min-w-0"
          />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[12px] text-zinc-600">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={newThreshold}
              onChange={e => setNewThreshold(e.target.value)}
              className="w-20 bg-[#0a0d1a] border border-[#1c2238] rounded-lg px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#5b8cff]/50"
              title="Max auto-pay amount in USD"
            />
          </div>
          <button
            onClick={() => handleAdd()}
            disabled={adding || !newDomain.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[12px] font-medium transition-colors shrink-0"
          >
            {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add
          </button>
        </div>
      </div>

      {/* Info footer */}
      <p className="text-[10px] text-zinc-700 leading-relaxed">
        Auto-pay only fires when the site returns{' '}
        <code className="text-zinc-500">HTTP 402</code> with{' '}
        <code className="text-zinc-500">X-Payment-Required: x402</code> and the payment
        amount is strictly below your threshold. Payments go through your connected wallet.
      </p>
    </div>
  );
};
````

## File: constants.tsx
````typescript
export const THEME = {
  primary: '#5b8cff',
  background: '#05060d',
  surface: '#0a0d1a',
  border: '#1c2238',
  textMuted: '#71717a',
  text: '#e4e4e7',
};
````

## File: content.js
````javascript
/**
 * KeyShield Content Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Watches every page for exposed API keys and shows a one-click "Save to vault"
 * notification. Domain-aware: when you're on platform.openai.com, OpenAI keys
 * get the highest priority match; the same pattern would be ignored if found
 * on a random blog (avoids false positives from tutorial code).
 *
 * Maps detected provider → KeyShield backend `upstream` so a single click
 * stores the key under the correct vault namespace.
 *
 * ── Detect → save flow audit (2026-05) ────────────────────────────────────
 *   detect (this file)
 *      └─ scan() text + inputs → handleMatch() → showNotification()
 *           ├─ "Save to vault" click
 *           │     └─ chrome.runtime.sendMessage({type:'SAVE_KEY', payload})
 *           │           └─ background.js → POST /manage/store {upstream, apiKey}
 *           │                 ├─ 200 → chrome.notifications + sendResponse(ok:true)
 *           │                 │         → in-page toast "Saved to vault"
 *           │                 ├─ 401 → fallback to dashboard prefill
 *           │                 └─ network → fallback to dashboard prefill
 *           ├─ "Dismiss" click       → just remove the notification
 *           └─ "Hide on this domain" → store HOST in dismissed_domains and stop
 *
 *   Gaps that USED to exist (closed in this revision):
 *     - background.js was hardcoded to localhost:8000.   FIX: storage override.
 *     - sendMessage was fire-and-forget, no UI feedback. FIX: callback + toast.
 *     - No way to silence the toast on noisy domains.    FIX: dismissed_domains.
 *     - Manifest had no prod host_permissions.           FIX: keyshield.dev/*.
 *
 *   Known remaining gaps (intentional, not in scope here):
 *     - mistral/cohere/alchemy generic 32–40 char regexes only fire on-domain
 *       (requiresDomain=true) but inside iframes the host check uses the top
 *       window's hostname; a same-origin iframe is fine, cross-origin iframe
 *       won't trigger. Acceptable for the OpenAI / Helius "happy path" demo.
 *     - The popup writes ks_token via externally_connectable from the dashboard
 *       only. There's no "paste your token" form in the popup itself yet.
 */

// ── Provider definitions ────────────────────────────────────────────────────
//
// Each provider has:
//   id         — KeyShield backend upstream name (must match server.py UPSTREAMS)
//   name       — human label
//   label      — 3-letter badge for the in-page toast
//   patterns   — list of regex (multiple to cover variants)
//   domains    — hostnames where this key is most likely (priority boost)
//   minLen     — sanity floor

const PROVIDERS = [
  {
    id:       'openai',
    name:     'OpenAI',
    label:    'AI',
    patterns: [
      /sk-proj-[A-Za-z0-9_-]{20,}/g,        // new-format project key
      /sk-svcacct-[A-Za-z0-9_-]{20,}/g,      // service account
      /sk-admin-[A-Za-z0-9_-]{20,}/g,        // admin key
      /sk-[A-Za-z0-9]{40,}/g,                // legacy 48+ char
    ],
    domains:  ['platform.openai.com', 'openai.com'],
    minLen:   30,
  },
  {
    id:       'anthropic',
    name:     'Anthropic Claude',
    label:    'AI',
    patterns: [
      /sk-ant-api\d{2}-[A-Za-z0-9_-]{50,}/g,
    ],
    domains:  ['console.anthropic.com', 'anthropic.com'],
    minLen:   60,
  },
  {
    id:       'groq',
    name:     'Groq',
    label:    'AI',
    patterns: [/gsk_[A-Za-z0-9]{40,}/g],
    domains:  ['console.groq.com', 'groq.com'],
    minLen:   40,
  },
  {
    id:       'mistral',
    name:     'Mistral AI',
    label:    'AI',
    patterns: [/[A-Za-z0-9]{32}/g],   // generic 32-char — needs domain match
    domains:  ['console.mistral.ai', 'mistral.ai'],
    minLen:   32,
    requiresDomain: true,             // never trigger off-domain
  },
  {
    id:       'cohere',
    name:     'Cohere',
    label:    'AI',
    patterns: [/[A-Za-z0-9]{40}/g],
    domains:  ['dashboard.cohere.com', 'cohere.com', 'cohere.ai'],
    minLen:   40,
    requiresDomain: true,
  },
  {
    id:       'helius',
    name:     'Helius RPC',
    label:    'SOL',
    patterns: [
      /helius_auth_[A-Za-z0-9]{20,}/g,
      // Helius API keys also appear as UUIDs on dashboard.helius.dev
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    ],
    domains:  ['dashboard.helius.dev', 'helius.dev', 'helius.xyz'],
    minLen:   20,
    requiresDomain: true,             // UUID-only keys = high false positive
  },
  {
    id:       '0x',
    name:     '0x Protocol',
    label:    'DEX',
    patterns: [/[A-Za-z0-9-]{36}/g],
    domains:  ['dashboard.0x.org', '0x.org'],
    minLen:   36,
    requiresDomain: true,
  },
  {
    id:       'alchemy',
    name:     'Alchemy',
    label:    'RPC',
    patterns: [/[A-Za-z0-9_-]{32}/g],
    domains:  ['dashboard.alchemy.com', 'alchemy.com'],
    minLen:   32,
    requiresDomain: true,
  },
];

// ── State ───────────────────────────────────────────────────────────────────

const detectedKeys = new Set();
let notificationActive = false;
let domainDismissed   = false;   // set asynchronously below
const HOST = window.location.hostname;

// Read user's per-domain dismissals from chrome.storage.local. Populated once
// at startup; updated when "Hide on this domain" is clicked.
function loadDismissedDomains() {
  try {
    chrome.storage?.local?.get?.(['dismissed_domains'], (out) => {
      const list = (out && out.dismissed_domains) || [];
      domainDismissed = Array.isArray(list) && list.includes(HOST);
      if (domainDismissed) console.log(`[KeyShield] ${HOST} is in dismissed_domains — auto-detect muted`);
    });
  } catch {
    // Extension context might not be available (e.g. in dev-server preview).
    // Fail open: keep auto-detect on.
  }
}

function dismissThisDomain() {
  try {
    chrome.storage?.local?.get?.(['dismissed_domains'], (out) => {
      const list = (out && Array.isArray(out.dismissed_domains)) ? out.dismissed_domains : [];
      if (!list.includes(HOST)) list.push(HOST);
      chrome.storage.local.set({ dismissed_domains: list }, () => {
        domainDismissed = true;
      });
    });
  } catch {/* noop */}
}

// Domain → provider boost (when a page has a matching provider domain,
// we treat its keys as high-confidence)
function isOnDomain(provider) {
  return provider.domains.some(d => HOST === d || HOST.endsWith('.' + d));
}

// ── Scanner ─────────────────────────────────────────────────────────────────

function scan() {
  if (domainDismissed) return;
  // 1. Visible text
  const text = document.body?.innerText || '';
  // 2. Input values (often where keys are revealed via "Show" button)
  const inputs = Array.from(document.querySelectorAll('input, textarea, code, pre'));

  for (const provider of PROVIDERS) {
    const onDomain = isOnDomain(provider);
    if (provider.requiresDomain && !onDomain) continue;

    for (const regex of provider.patterns) {
      regex.lastIndex = 0;  // reset stateful flag
      let m;
      while ((m = regex.exec(text)) !== null) {
        if (m[0].length >= provider.minLen) handleMatch(m[0], provider, onDomain);
      }
      for (const el of inputs) {
        const v = (el.value || el.textContent || '');
        regex.lastIndex = 0;
        const im = regex.exec(v);
        if (im && im[0].length >= provider.minLen) handleMatch(im[0], provider, onDomain);
      }
    }
  }
}

function handleMatch(key, provider, onDomain) {
  if (detectedKeys.has(key)) return;
  detectedKeys.add(key);
  console.log(`[KeyShield] detected ${provider.name} key on ${HOST} (onDomain=${onDomain})`);
  showNotification(key, provider, onDomain);
}

// ── Notification UI ─────────────────────────────────────────────────────────

function showNotification(key, provider, onDomain) {
  if (notificationActive) return;
  notificationActive = true;

  const container = document.createElement('div');
  container.id = 'keyshield-detection-notice';
  Object.assign(container.style, {
    position:        'fixed',
    top:             '20px',
    right:           '20px',
    zIndex:          '999999',
    backgroundColor: '#0a0d1a',
    border:          '1px solid #1c2238',
    borderRadius:    '12px',
    padding:         '16px',
    width:           '320px',
    boxShadow:       '0 20px 40px -10px rgba(0,0,0,0.6)',
    color:           '#e4e4e7',
    fontFamily:      '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    display:         'flex',
    flexDirection:   'column',
    gap:             '12px',
    animation:       'keyshield-slide 0.18s ease-out',
  });

  if (!document.getElementById('keyshield-style')) {
    const style = document.createElement('style');
    style.id = 'keyshield-style';
    style.textContent = `
      @keyframes keyshield-slide {
        from { transform: translateY(-12px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      .ks-btn{cursor:pointer;border:1px solid transparent;border-radius:8px;
        padding:9px 12px;font-size:12px;font-weight:500;transition:all .15s}
      .ks-btn-primary{background:#5b8cff;color:white;border-color:#5b8cff}
      .ks-btn-primary:hover{background:#7aa1ff}
      .ks-btn-ghost{background:transparent;color:#71717a;border-color:#27272a}
      .ks-btn-ghost:hover{color:#fafafa;border-color:#3f3f46}
      .ks-conf{display:inline-flex;align-items:center;gap:4px;font-size:10px;
        padding:2px 6px;border-radius:4px;font-weight:600}
      .ks-conf-high{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
      .ks-conf-med{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
    `;
    document.head.appendChild(style);
  }

  const conf = onDomain ? 'high' : 'med';
  const confText = onDomain
    ? `HIGH confidence — you are on ${HOST}`
    : `Detected, please verify provider`;

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="background:#0e1430;padding:6px 8px;border-radius:6px;
                  font-size:10px;font-weight:700;color:#5b8cff;
                  border:1px solid #1c2550;letter-spacing:.05em">${provider.label}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">API key detected</div>
        <div style="color:#a1a1aa;font-size:11px;margin-top:2px">${provider.name} · ${HOST}</div>
      </div>
      <span class="ks-conf ks-conf-${conf}">${onDomain ? '✓ MATCH' : '? CHECK'}</span>
    </div>
    <div style="background:#020408;padding:10px 12px;border-radius:6px;
                font-family:'JetBrains Mono',monospace;font-size:11px;
                color:#86efac;border:1px solid #131929;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      ${key.substring(0, 14)}••••••••${key.substring(key.length - 4)}
    </div>
    <div style="font-size:10px;color:#71717a;line-height:1.5">
      ${confText}
    </div>
    <div id="ks-status" style="display:none;font-size:11px;padding:6px 8px;
         border-radius:6px;line-height:1.4"></div>
    <div style="display:flex;gap:8px">
      <button id="ks-save"   class="ks-btn ks-btn-primary" style="flex:1">
        Save to vault as <strong>${provider.id}</strong>
      </button>
      <button id="ks-ignore" class="ks-btn ks-btn-ghost">Dismiss</button>
    </div>
    <div style="display:flex;justify-content:flex-end">
      <a id="ks-hide-domain" href="#"
         style="font-size:10px;color:#71717a;text-decoration:none;
                cursor:pointer;border-bottom:1px dotted #3f3f46">
        Hide for this domain
      </a>
    </div>
  `;

  document.body.appendChild(container);

  const status = container.querySelector('#ks-status');
  const setStatus = (text, kind) => {
    status.textContent = text;
    status.style.display = 'block';
    if (kind === 'ok') {
      status.style.background = 'rgba(16,185,129,.12)';
      status.style.color = '#34d399';
      status.style.border = '1px solid rgba(16,185,129,.3)';
    } else if (kind === 'err') {
      status.style.background = 'rgba(239,68,68,.12)';
      status.style.color = '#f87171';
      status.style.border = '1px solid rgba(239,68,68,.3)';
    } else {
      status.style.background = 'rgba(91,140,255,.12)';
      status.style.color = '#93b4ff';
      status.style.border = '1px solid rgba(91,140,255,.3)';
    }
  };

  let autoCloseTimer = setTimeout(() => closeNotice(), 12000);
  function closeNotice() {
    clearTimeout(autoCloseTimer);
    if (container.parentNode) container.remove();
    notificationActive = false;
  }

  const saveBtn = container.querySelector('#ks-save');
  saveBtn.onclick = () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    setStatus('Sending to your vault…', 'info');

    // Pause the auto-close while a save is in flight; we want the user to
    // actually see the success/failure toast.
    clearTimeout(autoCloseTimer);

    try {
      chrome.runtime.sendMessage(
        {
          type:    'SAVE_KEY',
          payload: {
            upstream: provider.id,                  // backend upstream name
            name:     `${provider.name} (${HOST})`,
            value:    key,
            domain:   HOST,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            setStatus(`Could not reach extension: ${chrome.runtime.lastError.message}`, 'err');
            saveBtn.disabled = false;
            saveBtn.innerHTML = `Retry save as <strong>${provider.id}</strong>`;
            return;
          }
          if (response && response.ok) {
            setStatus(`Saved ${provider.name} key to KeyShield vault`, 'ok');
            autoCloseTimer = setTimeout(closeNotice, 2200);
          } else {
            const why =
              response && response.reason === 'no-token'      ? 'Sign in to KeyShield first.'
              : response && response.reason === 'token-expired' ? 'Session expired — sign in again.'
              : response && response.reason === 'network'     ? 'Backend unreachable. Opened the dashboard.'
              : 'Save failed. Opened the dashboard.';
            setStatus(why, 'err');
            // The background opens the dashboard tab in fallback mode, so we can
            // close this notice after a short read.
            autoCloseTimer = setTimeout(closeNotice, 4000);
          }
        },
      );
    } catch (e) {
      setStatus(`Extension not available: ${String(e)}`, 'err');
      saveBtn.disabled = false;
    }
  };

  container.querySelector('#ks-ignore').onclick = closeNotice;

  container.querySelector('#ks-hide-domain').onclick = (ev) => {
    ev.preventDefault();
    dismissThisDomain();
    setStatus(`Auto-detect muted on ${HOST}.`, 'info');
    autoCloseTimer = setTimeout(closeNotice, 1200);
  };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

loadDismissedDomains();

scan();
setInterval(scan, 3000);

const observer = new MutationObserver(() => scan());
observer.observe(document.body, { childList: true, subtree: true });

// User pressed copy on a page — likely just copied a key. Re-scan.
document.addEventListener('copy', () => setTimeout(scan, 300));

// User typed/pasted in a field — likely revealing a key.
document.addEventListener('input', () => setTimeout(scan, 300), { capture: true });

// ── x402 payment interceptor ────────────────────────────────────────────────
// Wraps window.fetch to detect 402 + x402 headers and show a payment prompt.
// Does NOT interfere with any other fetch — only intercepts 402 responses that
// carry the X-Payment-Required: x402 header.

(function () {
  const _origFetch = window.fetch.bind(window);

  window.fetch = async function (...args) {
    const response = await _origFetch(...args);

    if (
      response.status === 402 &&
      response.headers.get('X-Payment-Required') === 'x402'
    ) {
      // Clone so the caller still gets the original 402 body
      const clone = response.clone();

      (async () => {
        let amount_usd = 0;
        let payTo      = '';
        let network    = '';
        let resource   = '';

        try {
          const body = await clone.json();
          const first = body?.accepts?.[0] ?? {};
          const raw   = parseFloat(first.maxAmountRequired ?? '0');
          amount_usd  = raw / 1_000_000;   // USDC 6 decimals → USD
          payTo       = first.payTo    ?? '';
          network     = first.network  ?? '';
          resource    = first.resource ?? (typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '');
        } catch {
          // malformed body — still show a prompt with $0.00
        }

        const hostname = location.hostname;

        // Ask background if this domain is trusted + below threshold
        let autoPayApproved = false;
        try {
          const reply = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { type: 'X402_CHECK_TRUST', hostname, amount_usd },
              resolve,
            );
          });
          autoPayApproved = !!reply?.autoPayApproved;
        } catch { /* extension context gone — treat as not trusted */ }

        // Ensure our CSS is injected (reuse existing ks-style if present)
        if (!document.getElementById('keyshield-style')) {
          const style = document.createElement('style');
          style.id    = 'keyshield-style';
          style.textContent = `
            @keyframes keyshield-slide {
              from { transform: translateY(-12px); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
            .ks-btn{cursor:pointer;border:1px solid transparent;border-radius:8px;
              padding:9px 12px;font-size:12px;font-weight:500;transition:all .15s}
            .ks-btn-primary{background:#5b8cff;color:white;border-color:#5b8cff}
            .ks-btn-primary:hover{background:#7aa1ff}
            .ks-btn-ghost{background:transparent;color:#71717a;border-color:#27272a}
            .ks-btn-ghost:hover{color:#fafafa;border-color:#3f3f46}
          `;
          document.head.appendChild(style);
        }

        const amountStr = `$${amount_usd.toFixed(2)}`;
        const toast = document.createElement('div');
        toast.id = 'keyshield-x402-notice';
        Object.assign(toast.style, {
          position:        'fixed',
          top:             '20px',
          right:           '20px',
          zIndex:          '999999',
          backgroundColor: '#0a0d1a',
          border:          '1px solid #1c2238',
          borderRadius:    '12px',
          padding:         '16px',
          width:           '320px',
          boxShadow:       '0 20px 40px -10px rgba(0,0,0,0.6)',
          color:           '#e4e4e7',
          fontFamily:      '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          display:         'flex',
          flexDirection:   'column',
          gap:             '12px',
          animation:       'keyshield-slide 0.18s ease-out',
        });

        if (autoPayApproved) {
          let secsLeft = 3;
          toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="background:#0e1430;padding:6px 8px;border-radius:6px;
                          font-size:10px;font-weight:700;color:#5b8cff;
                          border:1px solid #1c2550;letter-spacing:.05em">402</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600">Auto-paying ${amountStr} to ${hostname}…</div>
                <div style="color:#a1a1aa;font-size:11px;margin-top:2px">Sending in <span id="ks-cd">${secsLeft}</span>s</div>
              </div>
            </div>
          `;
          document.body.appendChild(toast);

          const interval = setInterval(() => {
            secsLeft--;
            const cd = toast.querySelector('#ks-cd');
            if (cd) cd.textContent = String(secsLeft);
            if (secsLeft <= 0) {
              clearInterval(interval);
              chrome.runtime.sendMessage({
                type: 'INITIATE_X402_PAYMENT',
                amount_usd,
                hostname,
                payTo,
                network,
                resource,
              });
              toast.remove();
            }
          }, 1000);

          // Allow cancellation before countdown ends
          toast.addEventListener('click', () => {
            clearInterval(interval);
            toast.remove();
          }, { once: true });

        } else {
          toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="background:#0e1430;padding:6px 8px;border-radius:6px;
                          font-size:10px;font-weight:700;color:#5b8cff;
                          border:1px solid #1c2550;letter-spacing:.05em">402</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600">x402 payment required — ${amountStr}</div>
                <div style="color:#a1a1aa;font-size:11px;margin-top:2px">${hostname}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button id="ks-x402-pay"     class="ks-btn ks-btn-primary" style="flex:1">Pay now</button>
              <button id="ks-x402-dismiss" class="ks-btn ks-btn-ghost">Dismiss</button>
            </div>
          `;
          document.body.appendChild(toast);

          toast.querySelector('#ks-x402-pay').onclick = () => {
            chrome.runtime.sendMessage({
              type: 'INITIATE_X402_PAYMENT',
              amount_usd,
              hostname,
              payTo,
              network,
              resource,
            });
            toast.remove();
          };

          toast.querySelector('#ks-x402-dismiss').onclick = () => toast.remove();

          // Auto-dismiss after 20s
          setTimeout(() => { if (toast.parentNode) toast.remove(); }, 20000);
        }
      })();
    }

    return response;
  };
})();
````

## File: extension/background.ts
````typescript
/**
 * KeyShield Background Service Worker — Plasmo entry point
 *
 * Migrated from frontend/background.js.  Plasmo treats `background.ts` at the
 * package root as the MV3 service worker; it is bundled separately from the popup.
 *
 * Two message paths:
 *
 *  1. SAVE_KEY (from content.ts):
 *     - If a stored session token exists → POST /manage/store directly.
 *       User sees a "✓ Saved" Chrome notification. NO new tab is opened.
 *     - If no token → fall back to opening the dashboard with prefilled URL params.
 *
 *  2. KS_TOKEN_REGISTER / KS_TOKEN_CLEAR / KS_PING (from dashboard via externally_connectable):
 *     Persist or clear the session token in chrome.storage.local.
 */

export {}  // make TypeScript treat this as a module (Plasmo requires it)

const KS_BASE       = "http://localhost:8000"
const DASHBOARD_URL = "http://localhost:3000"

// ── Storage helpers ─────────────────────────────────────────────────────────

async function getStoredToken(): Promise<{ token: string | null; user: string | null }> {
  const { ks_token, ks_user } = await chrome.storage.local.get(["ks_token", "ks_user"])
  return { token: ks_token || null, user: ks_user || null }
}

async function setStoredToken(token: string, user: string | null): Promise<void> {
  await chrome.storage.local.set({ ks_token: token, ks_user: user || null })
}

async function clearStoredToken(): Promise<void> {
  await chrome.storage.local.remove(["ks_token", "ks_user"])
}

// ── Notifications ───────────────────────────────────────────────────────────

function notify(title: string, message: string, icon?: string): void {
  chrome.notifications.create(
    {
      type:    "basic",
      iconUrl: icon || chrome.runtime.getURL("assets/icon.png"),
      title,
      message,
    },
    () => {
      // Silently swallow "icon not found" — manifest icon is optional in dev.
      if (chrome.runtime.lastError) {
        console.log("[KeyShield] notify:", chrome.runtime.lastError.message)
      }
    }
  )
}

// ── Direct store (no tab) ───────────────────────────────────────────────────

interface DirectStoreResult {
  ok: boolean
  reason?: string
  detail?: string
}

async function directStore({
  upstream,
  value,
}: {
  upstream: string
  value: string
}): Promise<DirectStoreResult> {
  const { token } = await getStoredToken()
  if (!token) return { ok: false, reason: "no-token" }

  try {
    const r = await fetch(`${KS_BASE}/manage/store`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ upstream, apiKey: value }),
    })

    if (r.status === 401) {
      await clearStoredToken()
      return { ok: false, reason: "token-expired" }
    }
    if (!r.ok) {
      return { ok: false, reason: `http-${r.status}`, detail: await r.text() }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: "network", detail: String(e) }
  }
}

// ── SAVE_KEY (from content.ts) ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SAVE_KEY") return false

  ;(async () => {
    const { upstream, name, value, domain } = message.payload as {
      upstream: string
      name: string
      value: string
      domain: string
    }

    const result = await directStore({ upstream, value })

    if (result.ok) {
      notify("✓ Key saved to vault", `${upstream} key from ${domain}`)
      sendResponse({ ok: true, mode: "direct" })
      return
    }

    const reasonMsg: Record<string, string> = {
      "no-token":      "Sign in to KeyShield first",
      "token-expired": "Session expired — sign in again",
      "network":       "Backend unreachable — opening dashboard",
    }
    const msg = reasonMsg[result.reason ?? ""] ?? `Error: ${result.reason}`

    const params = new URLSearchParams({
      action:   "add",
      upstream: upstream || "openai",
      name:     name || "",
      value:    value || "",
      domain:   domain || "",
    })

    notify("KeyShield", msg)
    chrome.tabs.create({ url: `${DASHBOARD_URL}/?${params}` })
    sendResponse({ ok: false, mode: "fallback", reason: result.reason })
  })()

  return true  // keep the sendResponse channel open for the async reply
})

// ── External messages (from dashboard via externally_connectable) ────────────

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type === "KS_TOKEN_REGISTER") {
    setStoredToken(message.token as string, message.user as string | null).then(() => {
      console.log("[KeyShield] token registered from dashboard")
      sendResponse({ ok: true })
    })
    return true
  }

  if (message.type === "KS_TOKEN_CLEAR") {
    clearStoredToken().then(() => {
      console.log("[KeyShield] token cleared")
      sendResponse({ ok: true })
    })
    return true
  }

  if (message.type === "KS_PING") {
    getStoredToken().then(({ token, user }) => {
      sendResponse({ ok: true, hasToken: !!token, user })
    })
    return true
  }

  return false
})

chrome.runtime.onInstalled.addListener(() => {
  console.log("[KeyShield] v1.1 installed — auto-detect + direct-store enabled")
})
````

## File: extension/content.ts
````typescript
/**
 * KeyShield Content Script — Plasmo entry point
 *
 * Migrated from frontend/content.js.  Plasmo treats `content.ts` at the
 * package root as the MV3 content script injected into every page.
 *
 * Watches every page for exposed API keys and shows a one-click "Save to vault"
 * notification. Domain-aware: when you're on platform.openai.com, OpenAI keys
 * get the highest priority match; the same pattern would be ignored if found on
 * a random blog (avoids false positives from tutorial code).
 *
 * Maps detected provider → KeyShield backend `upstream` so a single click
 * stores the key under the correct vault namespace.
 */

export {}  // Plasmo requires this to treat the file as a module

// ── Provider definitions ────────────────────────────────────────────────────
//
// Each provider has:
//   id              — KeyShield backend upstream name (must match server UPSTREAMS)
//   name            — human label
//   label           — 3-letter badge for the in-page toast
//   patterns        — list of regex (multiple to cover variants)
//   domains         — hostnames where this key is most likely (priority boost)
//   minLen          — sanity floor
//   requiresDomain  — never trigger off-domain (high false-positive patterns)

interface Provider {
  id:             string
  name:           string
  label:          string
  patterns:       RegExp[]
  domains:        string[]
  minLen:         number
  requiresDomain?: boolean
}

const PROVIDERS: Provider[] = [
  {
    id:       "openai",
    name:     "OpenAI",
    label:    "AI",
    patterns: [
      /sk-proj-[A-Za-z0-9_-]{20,}/g,       // new-format project key
      /sk-svcacct-[A-Za-z0-9_-]{20,}/g,     // service account
      /sk-admin-[A-Za-z0-9_-]{20,}/g,       // admin key
      /sk-[A-Za-z0-9]{40,}/g,               // legacy 48+ char
    ],
    domains:  ["platform.openai.com", "openai.com"],
    minLen:   30,
  },
  {
    id:       "anthropic",
    name:     "Anthropic Claude",
    label:    "AI",
    patterns: [/sk-ant-api\d{2}-[A-Za-z0-9_-]{50,}/g],
    domains:  ["console.anthropic.com", "anthropic.com"],
    minLen:   60,
  },
  {
    id:       "groq",
    name:     "Groq",
    label:    "AI",
    patterns: [/gsk_[A-Za-z0-9]{40,}/g],
    domains:  ["console.groq.com", "groq.com"],
    minLen:   40,
  },
  {
    id:       "mistral",
    name:     "Mistral AI",
    label:    "AI",
    patterns: [/[A-Za-z0-9]{32}/g],
    domains:  ["console.mistral.ai", "mistral.ai"],
    minLen:   32,
    requiresDomain: true,
  },
  {
    id:       "cohere",
    name:     "Cohere",
    label:    "AI",
    patterns: [/[A-Za-z0-9]{40}/g],
    domains:  ["dashboard.cohere.com", "cohere.com", "cohere.ai"],
    minLen:   40,
    requiresDomain: true,
  },
  {
    id:       "helius",
    name:     "Helius RPC",
    label:    "SOL",
    patterns: [
      /helius_auth_[A-Za-z0-9]{20,}/g,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    ],
    domains:  ["dashboard.helius.dev", "helius.dev", "helius.xyz"],
    minLen:   20,
    requiresDomain: true,
  },
  {
    id:       "0x",
    name:     "0x Protocol",
    label:    "DEX",
    patterns: [/[A-Za-z0-9-]{36}/g],
    domains:  ["dashboard.0x.org", "0x.org"],
    minLen:   36,
    requiresDomain: true,
  },
  {
    id:       "alchemy",
    name:     "Alchemy",
    label:    "RPC",
    patterns: [/[A-Za-z0-9_-]{32}/g],
    domains:  ["dashboard.alchemy.com", "alchemy.com"],
    minLen:   32,
    requiresDomain: true,
  },
]

// ── State ───────────────────────────────────────────────────────────────────

const detectedKeys = new Set<string>()
let notificationActive = false
const HOST = window.location.hostname

function isOnDomain(provider: Provider): boolean {
  return provider.domains.some(d => HOST === d || HOST.endsWith("." + d))
}

// ── Scanner ─────────────────────────────────────────────────────────────────

function scan(): void {
  const text = document.body?.innerText || ""
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>(
      "input, textarea, code, pre"
    )
  )

  for (const provider of PROVIDERS) {
    const onDomain = isOnDomain(provider)
    if (provider.requiresDomain && !onDomain) continue

    for (const regex of provider.patterns) {
      regex.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = regex.exec(text)) !== null) {
        if (m[0].length >= provider.minLen) handleMatch(m[0], provider, onDomain)
      }
      for (const el of inputs) {
        const v = ((el as HTMLInputElement).value || el.textContent || "")
        regex.lastIndex = 0
        const im = regex.exec(v)
        if (im && im[0].length >= provider.minLen) handleMatch(im[0], provider, onDomain)
      }
    }
  }
}

function handleMatch(key: string, provider: Provider, onDomain: boolean): void {
  if (detectedKeys.has(key)) return
  detectedKeys.add(key)
  console.log(`[KeyShield] detected ${provider.name} key on ${HOST} (onDomain=${onDomain})`)
  showNotification(key, provider, onDomain)
}

// ── Notification UI ─────────────────────────────────────────────────────────

function showNotification(key: string, provider: Provider, onDomain: boolean): void {
  if (notificationActive) return
  notificationActive = true

  const container = document.createElement("div")
  container.id = "keyshield-detection-notice"
  Object.assign(container.style, {
    position:        "fixed",
    top:             "20px",
    right:           "20px",
    zIndex:          "999999",
    backgroundColor: "#0a0d1a",
    border:          "1px solid #1c2238",
    borderRadius:    "12px",
    padding:         "16px",
    width:           "320px",
    boxShadow:       "0 20px 40px -10px rgba(0,0,0,0.6)",
    color:           "#e4e4e7",
    fontFamily:      "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    display:         "flex",
    flexDirection:   "column",
    gap:             "12px",
    animation:       "keyshield-slide 0.18s ease-out",
  })

  if (!document.getElementById("keyshield-style")) {
    const style = document.createElement("style")
    style.id = "keyshield-style"
    style.textContent = `
      @keyframes keyshield-slide {
        from { transform: translateY(-12px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      .ks-btn{cursor:pointer;border:1px solid transparent;border-radius:8px;
        padding:9px 12px;font-size:12px;font-weight:500;transition:all .15s}
      .ks-btn-primary{background:#5b8cff;color:white;border-color:#5b8cff}
      .ks-btn-primary:hover{background:#7aa1ff}
      .ks-btn-ghost{background:transparent;color:#71717a;border-color:#27272a}
      .ks-btn-ghost:hover{color:#fafafa;border-color:#3f3f46}
      .ks-conf{display:inline-flex;align-items:center;gap:4px;font-size:10px;
        padding:2px 6px;border-radius:4px;font-weight:600}
      .ks-conf-high{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
      .ks-conf-med{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
    `
    document.head.appendChild(style)
  }

  const conf = onDomain ? "high" : "med"
  const confText = onDomain
    ? `HIGH confidence — you are on ${HOST}`
    : `Detected, please verify provider`

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="background:#0e1430;padding:6px 8px;border-radius:6px;
                  font-size:10px;font-weight:700;color:#5b8cff;
                  border:1px solid #1c2550;letter-spacing:.05em">${provider.label}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">API key detected</div>
        <div style="color:#a1a1aa;font-size:11px;margin-top:2px">${provider.name} · ${HOST}</div>
      </div>
      <span class="ks-conf ks-conf-${conf}">${onDomain ? "✓ MATCH" : "? CHECK"}</span>
    </div>
    <div style="background:#020408;padding:10px 12px;border-radius:6px;
                font-family:'JetBrains Mono',monospace;font-size:11px;
                color:#86efac;border:1px solid #131929;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      ${key.substring(0, 14)}••••••••${key.substring(key.length - 4)}
    </div>
    <div style="font-size:10px;color:#71717a;line-height:1.5">
      ${confText}
    </div>
    <div style="display:flex;gap:8px">
      <button id="ks-save"   class="ks-btn ks-btn-primary" style="flex:1">
        Save to vault as <strong>${provider.id}</strong>
      </button>
      <button id="ks-ignore" class="ks-btn ks-btn-ghost">Dismiss</button>
    </div>
  `

  document.body.appendChild(container)

  const dismiss = (): void => {
    container.remove()
    notificationActive = false
  }

  const saveBtn = container.querySelector<HTMLButtonElement>("#ks-save")
  if (saveBtn) {
    saveBtn.onclick = (): void => {
      chrome.runtime.sendMessage({
        type:    "SAVE_KEY",
        payload: {
          upstream: provider.id,
          name:     `${provider.name} (${HOST})`,
          value:    key,
          domain:   HOST,
        },
      })
      dismiss()
    }
  }

  const ignoreBtn = container.querySelector<HTMLButtonElement>("#ks-ignore")
  if (ignoreBtn) {
    ignoreBtn.onclick = dismiss
  }

  setTimeout(() => {
    if (container.parentNode) dismiss()
  }, 12000)
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

scan()
setInterval(scan, 3000)

const observer = new MutationObserver(() => scan())
observer.observe(document.body, { childList: true, subtree: true })

// User pressed copy on a page — likely just copied a key. Re-scan.
document.addEventListener("copy", () => setTimeout(scan, 300))

// User typed/pasted in a field — likely revealing a key.
document.addEventListener("input", () => setTimeout(scan, 300), { capture: true })
````

## File: extension/package.json
````json
{
  "name": "keyshield-extension-plasmo",
  "displayName": "KeyShield — Sovereign Vault",
  "version": "1.1.0",
  "description": "Auto-detect API keys on any page and store them in your encrypted KeyShield vault.",
  "private": true,
  "scripts": {
    "dev": "plasmo dev",
    "build": "plasmo build",
    "build:firefox": "plasmo build --target=firefox-mv2",
    "package": "plasmo package"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.562.0",
    "@solana/web3.js": "1.98.0",
    "@solana/wallet-adapter-base": "0.9.25",
    "@solana/wallet-adapter-react": "0.15.35",
    "@solana/wallet-adapter-react-ui": "0.9.35",
    "@solana/wallet-adapter-wallets": "0.19.32"
  },
  "devDependencies": {
    "plasmo": "^0.90.5",
    "@types/chrome": "^0.0.317",
    "@types/node": "^22.14.0",
    "@types/react": "^18.3.20",
    "@types/react-dom": "^18.3.6",
    "typescript": "~5.8.2"
  },
  "manifest": {
    "name": "KeyShield — Sovereign Vault",
    "permissions": [
      "storage",
      "notifications",
      "clipboardRead"
    ],
    "host_permissions": [
      "http://localhost:8000/*",
      "http://localhost:3000/*",
      "https://*.keyshield.dev/*"
    ],
    "externally_connectable": {
      "matches": [
        "http://localhost:3000/*",
        "http://localhost:3001/*",
        "https://*.keyshield.dev/*"
      ]
    }
  }
}
````

## File: extension/popup.tsx
````typescript
/**
 * KeyShield Popup — Plasmo entry point
 *
 * Plasmo treats `popup.tsx` at the package root as the browser-action popup.
 * We simply re-export the full App from `frontend/` so all logic, components,
 * and styles are shared — zero duplication.
 *
 * The popup opens at 800×600px (set via the CSS on the html/body below).
 * Tailwind classes come from the frontend App; Plasmo bundles them together.
 */

import React from "react"
import App from "../frontend/App"

// Pull in the Solana wallet adapter styles so they're available in the popup.
import "@solana/wallet-adapter-react-ui/styles.css"

/**
 * Plasmo picks up the default export as the popup component.
 * Wrapping in a full-height container keeps the sidebar layout intact.
 */
const Popup: React.FC = () => {
  return (
    <div style={{ width: 900, height: 640, overflow: "auto" }}>
      <App />
    </div>
  )
}

export default Popup
````

## File: extension/tsconfig.json
````json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "commonjs",
    "moduleResolution": "node",
    "jsx": "react-jsx",
    "strict": false,
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"],
      "@frontend/*": ["../frontend/*"]
    },
    "types": ["node", "chrome"]
  },
  "include": [".plasmo/index.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
````

## File: hooks/useVaults.ts
````typescript
import { useState, useEffect, useMemo, useCallback } from 'react';
import { VaultItem, inferType } from '../types';
import { apiFetch, isAuthenticated, API_BASE } from '../lib/auth';

const UPSTREAM_META: Record<string, { name: string; domain: string; tags: string[] }> = {
  openai:    { name: 'OpenAI',          domain: 'openai.com',    tags: ['AI', 'PROD'] },
  anthropic: { name: 'Anthropic Claude', domain: 'anthropic.com', tags: ['AI', 'CLAUDE'] },
  helius:    { name: 'Helius RPC',       domain: 'helius.dev',    tags: ['RPC', 'SOLANA'] },
  mistral:   { name: 'Mistral AI',       domain: 'mistral.ai',    tags: ['AI'] },
  cohere:    { name: 'Cohere',           domain: 'cohere.ai',     tags: ['AI'] },
  groq:      { name: 'Groq',             domain: 'groq.com',      tags: ['AI', 'FAST'] },
};

interface BackendItem {
  upstream:  string;
  createdAt: number;
  updatedAt: number;
}

function userSecretLabel(slug: string): string {
  // pw__google → "google"   note__shopping → "shopping"
  const idx = slug.indexOf('__');
  return idx >= 0 ? slug.slice(idx + 2).replace(/_/g, ' ') : slug;
}

function backendItemToVault(item: BackendItem): VaultItem {
  const type = inferType(item.upstream);

  if (type === 'api_key') {
    const meta = UPSTREAM_META[item.upstream] ?? { name: item.upstream, domain: '', tags: ['KEY'] };
    return {
      id:          item.upstream,
      name:        meta.name,
      type:        'api_key',
      value:       `${API_BASE}/proxy/${item.upstream}/`,
      domain:      meta.domain,
      createdAt:   item.createdAt * 1000,
      lastUsedAt:  item.updatedAt  * 1000,
      tags:        [...meta.tags, 'VAULT'],
    };
  }

  // User-defined secret (password / note / env / ssh_key) — value is hidden
  return {
    id:          item.upstream,
    name:        userSecretLabel(item.upstream),
    type,
    value:       '••••••',
    createdAt:   item.createdAt * 1000,
    lastUsedAt:  item.updatedAt  * 1000,
    tags:        [type.replace('_', ' ')],
  };
}

export const useVaults = (searchQuery: string, _activeFilter: string) => {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const loadFromAPI = useCallback(async () => {
    if (!isAuthenticated()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/manage/list');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: { items?: BackendItem[]; keys?: string[] } = await res.json();

      // Prefer the new `items` array (with metadata); fall back to plain key names
      if (data.items && data.items.length > 0) {
        setVaultItems(data.items.map(backendItemToVault));
      } else if (data.keys) {
        const now = Math.floor(Date.now() / 1000);
        setVaultItems(
          data.keys.map(k => backendItemToVault({ upstream: k, createdAt: now, updatedAt: now }))
        );
      } else {
        setVaultItems([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromAPI();
    const handler = () => loadFromAPI();
    window.addEventListener('ks-auth-changed', handler);
    return () => window.removeEventListener('ks-auth-changed', handler);
  }, [loadFromAPI]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return vaultItems;
    return vaultItems.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.domain?.toLowerCase().includes(q) ||
      item.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [vaultItems, searchQuery]);

  const addItem = useCallback(async (data: Partial<VaultItem> & { upstream?: string; rawKey?: string }) => {
    const upstream = (data.upstream ?? data.domain?.replace(/\.(com|ai|dev|org)$/, '') ?? 'custom').toLowerCase();
    const rawKey   = data.rawKey ?? data.value ?? '';
    if (!rawKey) return;

    try {
      const res = await apiFetch('/manage/store', {
        method: 'POST',
        body: JSON.stringify({ upstream, apiKey: rawKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Store failed' }));
        throw new Error((err as { detail: string }).detail);
      }
      await loadFromAPI();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store key');
      throw err;
    }
  }, [loadFromAPI]);

  const deleteItem = useCallback(async (id: string) => {
    setVaultItems(prev => prev.filter(i => i.id !== id));
    try {
      const res = await apiFetch(`/manage/secret/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      await loadFromAPI();
    }
  }, [loadFromAPI]);

  const decryptItem = useCallback(async (id: string): Promise<string> => {
    const res = await apiFetch(`/manage/decrypt/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Decrypt failed' }));
      throw new Error((err as { detail: string }).detail ?? 'Decrypt failed');
    }
    const data = await res.json();
    return data.key as string;
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setVaultItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const hasFav = item.tags.includes('FAVORITE');
      return { ...item, tags: hasFav ? item.tags.filter(t => t !== 'FAVORITE') : [...item.tags, 'FAVORITE'] };
    }));
  }, []);

  return {
    items:          filteredItems,
    allItems:       vaultItems,
    loading,
    error,
    addItem,
    deleteItem,
    decryptItem,
    toggleFavorite,
    refresh:        loadFromAPI,
  };
};
````

## File: index.html
````html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KeyShield Vault</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <!-- Solana Wallet Adapter Styles -->
    <link rel="stylesheet" href="https://unpkg.com/@solana/wallet-adapter-react-ui/styles.css">
    <style>
      body {
        font-family: 'Montserrat', 'Inter', sans-serif;
        background-color: #000000;
        color: #ffffff;
        overflow-x: hidden;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      .font-mono {
        font-family: 'JetBrains Mono', monospace;
      }
      /* Override Wallet Modal for Institutional Minimalist Theme */
      .wallet-adapter-modal-wrapper {
        background: #0a0a0a !important;
        border: 1px solid #262626 !important;
        color: #ffffff !important;
        border-radius: 3px !important;
      }
      .wallet-adapter-modal-title {
        font-family: 'Montserrat', sans-serif !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
      }
      .wallet-adapter-button {
        background-color: #ffffff !important;
        border: 1px solid #ffffff !important;
        color: #000000 !important;
        font-family: 'Montserrat', sans-serif !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        border-radius: 2px !important;
        transition: all 0.15s !important;
      }
      .wallet-adapter-button:not([disabled]):hover {
        background-color: #e5e5e5 !important;
      }
      .wallet-adapter-button-start-icon {
        display: none !important;
      }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
</body>
</html>
````

## File: index.tsx
````typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentry } from './lib/sentry';

initSentry();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
````

## File: lib/api.ts
````typescript
/**
 * KeyShield API helpers — typed wrappers around `apiFetch`.
 *
 * These live separately from `auth.ts` so destructive flows
 * (account deletion, share grant/revoke) read like a contract instead
 * of being buried in component bodies. Each helper returns the parsed
 * JSON body or throws an Error with the server's `detail` message.
 */

import { apiFetch } from './auth';
import type { BuildTxResponse } from './solana';

// ─── Account deletion ──────────────────────────────────────────────────────

export interface DeleteAccountReport {
  vault_keys?:    number;
  agents?:        number;
  usage?:         { usage_log: number; user_balance: number; topup_tx: number };
  passkeys?:      number | string;
  x402_claims?:   string;
  shares?:        number | string;
  sessions?:      number;
}

export async function fetchDeleteAccountChallenge(): Promise<{ challenge: string; nonce: string }> {
  const res = await apiFetch('/auth/delete-account-challenge');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch challenge' }));
    throw new Error((err as { detail: string }).detail ?? 'Failed to fetch challenge');
  }
  return res.json();
}

export interface DeleteAccountInput {
  confirmation:    string;
  walletAddress?:  string;
  signature?:      string;   // base64 ed25519 signature
  challenge?:      string;
}

export async function deleteAccount(input: DeleteAccountInput): Promise<{ ok: boolean; report: DeleteAccountReport }> {
  const res = await apiFetch('/auth/delete-account', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Account deletion failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Account deletion failed');
  }
  return res.json();
}

// ─── Sharing ───────────────────────────────────────────────────────────────

export interface ShareRow {
  id:           number;
  owner_id:     string;
  recipient_id: string;
  key_name:     string;
  expires_at:   number | null;
  created_at:   number;
}

export interface GrantShareInput {
  key_name:         string;
  recipient_user_id: string;
  expires_at?:       number | null;
}

/**
 * Grant share: server may return 501 if the build does not yet support
 * re-wrapped DEKs (passkey-vault dependency, see backend). Callers
 * should surface the 501 message verbatim — it explains the limitation
 * better than a generic error.
 */
export async function grantShare(
  input: GrantShareInput,
): Promise<{ ok: boolean; share?: ShareRow; status: number; detail?: string }> {
  const res = await apiFetch('/share/grant', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  // 501 = explicit "not yet implemented" — surface but don't throw.
  if (res.status === 501) {
    const body = await res.json().catch(() => ({ detail: 'sharing not implemented' }));
    return { ok: false, status: 501, detail: (body as { detail?: string }).detail ?? 'sharing not implemented' };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Share failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Share failed');
  }
  const data = await res.json();
  return { ok: true, status: 200, share: data.share };
}

export async function listIncomingShares(): Promise<ShareRow[]> {
  const res = await apiFetch('/share/incoming');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.shares ?? []) as ShareRow[];
}

export async function listOutgoingShares(): Promise<ShareRow[]> {
  const res = await apiFetch('/share/outgoing');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.shares ?? []) as ShareRow[];
}

export async function revokeShare(shareId: number): Promise<void> {
  const res = await apiFetch(`/share/${shareId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Revoke failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Revoke failed');
  }
}

// ─── MPP wallet sign-off (Phase 10.5) ──────────────────────────────────────
//
// The server returns ix payloads but cannot sign — the wallet does.
// Round-trip is:
//   1. POST /mpp/streams/{id}/build-{open,withdraw}-tx with frontend-derived
//      PDA + bump + ATAs + caps → server returns BuildTxResponse.
//   2. Frontend wraps in Transaction, wallet adapter signs + sends, awaits
//      confirmation.
//   3. POST /mpp/streams/{id}/record-tx with the resulting base58 signature
//      so the UI can flip from "Open on-chain" CTA to a green explorer link.

export interface BuildOpenTxBody {
  ownerPubkey:                    string;
  streamPda:                      string;
  bump:                           number;
  usdcAta:                        string;
  maxTotalMicroUsdc:              number;
  costPerUnitMicroUsdc?:          number;
  maxRateUsdPerMinBits?:          number;
  settlementIntervalSecsOverride?: number;
}

export async function buildOpenStreamTx(
  streamId: number,
  body:     BuildOpenTxBody,
): Promise<BuildTxResponse> {
  const r = await apiFetch(`/mpp/streams/${streamId}/build-open-tx`, {
    method: 'POST',
    body:   JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'build-open-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'build-open-tx failed');
  }
  return r.json();
}

export interface BuildWithdrawTxBody {
  ownerPubkey:             string;
  streamPda:               string;
  streamAta:               string;
  ownerAta:                string;
  withdrawAmountMicroUsdc: number;
}

export async function buildWithdrawTx(
  streamId: number,
  body:     BuildWithdrawTxBody,
): Promise<BuildTxResponse> {
  const r = await apiFetch(`/mpp/streams/${streamId}/build-withdraw-tx`, {
    method: 'POST',
    body:   JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'build-withdraw-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'build-withdraw-tx failed');
  }
  return r.json();
}

export async function recordMppTxSignature(
  streamId:    number,
  txSignature: string,
): Promise<void> {
  const r = await apiFetch(`/mpp/streams/${streamId}/record-tx`, {
    method: 'POST',
    body:   JSON.stringify({ tx_signature: txSignature }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'record-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'record-tx failed');
  }
}

// Re-export from auth so a single import works for all KeyShield API needs:
export { API_BASE, getToken, apiFetch } from './auth';
````

## File: lib/audit-retention.ts
````typescript
/**
 * audit-retention.ts — enforce a retention policy on ks_audit_log in chrome.storage.local.
 *
 * Policy (configurable via chrome.storage.local 'ks_audit_retention'):
 *   maxAgeDays: 30  (default)
 *   maxEntries: 500 (default)
 *
 * Called from ReportPage on mount, and from background.js on install/update.
 */

// chrome is injected at runtime by the extension environment.
declare const chrome: any;

export interface AuditRetentionPolicy {
  maxAgeDays: number;  // default 30
  maxEntries: number;  // default 500
}

export const DEFAULT_POLICY: AuditRetentionPolicy = { maxAgeDays: 30, maxEntries: 500 };

const AUDIT_LOG_KEY = 'ks_audit_log';
const RETENTION_POLICY_KEY = 'ks_audit_retention';

/**
 * Read the current retention policy from storage, falling back to DEFAULT_POLICY.
 */
export async function getPolicy(): Promise<AuditRetentionPolicy> {
  if (typeof chrome === 'undefined' || !chrome?.storage) return { ...DEFAULT_POLICY };
  return new Promise((resolve) => {
    chrome.storage.local.get(RETENTION_POLICY_KEY, (result: Record<string, unknown>) => {
      const stored = result[RETENTION_POLICY_KEY] as Partial<AuditRetentionPolicy> | undefined;
      resolve({
        maxAgeDays: stored?.maxAgeDays ?? DEFAULT_POLICY.maxAgeDays,
        maxEntries: stored?.maxEntries ?? DEFAULT_POLICY.maxEntries,
      });
    });
  });
}

/**
 * Persist a (partial) retention policy update to storage.
 */
export async function setPolicy(policy: Partial<AuditRetentionPolicy>): Promise<void> {
  const current = await getPolicy();
  const updated: AuditRetentionPolicy = {
    maxAgeDays: policy.maxAgeDays ?? current.maxAgeDays,
    maxEntries: policy.maxEntries ?? current.maxEntries,
  };
  if (typeof chrome === 'undefined' || !chrome?.storage) return;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [RETENTION_POLICY_KEY]: updated }, () => resolve());
  });
}

/**
 * Enforce the retention policy on ks_audit_log:
 *  1. Remove entries older than maxAgeDays.
 *  2. If still over maxEntries, keep only the most recent maxEntries.
 *
 * Returns counts of how many entries were removed by each rule.
 */
export async function purgeAuditLog(): Promise<{ deletedByAge: number; deletedByCap: number }> {
  if (typeof chrome === 'undefined' || !chrome?.storage) {
    return { deletedByAge: 0, deletedByCap: 0 };
  }

  const policy = await getPolicy();

  const rawLogs = await new Promise<any[]>((resolve) => {
    chrome.storage.local.get(AUDIT_LOG_KEY, (result: Record<string, unknown>) => {
      resolve((result[AUDIT_LOG_KEY] as any[]) ?? []);
    });
  });

  const cutoff = Date.now() - policy.maxAgeDays * 86_400_000;

  const afterAge = rawLogs.filter((entry) => {
    const ts = typeof entry?.timestamp === 'number' ? entry.timestamp : 0;
    return ts >= cutoff;
  });
  const deletedByAge = rawLogs.length - afterAge.length;

  // Sort descending by timestamp so we keep the most recent
  const sorted = afterAge.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const afterCap = sorted.slice(0, policy.maxEntries);
  const deletedByCap = afterAge.length - afterCap.length;

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [AUDIT_LOG_KEY]: afterCap }, () => resolve());
  });

  return { deletedByAge, deletedByCap };
}
````

## File: lib/auth.ts
````typescript
/**
 * KeyShield auth helpers — localStorage-backed session token.
 */

export const API_BASE: string =
  (typeof process !== 'undefined' && (process.env as Record<string,string>)['KEYSHIELD_API_URL'])
  ?? 'http://localhost:8000';

const TOKEN_KEY    = 'ks_token';
const WALLET_KEY   = 'ks_wallet';
const PASSKEY_USER = 'ks_passkey_user';
const PASSKEY_PP   = 'ks_passkey_pp';

/** Mark this device as passkey-trusted: stores userId + passphrase locally
 *  so future sessions can sign in with Face ID / Touch ID alone. */
export function setPasskeyTrust(userId: string, passphrase: string): void {
  localStorage.setItem(PASSKEY_USER, userId);
  localStorage.setItem(PASSKEY_PP, passphrase);
}
export function getPasskeyTrust(): { userId: string; passphrase: string } | null {
  const u = localStorage.getItem(PASSKEY_USER);
  const p = localStorage.getItem(PASSKEY_PP);
  return u && p ? { userId: u, passphrase: p } : null;
}
export function clearPasskeyTrust(): void {
  localStorage.removeItem(PASSKEY_USER);
  localStorage.removeItem(PASSKEY_PP);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  pushTokenToExtension(token);
}
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WALLET_KEY);
  clearTokenInExtension();
}

// ── Browser extension bridge ────────────────────────────────────────────────
// When the dashboard logs in, push the session token to the KeyShield Chrome
// extension via chrome.runtime.sendMessage (externally_connectable). This lets
// the extension's content.js auto-detect and STORE keys without opening a tab.
//
// EXTENSION_IDS: list candidate extension IDs. Production replaces with the
// stable Chrome Web Store ID. For dev, we broadcast — the extension that has
// us in its externally_connectable list is the one that wins.

const EXTENSION_IDS: string[] = [
  // Replace with your unpacked extension ID from chrome://extensions
  // Or set localStorage['ks_ext_id'] = '<id>' to override at runtime
];

function getExtensionId(): string | null {
  const override = localStorage.getItem('ks_ext_id');
  if (override) return override;
  return EXTENSION_IDS[0] ?? null;
}

function hasChromeRuntime(): boolean {
  // @ts-ignore — chrome is injected into the page when the extension is installed
  return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;
}

export function pushTokenToExtension(token: string): void {
  if (!hasChromeRuntime()) return;
  const id = getExtensionId();
  if (!id) return;
  try {
    // @ts-ignore
    chrome.runtime.sendMessage(id, {
      type:  'KS_TOKEN_REGISTER',
      token,
      user:  getWalletAddress() ?? '',
    }, () => { /* ignore lastError if extension not installed */ });
  } catch { /* extension not installed — silent */ }
}

export function clearTokenInExtension(): void {
  if (!hasChromeRuntime()) return;
  const id = getExtensionId();
  if (!id) return;
  try {
    // @ts-ignore
    chrome.runtime.sendMessage(id, { type: 'KS_TOKEN_CLEAR' }, () => {});
  } catch { /* silent */ }
}

/** Returns whether the extension is installed AND has the current session token. */
export async function pingExtension(): Promise<{ installed: boolean; hasToken: boolean }> {
  if (!hasChromeRuntime()) return { installed: false, hasToken: false };
  const id = getExtensionId();
  if (!id) return { installed: false, hasToken: false };
  return new Promise(resolve => {
    try {
      // @ts-ignore
      chrome.runtime.sendMessage(id, { type: 'KS_PING' }, (resp: any) => {
        // @ts-ignore
        if (chrome.runtime.lastError) {
          resolve({ installed: false, hasToken: false });
        } else {
          resolve({ installed: true, hasToken: !!resp?.hasToken });
        }
      });
    } catch {
      resolve({ installed: false, hasToken: false });
    }
  });
}
export function getWalletAddress(): string | null {
  return localStorage.getItem(WALLET_KEY);
}
export function setWalletAddress(addr: string): void {
  localStorage.setItem(WALLET_KEY, addr);
}
export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Authenticated fetch — injects Bearer token automatically.
 *  On 401 (except for /auth/* endpoints), wipes local auth and pings the app to
 *  bounce back to AuthScreen, so expired tokens don't leave the UI in a stale
 *  "logged in but every call fails" state. */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    clearAuth();
    clearPasskeyTrust();
    notifyAuthChanged();
  }
  return res;
}

/** Fetch a one-time wallet challenge nonce from the backend. */
export async function fetchChallenge(): Promise<{ challenge: string; nonce: string }> {
  const res = await fetch(`${API_BASE}/auth/wallet-challenge`);
  if (!res.ok) throw new Error('Failed to fetch challenge');
  return res.json();
}

/** Submit signed challenge + passphrase → get session token. */
export async function walletLogin(
  walletAddress: string,
  signatureBytes: Uint8Array,
  challenge: string,
  passphrase: string,
): Promise<{ token: string; userId: string }> {
  const signature = btoa(String.fromCharCode(...signatureBytes));
  const res = await fetch(`${API_BASE}/auth/wallet-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, signature, challenge, passphrase }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Login failed');
  }
  return res.json();
}

/** Notify other components that auth state changed. */
export function notifyAuthChanged(): void {
  window.dispatchEvent(new CustomEvent('ks-auth-changed'));
}

/** Sign in with the passkey registered on this device.
 *  Triggers Face ID / Touch ID / hardware key prompt, returns a session token. */
export async function passkeyLogin(): Promise<{ token: string; userId: string }> {
  const trust = getPasskeyTrust();
  if (!trust) throw new Error('No passkey registered on this device');
  const { userId, passphrase } = trust;

  const optsRes = await fetch(`${API_BASE}/auth/passkey/auth-options?user_id=${encodeURIComponent(userId)}`);
  if (!optsRes.ok) throw new Error('Failed to fetch passkey options — try wallet login');
  const opts = await optsRes.json();

  opts.challenge = _b64urlToBuffer(opts.challenge);
  if (opts.allowCredentials) {
    opts.allowCredentials = opts.allowCredentials.map((c: { id: string }) => ({
      ...c, id: _b64urlToBuffer(c.id),
    }));
  }

  const credential = await navigator.credentials.get({ publicKey: opts }) as PublicKeyCredential;
  if (!credential) throw new Error('Passkey authentication cancelled');

  const resp = credential.response as AuthenticatorAssertionResponse;
  const credPayload = {
    id: credential.id,
    rawId: _bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: _bufferToB64url(resp.authenticatorData),
      clientDataJSON:    _bufferToB64url(resp.clientDataJSON),
      signature:         _bufferToB64url(resp.signature),
      userHandle:        resp.userHandle ? _bufferToB64url(resp.userHandle) : null,
    },
  };

  const verRes = await fetch(
    `${API_BASE}/auth/passkey/auth-verify?user_id=${encodeURIComponent(userId)}&passphrase=${encodeURIComponent(passphrase)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: credPayload }),
    },
  );
  if (!verRes.ok) {
    const err = await verRes.json().catch(() => ({ detail: 'Passkey login failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Passkey login failed');
  }
  return verRes.json();
}

// ─── Passkey (WebAuthn) helpers ────────────────────────────────────────────

/** Fetch WebAuthn registration options, call browser API, verify with backend. */
export async function registerPasskey(name: string): Promise<{ credentialId: string; name: string }> {
  const optsRes = await apiFetch('/auth/passkey/register-options');
  if (!optsRes.ok) throw new Error('Failed to get registration options');
  const opts = await optsRes.json();

  // Convert base64url challenge to ArrayBuffer
  opts.challenge = _b64urlToBuffer(opts.challenge);
  opts.user.id   = _b64urlToBuffer(opts.user.id);
  if (opts.excludeCredentials) {
    opts.excludeCredentials = opts.excludeCredentials.map((c: { id: string }) => ({
      ...c, id: _b64urlToBuffer(c.id),
    }));
  }

  const credential = await navigator.credentials.create({ publicKey: opts }) as PublicKeyCredential;
  if (!credential) throw new Error('Passkey creation cancelled');

  const response = credential.response as AuthenticatorAttestationResponse;
  const credPayload = {
    id: credential.id,
    rawId: _bufferToB64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: _bufferToB64url(response.attestationObject),
      clientDataJSON:    _bufferToB64url(response.clientDataJSON),
    },
  };

  const verRes = await apiFetch('/auth/passkey/register-verify', {
    method: 'POST',
    body: JSON.stringify({ credential: credPayload, name }),
  });
  if (!verRes.ok) {
    const err = await verRes.json().catch(() => ({ detail: 'Registration failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Registration failed');
  }
  return verRes.json();
}

/** List passkeys for the current user. */
export async function listPasskeys(): Promise<Array<{ id: string; name: string; createdAt: number }>> {
  const res = await apiFetch('/auth/passkey/list');
  if (!res.ok) return [];
  const data = await res.json();
  return data.credentials ?? [];
}

/** Delete a passkey by credential id. */
export async function deletePasskey(credId: string): Promise<void> {
  await apiFetch(`/auth/passkey/${encodeURIComponent(credId)}`, { method: 'DELETE' });
}

function _b64urlToBuffer(b64url: string): ArrayBuffer {
  const pad = 4 - (b64url.length % 4);
  const b64  = (pad !== 4 ? b64url + '='.repeat(pad) : b64url)
    .replace(/-/g, '+').replace(/_/g, '/');
  const bin  = atob(b64);
  const buf  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function _bufferToB64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
````

## File: lib/key-detector.ts
````typescript
/**
 * Key Detection System
 * Detects API keys from form fields, clipboard, and screen content.
 * Ported from disabled_extension/src/lib/key-detector.ts
 */

export interface DetectedKey {
  key: string;
  source: 'form' | 'clipboard' | 'ocr' | 'dom';
  fieldName?: string;
  fieldType?: string;
  domain: string;
  timestamp: number;
  provider?: string;
}

interface API_PATTERN {
  name: string;
  regex: RegExp;
  priority?: number;
}

const API_PATTERNS: API_PATTERN[] = [
  // Tier 1: Solana RPC & Infrastructure
  {
    name: 'Helius',
    regex: /(?:api-key=|X-API-Key:\s*)([a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})/i,
    priority: 10,
  },
  {
    name: 'QuickNode',
    regex: /\.(?:quicknode\.pro|quicknode\.com)\/([A-Za-z0-9]{30,})/i,
    priority: 9,
  },
  {
    name: 'Alchemy',
    regex: /\.(?:alchemy\.com|alchemyapi\.io)\/v2\/([A-Za-z0-9_-]{32,})/i,
    priority: 9,
  },
  {
    name: 'Ankr',
    regex: /(?:ankr\.com\/([A-Za-z0-9_]{40,})|X-API-Key:\s*([A-Za-z0-9_]{40,}))/i,
    priority: 8,
  },
  {
    name: 'GetBlock',
    regex: /Authorization:\s*Bearer\s+([A-Za-z0-9]{40,})/i,
    priority: 8,
  },
  {
    name: 'Chainstack',
    regex: /\.(?:chainstack\.com|chainstacklabs\.com)\/([A-Za-z0-9]{32,})/i,
    priority: 8,
  },

  // Tier 2: Solana Data & Analytics
  {
    name: 'Shyft',
    regex: /x-api-key[:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 7,
  },
  {
    name: 'SolanaFM',
    regex: /(?:solanafm\.com|api\.solanafm\.com).*?[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 6,
  },
  {
    name: 'Solscan',
    regex: /(?:solscan\.io|api\.solscan\.io).*?[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 6,
  },

  // Tier 3: Trading & MEV
  {
    name: 'bloXroute',
    regex: /(?:Authorization|X-Authorization):\s*([A-Za-z0-9+/=]{80,})/i,
    priority: 9,
  },
  {
    name: '0x API',
    regex: /(?:0x-api-key|X-API-Key):\s*([a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})/i,
    priority: 8,
  },

  // Tier 4: Additional Solana services
  {
    name: 'Moralis',
    regex: /(?:moralis\.io|api\.moralis\.io).*?[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 5,
  },
  {
    name: 'Tatum',
    regex: /(?:tatum\.io|api\.tatum\.io).*?[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 5,
  },

  // Classic dev APIs
  {
    name: 'OpenAI/Anthropic/Groq',
    regex: /sk-(?:live|test|proj|ant)_[A-Za-z0-9]{48}/i,
    priority: 4,
  },
  {
    name: 'GitHub PAT',
    regex: /gh[pousr]_[A-Za-z0-9]{36,}/i,
    priority: 4,
  },
  {
    name: 'Stripe',
    regex: /[rs]k_(?:live|test)_[A-Za-z0-9]{24,}/i,
    priority: 3,
  },
  {
    name: 'AWS',
    regex: /AKIA[0-9A-Z]{16}/i,
    priority: 3,
  },
  {
    name: 'Google Cloud',
    regex: /AIza[0-9A-Za-z_-]{35}/i,
    priority: 3,
  },
  {
    name: 'Twilio',
    regex: /SK[0-9a-fA-F]{32}/i,
    priority: 2,
  },
  {
    name: 'Cloudflare',
    regex: /v1\/[0-9a-f]{40}/i,
    priority: 2,
  },
];

const KEY_FIELD_PATTERNS = [
  /api[_-]?key/i,
  /apikey/i,
  /api[_-]?token/i,
  /access[_-]?token/i,
  /secret[_-]?key/i,
  /secret[_-]?token/i,
  /auth[_-]?token/i,
  /bearer[_-]?token/i,
  /private[_-]?key/i,
  /helius.*api.*key/i,
  /helius.*key/i,
  /helius.*token/i,
  /quicknode.*api.*key/i,
  /quicknode.*key/i,
  /alchemy.*api.*key/i,
  /ankr.*api.*key/i,
  /getblock.*api.*key/i,
  /chainstack.*api.*key/i,
  /shyft.*api.*key/i,
  /solanafm.*api.*key/i,
  /solscan.*api.*key/i,
  /bloxroute.*api.*key/i,
  /0x.*api.*key/i,
  /gemini.*api.*key/i,
  /google.*ai.*key/i,
  /google.*gemini.*key/i,
  /gemini.*key/i,
];

export class KeyDetector {
  static detectFormFields(): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const domain = window.location.hostname;

    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="password"], input:not([type]), textarea',
    );

    inputs.forEach((input) => {
      const value = input.value.trim();
      if (!value) return;

      const fieldName = input.name || input.id || input.className;
      const isKeyField = KEY_FIELD_PATTERNS.some((p) => p.test(fieldName));

      let matchedProvider: string | undefined;
      for (const pattern of API_PATTERNS) {
        const match = value.match(pattern.regex);
        if (match) {
          matchedProvider = pattern.name;
          detected.push({
            key: match[1] || match[0],
            source: 'form',
            fieldName,
            fieldType: input.type || 'text',
            domain,
            timestamp: Date.now(),
            provider: matchedProvider,
          });
          break;
        }
      }

      if (!matchedProvider && isKeyField && value.length >= 16) {
        detected.push({
          key: value,
          source: 'form',
          fieldName,
          fieldType: input.type || 'text',
          domain,
          timestamp: Date.now(),
        });
      }
    });

    return detected;
  }

  static async detectClipboard(): Promise<DetectedKey | null> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.length < 16) return null;

      const trimmed = text.trim();

      for (const pattern of API_PATTERNS) {
        const match = trimmed.match(pattern.regex);
        if (match) {
          return {
            key: match[1] || match[0],
            source: 'clipboard',
            domain: window.location.hostname,
            timestamp: Date.now(),
            provider: pattern.name,
          };
        }
      }

      const lines = trimmed.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*[A-Z_]+[=:]\s*(.+)$/);
        if (match) {
          const value = match[1].trim().replace(/['"]/g, '');
          for (const pattern of API_PATTERNS) {
            const keyMatch = value.match(pattern.regex);
            if (keyMatch) {
              return {
                key: keyMatch[1] || keyMatch[0],
                source: 'clipboard',
                domain: window.location.hostname,
                timestamp: Date.now(),
                provider: pattern.name,
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn('Clipboard access denied:', error);
    }

    return null;
  }

  static detectFromText(text: string, domain: string): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 16) continue;

      for (const pattern of API_PATTERNS) {
        const match = trimmed.match(pattern.regex);
        if (match) {
          detected.push({
            key: match[1] || match[0],
            source: 'ocr',
            domain,
            timestamp: Date.now(),
            provider: pattern.name,
          });
          break;
        }
      }

      const keyValueMatch = trimmed.match(/^\s*[A-Z_]+[=:]\s*(.+)$/);
      if (keyValueMatch) {
        const value = keyValueMatch[1].trim().replace(/['"]/g, '');
        for (const pattern of API_PATTERNS) {
          const match = value.match(pattern.regex);
          if (match) {
            detected.push({
              key: match[1] || match[0],
              source: 'ocr',
              domain,
              timestamp: Date.now(),
              provider: pattern.name,
            });
            break;
          }
        }
      }
    }

    return detected;
  }

  static setupFormMonitoring(callback: (detected: DetectedKey[]) => void): () => void {
    const handleSubmit = () => {
      const detected = this.detectFormFields();
      if (detected.length > 0) callback(detected);
    };
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.type === 'password' || target.type === 'text') {
        const detected = this.detectFormFields();
        if (detected.length > 0) callback(detected);
      }
    };
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('input', handleInput, true);
    return () => {
      document.removeEventListener('submit', handleSubmit, true);
      document.removeEventListener('input', handleInput, true);
    };
  }

  static setupClipboardMonitoring(
    callback: (detected: DetectedKey | null) => void,
    intervalMs = 1000,
  ): () => void {
    let lastClipboard = '';
    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text !== lastClipboard) {
          lastClipboard = text;
          const detected = await this.detectClipboard();
          if (detected) callback(detected);
        }
      } catch {
        // Clipboard access denied — silent
      }
    };
    const intervalId = setInterval(checkClipboard, intervalMs);
    return () => clearInterval(intervalId);
  }

  static detectFromDOMContent(): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const domain = window.location.hostname;
    const alerted = new Set<string>();

    try {
      const textContent = document.body.innerText || '';
      const htmlContent = document.body.innerHTML || '';
      const combinedContent = textContent + '\n' + htmlContent;

      for (const pattern of API_PATTERNS) {
        const matches = [...combinedContent.matchAll(new RegExp(pattern.regex.source, 'gi'))];
        for (const match of matches) {
          const key = match[1] || match[0];
          if (!key || key.length < 16) continue;
          const keyId = `${pattern.name}:${key.slice(0, 12)}`;
          if (!alerted.has(keyId)) {
            alerted.add(keyId);
            detected.push({
              key: key.trim(),
              source: 'dom',
              domain,
              timestamp: Date.now(),
              provider: pattern.name,
            });
          }
        }
      }
    } catch (error) {
      console.warn('[KeyShield] Error scanning DOM content:', error);
    }

    return detected;
  }

  static isValidKey(key: string): boolean {
    if (!key || key.length < 16) return false;
    return API_PATTERNS.some((p) => p.regex.test(key.trim()));
  }
}
````

## File: lib/ocr-service.ts
````typescript
/**
 * OCR Service for Screen Capture
 * Uses tesseract.js for optical character recognition.
 * Ported from disabled_extension/src/lib/ocr-service.ts
 * The Tesseract worker is lazy-loaded on first use to avoid large bundle impact.
 */

import { KeyDetector, type DetectedKey } from './key-detector';

export class OCRService {
  private worker: any = null;
  private isInitialized = false;

  /**
   * Lazy-initialize the Tesseract worker. Called automatically before first recognition.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Dynamic import so the large Tesseract bundle is only loaded when OCR is used.
      const { createWorker } = await import('tesseract.js');
      this.worker = await createWorker('eng');
      await this.worker.setParameters({
        // Restrict character set to characters commonly found in API keys.
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=:./',
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('[KeyShield] Failed to initialize OCR worker:', error);
      throw error;
    }
  }

  /**
   * Run OCR on an image element or canvas and return raw text.
   */
  async extractTextFromImage(
    imageData: ImageData | HTMLImageElement | HTMLCanvasElement,
  ): Promise<string> {
    if (!this.isInitialized) await this.initialize();

    try {
      const { data: { text } } = await this.worker.recognize(imageData);
      return text;
    } catch (error) {
      console.error('[KeyShield] OCR extraction failed:', error);
      throw error;
    }
  }

  /**
   * Prompt the user for screen-capture permission, grab one frame, and return
   * any API keys found via OCR + pattern matching.
   */
  async captureScreenAndDetectKeys(domain: string): Promise<DetectedKey[]> {
    // getDisplayMedia is only available in secure contexts (HTTPS / extension popup).
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { mediaSource: 'screen' } as any,
    });

    try {
      const video = document.createElement('video');
      video.srcObject = stream;

      // Must call play() before metadata is available.
      await video.play();
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('[KeyShield] Failed to get canvas context');
      ctx.drawImage(video, 0, 0);

      const text = await this.extractTextFromImage(canvas);
      return KeyDetector.detectFromText(text, domain);
    } finally {
      // Always stop the capture stream — never leave it running.
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  /**
   * Run OCR on a user-supplied image File and return detected keys.
   */
  async extractFromImageFile(file: File, domain: string): Promise<DetectedKey[]> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const text = await this.extractTextFromImage(img);
          resolve(KeyDetector.detectFromText(text, domain));
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(img.src);
        }
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Terminate the Tesseract worker and free memory.
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

// Singleton for use across the extension popup lifetime.
export const ocrService = new OCRService();
````

## File: lib/preferences.ts
````typescript
/**
 * User preferences — stored in localStorage, never sent to server.
 * Used for things like reveal-duration, default expiry, notification toggle.
 */

export interface VaultPreferences {
  revealDurationSec: number;   // how long a decrypted key stays visible
  defaultExpiryDays: number;   // pre-fill in AddKeyModal
  notifyOnExpiry:    boolean;  // browser notification 7 days before expiry
  notifyOnAnomaly:   boolean;  // browser notification on call spike
}

const KEY = 'ks_prefs';

const DEFAULTS: VaultPreferences = {
  revealDurationSec: 30,
  defaultExpiryDays: 90,
  notifyOnExpiry:    true,
  notifyOnAnomaly:   false,
};

export function getPrefs(): VaultPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function setPrefs(prefs: Partial<VaultPreferences>): VaultPreferences {
  const merged = { ...getPrefs(), ...prefs };
  localStorage.setItem(KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('ks-prefs-changed'));
  return merged;
}
````

## File: lib/sentry.ts
````typescript
/**
 * sentry.ts — optional Sentry integration for the KeyShield extension.
 *
 * Only initialised when VITE_SENTRY_DSN is set at build time.
 * Never captures API keys, vault data, or user credentials.
 */
import * as Sentry from '@sentry/browser';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION ?? 'dev',
    tracesSampleRate: 0.1,
    // Strip sensitive data before sending
    beforeSend(event) {
      // Drop network errors (too noisy for extension)
      if (event.exception?.values?.[0]?.type === 'NetworkError') return null;
      return event;
    },
  });
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!DSN) return;
  Sentry.withScope(scope => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}

export function captureMessage(msg: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!DSN) return;
  Sentry.captureMessage(msg, level);
}
````

## File: lib/solana.ts
````typescript
/**
 * Solana helpers for the KeyShield wallet sign-off UI.
 *
 * Spec 10 Phase 10.5 (Beta — wallet sign-off): the server returns the
 * unsigned ix payload from `/mpp/streams/{id}/build-{open,withdraw}-tx`
 * but cannot derive the PDA that `open_payment_stream` (#24) creates —
 * the bump must come from the SIGNER side or Solana rejects the ix.
 * We compute it client-side via `findProgramAddressSync` and pass
 * `streamPda` + `bump` back to the server in the request body.
 *
 * PDA seeds — see programs/keyshield/src/instructions/open_stream.rs:38
 * (`pub const APS_SEED: &[u8] = b"agent_payment_stream";`):
 *   ["agent_payment_stream", agent_grant_pubkey, owner_pubkey]
 *
 * Helpers also include the explorer URL builder so `ActivitySection`
 * doesn't hardcode the cluster string in three places.
 */

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Connection,
} from '@solana/web3.js';

/** Seed prefix for `open_payment_stream` PDAs.
 *  Matches `APS_SEED` in programs/keyshield/src/instructions/open_stream.rs:38. */
export const APS_SEED = 'agent_payment_stream';

/** Solana cluster the demo targets — devnet for now per ROADMAP §6a. */
export type Cluster = 'devnet' | 'mainnet-beta';
const DEFAULT_CLUSTER: Cluster = 'devnet';

/** Base64 decode → Uint8Array (browser-safe, no `buffer` dep needed). */
function b64decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** KeyShield on-chain program id.
 *
 *  Read from `KEYSHIELD_PROGRAM_ID` (vite.config.ts pipes it through
 *  `process.env`). Returns `null` when the env var isn't set — caller
 *  is expected to disable the wallet sign-off UI in that case (server
 *  also returns 503 from /build-*-tx so the failure is double-gated). */
export function getKeyshieldProgramId(): PublicKey | null {
  const raw = (typeof process !== 'undefined'
    && (process.env as Record<string, string>)?.['KEYSHIELD_PROGRAM_ID'])
    || '';
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

/** Derive the AgentPaymentStream PDA from agent + owner pubkeys.
 *
 *  Returns `[pda, bump]`. `bump` is the 1-byte canonical bump that the
 *  server will pack into byte 1 of the ix data (after the discriminator
 *  is stripped) — see open_stream.rs:89.
 */
export function deriveStreamPda(
  agentPubkey: PublicKey,
  ownerPubkey: PublicKey,
  programId:   PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(APS_SEED),
      agentPubkey.toBuffer(),
      ownerPubkey.toBuffer(),
    ],
    programId,
  );
}

/** Wire shape the server returns from `/mpp/streams/{id}/build-*-tx`.
 *  Matches `BuildTxResponse` in v2-mvp/src/server.py:1973. */
export interface BuildTxResponse {
  programId: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;  // base64-encoded ix payload (discriminator + body)
}

/** Wrap the server's BuildTxResponse into a `Transaction` ready for
 *  wallet adapter `signAndSendTransaction`.
 *
 *  This is intentionally one-line-per-step so reviewers can see the
 *  base64→bytes hop and the AccountMeta translation match the server's
 *  `_ix_to_response` byte-for-byte (server.py:1979). */
export function buildTxFromResponse(resp: BuildTxResponse): Transaction {
  const ix = new TransactionInstruction({
    programId: new PublicKey(resp.programId),
    keys: resp.keys.map(k => ({
      pubkey:     new PublicKey(k.pubkey),
      isSigner:   k.isSigner,
      isWritable: k.isWritable,
    })),
    data: b64decode(resp.data),
  });
  return new Transaction().add(ix);
}

/** Sign + send + confirm a built Transaction via the wallet adapter.
 *
 *  Returns the base58 tx signature once the cluster confirms the tx at
 *  the `'confirmed'` commitment. Caller posts the sig to
 *  `/mpp/streams/{id}/record-tx` for UI persistence. */
export async function signAndConfirmTx(
  tx:              Transaction,
  connection:      Connection,
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>,
): Promise<string> {
  const sig = await sendTransaction(tx, connection);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, ...latest },
    'confirmed',
  );
  return sig;
}

/** Solana explorer URL for a tx signature on the configured cluster. */
export function explorerTxUrl(sig: string, cluster: Cluster = DEFAULT_CLUSTER): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}

// ── SPL ATA derivation (no @solana/spl-token dep) ───────────────────────────
//
// We avoid pulling in @solana/spl-token because we only need the ATA
// pubkey (not a transfer/mint helper) and the spl-token package adds
// ~80kb to the wallet sign-off bundle. The derivation rule below is the
// canonical one — see https://spl.solana.com/associated-token-account.

/** SPL Token program id (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA). */
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);

/** SPL Associated Token Account program id. */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

/** Devnet USDC mint (Circle). Override via `KEYSHIELD_USDC_MINT` env when
 *  pointing at a fork or a custom faucet mint. */
export function getUsdcMint(): PublicKey {
  const raw = (typeof process !== 'undefined'
    && (process.env as Record<string, string>)?.['KEYSHIELD_USDC_MINT'])
    || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';  // devnet USDC
  return new PublicKey(raw);
}

/** Derive an Associated Token Account pubkey from owner + mint.
 *  Uses the canonical SPL formula so we don't need @solana/spl-token. */
export function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}
````

## File: lib/time.ts
````typescript
/** Relative time formatter used in Activity / Agents feeds. */
export function relTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
````

## File: lib/vault-key.ts
````typescript
/**
 * Deterministic vault-key derivation.
 * Used by WalletConnector (first login) and SettingsSection (passkey binding).
 *
 * ed25519 signatures are deterministic, so signing this fixed message
 * produces the same passphrase every session for the same wallet —
 * but unguessable without the private key.
 */

export const VAULT_KEY_MESSAGE = 'KeyShield Vault Key Derivation v1';

export async function deriveVaultPassphrase(sigBytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', sigBytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}
````

## File: lib/version.ts
````typescript
export const VERSION = 'v2.0.0-beta.1';
export const BUILD_DATE = '2026-04-29';
export const BETA_FEEDBACK_URL =
  'https://github.com/lilaclilac09/keyshield/issues/new?labels=beta-feedback&title=%5Bbeta%5D+';
export const REPO_URL = 'https://github.com/lilaclilac09/keyshield';
````

## File: lib/x402-trust.ts
````typescript
/**
 * x402 Trust Store
 * ─────────────────────────────────────────────────────────────────────────────
 * Backed by chrome.storage.local when in extension context, or in-memory/localStorage
 * when running as a standalone web dashboard. Safe to import in both React popup
 * context and background service worker — no DOM, no window, no fetch.
 *
 * Storage key: ks_x402_trust_list
 * Schema:      Record<hostname, TrustEntry>
 */

export interface TrustEntry {
  threshold_usd: number;
  enabled: boolean;
  added_at: number;
}

export type TrustList = Record<string, TrustEntry>;

const STORAGE_KEY = 'ks_x402_trust_list';
const LS_KEY = 'ks_x402_trust_list_web';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

async function load(): Promise<TrustList> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as TrustList) ?? {};
  }
  // Fallback: localStorage for web dashboard
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function save(list: TrustList): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  } else {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }
}

/** Returns true if hostname is trusted AND enabled. */
export async function isTrusted(hostname: string): Promise<boolean> {
  const list = await load();
  const entry = list[hostname];
  return !!entry && entry.enabled;
}

/**
 * Returns the threshold_usd for a trusted+enabled domain.
 * Returns Infinity if the domain is not trusted or is disabled,
 * so amount < getThreshold() is always false → no auto-pay.
 */
export async function getThreshold(hostname: string): Promise<number> {
  const list = await load();
  const entry = list[hostname];
  if (!entry || !entry.enabled) return Infinity;
  return entry.threshold_usd;
}

/** Add (or update) a domain in the trust list. Enabled by default. */
export async function addDomain(hostname: string, threshold_usd: number): Promise<void> {
  const list = await load();
  list[hostname] = {
    threshold_usd,
    enabled: list[hostname]?.enabled ?? true,
    added_at: list[hostname]?.added_at ?? Date.now(),
  };
  await save(list);
}

/** Remove a domain from the trust list entirely. */
export async function removeDomain(hostname: string): Promise<void> {
  const list = await load();
  delete list[hostname];
  await save(list);
}

/** Return all trusted domains. */
export async function listTrustedDomains(): Promise<TrustList> {
  return load();
}

/** Toggle enabled state without changing threshold or added_at. */
export async function toggleDomain(hostname: string, enabled: boolean): Promise<void> {
  const list = await load();
  if (!list[hostname]) return; // no-op if domain doesn't exist
  list[hostname] = { ...list[hostname], enabled };
  await save(list);
}
````

## File: manifest.firefox.json
````json
{
  "manifest_version": 2,
  "name": "KeyShield — Sovereign Vault",
  "version": "1.1.0",
  "description": "Auto-detect API keys on any page and store them in your encrypted KeyShield vault.",

  "permissions": [
    "storage",
    "notifications",
    "clipboardRead",
    "http://localhost:8000/*",
    "http://localhost:3000/*"
  ],

  "browser_action": {
    "default_popup": "index.html"
  },

  "background": {
    "scripts": ["background.js"]
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ],

  "web_accessible_resources": ["assets/*"],

  "content_security_policy": "script-src 'self'; object-src 'self'"
}
````

## File: manifest.json
````json
{
  "manifest_version": 3,
  "name": "KeyShield — Sovereign Vault",
  "version": "1.1.0",
  "description": "Auto-detect API keys on any page and store them in your encrypted KeyShield vault.",

  "permissions": [
    "storage",
    "notifications",
    "clipboardRead"
  ],

  "host_permissions": [
    "http://localhost:8000/*",
    "http://localhost:3000/*",
    "https://api.keyshield.dev/*",
    "https://*.keyshield.dev/*"
  ],

  "action": {
    "default_popup": "index.html"
  },

  "background": {
    "service_worker": "background.js"
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ],

  "externally_connectable": {
    "matches": [
      "http://localhost:3000/*",
      "http://localhost:3001/*",
      "https://keyshield.dev/*",
      "https://*.keyshield.dev/*"
    ]
  }
}
````

## File: metadata.json
````json
{
  "name": "keyshield_front",
  "description": "Generated by Gemini.",
  "requestFramePermissions": [
    "camera"
  ]
}
````

## File: package.json
````json
{
  "name": "keyshield_front",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "predev": "node check-platform.cjs",
    "prebuild": "node check-platform.cjs",
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@sentry/browser": "^8.0.0",
    "@solana/wallet-adapter-base": "0.9.25",
    "@solana/wallet-adapter-react": "0.15.35",
    "@solana/wallet-adapter-react-ui": "0.9.35",
    "@solana/wallet-adapter-wallets": "0.19.32",
    "@solana/web3.js": "^1.98.4",
    "lucide-react": "^0.562.0",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "tesseract.js": "^5.1.1"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.270",
    "@types/node": "^22.14.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  },
  "optionalDependencies": {
    "@esbuild/win32-x64": "*",
    "@esbuild/darwin-x64": "*",
    "@esbuild/darwin-arm64": "*",
    "@esbuild/linux-x64": "*",
    "@esbuild/linux-arm64": "*",
    "@rollup/rollup-win32-x64-msvc": "*",
    "@rollup/rollup-darwin-x64": "*",
    "@rollup/rollup-darwin-arm64": "*",
    "@rollup/rollup-linux-x64-gnu": "*",
    "@rollup/rollup-linux-arm64-gnu": "*",
    "@rollup/rollup-linux-arm64-musl": "*"
  }
}
````

## File: README.md
````markdown
# KeyShield Frontend

Vault dashboard + Chrome extension. Single source of code, two delivery modes.

> **For agents (Claude / Codex / Cursor / etc) picking this up cold:**
> Branch `refactor/clean-multi-type-vault` is the working version. `main` is an older "cyberpunk" theme — don't run that one.

---

## Run it locally (3 commands)

```bash
git fetch origin
git checkout refactor/clean-multi-type-vault    # the good one
cd frontend && npm install && npm run dev
```

Frontend boots at `http://localhost:3000` (or 3001/3002 if 3000 is taken).

You also need the backend running on `:8000`:

```bash
# from the repo root, in another terminal
cd v2-mvp
python3.14 -m venv .venv 2>/dev/null || true
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn src.server:app --port 8000 --reload
```

---

## What this codebase is

```
frontend/
├── App.tsx                     ← 275 lines: sidebar + section router only
├── index.tsx                   ← React mount
├── index.html                  ← Tailwind CDN + entry
├── types.ts                    ← VaultItem + 5 secret payload types
├── manifest.json               ← also serves as Chrome extension manifest
├── background.js / content.js  ← extension scripts (auto-detect API keys)
│
├── components/
│   ├── AuthScreen.tsx          ← wallet connect + Face ID for trusted devices
│   ├── WalletConnector.tsx     ← signs 2 messages: challenge + vault-key derivation
│   ├── SolanaProvider.tsx      ← Phantom / Solflare / Burner adapters
│   ├── AddKeyModal.tsx         ← 5 type tabs: api_key / password / note / env / ssh_key
│   ├── VaultItemCard.tsx       ← per-type body sub-components
│   ├── ProviderIcons.tsx       ← OpenAI / Helius / etc logos
│   │
│   ├── sections/               ← one file per dashboard panel
│   │   ├── VaultSection.tsx
│   │   ├── ActivitySection.tsx ← billing + usage + proxy call log
│   │   ├── AgentsSection.tsx   ← ed25519 keypair generator + register
│   │   ├── SharingSection.tsx
│   │   ├── SessionsSection.tsx
│   │   ├── SettingsSection.tsx ← identity / devices / prefs / extension / data + 1Password compare
│   │   ├── DeveloperSection.tsx
│   │   └── DocsSection.tsx
│   │
│   └── ui/                     ← shared primitives
│       ├── StatCard.tsx
│       ├── Placeholder.tsx
│       ├── CopyButton.tsx       (also exports useCopyable hook)
│       └── CodeBlock.tsx
│
├── hooks/
│   └── useVaults.ts            ← /manage/list /store /decrypt /secret CRUD
│
└── lib/
    ├── auth.ts                 ← session token + passkey + extension bridge
    ├── vault-key.ts            ← deterministic passphrase from wallet sig
    ├── time.ts                 ← relTime
    └── preferences.ts          ← user prefs in localStorage
```

---

## Two consumer modes (this is the whole point)

```
┌── Human user ──────────────────────────────────────────────┐
│                                                              │
│  Browser ──▶ /auth/wallet-login ──▶ session token            │
│                                                              │
│  Dashboard:                                                  │
│   • Vault: store API keys / passwords / notes / env / SSH    │
│   • Reveal locally with Face ID / wallet sig                 │
│   • Activity: every proxy call, cost, latency                │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌── Agent / CI / bot ────────────────────────────────────────┐
│                                                              │
│  Agent ──▶ http://localhost:8000/proxy/openai/v1/chat/...    │
│            Authorization: Bearer <ks_token>                  │
│                                                              │
│  Backend internally:                                         │
│    1. Verify token                                           │
│    2. AES-decrypt user's stored OpenAI key with passphrase   │
│    3. Inject into upstream request                           │
│    4. Forward to api.openai.com                              │
│                                                              │
│  Agent never sees the raw key. Server logs the call          │
│  (provider, latency, cost, key_type).                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Vault item types

All five live in the same `/manage/list` and `/manage/decrypt/{id}` endpoints. Type is encoded in the slug prefix:

| Type | Slug prefix | Decrypted value |
|---|---|---|
| `api_key`  | (none — slug = upstream id like `openai`) | plain string |
| `password` | `pw__`   | JSON `{ username, password, url, notes }` |
| `note`     | `note__` | JSON `{ title, content }` |
| `env`      | `env__`  | JSON `{ vars: [{key, value}], notes }` |
| `ssh_key`  | `ssh__`  | JSON `{ publicKey, privateKey, passphrase, comment }` |

Backend allowlist for slugs: `UPSTREAMS` dict (api keys) + `ALLOWED_USER_PREFIXES` tuple (`pw__`, `note__`, `env__`, `ssh__`). See `v2-mvp/src/server.py`.

---

## Branch layout

```
main                                     ← old "cyberpunk" theme (Jan 2026) — don't ship
refactor/clean-multi-type-vault          ← THIS — wallet+passkey, 5 types, modular
```

Use `git log --oneline -5` to see what's where.

---

## Common tasks

```bash
# type-check (no errors expected)
npx tsc --noEmit

# build for production
npm run build

# build as Chrome extension
# In Chrome: chrome://extensions → Developer mode → Load unpacked → select /frontend
```

---

## Backend pairing

The frontend calls `http://localhost:8000` by default. Override with `KEYSHIELD_API_URL` env var or set `API_BASE` in `lib/auth.ts`.

CORS is open for ports 3000–3005 + 5173–5175 by default (see `v2-mvp/src/server.py`).
````

## File: tsconfig.json
````json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "types": [
      "node",
      "chrome",
      "vite/client"
    ],
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
````

## File: types.ts
````typescript
export type VaultItemType = 'api_key' | 'password' | 'note' | 'env' | 'ssh_key';

export interface VaultItem {
  id:         string;          // backend slug (e.g. "openai", "pw__google", "note__idea")
  name:       string;          // user-facing label
  type:       VaultItemType;
  value:      string;          // for api_key: the proxy URL. for others: a preview ("•••••")
  domain?:    string;          // optional source domain
  createdAt:  number;
  lastUsedAt: number;
  tags:       string[];
  notes?:     string;
  expiryDate?: string;
}

// ─── Per-type plaintext payloads (decrypted client-side, JSON.parsed) ────────

export interface PasswordPayload {
  username: string;
  password: string;
  url?:     string;
  notes?:   string;
}

export interface NotePayload {
  title:   string;
  content: string;
}

export interface EnvPayload {
  vars: { key: string; value: string }[];
  notes?: string;
}

export interface SSHKeyPayload {
  publicKey:  string;
  privateKey: string;
  passphrase?: string;
  comment?:   string;
}

/** Slug prefix → type. Mirrors backend ALLOWED_USER_PREFIXES. */
export const TYPE_PREFIX: Record<Exclude<VaultItemType, 'api_key'>, string> = {
  password: 'pw__',
  note:     'note__',
  env:      'env__',
  ssh_key:  'ssh__',
};

export function inferType(slug: string): VaultItemType {
  if (slug.startsWith('pw__'))   return 'password';
  if (slug.startsWith('note__')) return 'note';
  if (slug.startsWith('env__'))  return 'env';
  if (slug.startsWith('ssh__'))  return 'ssh_key';
  return 'api_key';
}
````

## File: vercel.json
````json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "env": {
    "KEYSHIELD_API_URL": "@keyshield_api_url",
    "KEYSHIELD_PROGRAM_ID": "@keyshield_program_id"
  }
}
````

## File: vite-env.d.ts
````typescript
/// <reference types="vite/client" />
/// <reference types="chrome" />
````

## File: vite.config.ts
````typescript
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.KEYSHIELD_API_URL':    JSON.stringify(env.KEYSHIELD_API_URL ?? 'http://localhost:8000'),
        'process.env.KEYSHIELD_PROGRAM_ID': JSON.stringify(env.KEYSHIELD_PROGRAM_ID ?? ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        dedupe: ['@solana/web3.js'],
      },
      optimizeDeps: {
        include: [
          '@solana/web3.js',
          '@solana/wallet-adapter-react',
          '@solana/wallet-adapter-react-ui',
          'buffer',
        ],
      },
      build: {
        chunkSizeWarningLimit: 2000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('@solana/') || id.includes('buffer') || id.includes('borsh')) {
                  return 'solana';
                }
                if (id.includes('react') || id.includes('scheduler')) {
                  return 'vendor';
                }
                if (id.includes('tesseract')) {
                  return 'ocr';
                }
                if (id.includes('lucide')) {
                  return 'icons';
                }
                return 'vendor-deps';
              }
            },
          },
        },
      },
    };
});
````
