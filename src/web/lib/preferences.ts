export interface VaultPreferences {
  revealDurationSec: number;
  defaultExpiryDays: number;
  notifyOnExpiry: boolean;
  notifyOnAnomaly: boolean;
}

const KEY = 'ks_prefs';
const DEFAULTS: VaultPreferences = {
  revealDurationSec: 30, defaultExpiryDays: 90, notifyOnExpiry: true, notifyOnAnomaly: false,
};

export function getPrefs(): VaultPreferences {
  try { const raw = localStorage.getItem(KEY); if (!raw) return DEFAULTS; return { ...DEFAULTS, ...JSON.parse(raw) }; }
  catch { return DEFAULTS; }
}

export function setPrefs(prefs: Partial<VaultPreferences>): VaultPreferences {
  const merged = { ...getPrefs(), ...prefs };
  localStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}
