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
    <div className="rounded-2xl border border-[#243365] bg-[#131c39]/60 overflow-hidden mt-6">
      <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-white">Audit Log Retention</h3>
        <button
          onClick={reload}
          disabled={loading}
          className="text-[#8a96c2] hover:text-[#e8ecff] transition-colors"
          title="Refresh stats"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Current stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#243365] bg-[#0e1631] px-4 py-3">
            <div className="text-[20px] font-semibold text-white leading-tight">
              {loading ? '—' : stats.totalEntries.toLocaleString()}
            </div>
            <div className="text-[10px] text-[#8a96c2] mt-0.5">Total log entries</div>
          </div>
          <div className="rounded-xl border border-[#243365] bg-[#0e1631] px-4 py-3">
            <div className="text-[13px] font-medium text-[#e8ecff] leading-tight truncate">
              {loading ? '—' : (stats.oldestEntry ?? 'No entries')}
            </div>
            <div className="text-[10px] text-[#8a96c2] mt-0.5">Oldest entry</div>
          </div>
        </div>

        {/* Policy inputs */}
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-[#8a96c2] font-medium uppercase tracking-wider">
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
              className="bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[#6c8eff]/50 w-full"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-[#8a96c2] font-medium uppercase tracking-wider">
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
              className="bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-[#6c8eff]/50 w-full"
            />
          </label>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#6c8eff] hover:bg-[#7aa1ff] disabled:bg-[#243365] disabled:text-[#8a96c2] text-white text-[12px] font-medium transition-colors"
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
            <span className="text-[12px] text-[#a8b3d8]">{purgeResult}</span>
          )}
        </div>
      </div>
    </div>
  );
};
