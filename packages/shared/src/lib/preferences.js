const KEY = 'ks_preferences';
const DEFAULTS = {
    reveal_duration_sec: 30,
    default_expiry_days: 30,
    notify_on_expiry: true,
    notify_on_anomaly: true,
    theme: 'dark',
    sidebar_collapsed: false,
};
export function getPreferences() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw)
            return { ...DEFAULTS, ...JSON.parse(raw) };
    }
    catch { }
    return { ...DEFAULTS };
}
export function setPreferences(prefs) {
    const current = getPreferences();
    const merged = { ...current, ...prefs };
    localStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
}
export function resetPreferences() {
    localStorage.setItem(KEY, JSON.stringify(DEFAULTS));
    return { ...DEFAULTS };
}
//# sourceMappingURL=preferences.js.map