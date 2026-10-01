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
const DEFAULT_KS_BASE       = 'https://keyshield-production.up.railway.app';
const DEFAULT_DASHBOARD_URL = 'https://keyshield.dev';

// Stale URLs we silently upgrade to production when seen in storage so the
// Sign-in tab actually opens a reachable page after dev servers are stopped.
const STALE_DASHBOARD_DEFAULTS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
// Older builds defaulted to a maintainer-owned host; migrate unless the user pinned custom URLs.
const LEGACY_API_BASES = ['https://keyshield-production.up.railway.app'];
const LEGACY_DASHBOARD_URLS = ['https://app.ks.aileena.xyz'];
const PIN_PREF_KEY = 'ks_url_pref_pinned';

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

// ── Domain → upstream map for auto-fill (subset of content.js PROVIDERS) ────
// Used by GET_KEYS_FOR_DOMAIN to resolve which vault items belong to a page.
const DOMAIN_TO_UPSTREAM = {
  'platform.openai.com':   'openai',
  'openai.com':            'openai',
  'console.anthropic.com': 'anthropic',
  'anthropic.com':         'anthropic',
  'console.groq.com':      'groq',
  'groq.com':              'groq',
  'console.mistral.ai':    'mistral',
  'mistral.ai':            'mistral',
  'dashboard.cohere.com':  'cohere',
  'cohere.com':            'cohere',
  'cohere.ai':             'cohere',
  'dashboard.helius.dev':  'helius',
  'helius.dev':            'helius',
  'helius.xyz':            'helius',
  'dashboard.0x.org':      '0x',
  '0x.org':                '0x',
  'dashboard.alchemy.com': 'alchemy',
  'alchemy.com':           'alchemy',
};

function _upstreamForDomain(domain) {
  if (!domain) return null;
  if (DOMAIN_TO_UPSTREAM[domain]) return DOMAIN_TO_UPSTREAM[domain];
  // suffix match (e.g. foo.openai.com → openai)
  for (const d of Object.keys(DOMAIN_TO_UPSTREAM)) {
    if (domain === d || domain.endsWith('.' + d)) return DOMAIN_TO_UPSTREAM[d];
  }
  return null;
}

// In-memory decryption cache: id → { value, expires }
const _decryptCache = new Map();
const _DECRYPT_TTL_MS = 30_000;

async function _decryptCipher(keyBytes, cipherB64u, ivB64u) {
  const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const ct = _b64uDec(cipherB64u);
  const iv = _b64uDec(ivB64u);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return new TextDecoder().decode(pt);
}

async function getKeysForDomain(domain) {
  const keyBytes = await _getVaultKeyBytes();
  if (!keyBytes) return { ok: false, reason: 'no-vault-key' };

  const upstream = _upstreamForDomain(domain);
  // We still query the vault even without a known upstream — caller may match
  // by hostname suffix on their side. But for now, no match → no keys.
  if (!upstream) return { ok: false, reason: 'no-upstream-match' };

  const { token } = await getStoredToken();
  const { apiBase } = await getApiBase();
  const headers = { 'X-Dev-Mode': '1' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let items;
  try {
    const r = await fetch(`${apiBase}/manage/vault`, { headers });
    if (!r.ok) return { ok: false, reason: `http-${r.status}` };
    items = await r.json();
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e) };
  }
  if (!Array.isArray(items)) return { ok: false, reason: 'bad-response' };

  const matched = items.filter((it) =>
    it && it.upstream === upstream &&
    Number(it.cipher_v) === 1 &&
    typeof it.cipher === 'string' && it.cipher !== '' &&
    typeof it.iv === 'string' && it.iv !== ''
  );
  if (matched.length === 0) return { ok: false, reason: 'no-keys' };

  const now = Date.now();
  const out = [];
  for (const it of matched) {
    let value;
    const cached = _decryptCache.get(it.id);
    if (cached && cached.expires > now) {
      value = cached.value;
    } else {
      try {
        value = await _decryptCipher(keyBytes, it.cipher, it.iv);
        _decryptCache.set(it.id, { value, expires: now + _DECRYPT_TTL_MS });
      } catch (e) {
        // skip items we can't decrypt (key mismatch, corrupt cipher, etc.)
        continue;
      }
    }
    out.push({ id: it.id, upstream: it.upstream, name: it.name, value });
  }
  if (out.length === 0) return { ok: false, reason: 'decrypt-failed' };
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
  if (
    !pinned &&
    LEGACY_DASHBOARD_URLS.some((u) => dash === u || dash.startsWith(`${u}/`))
  ) {
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

async function directStore({ upstream, value }) {
  try {
    const { token } = await getStoredToken();
    const { apiBase } = await getApiBase();

    const headers = {
      'Content-Type': 'application/json',
      'X-Dev-Mode':   '1',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let body;
    const keyBytes = await _getVaultKeyBytes();
    if (keyBytes) {
      try {
        const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          aesKey,
          new TextEncoder().encode(String(value ?? '')),
        ));
        // Keep plaintext `value` alongside the cipher. /vproxy and the
        // Rust vault reader inject from the plaintext column. Cipher-only
        // rows saved the key and then every RPC call returned 422.
        body = JSON.stringify({
          upstream,
          name:     `${upstream} key`,
          value:    String(value ?? ''),
          cipher:   _b64uEnc(ct),
          iv:       _b64uEnc(iv),
          cipher_v: 1,
        });
      } catch (encErr) {
        console.warn('[KeyShield] client encrypt failed — falling back to plaintext:', encErr);
        body = JSON.stringify({ upstream, value, name: `${upstream} key` });
      }
    } else {
      console.warn('[KeyShield] vault key not registered — saving plaintext (less secure). Sign into the dashboard at keyshield.dev to enable client-side encryption.');
      body = JSON.stringify({ upstream, value: String(value ?? ''), name: `${upstream} key` });
    }

    try {
      const r = await fetch(`${apiBase}/manage/store`, { method: 'POST', headers, body });
      if (r.status === 401) {
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
  } catch (e) {
    console.error('[KeyShield] directStore exception:', e);
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
  const headers = { 'X-Dev-Mode': '1' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

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
  const headers = { 'Content-Type': 'application/json', 'X-Dev-Mode': '1' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let imported = 0;
  let skipped  = 0;
  const errors = [];

  for (const it of backup.items) {
    if (!it || typeof it.id !== 'string') { skipped++; continue; }
    const body = JSON.stringify({
      id:       it.id,
      upstream: it.upstream,
      name:     it.name,
      cipher:   it.cipher,
      iv:       it.iv,
      cipher_v: it.cipher_v,
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

  // MV3 wake: content script primes the service worker before bulk save.
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

  // Auto-fill: return decrypted vault values for a given page domain.
  if (message.type === 'GET_KEYS_FOR_DOMAIN') {
    (async () => {
      try {
        const result = await getKeysForDomain(message.domain || '');
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
      const stored = await chrome.storage.local.get(['ks_dashboard_url', PIN_PREF_KEY]);
      let dashboardUrl = stored.ks_dashboard_url || DEFAULT_DASHBOARD_URL;
      const pinned = !!stored[PIN_PREF_KEY];
      const looksLikeBackend = /:800[01](\/|$)/.test(dashboardUrl);
      const looksStaleLocal  = !pinned && STALE_DASHBOARD_DEFAULTS.some(
        (u) => dashboardUrl === u || dashboardUrl.startsWith(u + '/'),
      );
      const looksLegacyDash  = !pinned && LEGACY_DASHBOARD_URLS.some(
        (u) => dashboardUrl === u || dashboardUrl.startsWith(`${u}/`),
      );
      if (looksLikeBackend || looksStaleLocal || looksLegacyDash || !dashboardUrl) {
        dashboardUrl = DEFAULT_DASHBOARD_URL;
        try { await chrome.storage.local.set({ ks_dashboard_url: dashboardUrl }); } catch { /* noop */ }
      }
      chrome.tabs.create({ url: dashboardUrl });
      sendResponse({ ok: true, dashboardUrl });
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

      const result = await directStore({ upstream, value });
      if (result.ok) {
        notify('KeyShield', `Saved ${upstream} key to KeyShield`);
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

chrome.runtime.onInstalled.addListener(() => {
  console.log('[KeyShield] v1.1 installed — auto-detect + direct-store enabled');
  // Enforce audit log retention on install/update (inline — no TS imports in background.js)
  _purgeAuditLogInline().then((result) => {
    const total = result.deletedByAge + result.deletedByCap;
    if (total > 0) console.log('[KeyShield] onInstalled audit purge:', result);
  }).catch((e) => console.warn('[KeyShield] onInstalled audit purge failed:', e));
});

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
