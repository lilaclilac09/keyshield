
import type { AuditRetention } from '../types';

const STORAGE_KEY = 'ks_audit_log';
const POLICY_KEY = 'ks_audit_policy';

export function getAuditPolicy(): AuditRetention {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { max_age_days: 30, max_entries: 1000 };
}

export function setAuditPolicy(policy: AuditRetention) {
  localStorage.setItem(POLICY_KEY, JSON.stringify(policy));
  enforcePolicy(policy);
}

function getAuditLog(): Array<{ ts: string; event: string; details: Record<string, unknown> }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setAuditLog(entries: Array<{ ts: string; event: string; details: Record<string, unknown> }>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full
  }
}

export function addAuditEntry(event: string, details: Record<string, unknown> = {}) {
  const log = getAuditLog();
  log.push({ ts: new Date().toISOString(), event, details });
  const policy = getAuditPolicy();
  enforcePolicyForLog(log, policy);
  setAuditLog(log);
}

function enforcePolicy(policy: AuditRetention) {
  const log = getAuditLog();
  enforcePolicyForLog(log, policy);
  setAuditLog(log);
}

function enforcePolicyForLog(
  log: Array<{ ts: string; event: string; details: Record<string, unknown> }>,
  policy: AuditRetention
) {
  const cutoff = new Date(Date.now() - policy.max_age_days * 86400000);
  // Remove entries older than max_age_days
  while (log.length > 0 && new Date(log[0].ts) < cutoff) {
    log.shift();
  }
  // Remove oldest entries if over max_entries
  while (log.length > policy.max_entries) {
    log.shift();
  }
}

// Aliased export for external use
const _getAuditLog = getAuditLog;
export { _getAuditLog as getAuditLog };

export function clearAuditLog() {
  localStorage.removeItem(STORAGE_KEY);
}

// Public aliases for the dashboard UI (named after the conceptual UI verbs).
export { getAuditPolicy as getPolicy };
export { setAuditPolicy as setPolicy };
export { clearAuditLog as purgeAuditLog };

// Default retention policy shown in the Settings UI as the "reset" baseline.
export const DEFAULT_POLICY: AuditRetention = { max_age_days: 30, max_entries: 1000 };

// Re-export the type with a UI-friendly alias.
export type { AuditRetention as AuditRetentionPolicy };
