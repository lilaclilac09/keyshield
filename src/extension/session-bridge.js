/**
 * Dashboard session bridge — document_start on KeyShield hosts only.
 *
 * If the extension already has ks_token, write it into page localStorage
 * before React reads hasStoredToken(), then post {__ks_ext_session}.
 * Opening Sign-in then shows Home instead of AuthScreen.
 *
 * Muse / Firefox have no externally_connectable. The page posts
 * {__ks_ext_message: {type, ...}} and we forward allowlisted Path A
 * types to the background worker.
 */
(function keyShieldSessionBridge() {
  (function (g) {
    if (!g) return;
    if (!g.browser && g.chrome) g.browser = g.chrome;
    if (!g.chrome && g.browser) g.chrome = g.browser;
  })(typeof globalThis !== 'undefined' ? globalThis : window);

  const DASHBOARD_BRIDGE_TYPES = {
    KS_TOKEN_REGISTER: 1,
    KS_TOKEN_CLEAR: 1,
    KS_PING: 1,
    KS_VAULT_KEY_REGISTER: 1,
    KS_VAULT_KEY_CLEAR: 1,
    KS_ZK_ENROLL: 1,
    KS_ZK_FORGET: 1,
    KS_ZK_STATUS: 1,
  };
  const BRIDGE_ERROR_KEY = 'ks_bridge_last_error';

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

  function emitBridgeStatus(status) {
    try { window.postMessage({ __ks_ext_bridge_status: status }, location.origin); } catch { /* noop */ }
  }

  function clearBridgeError() {
    try { chrome.storage.local.remove(BRIDGE_ERROR_KEY); } catch { /* noop */ }
  }

  function rememberBridgeError(type, reason, detail) {
    const payload = {
      type: String(type || ''),
      reason: String(reason || 'bridge-error'),
      detail: String(detail || ''),
      at: Date.now(),
    };
    try { chrome.storage.local.set({ [BRIDGE_ERROR_KEY]: payload }); } catch { /* noop */ }
    emitBridgeStatus({ ok: false, ...payload });
  }

  function rememberBridgeSuccess(type) {
    clearBridgeError();
    emitBridgeStatus({ ok: true, type: String(type || ''), at: Date.now() });
  }

  function fallbackStorePageToken(page) {
    try {
      chrome.storage.local.set({
        ks_token: page.token,
        ks_user: page.user || null,
        ks_auto_store: true,
      });
    } catch { /* noop */ }
  }

  function sendBridgeMessage(message, opts) {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      if (!opts || !opts.suppressErrors) {
        rememberBridgeError(
          message && message.type,
          'extension-unavailable',
          'Extension runtime is unavailable. Reload the extension and dashboard tab.',
        );
      }
      if (opts && typeof opts.onFailure === 'function') opts.onFailure();
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          if (!opts || !opts.suppressErrors) {
            rememberBridgeError(message && message.type, 'runtime-error', String(err.message || err));
          }
          if (opts && typeof opts.onFailure === 'function') opts.onFailure();
          return;
        }
        if (!res || res.ok !== true) {
          if (!opts || !opts.suppressErrors) {
            rememberBridgeError(
              message && message.type,
              (res && res.reason) || 'bridge-rejected',
              (res && res.detail) || 'Bridge request was rejected by the background worker.',
            );
          }
          if (opts && typeof opts.onFailure === 'function') opts.onFailure();
          return;
        }
        if (opts && typeof opts.onSuccess === 'function') opts.onSuccess(res);
        if (!opts || !opts.suppressSuccess) rememberBridgeSuccess(message && message.type);
      });
    } catch (e) {
      if (!opts || !opts.suppressErrors) {
        rememberBridgeError(message && message.type, 'runtime-throw', String(e));
      }
      if (opts && typeof opts.onFailure === 'function') opts.onFailure();
    }
  }

  function capturePageToken() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    const page = readPageSession();
    if (!page.token || page.token.trim().length < 12) return;
    chrome.storage.local.get(['ks_token'], (stored) => {
      if (stored && stored.ks_token === page.token) return;
      sendBridgeMessage({
        type: 'KS_TOKEN_REGISTER',
        token: page.token,
        user: page.user || null,
      }, {
        onFailure: () => fallbackStorePageToken(page),
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

  // Unsent keys live in the background's session memory (never on disk).
  // Ask for them only here, on the dashboard, so it can flush them.
  function pushPendingVault() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    sendBridgeMessage({ type: 'KS_PENDING_FOR_DASHBOARD' }, {
      suppressSuccess: true,
      onSuccess: (res) => {
        const pending = res && res.pending;
        if (!Array.isArray(pending) || !pending.length) return;
        try { window.postMessage({ __ks_pending_vault: pending }, location.origin); } catch { /* noop */ }
      },
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
    if (e.data.__ks_pending_vault_cleared && chrome.runtime && chrome.runtime.sendMessage) {
      sendBridgeMessage({ type: 'KS_PENDING_CLEAR' }, { suppressSuccess: true });
    }
    const bridge = e.data.__ks_ext_message;
    if (bridge && typeof bridge === 'object' && DASHBOARD_BRIDGE_TYPES[bridge.type]
      && chrome.runtime && chrome.runtime.sendMessage) {
      sendBridgeMessage(bridge);
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
