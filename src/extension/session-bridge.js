/**
 * Dashboard session bridge — document_start on KeyShield hosts only.
 *
 * If the extension already has ks_token, write it into page localStorage
 * before React reads hasStoredToken(), then post {__ks_ext_session}.
 * Opening Sign-in then shows Home instead of AuthScreen.
 */
(function keyShieldSessionBridge() {
  function announce() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    try { window.postMessage({ __ks_ext_announce: chrome.runtime.id }, location.origin); }
    catch { /* noop */ }
  }

  function readPageSession() {
    try {
      return {
        token: localStorage.getItem('ks_token') || '',
        user: localStorage.getItem('ks_wallet') || localStorage.getItem('ks_passkey_user') || '',
      };
    } catch {
      return { token: '', user: '' };
    }
  }

  function capturePageToken() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    const page = readPageSession();
    if (!page.token || page.token.trim().length < 12) return;
    chrome.storage.local.get(['ks_token'], (stored) => {
      if (stored && stored.ks_token === page.token) return;
      chrome.storage.local.set({
        ks_token: page.token,
        ks_user: page.user || null,
        ks_auto_store: true,
      });
    });
  }

  function shareSession() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    capturePageToken();
    chrome.storage.local.get(['ks_token', 'ks_user'], (stored) => {
      const token = stored && stored.ks_token;
      try {
        if (stored && stored.ks_user) {
          if (!localStorage.getItem('ks_passkey_user')) localStorage.setItem('ks_passkey_user', stored.ks_user);
          if (!localStorage.getItem('ks_wallet')) localStorage.setItem('ks_wallet', stored.ks_user);
        }
      } catch { /* noop */ }
      if (!token) return;
      try {
        if (!localStorage.getItem('ks_token')) {
          localStorage.setItem('ks_token', token);
          if (stored.ks_user) localStorage.setItem('ks_wallet', stored.ks_user);
        }
      } catch { /* noop */ }
      try {
        window.postMessage({
          __ks_ext_session: { token: token, user: stored.ks_user || null },
        }, location.origin);
      } catch { /* noop */ }
    });
  }

  function announceVaultSaved() {
    try { window.dispatchEvent(new CustomEvent('ks-vault-changed')); } catch { /* noop */ }
    try { window.postMessage({ __ks_vault_changed: true }, location.origin); } catch { /* noop */ }
  }

  function pushPendingVault() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(['ks_pending_vault'], (stored) => {
      const pending = stored && stored.ks_pending_vault;
      if (!Array.isArray(pending) || !pending.length) return;
      try { window.postMessage({ __ks_pending_vault: pending }, location.origin); } catch { /* noop */ }
    });
  }

  announce();
  shareSession();
  capturePageToken();
  pushPendingVault();
  [400, 1200, 3000, 8000].forEach((ms) => {
    setTimeout(capturePageToken, ms);
    setTimeout(pushPendingVault, ms);
  });
  window.addEventListener('ks-auth-changed', capturePageToken);
  window.addEventListener('storage', capturePageToken);
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__ks_ext_request) announce();
    if (e.data.__ks_ext_request_session) shareSession();
    if (e.data.__ks_ext_request_pending_vault) pushPendingVault();
    if (e.data.__ks_page_session || e.data.__ks_auth_changed) capturePageToken();
    if (e.data.__ks_pending_vault_cleared && chrome.storage && chrome.storage.local) {
      try { chrome.storage.local.set({ ks_pending_vault: [] }); } catch { /* noop */ }
    }
  });
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'KS_VAULT_SAVED') {
        announceVaultSaved();
        pushPendingVault();
      }
    });
  } catch { /* noop */ }
})();
