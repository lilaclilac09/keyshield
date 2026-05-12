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
import { API_BASE, getToken } from '../lib/auth';

// ── helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function fetchTrustList(): Promise<TrustList> {
  try {
    const res = await fetch(`${API_BASE}/x402/trust`, { headers: authHeaders() });
    if (!res.ok) throw new Error('server fetch failed');
    const data = await res.json();
    const list: TrustList = {};
    for (const row of data.trust_list ?? []) {
      list[row.domain] = {
        threshold_usd: (row.max_micro ?? 100000) / 1_000_000,
        enabled: !!row.enabled,
        added_at: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      };
    }
    return list;
  } catch {
    try {
      const raw = localStorage.getItem('ks_x402_trust_list_web');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}

async function serverAddTrust(domain: string, threshold_usd: number, enabled: boolean): Promise<void> {
  await fetch(`${API_BASE}/x402/trust`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      domain,
      max_micro: Math.round(threshold_usd * 1_000_000),
      daily_cap: 10_000_000,
      enabled: enabled ? 1 : 0,
    }),
  });
}

async function serverRemoveTrust(domain: string): Promise<void> {
  await fetch(`${API_BASE}/x402/trust/${encodeURIComponent(domain)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

async function serverToggleTrust(domain: string, enabled: boolean): Promise<void> {
  await fetch(`${API_BASE}/x402/trust/${encodeURIComponent(domain)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ enabled: enabled ? 1 : 0 }),
  });
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
      on ? 'bg-[#6c8eff]' : 'bg-[#27272a]'
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
      await serverAddTrust(host, amt, true);
      setOk(`${host} added — auto-pay up to $${amt.toFixed(2)}`);
      setNewDomain('');
      setNewThreshold('1');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add domain');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (hostname: string) => {
    setRemovingKey(hostname);
    setErr('');
    try {
      await serverRemoveTrust(hostname);
      setTrustList(prev => {
        const next = { ...prev };
        delete next[hostname];
        return next;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to remove domain');
    } finally {
      setRemovingKey(null);
    }
  };

  const handleToggle = async (hostname: string, enabled: boolean) => {
    setTrustList(prev => ({
      ...prev,
      [hostname]: { ...prev[hostname], enabled },
    }));
    try {
      await serverToggleTrust(hostname, enabled);
    } catch {
      await load();
    }
  };

  const entries = Object.entries(trustList).sort((a, b) => b[1].added_at - a[1].added_at);
  const currentHostAlreadyTrusted = currentHost ? !!trustList[currentHost] : false;

  return (
    <div className="rounded-2xl border border-[#243365] bg-[#131c39]/60 p-5 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
          <Zap size={14} className="text-[#6c8eff]" /> Trusted Domains for Auto-Pay
        </h3>
        <p className="text-[12px] text-[#8a96c2] mt-0.5">
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0e1430] border border-[#2e4585]">
          <Globe size={12} className="text-[#6c8eff] shrink-0" />
          <span className="text-[12px] text-[#e8ecff] flex-1 truncate">
            Current tab: <span className="font-mono text-white">{currentHost}</span>
          </span>
          <button
            onClick={() => handleAdd(currentHost, 1)}
            disabled={adding}
            className="shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-[#6c8eff]/20 border border-[#6c8eff]/40 text-[#6c8eff] hover:bg-[#6c8eff]/30 transition-colors disabled:opacity-50"
          >
            <Plus size={10} /> Quick-add ($1.00)
          </button>
        </div>
      )}

      {/* Domain table */}
      <div className="rounded-xl border border-[#243365] bg-[#0e1631]/80 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 border-b border-[#141a2e] text-[10px] uppercase tracking-wider text-[#5e6a91]">
          <div>Domain</div>
          <div className="text-right">Threshold</div>
          <div>Enabled</div>
          <div></div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-[#8a96c2]">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[12px]">Loading…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-[#8a96c2]">No trusted domains yet.</p>
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
                <Globe size={11} className="text-[#5e6a91] shrink-0" />
                <span className="text-[13px] text-zinc-200 font-mono truncate">{hostname}</span>
                {hostname === currentHost && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#6c8eff]/20 text-[#6c8eff] border border-[#6c8eff]/30 shrink-0">
                    current
                  </span>
                )}
              </div>
              <div className="text-[10px] text-zinc-700 mt-0.5 font-mono pl-[19px]">
                added {new Date(entry.added_at).toLocaleDateString()}
              </div>
            </div>

            <div className="text-[13px] text-[#e8ecff] font-mono text-right shrink-0">
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
                className="flex items-center justify-center w-7 h-7 rounded-md text-[#5e6a91] hover:text-rose-400 hover:bg-rose-950/30 transition-colors disabled:opacity-40"
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
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-4 py-3 border-t border-[#141a2e] bg-[#0b1226]/60">
          <input
            type="text"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="api.example.com"
            className="bg-[#131c39] border border-[#243365] rounded-lg px-3 py-1.5 text-[12px] font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#6c8eff]/50 min-w-0"
          />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[12px] text-[#5e6a91]">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={newThreshold}
              onChange={e => setNewThreshold(e.target.value)}
              className="w-20 bg-[#131c39] border border-[#243365] rounded-lg px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#6c8eff]/50"
              title="Max auto-pay amount in USD"
            />
          </div>
          <button
            onClick={() => handleAdd()}
            disabled={adding || !newDomain.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6c8eff] hover:bg-[#7aa1ff] disabled:bg-[#243365] disabled:text-[#8a96c2] text-white text-[12px] font-medium transition-colors shrink-0"
          >
            {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add
          </button>
        </div>
      </div>

      {/* Info footer */}
      <p className="text-[10px] text-zinc-700 leading-relaxed">
        Auto-pay only fires when the site returns{' '}
        <code className="text-[#8a96c2]">HTTP 402</code> with{' '}
        <code className="text-[#8a96c2]">X-Payment-Required: x402</code> and the payment
        amount is strictly below your threshold. Payments go through your connected wallet.
      </p>
    </div>
  );
};
