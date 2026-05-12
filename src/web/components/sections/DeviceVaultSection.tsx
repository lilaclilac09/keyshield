/**
 * Device Vault — Path A UI (zero-knowledge / device-as-TEE).
 *
 * The encryption model already lives in lib/vault-session.ts +
 * lib/auth.ts (PRF-derived master key, AES-GCM-256 in browser,
 * ciphertext synced to a Cloudflare Worker). This component just
 * exposes that flow as three UI states:
 *
 *   1. NOT REGISTERED — user has not enrolled a PRF passkey on this
 *      device. Show "Set up Device Vault" CTA, which calls
 *      registerPasskey() (WebAuthn create + PRF + CF Worker enroll).
 *
 *   2. REGISTERED + LOCKED — passkey trusted, but no master key in
 *      memory. Show "Unlock Vault" CTA, which calls
 *      requestVaultUnlock() (WebAuthn get + PRF + CF Worker
 *      challenge → exchange).
 *
 *   3. UNLOCKED — show entry list with Add / Use / Delete. Plaintext
 *      keys live only in module-scoped memory inside vault-session.ts;
 *      this component never holds them in React state past one render
 *      tick.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock, Unlock, ShieldCheck, KeyRound, Loader2, AlertCircle, Plus, Play,
  X, Check, Trash2,
} from 'lucide-react';

import { proxyFetch, registerPasskey, requestVaultUnlock, getPasskeyTrust, setPasskeyTrust, getWalletAddress, API_BASE, getToken } from '../../lib/auth';
import {
  isVaultUnlocked, lockVault, listEntries, addEntry, removeEntry,
} from '../../lib/vault-session';
import type { VaultEntry } from '../../lib/vault';

interface ShimEntry {
  id: string;
  name: string;
  upstream: string;
  masked_value: string;
  created_at: string;
  source: 'extension';
}

async function fetchExtensionKeys(): Promise<ShimEntry[]> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/manage/vault`, { headers });
    if (!res.ok) return [];
    const items = await res.json();
    return (items as ShimEntry[]).map((it: ShimEntry) => ({ ...it, source: 'extension' as const }));
  } catch {
    return [];
  }
}

// ── Provider catalog (mirror of AddKeyModal's, scoped to API-key types) ──
const PROVIDERS: { id: string; name: string; placeholder: string }[] = [
  { id: 'openai',    name: 'OpenAI',           placeholder: 'sk-proj-…' },
  { id: 'anthropic', name: 'Anthropic Claude', placeholder: 'sk-ant-api03-…' },
  { id: 'groq',      name: 'Groq',             placeholder: 'gsk_…' },
  { id: 'helius',    name: 'Helius RPC',       placeholder: 'xxxxxxxx-…' },
  { id: 'mistral',   name: 'Mistral AI',       placeholder: 'xxxxxxxxxxxxxxxx' },
  { id: 'cohere',    name: 'Cohere',           placeholder: 'xxxxxxxxxxxxxxxx' },
];

const inputCls =
  'w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] ' +
  'text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10 ' +
  'focus:border-zinc-600 transition-colors';

// ── Add modal (inlined; small enough that a separate file would be churn) ──
interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const AddDeviceKeyModal: React.FC<AddModalProps> = ({ isOpen, onClose, onAdded }) => {
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [keyValue, setKeyValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Reset on open. Critical: also wipe `keyValue` when the modal closes,
  // so a stale plaintext doesn't sit in React state.
  useEffect(() => {
    if (!isOpen) {
      setKeyValue('');
      setErr('');
      setBusy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyValue.trim()) {
      setErr('Paste the API key to encrypt');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await addEntry(provider.id, keyValue);
      // Wipe local copy immediately — vault-session now owns it.
      setKeyValue('');
      onAdded();
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to add key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1226]/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl border border-[#243365]/60 bg-[#131c39] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400" />
            <h3 className="text-[14px] font-semibold uppercase tracking-wider">
              Add encrypted key
            </h3>
          </div>
          <button onClick={onClose} className="text-[#8a96c2] hover:text-white">
            <X size={16} />
          </button>
        </div>

        <p className="text-[12px] text-[#8a96c2] mb-4 leading-relaxed">
          Encrypted on this device with your passkey&rsquo;s PRF output.
          Server stores ciphertext only.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#8a96c2] mb-1.5">
              Provider
            </label>
            <select
              value={provider.id}
              onChange={(e) => {
                const next = PROVIDERS.find((p) => p.id === e.target.value);
                if (next) setProvider(next);
              }}
              className={inputCls}
              disabled={busy}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#8a96c2] mb-1.5">
              API key
            </label>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider.placeholder}
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              className={inputCls}
              disabled={busy}
            />
          </div>

          {err && (
            <div className="px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 flex items-start gap-2">
              <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-red-300 leading-relaxed">{err}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 h-9 rounded-lg border border-[#243365] text-[12px] uppercase tracking-wider text-[#a8b3d8] hover:text-white hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !keyValue.trim()}
              className="flex-1 h-9 rounded-lg bg-white text-black text-[12px] font-semibold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {busy ? 'Encrypting…' : 'Encrypt & store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── "Use" panel — calls /proxy/{upstream}/{path} with the decrypted key ──
//
// `proxyFetch(upstream, path, options)` pulls the plaintext from
// vault-session internally and injects it as `X-Upstream-API-Key`. The
// caller never touches the plaintext string here.
interface ProxyAction {
  label: string;
  path: string;
  method?: string;
  body?: unknown;
}
const ACTIONS: Record<string, ProxyAction> = {
  openai:    { label: 'List models', path: 'v1/models' },
  anthropic: { label: 'List models', path: 'v1/models' },
  groq:      { label: 'List models', path: 'openai/v1/models' },
  helius:    {
    label: 'getSlot (JSON-RPC)',
    path: '',
    method: 'POST',
    body: { jsonrpc: '2.0', id: 1, method: 'getSlot', params: [] },
  },
  mistral:   { label: 'List models', path: 'v1/models' },
  cohere:    { label: 'List models', path: 'v1/models' },
};

interface UsePanelProps { entry: VaultEntry; }

const UsePanel: React.FC<UsePanelProps> = ({ entry }) => {
  const [open, setOpen]       = useState(false);
  const [busy, setBusy]       = useState(false);
  const [status, setStatus]   = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [body, setBody]       = useState('');
  const [err, setErr]         = useState('');

  const action = ACTIONS[entry.upstream];
  if (!action) {
    return (
      <span className="text-[11px] text-[#5e6a91]">No demo action for {entry.upstream}</span>
    );
  }

  const run = async () => {
    setBusy(true); setErr(''); setStatus(null); setLatency(null); setBody('');
    try {
      const t0 = performance.now();
      const fetchOpts: RequestInit = { method: action.method ?? 'GET' };
      if (action.body) fetchOpts.body = JSON.stringify(action.body);
      const res = await proxyFetch(entry.upstream, action.path, fetchOpts);
      const t1 = performance.now();
      setStatus(res.status);
      setLatency(Math.round(t1 - t0));
      const txt = await res.text();
      setBody(txt.slice(0, 1500));
      setOpen(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Request failed');
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="h-7 px-3 rounded-lg border border-[#243365] hover:border-zinc-600 text-[11px] uppercase tracking-wider text-[#e8ecff] hover:text-white inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
        {busy ? 'Calling…' : action.label}
      </button>
      {open && (status !== null || err) && (
        <div className="rounded-lg border border-[#243365]/60 bg-[#0e1631] p-3 space-y-1.5">
          {err ? (
            <div className="flex items-start gap-2 text-[12px] text-red-300">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 text-[11px]">
                <span className={status && status < 400 ? 'text-emerald-400' : 'text-amber-400'}>
                  HTTP {status}
                </span>
                <span className="text-[#5e6a91]">{latency}ms</span>
                <span className="text-emerald-500/70">
                  proxied &middot; key never persisted server-side
                </span>
              </div>
              <pre className="text-[11px] text-[#a8b3d8] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-48">
                {body}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── "Use" panel for extension-stored keys (fetches key from /manage shim) ──

const ExtUsePanel: React.FC<{ entry: ShimEntry }> = ({ entry }) => {
  const [busy, setBusy]       = useState(false);
  const [status, setStatus]   = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [body, setBody]       = useState('');
  const [err, setErr]         = useState('');
  const [open, setOpen]       = useState(false);

  const action = ACTIONS[entry.upstream];
  if (!action) {
    return <span className="text-[11px] text-[#5e6a91]">No demo action for {entry.upstream}</span>;
  }

  const run = async () => {
    setBusy(true); setErr(''); setStatus(null); setLatency(null); setBody('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const decRes = await fetch(`${API_BASE}/manage/decrypt/${entry.id}`, { headers });
      if (!decRes.ok) throw new Error('Failed to decrypt extension key');
      const { value: apiKey } = await decRes.json();

      const reqHeaders = new Headers(headers);
      reqHeaders.set('X-Upstream-API-Key', apiKey);
      const method = action.method ?? 'GET';
      const fetchOpts: RequestInit = { method, headers: reqHeaders };
      if (action.body) fetchOpts.body = JSON.stringify(action.body);

      const t0 = performance.now();
      const res = await fetch(
        `${API_BASE}/proxy/${entry.upstream}/${action.path.replace(/^\//, '')}`,
        fetchOpts,
      );
      const t1 = performance.now();
      setStatus(res.status);
      setLatency(Math.round(t1 - t0));
      const txt = await res.text();
      setBody(txt.slice(0, 1500));
      setOpen(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Request failed');
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="h-7 px-3 rounded-lg border border-blue-900/50 hover:border-blue-700 text-[11px] uppercase tracking-wider text-blue-300 hover:text-blue-200 inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
        {busy ? 'Calling…' : action.label}
      </button>
      {open && (status !== null || err) && (
        <div className="rounded-lg border border-[#243365]/60 bg-[#0e1631] p-3 space-y-1.5">
          {err ? (
            <div className="flex items-start gap-2 text-[12px] text-red-300">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 text-[11px]">
                <span className={status && status < 400 ? 'text-emerald-400' : 'text-amber-400'}>
                  HTTP {status}
                </span>
                <span className="text-[#5e6a91]">{latency}ms</span>
                <span className="text-blue-400/70">
                  proxied via extension key
                </span>
              </div>
              <pre className="text-[11px] text-[#a8b3d8] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-48">
                {body}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main section ────────────────────────────────────────────────────
type Phase = 'idle' | 'busy';

export const DeviceVaultSection: React.FC = () => {
  const [trust, setTrust]       = useState(() => getPasskeyTrust());
  const [unlocked, setUnlocked] = useState<boolean>(() => isVaultUnlocked());
  const [entries, setEntries]   = useState<VaultEntry[]>(() => (isVaultUnlocked() ? listEntries() : []));
  const [extKeys, setExtKeys]   = useState<ShimEntry[]>([]);
  const [phase, setPhase]       = useState<Phase>('idle');
  const [phaseMsg, setPhaseMsg] = useState('');
  const [err, setErr]           = useState('');
  const [showAdd, setShowAdd]   = useState(false);

  const refresh = useCallback(() => {
    setUnlocked(isVaultUnlocked());
    setEntries(isVaultUnlocked() ? listEntries() : []);
    setTrust(getPasskeyTrust());
    fetchExtensionKeys().then(setExtKeys);
  }, []);

  // Re-sync state if some other surface (e.g. AuthScreen) just unlocked.
  useEffect(() => {
    const onAuth = () => refresh();
    window.addEventListener('ks-auth-changed', onAuth);
    const i = window.setInterval(refresh, 2000); // light polling for vault state
    return () => {
      window.removeEventListener('ks-auth-changed', onAuth);
      window.clearInterval(i);
    };
  }, [refresh]);

  const enroll = async () => {
    setPhase('busy');
    setPhaseMsg('Tap your passkey to enroll…');
    setErr('');
    try {
      await registerPasskey('Device Vault');
      const addr = getWalletAddress();
      if (addr) setPasskeyTrust(addr, '');
      refresh();
      setPhaseMsg('Unlocking…');
      await requestVaultUnlock();
      refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Enrollment failed');
    } finally {
      setPhase('idle');
      setPhaseMsg('');
    }
  };

  const unlock = async () => {
    setPhase('busy');
    setPhaseMsg('Tap your passkey…');
    setErr('');
    try {
      await requestVaultUnlock();
      refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Unlock failed');
    } finally {
      setPhase('idle');
      setPhaseMsg('');
    }
  };

  const lock = () => {
    lockVault();
    refresh();
  };

  const remove = async (upstream: string) => {
    if (!window.confirm(`Delete ${upstream} from Device Vault? This cannot be undone.`)) return;
    setPhase('busy');
    setPhaseMsg('Removing…');
    try {
      await removeEntry(upstream);
      refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to remove entry');
    } finally {
      setPhase('idle');
      setPhaseMsg('');
    }
  };

  const promiseBadge = (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-900/60 bg-emerald-950/30 text-emerald-400 text-[10.5px] font-semibold uppercase tracking-wider">
      <ShieldCheck size={11} />
      Encrypted on this device &middot; server can&rsquo;t read
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>{promiseBadge}</div>
        <div className="flex items-center gap-2">
          {unlocked && (
            <button
              onClick={lock}
              className="h-8 px-3 rounded-lg border border-[#243365] text-[11px] uppercase tracking-wider text-[#a8b3d8] hover:text-white hover:bg-white/5 inline-flex items-center gap-1.5 transition-colors"
            >
              <Lock size={12} /> Lock
            </button>
          )}
          {unlocked && (
            <button
              onClick={() => setShowAdd(true)}
              className="h-8 px-3 rounded-lg bg-white text-black text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 hover:bg-zinc-200 transition-colors"
            >
              <Plus size={12} /> Add
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 flex items-start gap-2">
          <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-300 leading-relaxed">{err}</p>
        </div>
      )}

      {/* State 1 — not registered */}
      {!trust && !unlocked && (
        <div className="rounded-xl border border-dashed border-[#243365]/60 py-16 flex flex-col items-center text-center px-6">
          <div className="w-12 h-12 rounded-xl bg-[#131c39] border border-[#243365]/50 flex items-center justify-center mb-4">
            <KeyRound size={20} className="text-white" strokeWidth={1.75} />
          </div>
          <p className="text-[14px] text-[#e8ecff] font-medium">Set up Device Vault</p>
          <p className="text-[12px] text-[#8a96c2] mt-1 mb-5 max-w-md leading-relaxed">
            Enrolls a passkey with WebAuthn PRF. The master key is derived
            on this device and never reaches our servers. Subsequent unlocks
            need the same authenticator.
          </p>
          <button
            onClick={enroll}
            disabled={phase !== 'idle'}
            className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 disabled:opacity-50 text-black text-[12px] font-semibold uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
          >
            {phase === 'busy' ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
            {phase === 'busy' ? phaseMsg : 'Enroll passkey'}
          </button>
        </div>
      )}

      {/* State 2 — registered + locked */}
      {trust && !unlocked && (
        <div className="rounded-xl border border-[#243365]/50 py-12 flex flex-col items-center text-center px-6 bg-[#131c39]">
          <div className="w-12 h-12 rounded-xl bg-[#0e1631] border border-[#243365]/50 flex items-center justify-center mb-4">
            <Lock size={18} className="text-[#a8b3d8]" strokeWidth={1.75} />
          </div>
          <p className="text-[14px] text-[#e8ecff] font-medium">Vault locked</p>
          <p className="text-[12px] text-[#8a96c2] mt-1 mb-5 max-w-md leading-relaxed">
            Tap your passkey to derive the master key and load the
            encrypted vault from sync storage.
          </p>
          <button
            onClick={unlock}
            disabled={phase !== 'idle'}
            className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 disabled:opacity-50 text-black text-[12px] font-semibold uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
          >
            {phase === 'busy' ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
            {phase === 'busy' ? phaseMsg : 'Unlock vault'}
          </button>
        </div>
      )}

      {/* State 3 — unlocked */}
      {unlocked && entries.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#243365]/50 py-20 flex flex-col items-center text-center px-6">
          <div className="w-12 h-12 rounded-xl bg-[#131c39] border border-[#243365]/50 flex items-center justify-center mb-4">
            <KeyRound size={20} className="text-white" strokeWidth={1.75} />
          </div>
          <p className="text-[14px] text-[#e8ecff] font-medium">Vault unlocked &mdash; no encrypted keys yet</p>
          <p className="text-[12px] text-[#8a96c2] mt-1 mb-5 leading-relaxed max-w-md">
            Add an API key to store its ciphertext in sync storage. The plaintext
            key never leaves this device after add &mdash; the proxy receives it
            per-request via a one-shot header.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 text-black text-[12px] font-semibold uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
          >
            <Plus size={13} /> Add encrypted key
          </button>
        </div>
      )}

      {unlocked && entries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {entries.map((e) => {
            const meta = PROVIDERS.find((p) => p.id === e.upstream);
            const name = meta?.name ?? e.upstream;
            const added = new Date(e.addedAt).toLocaleDateString();
            return (
              <div
                key={e.upstream}
                className="rounded-xl border border-[#243365]/60 bg-[#131c39] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] text-white font-medium">{name}</p>
                    <p className="text-[11px] text-[#5e6a91] mt-0.5">added {added}</p>
                  </div>
                  <button
                    onClick={() => void remove(e.upstream)}
                    title="Remove entry"
                    className="text-[#5e6a91] hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <UsePanel entry={e} />
              </div>
            );
          })}
        </div>
      )}

      {/* Extension-stored keys (from /manage/vault shim) */}
      {extKeys.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-blue-900/60 bg-blue-950/30 text-blue-400 text-[10.5px] font-semibold uppercase tracking-wider">
              <KeyRound size={11} />
              Extension-stored keys
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {extKeys
              .filter((ek) => !entries.some((ve) => ve.upstream === ek.upstream))
              .map((ek) => {
                const meta = PROVIDERS.find((p) => p.id === ek.upstream);
                const name = meta?.name ?? ek.name ?? ek.upstream;
                return (
                  <div
                    key={ek.id}
                    className="rounded-xl border border-blue-900/40 bg-[#131c39] p-4 space-y-2"
                  >
                    <div>
                      <p className="text-[13px] text-white font-medium">{name}</p>
                      <p className="text-[11px] text-[#5e6a91] mt-0.5">
                        {ek.masked_value} &middot; via extension
                      </p>
                    </div>
                    <ExtUsePanel entry={ek} />
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <AddDeviceKeyModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={refresh}
      />
    </div>
  );
};
