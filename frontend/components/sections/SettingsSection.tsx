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
import { VAULT_KEY_MESSAGE } from '../../lib/vault-key';
import { getPrefs, setPrefs, VaultPreferences } from '../../lib/preferences';

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
      '  • Your registered agents\n\n' +
      'For full account deletion, contact support (coming soon) or rotate your wallet keypair.'
    )) return;
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    try { await disconnect(); } catch {}
    clearAuth();
    clearPasskeyTrust();
    notifyAuthChanged();
    location.reload();
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
