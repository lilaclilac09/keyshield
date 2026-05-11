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
