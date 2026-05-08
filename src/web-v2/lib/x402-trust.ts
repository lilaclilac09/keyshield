export interface TrustEntry { threshold_usd: number; enabled: boolean; added_at: number; }
export type TrustList = Record<string, TrustEntry>;
const STORAGE_KEY = 'ks_x402_trust_list';
const LS_KEY = 'ks_x402_trust_list_web';

function hasChromeStorage(): boolean { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }

async function load(): Promise<TrustList> {
  if (hasChromeStorage()) { const r = await chrome.storage.local.get(STORAGE_KEY); return (r[STORAGE_KEY] as TrustList) ?? {}; }
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

async function save(list: TrustList): Promise<void> {
  if (hasChromeStorage()) await chrome.storage.local.set({ [STORAGE_KEY]: list });
  else localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export async function isTrusted(hostname: string): Promise<boolean> {
  const list = await load(); const e = list[hostname]; return !!e && e.enabled;
}

export async function getThreshold(hostname: string): Promise<number> {
  const list = await load(); const e = list[hostname]; if (!e || !e.enabled) return Infinity; return e.threshold_usd;
}

export async function addDomain(hostname: string, threshold_usd: number): Promise<void> {
  const list = await load();
  list[hostname] = { threshold_usd, enabled: list[hostname]?.enabled ?? true, added_at: list[hostname]?.added_at ?? Date.now() };
  await save(list);
}

export async function removeDomain(hostname: string): Promise<void> {
  const list = await load(); delete list[hostname]; await save(list);
}

export async function toggleDomain(hostname: string, enabled: boolean): Promise<void> {
  const list = await load(); if (!list[hostname]) return; list[hostname] = { ...list[hostname], enabled }; await save(list);
}

export async function listTrustedDomains(): Promise<TrustList> { return load(); }
