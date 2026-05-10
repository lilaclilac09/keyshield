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
