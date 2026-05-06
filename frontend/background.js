/**
 * KeyShield Background Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Three paths:
 *
 *  1. SAVE_KEY (from content.js):
 *     - If we have a stored session token → POST /manage/store directly.
 *       User sees a "✓ Saved" Chrome notification AND we sendResponse so the
 *       content script can render an in-page success/failure toast.
 *     - If no token / token expired → fall back to opening the dashboard with
 *       a prefilled URL.
 *
 *  2. KS_TOKEN_REGISTER (from dashboard via externally_connectable):
 *     Dashboard sends this on login/logout. We persist in chrome.storage.local.
 *
 *  3. API_BASE override (chrome.storage.local.ks_api_base):
 *     Lets QA point a single extension build at staging or prod without
 *     re-zipping. Defaults to localhost in dev. The popup writes this value.
 */

const DEFAULT_KS_BASE       = 'http://localhost:8000';
const DEFAULT_DASHBOARD_URL = 'http://localhost:3000';

async function getApiBase() {
  const { ks_api_base, ks_dashboard_url } = await chrome.storage.local.get([
    'ks_api_base',
    'ks_dashboard_url',
  ]);
  return {
    apiBase:      ks_api_base      || DEFAULT_KS_BASE,
    dashboardUrl: ks_dashboard_url || DEFAULT_DASHBOARD_URL,
  };
}

// ── Storage helpers ─────────────────────────────────────────────────────────

async function getStoredToken() {
  const { ks_token, ks_user } = await chrome.storage.local.get(['ks_token', 'ks_user']);
  return { token: ks_token || null, user: ks_user || null };
}

async function setStoredToken(token, user) {
  await chrome.storage.local.set({ ks_token: token, ks_user: user || null });
}

async function clearStoredToken() {
  await chrome.storage.local.remove(['ks_token', 'ks_user']);
}

// ── Notifications ───────────────────────────────────────────────────────────

function notify(title, message, icon) {
  chrome.notifications.create({
    type:    'basic',
    iconUrl: icon || chrome.runtime.getURL('icon.png'),
    title:   title,
    message: message,
  }, () => {
    // ignore "icon not found" — manifest icon is optional
    if (chrome.runtime.lastError) console.log('[KeyShield] notify:', chrome.runtime.lastError.message);
  });
}

// ── Direct store (no tab) ───────────────────────────────────────────────────

async function directStore({ upstream, value }) {
  const { token } = await getStoredToken();
  if (!token) return { ok: false, reason: 'no-token' };

  const { apiBase } = await getApiBase();

  try {
    const r = await fetch(`${apiBase}/manage/store`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ upstream, apiKey: value }),
    });

    if (r.status === 401) {
      // token expired
      await clearStoredToken();
      return { ok: false, reason: 'token-expired' };
    }
    if (!r.ok) {
      return { ok: false, reason: `http-${r.status}`, detail: await r.text() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e) };
  }
}

// ── SAVE_KEY (from content.js) ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Accept both the structured form ({type, payload}) and the spec form
  // ({action: "save-key", provider, key, source_url}) so we don't break
  // either client.
  let payload = null;
  if (message.type === 'SAVE_KEY' && message.payload) {
    payload = message.payload;
  } else if (message.action === 'save-key') {
    payload = {
      upstream: message.provider,
      value:    message.key,
      name:     message.name || `${message.provider} (${new URL(message.source_url || 'http://x').hostname})`,
      domain:   (() => { try { return new URL(message.source_url).hostname; } catch { return ''; } })(),
    };
  }
  if (!payload) return false;

  (async () => {
    const { upstream, name, value, domain } = payload;

    // Try direct API store
    const result = await directStore({ upstream, value });

    if (result.ok) {
      notify('KeyShield', `Saved ${upstream} key to KeyShield`);
      sendResponse({ ok: true, mode: 'direct' });
      return;
    }

    // Fallback: open dashboard with prefilled URL
    const reasonMsg = {
      'no-token':      'Sign in to KeyShield first',
      'token-expired': 'Session expired — sign in again',
      'network':       'Backend unreachable — opening dashboard',
    }[result.reason] || `Error: ${result.reason}`;

    const { dashboardUrl } = await getApiBase();
    const params = new URLSearchParams({
      action:   'add',
      upstream: upstream || 'openai',
      name:     name     || '',
      value:    value    || '',
      domain:   domain   || '',
    });

    notify('KeyShield', reasonMsg);
    chrome.tabs.create({ url: `${dashboardUrl}/?${params}` });
    sendResponse({ ok: false, mode: 'fallback', reason: result.reason });
  })();

  return true;  // keep sendResponse channel open for async reply
});

// ── External messages (from dashboard) ──────────────────────────────────────

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'KS_TOKEN_REGISTER') {
    setStoredToken(message.token, message.user).then(() => {
      console.log('[KeyShield] token registered from dashboard');
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === 'KS_TOKEN_CLEAR') {
    clearStoredToken().then(() => {
      console.log('[KeyShield] token cleared');
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === 'KS_PING') {
    getStoredToken().then(({ token, user }) => {
      sendResponse({ ok: true, hasToken: !!token, user });
    });
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[KeyShield] v1.1 installed — auto-detect + direct-store enabled');
});
