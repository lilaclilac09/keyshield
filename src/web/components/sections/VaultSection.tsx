import React, { useState } from 'react';
import { Key, Plus, ShieldCheck, ArrowRight } from 'lucide-react';
import { VaultItem } from '../../types';
import { VaultItemCard } from '../VaultItemCard';
import { StatCard } from '../ui/Card';
import { callKeychain, detectUpstream, extractDetectedKeys, storeDetectedKeys } from '../../lib/keychain';
import { formatStoredApiCard } from '../../lib/provider-catalog';

interface Props {
  items: VaultItem[]; total: number; searchQuery: string;
  onAdd: () => void; onDelete: (id: string) => void; onDecrypt: (id: string) => Promise<string>;
  unlocked?: boolean; unlocking?: boolean; unlockError?: string | null; onUnlock?: () => void;
  onStored?: () => void;
}

export const VaultSection: React.FC<Props> = ({ items, total, searchQuery, onAdd, onDelete, onDecrypt, unlockError, onStored }) => {
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const detected = detectUpstream(paste);

  const saveAndCall = async (alsoCall: boolean) => {
    const hits = extractDetectedKeys(paste);
    if (!hits.length) { setMsg('Paste a key first'); return; }
    setBusy(true); setMsg(null);
    try {
      const stored = await storeDetectedKeys(paste, detected.upstream ?? undefined);
      onStored?.();
      const first = stored[0];
      if (alsoCall && first?.upstream) {
        const result = await callKeychain(first.upstream);
        setMsg(`Saved ${stored.length} · call ${result.latency_ms.toFixed(0)}ms · cache ${result.cache}`);
      } else {
        setMsg(`Saved ${stored.length}: ${stored.map((row) => row.prefix).join(' · ')}`);
      }
      setPaste('');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
  <div className="space-y-6">
    <div className="rounded-xl border border-[#243365] bg-[#131c39] p-4 space-y-3">
      <p className="text-[16px] font-semibold text-white">Keychain — paste or extension detect</p>
      <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={2} placeholder="sk-or-…  sk-proj-…  gsk_…  helius UUID…" className="w-full rounded-lg bg-[#0e1631] border border-[#243365] px-3 py-2 text-[14px] font-mono text-white placeholder:text-[#3e4a72]" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-[#8a96c2]">{detected.matched ? `Detected ${detected.upstream} ${detected.prefix}` : 'Auto-detects provider prefix'}</span>
        <button type="button" disabled={busy || !paste.trim()} onClick={() => void saveAndCall(false)} className="h-9 px-3 rounded-lg bg-white text-black text-[13px] font-semibold disabled:opacity-50">Save</button>
        <button type="button" disabled={busy || !detected.upstream} onClick={() => void saveAndCall(true)} className="h-9 px-3 rounded-lg border border-zinc-500 text-white text-[13px] font-semibold disabled:opacity-50">Save + Call</button>
      </div>
      {msg && <p className="text-[13px] text-[#a8b3d8]">{msg}</p>}
    </div>
    <div data-testid="vault-saved-apis" className="rounded-xl border border-[#243365] bg-[#0e1631] p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[28px] font-bold tracking-tight text-white leading-none">
          {total === 1 ? '1 saved' : `${total} saved`}
        </p>
        <p className="text-[12px] text-[#8a96c2]">`/manage/vault` · hidden until you click reveal · 点眼睛才看到明文</p>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const card = formatStoredApiCard({
              name: item.name,
              upstream: item.upstream || '',
              prefix: item.prefix,
              family: item.family,
              product: item.product,
              domain: item.domain,
              expires_at: item.expiryDate,
              created_at: Number.isFinite(item.createdAt) ? new Date(item.createdAt).toISOString() : null,
              notes: item.notes,
            });
            return (
            <div key={item.id} className="flex items-baseline justify-between gap-3 rounded-lg border border-[#243365] bg-[#131c39] px-3 py-2">
              <div className="min-w-0">
                <strong className="text-[13px] text-white">{card.title}</strong>
                <p className="text-[11px] text-[#8a96c2]">{card.subtitle} · {card.meta}</p>
              </div>
              <code className="text-[11px] text-[#93b4ff] break-all">{item.prefix || item.value}</code>
            </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-[#8a96c2]">
          {searchQuery
            ? 'No secrets match your search'
            : 'No keys in this session yet. Detect writes this list.'}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <StatCard label="Total Secrets" value={total} hint="hidden until you reveal" />
      <StatCard label="Used This Week" value={items.filter(i => Date.now() - i.lastUsedAt < 86400000 * 7).length} hint="across agents and apps" />
      <StatCard label="Expiring Soon" value={items.filter(i => { if (!i.expiryDate) return false; const d = (new Date(i.expiryDate).getTime() - Date.now()) / 86400000; return d >= 0 && d <= 14; }).length} hint="within 14 days" />
    </div>
    {unlockError && <p className="text-[12px] text-red-400">{unlockError}</p>}
    {items.length === 0 ? (
      <div className="rounded-xl border border-dashed border-[#243365]/50 py-16 flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-xl bg-[#131c39] border border-[#243365]/50 flex items-center justify-center mb-4">
          <Key size={20} className="text-white" strokeWidth={1.75} />
        </div>
        <p className="text-[14px] text-[#e8ecff] font-medium">{searchQuery ? 'No secrets match your search' : 'Your vault is empty / 金库是空的'}</p>
        <p className="text-[12px] text-[#8a96c2] mt-1 mb-5">{searchQuery ? '' : 'Detect on a key page. This block is where saved keys show.'}</p>
        {!searchQuery && (
          <>
            <button onClick={onAdd} className="h-9 px-4 rounded-lg bg-white hover:bg-zinc-200 text-black text-[13px] font-semibold uppercase tracking-wider inline-flex items-center gap-2 transition-colors">
              <Plus size={14} /> Add Secret
            </button>
            <div className="mt-8 w-full max-w-lg">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={13} className="text-emerald-400" />
                <span className="text-[11px] font-semibold text-[#8a96c2] uppercase tracking-wider">How it works</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-[11px] text-[#8a96c2] flex-wrap">
                <span className="px-2 py-1 rounded bg-[#131c39] border border-[#243365]/50 text-white">Add key here</span>
                <ArrowRight size={11} className="text-[#3e4a72]" />
                <span className="px-2 py-1 rounded bg-[#131c39] border border-[#243365]/50 text-[#a8b3d8]">Stored in vault</span>
                <ArrowRight size={11} className="text-[#3e4a72]" />
                <span className="px-2 py-1 rounded bg-[#131c39] border border-[#243365]/50 text-[#a8b3d8]">Agent calls /proxy/...</span>
                <ArrowRight size={11} className="text-[#3e4a72]" />
                <span className="px-2 py-1 rounded bg-emerald-950/40 border border-emerald-900/30 text-emerald-400">Key injected per-request</span>
              </div>
              <p className="text-[10px] text-[#5e6a91] mt-2">
                Agents use the proxy URL. The raw key stays hidden until you click reveal.
              </p>
            </div>
          </>
        )}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(item => <VaultItemCard key={item.id} item={item} onDelete={onDelete} onDecrypt={onDecrypt} />)}
      </div>
    )}
  </div>
  );
};
