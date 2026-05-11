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
      className="px-4 py-6 text-center text-[12px] text-[#5e6a91] italic"
    >
      {msg}
    </td>
  </tr>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#8a96c2] bg-[#0e1631] border-b border-[#141a2e]">
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode; mono?: boolean }> = ({ children, mono }) => (
  <td className={`px-4 py-2.5 text-[12px] text-[#e8ecff] border-b border-[#0d1020] ${mono ? 'font-mono' : ''}`}>
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
          icon: <KeyRound size={14} className="text-[#6c8eff]" />,
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
      <div className="rounded-2xl border border-[#243365] bg-[#131c39]/60 px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[12px] text-[#e8ecff] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeLogs}
              onChange={(e) => setIncludeLogs(e.target.checked)}
              className="accent-[#6c8eff] w-4 h-4"
            />
            Include detection &amp; autofill logs
          </label>

          <label className="flex items-center gap-2 text-[12px] text-[#a8b3d8]">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-[#0e1631] border border-[#243365] rounded-md px-2.5 py-1 text-[12px] text-[#e8ecff] focus:outline-none focus:border-[#6c8eff]/50"
            />
          </label>

          <label className="flex items-center gap-2 text-[12px] text-[#a8b3d8]">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-[#0e1631] border border-[#243365] rounded-md px-2.5 py-1 text-[12px] text-[#e8ecff] focus:outline-none focus:border-[#6c8eff]/50"
            />
          </label>

          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#6c8eff] hover:bg-[#7aa1ff] disabled:bg-[#243365] disabled:text-[#8a96c2] text-white text-[12px] font-medium transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {loading ? 'Generating…' : 'Generate'}
          </button>

          <button
            onClick={handleExport}
            disabled={!report || loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#243365] text-[#a8b3d8] hover:text-white hover:border-[#2e4585] disabled:opacity-40 text-[12px] transition-colors ml-auto"
          >
            <Download size={12} />
            Export JSON
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-[#5e6a91]" />
        </div>
      )}

      {!loading && report && (
        <>
          {/* ── Overview stats ────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-3">
            {statItems.map(({ icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-[#243365] bg-[#0e1631] px-4 py-3 flex items-center gap-3"
              >
                {icon}
                <div>
                  <div className="text-[20px] font-semibold text-white leading-tight">{value}</div>
                  <div className="text-[10px] text-[#8a96c2]">{label}</div>
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
          <div className="rounded-2xl border border-[#243365] bg-[#131c39]/60 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#141a2e]">
              <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
                <KeyRound size={13} className="text-[#6c8eff]" /> Vault / Keys
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
          <div className="rounded-2xl border border-[#243365] bg-[#131c39]/60 overflow-hidden">
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
          <div className="rounded-2xl border border-[#243365] bg-[#131c39]/60 overflow-hidden">
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
            <div className="rounded-2xl border border-[#243365] bg-[#131c39]/60 overflow-hidden">
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
