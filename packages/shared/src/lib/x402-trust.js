const STORAGE_KEY = 'ks_x402_trust';
function getStorage() {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            // Extension context – sync handled by background
            return {};
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    }
    catch {
        return {};
    }
}
function setStorage(data) {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ [STORAGE_KEY]: data });
            return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    catch {
        // Storage full or unavailable
    }
}
export function getTrustList() {
    const data = getStorage();
    return Object.values(data);
}
export function getTrustEntry(hostname) {
    return getStorage()[hostname] ?? null;
}
export function setTrustEntry(entry) {
    const data = getStorage();
    data[entry.hostname] = entry;
    setStorage(data);
}
export function removeTrustEntry(hostname) {
    const data = getStorage();
    delete data[hostname];
    setStorage(data);
}
export function isAutoPayApproved(hostname, amountUsd) {
    const entry = getTrustEntry(hostname);
    if (!entry || !entry.enabled)
        return false;
    return amountUsd <= entry.threshold_usd;
}
//# sourceMappingURL=x402-trust.js.map