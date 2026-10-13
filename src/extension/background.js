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

// Production defaults — extension ships pointing at the hosted KeyShield
// deployment so a fresh install works without a local dev server. Mirrors
// popup.js. Local-dev users override these via the popup's settings panel.
const PROD_KS_BASE          = 'https://keyshield-production.up.railway.app';
const PROD_DASHBOARD_URL    = 'https://app.ks.aileena.xyz';
const LOCAL_KS_BASE         = 'http://127.0.0.1:8001';
const LOCAL_DASHBOARD_URL   = 'http://127.0.0.1:5173';
const DEFAULT_KS_BASE       = PROD_KS_BASE;
const DEFAULT_DASHBOARD_URL = 'https://app.ks.aileena.xyz';

const STALE_DASHBOARD_DEFAULTS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
const LEGACY_API_BASES = [];
const DEAD_DASHBOARD_URLS = [
  'https://keyshield.dev',
  'https://www.keyshield.dev',
  'https://app.keyshield.dev',
  'https://ks.app.aileena.xyz',
];
const PIN_PREF_KEY = 'ks_url_pref_pinned';

function isDeadDashboardUrl(url) {
  const u = String(url || '').replace(/\/+$/, '');
  return DEAD_DASHBOARD_URLS.some((d) => u === d || u.startsWith(`${d}/`));
}

// ── base64url helpers ───────────────────────────────────────────────────────
function _b64uEnc(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _b64uDec(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Vault key (Path A lite): session-only, base64url-encoded 32-byte AES key
async function _getVaultKeyBytes() {
  const r = await chrome.storage.session.get('ks_vault_key');
  return r.ks_vault_key ? _b64uDec(r.ks_vault_key) : null;
}

// ── Domain → upstreams for auto-fill (keep in sync with fill-domain.ts) ────
// cursor.com Settings blanks take Cursor + OpenAI + Anthropic + OpenRouter + Groq.
// app.kilo.ai/byok pastes a saved OpenRouter / NVIDIA / OpenAI / Anthropic / Groq key.
const CURSOR_FILL_UPSTREAMS = ['cursor', 'openai', 'anthropic', 'openrouter', 'nvidia', 'groq'];
const KILO_FILL_UPSTREAMS = ['openrouter', 'nvidia', 'openai', 'anthropic', 'groq'];
const NVIDIA_FILL_UPSTREAMS = ['nvidia', 'openrouter'];
const AI_FILL_UPSTREAMS = ['nvidia', 'openrouter', 'openai', 'anthropic', 'groq', 'cursor'];
const DOMAIN_TO_UPSTREAMS = {
  'openrouter.ai':         ['openrouter'],
  'build.nvidia.com':      NVIDIA_FILL_UPSTREAMS,
  'integrate.api.nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'api.nvidia.com':        NVIDIA_FILL_UPSTREAMS,
  'nim.nvidia.com':        NVIDIA_FILL_UPSTREAMS,
  'catalog.ngc.nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'ngc.nvidia.com':        NVIDIA_FILL_UPSTREAMS,
  'nvidia.com':            NVIDIA_FILL_UPSTREAMS,
  'nvidia.demo.localhost': NVIDIA_FILL_UPSTREAMS,
  'scvd.store':            ['openrouter'],
  'kilo.ai':               KILO_FILL_UPSTREAMS,
  'app.kilo.ai':           KILO_FILL_UPSTREAMS,
  'www.kilo.ai':           KILO_FILL_UPSTREAMS,
  'kilo.demo.localhost':   KILO_FILL_UPSTREAMS,
  'platform.openai.com':   ['openai'],
  'openai.com':            ['openai'],
  'console.anthropic.com': ['anthropic'],
  'anthropic.com':         ['anthropic'],
  'console.groq.com':      ['groq'],
  'groq.com':              ['groq'],
  'console.mistral.ai':    ['mistral'],
  'mistral.ai':            ['mistral'],
  'dashboard.cohere.com':  ['cohere'],
  'cohere.com':            ['cohere'],
  'cohere.ai':             ['cohere'],
  'dashboard.helius.dev':  ['helius'],
  'helius.dev':            ['helius'],
  'helius.xyz':            ['helius'],
  'dashboard.0x.org':      ['0x'],
  '0x.org':                ['0x'],
  'dashboard.alchemy.com': ['alchemy'],
  'alchemy.com':           ['alchemy'],
  'vercel.com':            ['vercel'],
  'vercel.demo.localhost': ['vercel'],
  'github.com':            ['github'],
  'github.demo.localhost': ['github'],
  'openrouter.demo.localhost': ['openrouter'],
  'cursor.com':            CURSOR_FILL_UPSTREAMS,
  'www.cursor.com':        CURSOR_FILL_UPSTREAMS,
  'cursor.sh':             CURSOR_FILL_UPSTREAMS,
  'cursor.demo.localhost': CURSOR_FILL_UPSTREAMS,
  'devin.demo.localhost':  ['openrouter'],
};

function _normalizeHostname(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\.+$/, '');
}

function _upstreamsForDomain(domain) {
  const normalized = _normalizeHostname(domain);
  if (!normalized) return [];
  if (DOMAIN_TO_UPSTREAMS[normalized]) return DOMAIN_TO_UPSTREAMS[normalized];
  for (const d of Object.keys(DOMAIN_TO_UPSTREAMS)) {
    if (normalized === d || normalized.endsWith('.' + d)) return DOMAIN_TO_UPSTREAMS[d];
  }
  return [];
}

function _isCursorFillHost(domain) {
  const host = _normalizeHostname(domain);
  return host === 'cursor.com' || host.endsWith('.cursor.com')
    || host === 'cursor.sh' || host.endsWith('.cursor.sh')
    || host === 'cursor.demo.localhost';
}

function _isLocalFillDemoPath(pathname) {
  const path = String(pathname || '').toLowerCase();
  return path.includes('cursor-settings-fill-demo')
    || path.includes('nvidia-fill-demo')
    || path.includes('/journey/cursor')
    || /(?:^|\/)cursor\.html$/.test(path)
    || path === '/story'
    || path.startsWith('/story/');
}

function _isNvidiaFillHost(domain) {
  const host = _normalizeHostname(domain);
  return host === 'nvidia.com' || host.endsWith('.nvidia.com') || host === 'nvidia.demo.localhost';
}

function _isNvidiaKeyFetchContext(domain, pathname, url) {
  if (_isNvidiaFillHost(domain)) return true;
  const path = String(pathname || '').toLowerCase();
  if (path.includes('nvidia-fill-demo')) return true;
  try {
    if (url && new URL(url).pathname.toLowerCase().includes('nvidia-fill-demo')) return true;
  } catch { /* noop */ }
  return false;
}

function _hintsText(hints) {
  return (Array.isArray(hints) ? hints.join(' ') : String(hints || '')).toLowerCase();
}

function _hintsWantNvidia(hints) {
  return /\bnvidia\b|\bnim\b|\bnvapi\b/.test(_hintsText(hints));
}

function _hintsWantAi(hints) {
  return /\bapi[\s_-]?key\b|\btoken\b|\bsecret\b|\bnvidia\b|\bnim\b|\bnvapi\b|\bopenai\b|\banthropic\b|\bopenrouter\b|\bgroq\b|\bcursor\b/.test(_hintsText(hints));
}

function _valueLooksNvidia(value) {
  return /^nvapi-[A-Za-z0-9_-]{16,}/.test(String(value || ''));
}

function _vaultItemMatchesWanted(it, wanted) {
  const up = String((it && it.upstream) || '').toLowerCase();
  if (wanted.has(up)) return true;
  const blob = `${(it && it.name) || ''} ${(it && it.product) || ''} ${(it && it.family) || ''}`.toLowerCase();
  if (wanted.has('nvidia') && /\bnvidia\b|\bnim\b|\bnvapi\b/.test(blob)) return true;
  return false;
}

function _isKiloFillHost(domain) {
  const host = _normalizeHostname(domain);
  return host === 'kilo.ai' || host.endsWith('.kilo.ai') || host === 'kilo.demo.localhost';
}

function _isKiloByokPath(pathname, url) {
  const blob = `${pathname || ''} ${url || ''}`.toLowerCase();
  return blob.includes('/byok')
    || blob.includes('kilo-byok-fill-demo')
    || blob.includes('bring-your-own-key')
    || blob.includes('bring_your_own_key')
    || /[#?&=/]byok\b/.test(blob);
}

function _isKiloFillTabUrl(url) {
  const raw = String(url || '');
  if (/kilo-byok-fill-demo|kilo\.demo\.localhost/i.test(raw)) return true;
  try {
    const parsed = new URL(raw);
    if (_isKiloFillHost(parsed.hostname) && _isKiloByokPath(parsed.pathname, raw)) return true;
  } catch { /* noop */ }
  return _isKiloByokPath(raw, raw);
}

function _isKiloKeyFetchContext(domain, pathname, url) {
  if (_isKiloFillHost(domain)) return true;
  try {
    if (url) {
      const parsed = new URL(url);
      if (parsed.protocol === 'chrome-extension:' && _isKiloByokPath(parsed.pathname || pathname, url)) return true;
    }
  } catch { /* noop */ }
  const host = _normalizeHostname(domain);
  const local = host === '127.0.0.1' || host === 'localhost';
  return local && _isKiloByokPath(pathname, url);
}

function _isOwnExtensionFillDemo(url) {
  const raw = String(url || '');
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'chrome-extension:') return false;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id
      && parsed.host !== chrome.runtime.id) return false;
    return _isLocalFillDemoPath(parsed.pathname) || _isKiloByokPath(parsed.pathname, raw);
  } catch {
    return false;
  }
}

function _isFillableTabUrl(url) {
  const raw = String(url || '');
  if (/^https?:/i.test(raw)) return true;
  return _isOwnExtensionFillDemo(raw);
}

/** Unlock Cursor/model keys only for cursor hosts or our local demo path — never a spoofed title. */
function _isCursorKeyFetchContext(domain, pathname, url) {
  if (_isCursorFillHost(domain)) return true;
  if (_isOwnExtensionFillDemo(url) && !_isKiloByokPath(pathname, url) && !_isKiloByokPath(url, url)) return true;
  const host = _normalizeHostname(domain);
  const local = host === '127.0.0.1' || host === 'localhost';
  return local && _isLocalFillDemoPath(pathname);
}

function distinguishStoreName({ upstream, value, name, domain, pageTitle }) {
  const raw = String(value || '');
  const prefix = raw.length < 10 ? '••••' : `${raw.slice(0, 6)}…${raw.slice(-4)}`;
  const given = String(name || '').trim();
  const up = String(upstream || '').toLowerCase();
  const pageName = /^[A-Za-z][A-Za-z0-9 _-]{2,47}$/.test(given)
    && !/^(name|api key|key)$/i.test(given)
    && given.toLowerCase() !== up
    && given.toLowerCase() !== `${up} key`;
  if (pageName) return given;
  const generic = !given
    || given.toLowerCase() === up
    || given.toLowerCase() === `${up} key`
    || given.toLowerCase() === `${up}key`
    || given.toLowerCase().startsWith(`${up} rpc (`);
  if (given && !generic) return given.includes(prefix) ? given : `${given} · ${prefix}`;
  const parts = [upstream || 'API', prefix];
  const host = String(domain || '').trim();
  if (host) parts.push(host);
  const title = String(pageTitle || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  if (title) parts.push(title);
  return parts.filter(Boolean).join(' · ');
}

async function _decryptCipher(keyBytes, cipherB64u, ivB64u) {
  const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const ct = _b64uDec(cipherB64u);
  const iv = _b64uDec(ivB64u);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return new TextDecoder().decode(pt);
}

function _isLocalApi(apiBase) {
  try {
    const host = new URL(apiBase).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

function _manageHeaders(apiBase, token, extra) {
  const headers = { ...(extra || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  // X-Dev-Mode is loopback-only. On Railway a stale Bearer plus this
  // header used to write user_id=default, so Vault listed none.
  if (_isLocalApi(apiBase)) headers['X-Dev-Mode'] = '1';
  return headers;
}

async function pendingKeysForUpstreams(upstreams) {
  const wanted = new Set((upstreams || []).map((u) => String(u || '').toLowerCase()));
  try {
    const stored = await chrome.storage.local.get(['ks_pending_vault']);
    const rows = Array.isArray(stored.ks_pending_vault) ? stored.ks_pending_vault : [];
    const out = [];
    const seen = new Set();
    for (const row of rows) {
      const upstream = String((row && row.upstream) || '').toLowerCase();
      const value = String((row && row.value) || '');
      if (!upstream || !value || seen.has(value)) continue;
      if (wanted.size && !wanted.has(upstream)
        && !(wanted.has('nvidia') && (_valueLooksNvidia(value) || /\bnvidia\b|\bnim\b|\bnvapi\b/.test(`${upstream} ${(row && row.name) || ''}`)))) {
        continue;
      }
      seen.add(value);
      out.push({ id: `pending-${upstream}`, upstream, name: `${upstream} key`, value });
    }
    return out;
  } catch {
    return [];
  }
}

async function getKeysForDomain(domain, extra) {
  extra = extra || {};
  await ensureFillSession();
  let upstreams = _upstreamsForDomain(domain);
  if (!upstreams.length && _isKiloKeyFetchContext(domain, extra.pathname, extra.url)) {
    upstreams = KILO_FILL_UPSTREAMS.slice();
  }
  if (!upstreams.length && (_isNvidiaKeyFetchContext(domain, extra.pathname, extra.url) || _hintsWantNvidia(extra.hints))) {
    upstreams = NVIDIA_FILL_UPSTREAMS.slice();
  }
  if (!upstreams.length && _isCursorKeyFetchContext(domain, extra.pathname, extra.url)) {
    upstreams = CURSOR_FILL_UPSTREAMS.slice();
  }
  if (!upstreams.length && extra.hasKeyBlanks && _hintsWantAi(extra.hints)) {
    upstreams = AI_FILL_UPSTREAMS.slice();
  }
  if (!upstreams.length) return { ok: false, reason: 'no-upstream-match' };

  const wanted = new Set(upstreams.map((u) => String(u || '').toLowerCase()));
  const pending = await pendingKeysForUpstreams(upstreams);
  const { token } = await getStoredToken();
  if (!token) {
    if (pending.length) return { ok: true, keys: pending };
    return { ok: false, reason: 'no-token' };
  }
  const { apiBase } = await getApiBase();
  const headers = _manageHeaders(apiBase, token);

  let items = [];
  try {
    const r = await fetch(`${apiBase}/manage/vault`, { headers });
    if (r.ok) {
      const payload = await r.json();
      items = Array.isArray(payload)
        ? payload
        : payload && Array.isArray(payload.items)
          ? payload.items
          : payload && Array.isArray(payload.keys)
            ? payload.keys
            : [];
    }
  } catch { /* pending fill still runs */ }

  const matched = items.filter((it) => it && _vaultItemMatchesWanted(it, wanted));
  const out = [];
  for (const it of matched) {
    let value = '';
    try {
      const dec = await fetch(`${apiBase}/manage/decrypt/${encodeURIComponent(it.id)}`, { headers });
      if (dec.ok) {
        const body = await dec.json();
        value = typeof body.value === 'string' ? body.value : (typeof body.key === 'string' ? body.key : '');
      }
    } catch {
      value = '';
    }
    if (!value) continue;
    let upstream = String(it.upstream || '').toLowerCase();
    if (_valueLooksNvidia(value)) upstream = 'nvidia';
    if (!wanted.has(upstream) && !(wanted.has('nvidia') && (_valueLooksNvidia(value) || _vaultItemMatchesWanted({ ...it, value }, wanted)))) {
      continue;
    }
    out.push({ id: it.id, upstream: upstream || it.upstream, name: it.name, value });
  }
  for (const row of pending) {
    if (!out.some((k) => k.value === row.value)) out.push(row);
  }
  if (out.length === 0) {
    return { ok: false, reason: 'no-keys' };
  }
  return { ok: true, keys: out };
}

async function getApiBase() {
  const stored = await chrome.storage.local.get([
    'ks_api_base',
    'ks_dashboard_url',
    PIN_PREF_KEY,
  ]);
  const pinned = !!stored[PIN_PREF_KEY];
  let api = stored.ks_api_base || DEFAULT_KS_BASE;
  let dash = stored.ks_dashboard_url || DEFAULT_DASHBOARD_URL;
  let changed = false;
  if (
    !pinned &&
    LEGACY_API_BASES.some((u) => api === u || api.startsWith(`${u}/`))
  ) {
    api = DEFAULT_KS_BASE;
    changed = true;
  }
  if (isDeadDashboardUrl(dash) || STALE_DASHBOARD_DEFAULTS.some((u) => dash === u || dash.startsWith(`${u}/`))) {
    dash = DEFAULT_DASHBOARD_URL;
    changed = true;
  }
  if (changed) {
    try {
      await chrome.storage.local.set({ ks_api_base: api, ks_dashboard_url: dash });
    } catch { /* noop */ }
  }
  return { apiBase: api, dashboardUrl: dash };
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

function summarizeSavedApis(data) {
  const rows = Array.isArray(data)
    ? data
    : data && Array.isArray(data.items)
      ? data.items
      : data && Array.isArray(data.keys)
        ? data.keys
        : [];
  const out = [];
  for (const it of rows) {
    if (!it || typeof it !== 'object') continue;
    const upstream = String(it.upstream || '').toLowerCase().trim();
    if (!upstream) continue;
    let masked = String(it.masked_value || '').trim();
    if (!masked) masked = it.cipher ? 'encrypted' : 'saved';
    out.push({
      id: String(it.id || upstream),
      upstream,
      name: String(it.name || `${upstream} key`),
      masked,
      family: String(it.family || ''),
      product: String(it.product || ''),
      domain: String(it.domain || ''),
      expires_at: it.expires_at ? String(it.expires_at) : null,
      created_at: it.created_at ? String(it.created_at) : null,
      notes: String(it.notes || ''),
    });
  }
  return out;
}

async function listSavedApis() {
  const pending = await pendingKeysForUpstreams([]);
  const pendingApis = pending.map((row) => ({
    id: row.id,
    upstream: row.upstream,
    name: row.name,
    masked: maskHarvestedKey(row.value),
  }));
  const { token } = await getStoredToken();
  if (!token) {
    return { ok: pendingApis.length > 0, reason: pendingApis.length ? undefined : 'no-token', apis: pendingApis };
  }
  const { apiBase } = await getApiBase();
  const headers = _manageHeaders(apiBase, token);
  try {
    const r = await fetch(`${apiBase}/manage/vault`, { headers });
    if (r.status === 401) {
      await clearStoredToken();
      return { ok: pendingApis.length > 0, reason: 'token-expired', apis: pendingApis };
    }
    if (!r.ok) return { ok: pendingApis.length > 0, reason: `http-${r.status}`, apis: pendingApis };
    const items = await r.json();
    const apis = summarizeSavedApis(items);
    for (const row of pendingApis) {
      if (!apis.some((it) => it.upstream === row.upstream && it.masked === row.masked)) apis.push(row);
    }
    return { ok: true, apis };
  } catch (e) {
    return { ok: pendingApis.length > 0, reason: 'network', apis: pendingApis, detail: String(e) };
  }
}

async function notifyDashboardVaultSaved() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch { return; }
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (!/ks\.aileena\.xyz|127\.0\.0\.1:5173|localhost:5173/.test(tab.url)) continue;
    try { await chrome.tabs.sendMessage(tab.id, { type: 'KS_VAULT_SAVED' }); } catch { /* no bridge */ }
  }
}

async function queuePendingVault(hit) {
  const upstream = String((hit && hit.upstream) || '').toLowerCase().trim();
  const value = String((hit && hit.value) || '');
  if (!upstream || !value) return;
  try {
    const stored = await chrome.storage.local.get(['ks_pending_vault']);
    const rows = Array.isArray(stored.ks_pending_vault) ? stored.ks_pending_vault : [];
    const id = `${upstream}:${value}`;
    if (rows.some((row) => `${row.upstream}:${row.value}` === id)) return;
    rows.push({ upstream, value, at: Date.now() });
    await chrome.storage.local.set({ ks_pending_vault: rows.slice(-40) });
  } catch { /* noop */ }
}

async function directStore({ upstream, value, name, domain, pageTitle, expires_at }) {
  try {
    const { token } = await getStoredToken();
    if (!token) {
      try { await queuePendingVault({ upstream, value: String(value ?? '') }); } catch { /* dashboard flush */ }
      return { ok: false, reason: 'no-token' };
    }
    const { apiBase } = await getApiBase();

    const headers = _manageHeaders(apiBase, token, { 'Content-Type': 'application/json' });

    // Vault page reveal reads SQLite `value`. Cipher-only rows showed
    // "hides in Ns" with an empty RAW field. Always send plaintext.
    const storedName = distinguishStoreName({
      upstream, value, name, domain, pageTitle,
    });
    const body = JSON.stringify({
      upstream,
      apiKey: String(value ?? ''),
      value: String(value ?? ''),
      name: storedName,
      domain: domain || '',
      origin: domain || '',
      pageTitle: pageTitle || '',
      expires_at: expires_at || undefined,
    });

    try {
      const r = await fetch(`${apiBase}/manage/store`, { method: 'POST', headers, body });
      if (r.status === 401) {
        try { await queuePendingVault({ upstream, value: String(value ?? '') }); } catch { /* dashboard flush */ }
        await clearStoredToken();
        return { ok: false, reason: 'token-expired' };
      }
      if (!r.ok) {
        try { await queuePendingVault({ upstream, value: String(value ?? '') }); } catch { /* noop */ }
        return { ok: false, reason: `http-${r.status}`, detail: await r.text() };
      }
      try { await queuePendingVault({ upstream, value: String(value ?? '') }); } catch { /* noop */ }
      try { await notifyDashboardVaultSaved(); } catch { /* noop */ }
      try { await fillCursorTabsFromPending(); } catch { /* empty boxes on other tabs */ }
      return { ok: true };
    } catch (e) {
      try { await queuePendingVault({ upstream, value: String(value ?? '') }); } catch { /* dashboard flush */ }
      return { ok: false, reason: 'network', detail: String(e) };
    }
  } catch (e) {
    console.error('[KeyShield] directStore exception:', e);
    try { await queuePendingVault({ upstream, value: String(value ?? '') }); } catch { /* dashboard flush */ }
    return { ok: false, reason: 'exception', detail: String(e) };
  }
}

// ── Vault fingerprint helper (Path A lite) ──────────────────────────────────
// SHA-256(vault_key_bytes)[:4] as hex — used to detect "this backup was
// encrypted with a different vault key than the one currently unlocked".
async function _vaultFingerprint(keyBytes) {
  if (!keyBytes) return null;
  const digest = await crypto.subtle.digest('SHA-256', keyBytes);
  const bytes = new Uint8Array(digest).slice(0, 4);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── EXPORT_VAULT: fetch vault, return stringified backup JSON ───────────────
async function exportVault() {
  const { token } = await getStoredToken();
  const { apiBase } = await getApiBase();
  const headers = _manageHeaders(apiBase, token);

  let items;
  try {
    const r = await fetch(`${apiBase}/manage/vault`, { headers });
    if (!r.ok) return { ok: false, reason: `http-${r.status}` };
    items = await r.json();
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e) };
  }
  if (!Array.isArray(items)) return { ok: false, reason: 'bad-response' };

  const keyBytes = await _getVaultKeyBytes();
  const fingerprint = await _vaultFingerprint(keyBytes);

  const out = {
    schema:      'keyshield-backup-v1',
    exported_at: Math.floor(Date.now() / 1000),
    fingerprint: fingerprint,                       // null if no vault key unlocked
    items: items.map((it) => ({
      id:         it.id,
      upstream:   it.upstream,
      name:       it.name,
      cipher:     it.cipher,
      iv:         it.iv,
      cipher_v:   it.cipher_v,
      created_at: it.created_at,
      expires_at: it.expires_at ?? null,
    })),
  };

  return { ok: true, json: JSON.stringify(out) };
}

// ── IMPORT_VAULT: parse, validate, POST each item back to /manage/store ─────
async function importVault(jsonStr) {
  let backup;
  try {
    backup = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, reason: 'bad-format', detail: 'invalid JSON' };
  }
  if (!backup || backup.schema !== 'keyshield-backup-v1') {
    return { ok: false, reason: 'bad-format', detail: 'schema mismatch' };
  }
  if (!Array.isArray(backup.items)) {
    return { ok: false, reason: 'bad-format', detail: 'items not array' };
  }

  // Fingerprint check — warn but don't block. The user may legitimately be
  // restoring after losing their browser; they need to unlock first to decrypt.
  const keyBytes = await _getVaultKeyBytes();
  const currentFp = await _vaultFingerprint(keyBytes);
  const warnFingerprint = !!backup.fingerprint && !!currentFp && backup.fingerprint !== currentFp;

  const { token } = await getStoredToken();
  const { apiBase } = await getApiBase();
  const headers = _manageHeaders(apiBase, token, { 'Content-Type': 'application/json' });

  let imported = 0;
  let skipped  = 0;
  const errors = [];

  for (const it of backup.items) {
    if (!it || typeof it.id !== 'string') { skipped++; continue; }
    const plaintext = String(it.value || it.apiKey || it.api_key || '').trim();
    if (!plaintext) { skipped++; continue; }
    const body = JSON.stringify({
      id:       it.id,
      upstream: it.upstream,
      name:     it.name,
      apiKey:   plaintext,
      value:    plaintext,
    });
    try {
      const r = await fetch(`${apiBase}/manage/store`, { method: 'POST', headers, body });
      if (r.ok) {
        imported++;
      } else {
        skipped++;
        if (errors.length < 3) errors.push(`http-${r.status}`);
      }
    } catch (e) {
      skipped++;
      if (errors.length < 3) errors.push(String(e));
    }
  }

  return { ok: true, imported, skipped, warnFingerprint, errors };
}

// ── x402 Trust Store helpers (mirrors lib/x402-trust.ts) — before onMessage ──
const X402_STORAGE_KEY = 'ks_x402_trust_list';
async function x402LoadList() { const r = await chrome.storage.local.get(X402_STORAGE_KEY); return r[X402_STORAGE_KEY] ?? {}; }
async function x402SaveList(list) { await chrome.storage.local.set({ [X402_STORAGE_KEY]: list }); }
async function x402IsTrusted(h) { const l = await x402LoadList(); const e = l[h]; return !!e && e.enabled; }
async function x402GetThreshold(h) { const l = await x402LoadList(); const e = l[h]; if (!e || !e.enabled) return Infinity; return e.threshold_usd; }
async function x402AddDomain(h, t) { const l = await x402LoadList(); l[h] = { threshold_usd: t, enabled: l[h]?.enabled ?? true, added_at: l[h]?.added_at ?? Date.now() }; await x402SaveList(l); }
async function x402RemoveDomain(h) { const l = await x402LoadList(); delete l[h]; await x402SaveList(l); }
async function x402ToggleDomain(h, enabled) { const l = await x402LoadList(); if (!l[h]) return; l[h] = { ...l[h], enabled }; await x402SaveList(l); }

// ── Internal messages (content / popup): single listener ─────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // x402 — keep in same listener so SAVE_KEY/async paths aren't racing a split handler.
  if (message.type === 'X402_CHECK_TRUST') {
    (async () => {
      try {
        const { hostname, amount_usd } = message;
        const trusted = await x402IsTrusted(hostname);
        const threshold = await x402GetThreshold(hostname);
        sendResponse({ autoPayApproved: trusted && typeof amount_usd === 'number' && amount_usd < threshold });
      } catch (e) {
        sendResponse({ autoPayApproved: false, detail: String(e) });
      }
    })();
    return true;
  }
  if (message.type === 'INITIATE_X402_PAYMENT') {
    (async () => {
      try {
        const { amount_usd, hostname, payTo, network, resource } = message;
        await chrome.storage.session.set({ ks_x402_pending: {
          amount_usd, hostname, payTo, network, resource, initiated_at: Date.now(),
        } });
        try { await chrome.action.openPopup(); } catch { /* noop */ }
        sendResponse({ initiated: true });
      } catch (e) {
        sendResponse({ initiated: false, detail: String(e) });
      }
    })();
    return true;
  }
  if (message.type === 'GET_X402_TRUST') {
    (async () => {
      try { sendResponse({ list: await x402LoadList() }); }
      catch (e) { sendResponse({ list: {}, detail: String(e) }); }
    })();
    return true;
  }
  if (message.type === 'UPDATE_X402_TRUST') {
    (async () => {
      try {
        const { action, hostname, threshold_usd, enabled } = message;
        if (action === 'add') await x402AddDomain(hostname, threshold_usd);
        if (action === 'remove') await x402RemoveDomain(hostname);
        if (action === 'toggle') await x402ToggleDomain(hostname, enabled);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, detail: String(e) });
      }
    })();
    return true;
  }
  if (message.type === 'TRIGGER_QUICK_AUTH') {
    (async () => {
      try {
        const payload = {
          hostname: _normalizeHostname(message.hostname || ''),
          reason: String(message.reason || '401'),
          initiated_at: Date.now(),
        };
        await chrome.storage.session.set({ ks_quick_auth_pending: payload });
        try {
          await chrome.action.openPopup();
          sendResponse({ initiated: true, mode: 'popup' });
          return;
        } catch {
          // Popup can fail in some contexts; fall through to dashboard tab.
        }
        const stored = await chrome.storage.local.get(['ks_dashboard_url', PIN_PREF_KEY]);
        let dashboardUrl = stored.ks_dashboard_url || DEFAULT_DASHBOARD_URL;
        if (!dashboardUrl || isDeadDashboardUrl(dashboardUrl)) dashboardUrl = DEFAULT_DASHBOARD_URL;
        chrome.tabs.create({ url: dashboardUrl });
        sendResponse({ initiated: true, mode: 'dashboard-tab' });
      } catch (e) {
        sendResponse({ initiated: false, detail: String(e) });
      }
    })();
    return true;
  }

  // MV3 wake: content script primes the service worker before bulk save.
  if (message.type === 'INJECT_DETECT') {
    (async () => {
      const result = await injectDetectOnAllTabs();
      sendResponse({ ok: true, ...result });
    })();
    return true;
  }

  if (message.type === 'KS_BG_READY') {
    sendResponse({ ok: true });
    return true;
  }

  // Backup: export encrypted vault as JSON (decryption needs wallet, file is safe).
  if (message.type === 'EXPORT_VAULT') {
    (async () => {
      try {
        const result = await exportVault();
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, reason: 'exception', detail: String(e) });
      }
    })();
    return true;
  }

  // Restore: import a previously-exported backup JSON.
  if (message.type === 'IMPORT_VAULT') {
    (async () => {
      try {
        const result = await importVault(message.json || '');
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, reason: 'exception', detail: String(e) });
      }
    })();
    return true;
  }

  if (message.type === 'LIST_SAVED_APIS') {
    (async () => {
      try {
        sendResponse(await listSavedApis());
      } catch (e) {
        sendResponse({ ok: false, reason: 'exception', apis: [], detail: String(e) });
      }
    })();
    return true;
  }

  // Auto-fill: return decrypted vault values for a given page domain.
  if (message.type === 'GET_KEYS_FOR_DOMAIN') {
    (async () => {
      try {
        const result = await getKeysForDomain(message.domain || '', {
          pathname: message.pathname || '',
          title: message.title || '',
          url: message.url || '',
          hints: message.hints || [],
          hasKeyBlanks: !!message.hasKeyBlanks,
        });
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, reason: 'exception', detail: String(e) });
      }
    })();
    return true;
  }

  if (message.type === 'FILL_PAGE_NOW') {
    (async () => {
      try {
        let tabId = message.tabId;
        let tabUrl = '';
        if (!tabId) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tab && tab.id;
          tabUrl = (tab && tab.url) || '';
        }
        if (!tabId) {
          sendResponse({ ok: false, reason: 'no-tab' });
          return;
        }
        if (!tabUrl) {
          try {
            const tab = await chrome.tabs.get(tabId);
            tabUrl = (tab && tab.url) || '';
          } catch { /* noop */ }
        }
        const result = await fillTabNow(tabId, tabUrl);
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, reason: 'exception', detail: String(e) });
      }
    })();
    return true;
  }

  // Auxiliary: token+vault status (gates content.js bulk-save UX)
  if (message.type === 'GET_TOKEN_STATUS') {
    (async () => {
      const { token, user } = await getStoredToken();
      const vaultKey = await _getVaultKeyBytes();
      sendResponse({ hasToken: !!token, user, hasVaultKey: !!vaultKey });
    })();
    return true;
  }

  // Cross-device sync proof: return SHA-256(keyBytes)[:4] as 8 hex chars.
  // Since ks_vault_key = HKDF-SHA256(walletSig), the same wallet on any
  // browser produces the same key → same fingerprint. Leaking 32 bits of a
  // SHA-256 prefix doesn't compromise the underlying key.
  if (message.type === 'GET_VAULT_FINGERPRINT') {
    (async () => {
      const keyBytes = await _getVaultKeyBytes();
      if (!keyBytes) {
        sendResponse({ ok: false, reason: 'no-vault-key' });
        return;
      }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', keyBytes));
      const hex = Array.from(digest.slice(0, 4))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      sendResponse({ ok: true, fingerprint: hex });
    })();
    return true;
  }

  // Auxiliary: open dashboard once for sign-in (bulk-save flow). Auto-correct
  // a stale stored value that:
  //   - points at :8001/:8000 (FastAPI control-plane port, never the dashboard)
  //   - points at a localhost dev server when the user hasn't pinned a local
  //     target — old extensions defaulted to 127.0.0.1:5173 which 404s on
  //     every fresh install once the user stops `npm run dev`.
  if (message.type === 'OPEN_DASHBOARD_FOR_SIGNIN') {
    (async () => {
      const stored = await chrome.storage.local.get([PIN_PREF_KEY, 'ks_dashboard_url']);
      const dash = String(stored.ks_dashboard_url || '');
      const pinnedLocal = !!stored[PIN_PREF_KEY] && /127\.0\.0\.1:5173|localhost:5173/.test(dash);
      let usedLocal = false;
      if (pinnedLocal) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 400);
          await fetch('http://127.0.0.1:5173/', { method: 'GET', cache: 'no-store', signal: ctrl.signal });
          clearTimeout(timer);
          usedLocal = true;
        } catch {
          usedLocal = false;
          try {
            await chrome.storage.local.set({ ks_dashboard_url: DEFAULT_DASHBOARD_URL, [PIN_PREF_KEY]: false });
          } catch { /* noop */ }
        }
      } else {
        try { await chrome.storage.local.set({ ks_dashboard_url: DEFAULT_DASHBOARD_URL }); } catch { /* noop */ }
      }
      const url = usedLocal
        ? `${LOCAL_DASHBOARD_URL}/?local=1&ext=1&demo=shop`
        : `${DEFAULT_DASHBOARD_URL}/?ext=1&demo=shop`;
      chrome.tabs.create({ url });
      sendResponse({ ok: true, dashboardUrl: usedLocal ? LOCAL_DASHBOARD_URL : DEFAULT_DASHBOARD_URL, usedLocal });
    })();
    return true;
  }

  // SAVE_KEY: structured form ({type, payload}) or spec form ({action, ...})
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
    try {
      const { upstream, name, value, domain } = payload;

      const result = await directStore({
        upstream,
        value,
        name,
        domain,
        pageTitle: payload.pageTitle || '',
        expires_at: payload.expires_at || payload.expiresAt || '',
      });
      if (result.ok) {
        if (!message.silent) notify('KeyShield', `Saved ${upstream} key to KeyShield`);
        sendResponse({ ok: true, mode: 'direct' });
        return;
      }

      // Silent mode (bulk save): return error to caller, don't open per-key tab
      if (message.silent) {
        sendResponse({ ok: false, mode: 'silent', reason: result.reason, detail: result.detail });
        return;
      }

      // Fallback: open dashboard prefill (single save UX)
      const reasonMsg = {
        'no-token':      'Sign in to KeyShield first',
        'token-expired': 'Session expired — sign in again',
        'network':       'Backend unreachable — start local API on 127.0.0.1:8001 or check Settings',
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
      sendResponse({ ok: false, mode: 'fallback', reason: result.reason, detail: result.detail });
    } catch (e) {
      console.error('[KeyShield] SAVE_KEY:', e);
      sendResponse({
        ok:     false,
        mode:   message.silent ? 'silent' : 'fallback',
        reason: 'exception',
        detail: String(e),
      });
    }
  })();

  return true;
});

// ── External messages (from dashboard) ──────────────────────────────────────

async function armLiveScanFromLogin() {
  try { await chrome.storage.local.set({ ks_auto_store: true }); } catch { /* noop */ }
  try { await injectDetectOnAllTabs(); } catch { /* noop */ }
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'KS_TOKEN_REGISTER') {
    setStoredToken(message.token, message.user).then(async () => {
      console.log('[KeyShield] token registered from dashboard — live scan + auto-save on');
      await armLiveScanFromLogin();
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
  // Path A lite: dashboard pushes the AES master key (HKDF of wallet sig)
  if (message.type === 'KS_VAULT_KEY_REGISTER' && typeof message.keyB64 === 'string') {
    chrome.storage.session.set({ ks_vault_key: message.keyB64 }).then(() => {
      console.log('[KeyShield] vault key registered (session-scoped)');
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === 'KS_VAULT_KEY_CLEAR') {
    chrome.storage.session.remove('ks_vault_key').then(() => {
      console.log('[KeyShield] vault key cleared');
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});

function isHeliusDashboardHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.+$/, '');
  return host === 'dashboard.helius.dev' || host === 'helius.dev' || host.endsWith('.helius.dev')
    || host === 'helius.xyz' || host.endsWith('.helius.xyz');
}

function harvestPageKeyLabels(text) {
  const lines = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const name = lines[i];
    if (!/^[A-Za-z][A-Za-z0-9 _-]{2,47}$/.test(name)) continue;
    if (/^(name|api key|api keys|key|keys|expires|created|status)$/i.test(name)) continue;
    const next = lines[i + 1];
    const uuid = String(next).match(/[0-9a-f]{8}(?:-[0-9a-f*]{4}){3}-[0-9a-f*]{12}/i);
    if (!uuid) continue;
    out.push({ name, prefix: uuid[0].slice(0, 8).toLowerCase() });
  }
  return out;
}

function labelForHarvestedKey(key, labels) {
  const prefix = String(key || '').slice(0, 8).toLowerCase();
  return (labels || []).find((row) => prefix.startsWith(row.prefix))?.name || '';
}

function harvestVisibleKeysFromText(text, hostname, href) {
  const src = String(text || '');
  const host = String(hostname || '').toLowerCase();
  const pageHref = String(href || '');
  const skipUuid = new Set(
    (pageHref.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [])
      .map((s) => s.toLowerCase()),
  );
  const shapes = [
    { upstream: 'nvidia', re: /nvapi-[A-Za-z0-9_-]{16,}/g },
    { upstream: 'openrouter', re: /sk-or-[A-Za-z0-9_-]{12,}/g },
    { upstream: 'anthropic', re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/g },
    { upstream: 'groq', re: /gsk_[A-Za-z0-9]{32,}/g },
    { upstream: 'helius', re: /helius_auth_[A-Za-z0-9]{16,}/g },
    { upstream: 'helius', re: /(?<![0-9a-f-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f-])/gi },
    { upstream: 'cursor', re: /(?:key_|crsr[_-])[A-Za-z0-9_-]{12,}/g },
    { upstream: 'openai', re: /sk-(?:proj-|svcacct-|admin-)?(?!or-|ant-)[A-Za-z0-9_-]{20,}/g },
  ];
  const out = [];
  const seen = new Set();
  for (const row of shapes) {
    row.re.lastIndex = 0;
    let match;
    while ((match = row.re.exec(src)) !== null) {
      const key = match[0];
      if (!key || /[•…]|\.{3}/.test(key)) continue;
      if (row.upstream === 'helius' && key.includes('-')) {
        if (!isHeliusDashboardHost(host)) continue;
        if (skipUuid.has(key.toLowerCase())) continue;
      }
      const id = `${row.upstream}:${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ upstream: row.upstream, key });
    }
  }
  return out;
}

async function harvestTokenFromDashboardTabs() {
  if (!chrome.scripting || !chrome.tabs) return null;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({
      url: [
        'https://app.ks.aileena.xyz/*',
        'https://*.aileena.xyz/*',
        'http://127.0.0.1:5173/*',
        'http://localhost:5173/*',
      ],
    });
  } catch {
    try { tabs = await chrome.tabs.query({}); } catch { return null; }
  }
  let foundUser = null;
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (!/ks\.aileena\.xyz|127\.0\.0\.1:5173|localhost:5173/.test(tab.url)) continue;
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          token: localStorage.getItem('ks_token') || '',
          user: localStorage.getItem('ks_wallet') || localStorage.getItem('ks_passkey_user') || '',
        }),
      });
      const result = injected && injected[0] && injected[0].result;
      if (result && String(result.token || '').trim().length >= 12) {
        await chrome.storage.local.set({
          ks_token: result.token,
          ks_user: result.user || null,
          ks_auto_store: true,
        });
        return result.token;
      }
      if (result && result.user && !foundUser) foundUser = result.user;
    } catch { /* restricted tab */ }
  }
  if (foundUser) {
    try { await chrome.storage.local.set({ ks_user: foundUser }); } catch { /* noop */ }
  }
  return null;
}

async function ensureFillSession() {
  let { token, user } = await getStoredToken();
  if (!token) {
    const harvested = await harvestTokenFromDashboardTabs();
    if (harvested) {
      const again = await getStoredToken();
      token = again.token;
      user = again.user;
    }
  }
  if (token) {
    try { await chrome.storage.local.set({ ks_auto_store: true }); } catch { /* noop */ }
  }
  return { token, user };
}

const _kiloFillRetryAt = new Map();

function scheduleKiloFillRetries(tabId) {
  const now = Date.now();
  const last = _kiloFillRetryAt.get(tabId) || 0;
  if (now - last < 2500) return;
  _kiloFillRetryAt.set(tabId, now);
  [400, 1200, 2500, 5000].forEach((ms) => {
    setTimeout(() => {
      chrome.tabs.get(tabId).then((tab) => {
        fillTabNow(tabId, (tab && tab.url) || '', { skipRetry: true }).catch(() => {});
      }).catch(() => {});
    }, ms);
  });
}

async function fillTabNow(tabId, tabUrl, opts) {
  if (!tabId) return { ok: false, reason: 'no-tab', filled: 0 };
  if (tabUrl && !_isFillableTabUrl(tabUrl)) {
    return {
      ok: false,
      reason: 'restricted-tab',
      filled: 0,
      detail: 'Chrome cannot fill Cursor desktop Settings. Open cursor.com or http://127.0.0.1:5173/cursor-settings-fill-demo.html.',
    };
  }
  await ensureFillSession();
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    });
  } catch { /* already injected or restricted */ }

  let host = '';
  let path = '';
  try {
    const parsed = new URL(tabUrl || '');
    host = parsed.hostname;
    path = parsed.pathname;
  } catch { /* noop */ }

  let keys = [];
  try {
    const fetched = await getKeysForDomain(host, { pathname: path, url: tabUrl || '' });
    if (fetched && fetched.ok && Array.isArray(fetched.keys)) keys = fetched.keys;
  } catch { keys = []; }

  let filled = 0;
  if (keys.length) {
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: injectedAutoFill,
        args: [keys],
      });
      for (const row of injected || []) {
        if (typeof row.result === 'number' && row.result > filled) filled = row.result;
      }
    } catch { /* restricted */ }
  }

  let last = null;
  try {
    last = await chrome.tabs.sendMessage(tabId, { type: 'FILL_PAGE_NOW' });
    if (last && typeof last.filled === 'number' && last.filled > filled) filled = last.filled;
  } catch { /* leftover content */ }

  try {
    const worlds = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        try {
          if (typeof window.__ksFillPageNow === 'function') return window.__ksFillPageNow();
        } catch { /* noop */ }
        return null;
      },
    });
    for (const row of worlds || []) {
      const result = row && row.result;
      if (result && typeof result.filled === 'number' && result.filled > filled) filled = result.filled;
    }
  } catch { /* noop */ }

  if ((!opts || !opts.skipRetry) && (_isKiloFillTabUrl(tabUrl) || _isKiloKeyFetchContext(host, path, tabUrl))) {
    scheduleKiloFillRetries(tabId);
  }

  const ok = !!(last && last.ok) || filled > 0 || keys.length > 0;
  return {
    ok,
    filled,
    reason: last && last.reason,
    keys: (last && last.keys) || keys.length,
  };
}

function collectPageSecrets() {
  const chunks = [];
  try { chunks.push(document.body ? document.body.innerText : ''); } catch (e) { /* noop */ }
  try {
    document.querySelectorAll('input, textarea, code, pre').forEach((el) => {
      chunks.push(el.value || el.textContent || '');
    });
  } catch (e) { /* noop */ }
  return {
    text: chunks.join('\n'),
    hostname: location.hostname,
    title: document.title || '',
    href: location.href,
    stalePanel: !!(
      document.getElementById('keyshield-detection-notice')
      || document.getElementById('keyshield-status-card')
    ),
  };
}

function maskHarvestedKey(raw) {
  const key = String(raw || '');
  if (key.length <= 18) return key;
  return `${key.slice(0, 8)}••••${key.slice(-4)}`;
}

function paintLiveDetectPanel(state) {
  const CARD = 'keyshield-status-card';
  const STALE = 'keyshield-detection-notice';
  document.querySelectorAll('#' + STALE).forEach((el) => el.remove());
  document.querySelectorAll('#' + CARD).forEach((el, i) => { if (i > 0) el.remove(); });
  let card = document.getElementById(CARD);
  if (!card) {
    card = document.createElement('div');
    card.id = CARD;
    Object.assign(card.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '999999',
      backgroundColor: '#0a0d1a',
      border: '1px solid #1c2238',
      borderRadius: '12px',
      padding: '16px',
      width: '340px',
      boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)',
      color: '#e4e4e7',
      fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    });
    (document.body || document.documentElement).appendChild(card);
  }
  const keys = Array.isArray(state && state.keys) ? state.keys : [];
  const rows = keys.map((k) => (
    '<li class="' + (k.saved ? 'ks-saved' : '') + '"><span class="ks-badge">'
    + String(k.upstream || '') + '</span><span class="ks-keytext">'
    + String(k.masked || '') + '</span><span class="ks-state">'
    + (k.saved ? '✓' : '·') + '</span></li>'
  )).join('');
  const collected = keys.length === 1 ? '1 collected' : keys.length + ' collected';
  const filledN = Math.max(0, Math.floor(Number(state && state.filled) || 0));
  const ms = state && state.ms;
  const filled = (filledN === 1 ? '1 filled' : filledN + ' filled') + ' · '
    + (ms == null || !isFinite(Number(ms)) || Number(ms) < 0 ? '—' : Math.round(Number(ms)) + 'ms');
  const saved = Math.max(0, Math.floor(Number(state && state.saved) || 0));
  const failed = Math.max(0, Math.floor(Number(state && state.failed) || 0));
  const queued = Math.max(0, Math.floor(Number(state && state.queued) || 0));
  const inVault = saved + queued;
  const save = inVault > 0
    ? ('Saved ' + inVault + ' key' + (inVault === 1 ? '' : 's') + ' to KeyShield vault.')
    : ('Saved ' + saved + ', ' + failed + ' failed.');
  card.innerHTML = ''
    + '<div style="font-size:14px;font-weight:600">KeyShield — Sovereign Vault</div>'
    + '<div style="font-size:22px;font-weight:700;line-height:1.1">' + (state && state.signed ? 'signed' : 'Sign in') + '</div>'
    + '<div style="font-size:12px;color:#34d399">' + collected + '</div>'
    + '<ul class="ks-list" style="list-style:none;margin:0;padding:0;max-height:170px;overflow:auto">' + rows + '</ul>'
    + '<div style="font-size:12px;color:' + (failed ? '#f87171' : '#34d399') + '">' + save + '</div>'
    + '<div style="font-size:12px;color:#a1a1aa">' + filled + '</div>'
    + '<div style="font-size:12px;color:#34d399">detect on · ok 1.2.5</div>';
}

async function pushDetectState(tabId, state) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'KS_DETECT_STATE', state });
  } catch { /* leftover or dead content */ }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: paintLiveDetectPanel,
      args: [state],
    });
  } catch { /* restricted */ }
}

function injectedAutoFill(keys) {
  if (!keys || !keys.length) return 0;
  const href = String(location.href || '');
  const cursorish = /cursor\.com|cursor\.sh|cursor-settings-fill-demo|\/journey\/cursor|cursor\.html|\/story/i.test(href)
    || location.hostname === 'cursor.demo.localhost';
  const kiloish = /(?:^|\.)kilo\.ai(?:[:/]|$)|kilo-byok-fill-demo|kilo\.demo\.localhost/i.test(href);
  function hay(el) {
    const bits = [
      el.getAttribute('name') || '',
      el.getAttribute('placeholder') || '',
      el.getAttribute('aria-label') || '',
      el.id || '',
    ];
    const item = el.closest && el.closest('.setting-item, [class*="setting-item"]');
    if (item) {
      const lab = item.querySelector('.setting-item-label, .setting-item-title, label');
      if (lab) bits.push(lab.textContent || '');
    }
    const wrapped = el.closest && el.closest('label');
    if (wrapped) bits.push(wrapped.textContent || '');
    const prev = el.previousElementSibling;
    if (prev && /^(LABEL|SPAN|P|DIV|H[1-6])$/.test(prev.tagName)) bits.push(prev.textContent || '');
    return bits.join(' ').toLowerCase();
  }
  function match(h) {
    if (/nvidia|nim|nvapi/.test(h)) return 'nvidia';
    if (/openrouter|sk-or/.test(h)) return 'openrouter';
    if (/anthropic|claude|sk-ant/.test(h)) return 'anthropic';
    if (/openai|chatgpt|gpt|sk-proj/.test(h)) return 'openai';
    if (/groq|gsk_/.test(h)) return 'groq';
    if (/cursor|crsr/.test(h)) return 'cursor';
    if (/kilo|byok/.test(h)) return 'openrouter';
    return null;
  }
  function login(h) {
    if (/(sign[\s-]?in|log[\s-]?in|email|username|account password)/.test(h)) return true;
    return /\bpassword\b/.test(h) && !/\b(key|token|secret|api|openai|anthropic|cursor|claude|openrouter|nvidia)\b/.test(h);
  }
  function looksKey(h) {
    return /\bkey\b|api[\s_-]?key|\bapi\b|\btoken\b|\bsecret\b|\bopenai\b|\banthropic\b|\bopenrouter\b|\bnvidia\b|\bnim\b|\bnvapi\b|\bgroq\b|\bcursor\b|\bclaude\b|\bkilo\b|\bbyok\b/.test(h);
  }
  function setVal(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const last = el.value;
    try {
      const tracker = el._valueTracker;
      if (tracker && typeof tracker.setValue === 'function') tracker.setValue(last);
    } catch { /* noop */ }
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: 'insertFromPaste' }));
    } catch {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const remaining = keys.filter((k) => k && k.value);
  const nodes = document.querySelectorAll('input[type=password], input[type=text], input:not([type]), textarea');
  let filled = 0;
  nodes.forEach((el) => {
    if (el.disabled || el.readOnly) return;
    if (String(el.value || '').trim()) return;
    const ac = String(el.getAttribute('autocomplete') || '').toLowerCase();
    if (ac.includes('current-password') || ac.includes('username') || ac.includes('email')) return;
    const h = hay(el);
    if (login(h)) return;
    const wanted = match(h);
    let key = wanted ? remaining.find((k) => k.upstream === wanted) : null;
    if (!key && (cursorish || kiloish || looksKey(h))) {
      const order = kiloish
        ? ['openrouter', 'nvidia', 'openai', 'anthropic', 'groq', 'cursor']
        : ['cursor', 'openai', 'nvidia', 'openrouter', 'anthropic', 'groq'];
      for (const u of order) {
        key = remaining.find((k) => k.upstream === u);
        if (key) break;
      }
    }
    if (!key && (cursorish || kiloish)) key = remaining[0];
    if (!key) return;
    setVal(el, key.value);
    const idx = remaining.findIndex((k) => k.value === key.value && k.upstream === key.upstream);
    if (idx >= 0) remaining.splice(idx, 1);
    filled += 1;
  });
  return filled;
}

function isCursorFillTabUrl(url) {
  const raw = String(url || '');
  if (/cursor\.com|cursor\.sh|cursor-settings-fill-demo|\/journey\/cursor|cursor\.html/i.test(raw)) return true;
  try {
    const parsed = new URL(raw);
    const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    const dash = /ks\.aileena\.xyz|keyshield\.dev|up\.railway\.app|vercel\.app/.test(parsed.hostname);
    if ((local || dash) && (parsed.pathname === '/story' || parsed.pathname.startsWith('/story/'))) return true;
  } catch { /* noop */ }
  return false;
}

async function fillCursorTabsFromPending() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch { return 0; }
  let filled = 0;
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !_isFillableTabUrl(tab.url)) continue;
    let host = '';
    let path = '';
    try {
      const parsed = new URL(tab.url);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch { continue; }
    const mapped = _upstreamsForDomain(host);
    const cursorish = isCursorFillTabUrl(tab.url) || _isCursorKeyFetchContext(host, path, tab.url);
    const kiloish = _isKiloKeyFetchContext(host, path, tab.url);
    if (!cursorish && !kiloish && !mapped.length) continue;
    let keys = [];
    try {
      const fetched = await getKeysForDomain(host, { pathname: path, title: tab.title || '', url: tab.url });
      if (fetched && fetched.ok && Array.isArray(fetched.keys)) keys = fetched.keys;
    } catch { keys = []; }
    if (!keys.length) {
      keys = await pendingKeysForUpstreams(
        mapped.length ? mapped : (kiloish ? KILO_FILL_UPSTREAMS : CURSOR_FILL_UPSTREAMS),
      );
    }
    if (!keys.length) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js'],
      });
    } catch { /* already injected or restricted */ }
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: injectedAutoFill,
        args: [keys],
      });
      for (const row of injected || []) {
        if (typeof row.result === 'number' && row.result > filled) filled = row.result;
      }
    } catch { /* restricted */ }
    try {
      const fill = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_PAGE_NOW' });
      if (fill && typeof fill.filled === 'number' && fill.filled > filled) filled = fill.filled;
    } catch { /* leftover content */ }
  }
  return filled;
}

async function injectDetectOnAllTabs(opts) {
  if (!chrome.scripting || !chrome.tabs) return { injected: 0, saved: 0, failed: 0 };
  const stored = await getStoredToken();
  if (!stored.token) await harvestTokenFromDashboardTabs();
  const again = await getStoredToken();
  if (again.token) {
    try { await chrome.storage.local.set({ ks_auto_store: true }); } catch { /* noop */ }
  }
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch { return { injected: 0, saved: 0, failed: 0 }; }
  let injected = 0;
  let saved = 0;
  let failed = 0;
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/^https?:/i.test(tab.url)) continue;
    let page = null;
    try {
      const scraped = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: collectPageSecrets,
      });
      page = (scraped || []).map((row) => row && row.result).filter(Boolean)[0] || null;
    } catch { /* restricted */ }
    const started = Date.now();
    const painted = [];
    if (page) {
      const keys = harvestVisibleKeysFromText(page.text, page.hostname, page.href);
      const labels = harvestPageKeyLabels(page.text);
      for (const hit of keys) {
        let queued = false;
        try {
          await queuePendingVault({ upstream: hit.upstream, value: hit.key });
          queued = true;
        } catch { /* dashboard flush */ }
        let ok = false;
        if (again.token) {
          const result = await directStore({
            upstream: hit.upstream,
            value: hit.key,
            name: labelForHarvestedKey(hit.key, labels),
            domain: page.hostname,
            pageTitle: page.title || tab.title || '',
          });
          ok = !!(result && result.ok);
          if (ok) saved += 1;
          else failed += 1;
        } else if (!queued) {
          failed += 1;
        }
        painted.push({
          upstream: hit.upstream,
          masked: maskHarvestedKey(hit.key),
          saved: ok || queued,
        });
      }
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js'],
      });
      injected += 1;
    } catch { /* already declared or restricted */ }
    let filled = 0;
    try {
      const fill = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_PAGE_NOW' });
      if (fill && typeof fill.filled === 'number') filled = fill.filled;
    } catch { /* restricted or dead content */ }
    const queuedN = painted.filter((row) => row.saved).length;
    const state = {
      signed: !!again.token,
      keys: painted,
      saved: painted.filter((row) => row.saved).length,
      failed: painted.filter((row) => !row.saved).length,
      queued: queuedN,
      filled,
      ms: Date.now() - started,
      force: true,
    };
    if (painted.length || (page && page.stalePanel) || (opts && tab.id === opts.focusTabId)) {
      await pushDetectState(tab.id, state);
    }
  }
  let filledAll = 0;
  try { filledAll = await fillCursorTabsFromPending(); } catch { /* cursor tab missing */ }
  // Silent harvest — toolbar popup lists saved keys. Do not toast.
  return { injected, saved, failed, filled: filledAll };
}

if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status !== 'complete' && !info.url) return;
    const url = (tab && tab.url) || info.url || '';
    if (!url || !_isFillableTabUrl(url)) return;
    const kilo = _isKiloFillTabUrl(url);
    chrome.storage.local.get(['ks_token', 'ks_auto_store', 'ks_pending_vault', 'ks_user'], (out) => {
      const pending = (out && out.ks_pending_vault) || [];
      const hasAuth = !!(out && (out.ks_token || out.ks_auto_store || pending.length || out.ks_user));
      if (!hasAuth && !kilo) return;
      fillTabNow(tabId, url).catch(() => {});
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[KeyShield] installed — detect toast on every visible API key');
  injectDetectOnAllTabs().catch(() => {});
  _purgeAuditLogInline().then((result) => {
    const total = result.deletedByAge + result.deletedByCap;
    if (total > 0) console.log('[KeyShield] onInstalled audit purge:', result);
  }).catch((e) => console.warn('[KeyShield] onInstalled audit purge failed:', e));
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    injectDetectOnAllTabs().catch(() => {});
  });
}

const toolbarAction = (chrome.action && chrome.action.onClicked)
  ? chrome.action
  : (chrome.browserAction && chrome.browserAction.onClicked)
    ? chrome.browserAction
    : null;
if (toolbarAction) {
  toolbarAction.onClicked.addListener((tab) => {
    injectDetectOnAllTabs({ focusTabId: tab && tab.id }).catch(() => {});
  });
}

// ── Audit log retention (inline JS, mirrors lib/audit-retention.ts) ──────────

async function _purgeAuditLogInline() {
  const AUDIT_LOG_KEY = 'ks_audit_log';
  const RETENTION_POLICY_KEY = 'ks_audit_retention';
  const DEFAULT_MAX_AGE_DAYS = 30;
  const DEFAULT_MAX_ENTRIES = 500;

  const stored = await chrome.storage.local.get([AUDIT_LOG_KEY, RETENTION_POLICY_KEY]);
  const policy = stored[RETENTION_POLICY_KEY] || {};
  const maxAgeDays = typeof policy.maxAgeDays === 'number' ? policy.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
  const maxEntries = typeof policy.maxEntries === 'number' ? policy.maxEntries : DEFAULT_MAX_ENTRIES;

  const rawLogs = stored[AUDIT_LOG_KEY] || [];
  const cutoff = Date.now() - maxAgeDays * 86400000;

  const afterAge = rawLogs.filter((e) => typeof e?.timestamp === 'number' && e.timestamp >= cutoff);
  const deletedByAge = rawLogs.length - afterAge.length;

  const sorted = afterAge.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const afterCap = sorted.slice(0, maxEntries);
  const deletedByCap = afterAge.length - afterCap.length;

  await chrome.storage.local.set({ [AUDIT_LOG_KEY]: afterCap });
  return { deletedByAge, deletedByCap };
}
