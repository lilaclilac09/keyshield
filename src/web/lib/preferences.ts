/**
 * User preferences — stored in localStorage, never sent to server.
 * Used for things like reveal-duration, default expiry, notification toggle.
 */

export interface VaultPreferences {
  revealDurationSec: number;   // how long a decrypted key stays visible
  defaultExpiryDays: number;   // pre-fill in AddKeyModal
  notifyOnExpiry:    boolean;  // browser notification 7 days before expiry
  notifyOnAnomaly:   boolean;  // browser notification on call spike
}

const KEY = 'ks_prefs';

const DEFAULTS: VaultPreferences = {
  revealDurationSec: 30,
  defaultExpiryDays: 90,
  notifyOnExpiry:    true,
  notifyOnAnomaly:   false,
};

export function getPrefs(): VaultPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function setPrefs(prefs: Partial<VaultPreferences>): VaultPreferences {
  const merged = { ...getPrefs(), ...prefs };
  localStorage.setItem(KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('ks-prefs-changed'));
  return merged;
}
