
import type { TrustEntry } from '../types';

const STORAGE_KEY = 'ks_x402_trust';

function getStorage(): Record<string, TrustEntry> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      // Extension context – sync handled by background
      return {};
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setStorage(data: Record<string, TrustEntry>) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: data });
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable
  }
}

export function getTrustList(): TrustEntry[] {
  const data = getStorage();
  return Object.values(data);
}

export function getTrustEntry(hostname: string): TrustEntry | null {
  return getStorage()[hostname] ?? null;
}

export function setTrustEntry(entry: TrustEntry) {
  const data = getStorage();
  data[entry.hostname] = entry;
  setStorage(data);
}

export function removeTrustEntry(hostname: string) {
  const data = getStorage();
  delete data[hostname];
  setStorage(data);
}

export function isAutoPayApproved(hostname: string, amountUsd: number): boolean {
  const entry = getTrustEntry(hostname);
  if (!entry || !entry.enabled) return false;
  return amountUsd <= entry.threshold_usd;
}
