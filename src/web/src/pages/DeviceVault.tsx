/**
 * Device Vault — Path A UI (zero-knowledge / device-as-TEE).
 *
 * The encryption model lives in @keyshield/shared (vault.ts +
 * vault-session.ts + auth-pathA.ts): WebAuthn PRF derives the master
 * key on this device, AES-GCM-256 encrypts entries client-side, only
 * ciphertext is synced to the Cloudflare Worker.
 *
 * Three rendered states:
 *   1. NOT REGISTERED  — user has not enrolled a PRF passkey on this
 *      device. Show "Set up Device Vault" CTA.
 *   2. REGISTERED + LOCKED  — passkey trusted, no master key in memory.
 *      Show "Unlock vault" CTA.
 *   3. UNLOCKED  — list entries with Add / Use / Delete. Plaintext keys
 *      live in module-scoped memory inside vault-session; this component
 *      never holds them in React state past one render tick.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Lock, Unlock, ShieldCheck, KeyRound, Loader2, AlertCircle, Plus,
  X, Check, Trash2,
} from 'lucide-react';

import {
  registerPasskey,
  requestVaultUnlock,
  getPasskeyTrust,
} from '@keyshield/shared/auth';
import {
  isVaultUnlocked,
  lockVault,
  listEntries,
  addEntry,
  removeEntry,
} from '@keyshield/shared/lib/vault-session';
import type { VaultEntry } from '@keyshield/shared/lib/vault';
// MppStreamOpener intentionally NOT imported here — it's the wallet
// sign-off for an MPP *stream* (id + agentPubkey), not a vault entry.
// Wire it on the Agents/MPP surface, not on the Device Vault page.

// ── Provider catalog (mirror of AddKeyModal's, scoped to API-key types) ──
const PROVIDERS: { id: string; name: string; placeholder: string }[] = [
  { id: 'openai',    name: 'OpenAI',           placeholder: 'sk-proj-…' },
  { id: 'anthropic', name: 'Anthropic Claude', placeholder: 'sk-ant-api03-…' },
  { id: 'groq',      name: 'Groq',             placeholder: 'gsk_…' },
  { id: 'helius',    name: 'Helius RPC',       placeholder: 'xxxxxxxx-…' },
  { id: 'mistral',   name: 'Mistral AI',       placeholder: 'xxxxxxxxxxxxxxxx' },
  { id: 'cohere',    name: 'Cohere',           placeholder: 'xxxxxxxxxxxxxxxx' },
];

// ── Add modal (inlined; small enough that a separate file would be churn) ──
interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

function AddDeviceKeyModal({ isOpen, onClose, onAdded }: AddModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl border border-[#1e1e24] bg-[#141418] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#10b981]" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Add encrypted key
            </h3>
          </div>
          <button onClick={onClose} className="text-[#6b6b7a] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-[#a0a0b0] mb-4 leading-relaxed">
          Encrypted on this device with your passkey&rsquo;s PRF output.
          Server stores ciphertext only.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#6b6b7a] mb-1.5">
              Provider
            </label>
            <select
              value={provider.id}
              onChange={(e) => {
                const next = PROVIDERS.find((p) => p.id === e.target.value);
                if (next) setProvider(next);
              }}
              className="w-full bg-[#111114] border border-[#1e1e24] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-[#2a2a30] transition-colors"
              disabled={busy}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#6b6b7a] mb-1.5">
              API key
            </label>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider.placeholder}
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              className="w-full bg-[#111114] border border-[#1e1e24] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#4a4a56] focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-[#2a2a30] transition-colors"
              disabled={busy}
            />
          </div>

          {err && (
            <div className="px-3 py-2 rounded-md bg-[#1a0808] border border-[#3a1f1f] flex items-start gap-2">
              <AlertCircle className="h-3 w-3 text-[#ef4444] shrink-0 mt-0.5" />
              <p className="text-xs text-[#fca5a5] leading-relaxed">{err}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 h-9 rounded-md border border-[#1e1e24] text-xs uppercase tracking-wider text-[#a0a0b0] hover:text-white hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !keyValue.trim()}
              className="flex-1 h-9 rounded-md bg-white text-black text-xs font-semibold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {busy ? 'Encrypting…' : 'Encrypt & store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
type Phase = 'idle' | 'busy';

export default function DeviceVault() {
  const [trust, setTrust]       = useState(() => getPasskeyTrust());
  const [unlocked, setUnlocked] = useState<boolean>(() => isVaultUnlocked());
  const [entries, setEntries]   = useState<VaultEntry[]>(() => (isVaultUnlocked() ? listEntries() : []));
  const [phase, setPhase]       = useState<Phase>('idle');
  const [phaseMsg, setPhaseMsg] = useState('');
  const [err, setErr]           = useState('');
  const [showAdd, setShowAdd]   = useState(false);

  const refresh = useCallback(() => {
    const u = isVaultUnlocked();
    setUnlocked(u);
    setEntries(u ? listEntries() : []);
    setTrust(getPasskeyTrust());
  }, []);

  // Re-sync state if some other surface (e.g. wallet menu) just unlocked.
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
      refresh();
      // Newly registered users still need to unlock to load the empty vault.
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

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Device Vault</h1>
          <p className="page-header-subtitle">
            Zero-knowledge passkey vault &mdash; keys are derived and decrypted
            on this device only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unlocked && (
            <button
              onClick={lock}
              className="ks-btn-ghost h-9 px-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider"
            >
              <Lock className="h-3 w-3" /> Lock
            </button>
          )}
          {unlocked && (
            <button
              onClick={() => setShowAdd(true)}
              className="ks-btn-primary h-9 px-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider"
            >
              <Plus className="h-3 w-3" /> Add encrypted key
            </button>
          )}
        </div>
      </div>

      {/* Promise badge */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#0d3d2a] bg-[#0a1f15] text-[#10b981] text-[10.5px] font-semibold uppercase tracking-wider">
          <ShieldCheck className="h-3 w-3" />
          Encrypted on this device &middot; server can&rsquo;t read
        </div>
      </div>

      {err && (
        <div className="px-3 py-2 mb-4 rounded-md bg-[#1a0808] border border-[#3a1f1f] flex items-start gap-2">
          <AlertCircle className="h-3 w-3 text-[#ef4444] shrink-0 mt-0.5" />
          <p className="text-xs text-[#fca5a5] leading-relaxed">{err}</p>
        </div>
      )}

      {/* State 1 — not registered */}
      {!trust && !unlocked && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <KeyRound size={20} strokeWidth={1.75} />
          </div>
          <h3>Set up Device Vault</h3>
          <p>
            Enrolls a passkey with WebAuthn PRF. The master key is derived
            on this device and never reaches our servers.
          </p>
          <button
            onClick={enroll}
            disabled={phase !== 'idle'}
            className="ks-btn-primary"
          >
            {phase === 'busy'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ShieldCheck className="h-3.5 w-3.5" />}
            {phase === 'busy' ? phaseMsg : 'Enroll passkey'}
          </button>
        </div>
      )}

      {/* State 2 — registered + locked */}
      {trust && !unlocked && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Lock size={20} strokeWidth={1.75} />
          </div>
          <h3>Vault locked</h3>
          <p>
            Tap your passkey to derive the master key and load the
            encrypted vault from sync storage.
          </p>
          <button
            onClick={unlock}
            disabled={phase !== 'idle'}
            className="ks-btn-primary"
          >
            {phase === 'busy'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Unlock className="h-3.5 w-3.5" />}
            {phase === 'busy' ? phaseMsg : 'Unlock vault'}
          </button>
        </div>
      )}

      {/* State 3a — unlocked, empty */}
      {unlocked && entries.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <KeyRound size={20} strokeWidth={1.75} />
          </div>
          <h3>Vault unlocked &mdash; no encrypted keys yet</h3>
          <p>
            Add an API key to store its ciphertext in sync storage. The plaintext
            never leaves this device after add &mdash; the proxy receives it
            per-request via a one-shot header.
          </p>
          <button onClick={() => setShowAdd(true)} className="ks-btn-primary">
            <Plus className="h-3.5 w-3.5" /> Add encrypted key
          </button>
        </div>
      )}

      {/* State 3b — unlocked with entries */}
      {unlocked && entries.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map((e) => {
            const meta = PROVIDERS.find((p) => p.id === e.upstream);
            const name = meta?.name ?? e.upstream;
            const added = new Date(e.addedAt).toLocaleDateString();
            return (
              <div
                key={e.upstream}
                className="ks-card"
                style={{ padding: '16px 20px' }}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="text-sm text-white font-medium">{name}</p>
                    <p className="text-[11px] text-[#6b6b7a] mt-0.5">added {added}</p>
                  </div>
                  <button
                    onClick={() => void remove(e.upstream)}
                    title="Remove entry"
                    className="text-[#6b6b7a] hover:text-[#ef4444] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* "Use" CTA. The plaintext API key lives in
                 * vault-session memory after unlock; for an actual
                 * upstream call go through proxyFetch (or the existing
                 * Vault page's similar flow). The MppStreamOpener
                 * component (src/web/src/components/MppStreamOpener.tsx)
                 * is the wallet sign-off for an MPP **stream** rather
                 * than a vault entry — wire it on the Agents/MPP page
                 * once an `MppStream { id, agentPubkey }` exists, not
                 * here. */}
                <button
                  type="button"
                  className="ks-btn-ghost text-[12px] mt-1"
                  title="Use this key via the proxy (manual integration)"
                >
                  Copy use-instructions →
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AddDeviceKeyModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={refresh}
      />
    </div>
  );
}
