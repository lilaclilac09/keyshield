/**
 * KeyShield Content Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Watches every page for exposed API keys and shows a one-click "Save to vault"
 * notification. Domain-aware: when you're on platform.openai.com, OpenAI keys
 * get the highest priority match; the same pattern would be ignored if found
 * on a random blog (avoids false positives from tutorial code).
 *
 * Maps detected provider → KeyShield backend `upstream` so a single click
 * stores the key under the correct vault namespace.
 *
 * ── Detect → save flow audit (2026-05) ────────────────────────────────────
 *   detect (this file)
 *      └─ scan() text + inputs → handleMatch() → showNotification()
 *           ├─ "Save to vault" click
 *           │     └─ chrome.runtime.sendMessage({type:'SAVE_KEY', payload})
 *           │           └─ background.js → POST /manage/store {upstream, apiKey}
 *           │                 ├─ 200 → chrome.notifications + sendResponse(ok:true)
 *           │                 │         → in-page toast "Saved to vault"
 *           │                 ├─ 401 → fallback to dashboard prefill
 *           │                 └─ network → fallback to dashboard prefill
 *           ├─ "Dismiss" click       → just remove the notification
 *           └─ "Hide on this domain" → store HOST in dismissed_domains and stop
 *
 *   Gaps that USED to exist (closed in this revision):
 *     - background.js was hardcoded to localhost:8000.   FIX: storage override.
 *     - sendMessage was fire-and-forget, no UI feedback. FIX: callback + toast.
 *     - No way to silence the toast on noisy domains.    FIX: dismissed_domains.
 *     - Manifest had no prod host_permissions.           FIX: keyshield.dev/*.
 *
 *   Known remaining gaps (intentional, not in scope here):
 *     - mistral/cohere/alchemy generic 32–40 char regexes only fire on-domain
 *       (requiresDomain=true) but inside iframes the host check uses the top
 *       window's hostname; a same-origin iframe is fine, cross-origin iframe
 *       won't trigger. Acceptable for the OpenAI / Helius "happy path" demo.
 *     - Dashboard hosts also get session-bridge.js at document_start so an
 *       existing chrome.storage token lands in localStorage before React.
 */

// ── Provider definitions ────────────────────────────────────────────────────
//
// Each provider has:
//   id         — KeyShield backend upstream name (must match server.py UPSTREAMS)
//   name       — human label
//   label      — 3-letter badge for the in-page toast
//   patterns   — list of regex (multiple to cover variants)
//   domains    — hostnames where this key is most likely (priority boost)
//   minLen     — sanity floor

// background.js re-runs chrome.scripting.executeScript({files:['content.js']})
// (fill tab / fill-from-pending / popup reinject) on tabs that already have the
// manifest content script. Guard so a second run is a no-op instead of
// "Identifier 'PROVIDERS' has already been declared".
(function ksContentMain() {
if (window.__ksContentLoaded) return;
window.__ksContentLoaded = true;

const PROVIDERS = [
  {
    id:       'nvidia',
    name:     'NVIDIA NIM',
    label:    'NV',
    patterns: [
      /nvapi-[A-Za-z0-9_-]{16,}/g,
    ],
    domains:  [
      'build.nvidia.com',
      'integrate.api.nvidia.com',
      'api.nvidia.com',
      'nim.nvidia.com',
      'catalog.ngc.nvidia.com',
      'ngc.nvidia.com',
      'nvidia.com',
      'nvidia.demo.localhost',
    ],
    minLen:   16,
  },
  {
    id:       'cursor',
    name:     'Cursor',
    label:    'CUR',
    patterns: [
      /key_[A-Za-z0-9_-]{16,}/g,
      /crsr[_-][A-Za-z0-9_-]{10,}/g,
    ],
    domains:  ['cursor.com', 'www.cursor.com', 'cursor.sh'],
    minLen:   16,
  },
  {
    id:       'openrouter',
    name:     'OpenRouter',
    label:    'OR',
    patterns: [
      /sk-or-[A-Za-z0-9_-]{12,}/g,
    ],
    domains:  ['openrouter.ai', 'openrouter.demo.localhost', 'kilo.ai', 'app.kilo.ai', 'www.kilo.ai', 'kilo.demo.localhost'],
    minLen:   16,
  },
  {
    id:       'openai',
    name:     'OpenAI',
    label:    'AI',
    patterns: [
      /sk-proj-[A-Za-z0-9_-]{20,}/g,        // new-format project key
      /sk-svcacct-[A-Za-z0-9_-]{20,}/g,      // service account
      /sk-admin-[A-Za-z0-9_-]{20,}/g,        // admin key
      /sk-[A-Za-z0-9]{40,}/g,                // legacy 48+ char
    ],
    domains:  ['platform.openai.com', 'openai.com'],
    minLen:   30,
  },
  {
    id:       'anthropic',
    name:     'Anthropic Claude',
    label:    'AI',
    patterns: [
      /sk-ant-api\d{2}-[A-Za-z0-9_-]{50,}/g,
    ],
    domains:  ['console.anthropic.com', 'anthropic.com'],
    minLen:   60,
  },
  {
    id:       'groq',
    name:     'Groq',
    label:    'AI',
    patterns: [/gsk_[A-Za-z0-9]{40,}/g],
    domains:  ['console.groq.com', 'groq.com'],
    minLen:   40,
  },
  {
    id:       'mistral',
    name:     'Mistral AI',
    label:    'AI',
    patterns: [/[A-Za-z0-9]{32}/g],   // generic 32-char — needs domain match
    domains:  ['console.mistral.ai', 'mistral.ai'],
    minLen:   32,
    requiresDomain: true,             // never trigger off-domain
  },
  {
    id:       'cohere',
    name:     'Cohere',
    label:    'AI',
    patterns: [/[A-Za-z0-9]{40}/g],
    domains:  ['dashboard.cohere.com', 'cohere.com', 'cohere.ai'],
    minLen:   40,
    requiresDomain: true,
  },
  {
    id:       'helius',
    name:     'Helius RPC',
    label:    'SOL',
    patterns: [
      /helius_auth_[A-Za-z0-9]{20,}/g,
      // Helius API keys also appear as UUIDs on dashboard.helius.dev
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    ],
    domains:  ['dashboard.helius.dev', 'helius.dev', 'helius.xyz'],
    minLen:   20,
    requiresDomain: true,             // UUID-only keys = high false positive
  },
  {
    id:       '0x',
    name:     '0x Protocol',
    label:    'DEX',
    patterns: [/[A-Za-z0-9-]{36}/g],
    domains:  ['dashboard.0x.org', '0x.org'],
    minLen:   36,
    requiresDomain: true,
  },
  {
    id:       'alchemy',
    name:     'Alchemy',
    label:    'RPC',
    patterns: [/[A-Za-z0-9_-]{32}/g],
    domains:  ['dashboard.alchemy.com', 'alchemy.com'],
    minLen:   32,
    requiresDomain: true,
  },
  {
    id:       'vercel',
    name:     'Vercel',
    label:    'VC',
    patterns: [/(?:vercel_|vcp_)[A-Za-z0-9_]{20,}/g],
    domains:  ['vercel.com', 'vercel.demo.localhost'],
    minLen:   24,
  },
  {
    id:       'github',
    name:     'GitHub',
    label:    'GH',
    patterns: [/(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g],
    domains:  ['github.com', 'github.demo.localhost'],
    minLen:   24,
  },
];

// ── State ───────────────────────────────────────────────────────────────────

const detectedKeys   = new Map();   // key -> { provider, onDomain, saved }
let   panelEl        = null;        // the multi-key floating panel (null when hidden)
let   domainDismissed = false;      // set asynchronously below
const AUTO_STORE_KEY = 'ks_auto_store';
let   autoStoreAllowed = false;
let   loggedIn = false;
let   autoStoreInFlight = false;
let   extensionContextDead = false;
const HOST = window.location.hostname;
const QUICK_AUTH_TARGETS = ['openrouter.ai', 'scvd.store'];
const PAYMENT_INTERCEPT_TARGETS = ['openrouter.ai', 'scvd.store', 'crypto-regime-api.onrender.com'];
let lastQuickAuthPromptAt = 0;
const QUICK_AUTH_COOLDOWN_MS = 5000;

// UUIDs that appear in the page URL itself are routing IDs (e.g. the
// /<account-uuid>/api-keys path on dashboard.helius.dev), NOT credentials.
const URL_UUIDS = new Set(
  (location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [])
    .map((s) => s.toLowerCase()),
);

// Read user's per-domain dismissals from chrome.storage.local. Populated once
// at startup; updated when "Hide on this domain" is clicked.
function loadDismissedDomains() {
  try {
    chrome.storage?.local?.get?.(['dismissed_domains'], (out) => {
      const list = (out && out.dismissed_domains) || [];
      domainDismissed = Array.isArray(list) && list.includes(HOST);
      if (domainDismissed) console.log(`[KeyShield] ${HOST} is in dismissed_domains — auto-detect muted`);
    });
  } catch {
    // Extension context might not be available (e.g. in dev-server preview).
    // Fail open: keep auto-detect on.
  }
}

function dismissThisDomain() {
  try {
    chrome.storage?.local?.get?.(['dismissed_domains'], (out) => {
      const list = (out && Array.isArray(out.dismissed_domains)) ? out.dismissed_domains : [];
      if (!list.includes(HOST)) list.push(HOST);
      chrome.storage.local.set({ dismissed_domains: list }, () => {
        domainDismissed = true;
      });
    });
  } catch {/* noop */}
}

// Domain → provider boost (when a page has a matching provider domain,
// we treat its keys as high-confidence)
function isOnDomain(provider) {
  if (provider.domains.some(d => HOST === d || HOST.endsWith('.' + d))) return true;
  if (HOST.endsWith('.demo.localhost')) {
    const slug = HOST.split('.')[0];
    return provider.id === slug || provider.domains.some(d => d.startsWith(slug));
  }
  return false;
}

function ksHostMatches(hostname, allowList) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return allowList.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// ── Scanner ─────────────────────────────────────────────────────────────────

function collectScanText() {
  const chunks = [];
  if (document.body) chunks.push(document.body.innerText || '');
  const nodes = document.querySelectorAll(
    'input, textarea, code, pre, [contenteditable="true"], td, th, [role="cell"], [role="gridcell"]',
  );
  for (const el of nodes) {
    chunks.push(el.value || el.textContent || '');
  }
  return chunks.join('\n');
}

function ksLooksLikePageKeyName(name) {
  const text = String(name || '').trim();
  if (!text || /^(name|names|api key|api keys|key|keys|expires|expiry|created|status|actions)$/i.test(text)) return false;
  if (/https?:|[•…]|sk-|gsk_|helius_auth_/i.test(text)) return false;
  if (/^[0-9a-f-]{8,}$/i.test(text)) return false;
  return /^[A-Za-z][A-Za-z0-9 _-]{2,47}$/.test(text);
}

function ksKeyPrefixFromCell(text) {
  const cell = String(text || '').trim();
  const uuid = cell.match(/[0-9a-f]{8}(?:-[0-9a-f*]{4}){3}-[0-9a-f*]{12}/i);
  if (uuid) return uuid[0].slice(0, 8).toLowerCase();
  return '';
}

function ksParseExpiryCell(text) {
  const cell = String(text || '').trim();
  const iso = cell.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const us = cell.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!us) return '';
  const a = Number(us[1]);
  const b = Number(us[2]);
  const month = a > 12 ? b : a;
  const day = a > 12 ? a : b;
  return `${us[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function ksCollectPageKeyRecords() {
  const records = [];
  const rows = document.querySelectorAll('tr, [role="row"]');
  rows.forEach((row) => {
    const cells = [...row.querySelectorAll('td, th, [role="cell"], [role="gridcell"]')]
      .map((c) => String(c.innerText || c.textContent || '').trim())
      .filter(Boolean);
    if (cells.length < 2) return;
    let name = '';
    let prefix = '';
    let expires = '';
    for (const cell of cells) {
      if (!name && ksLooksLikePageKeyName(cell)) name = cell;
      const p = ksKeyPrefixFromCell(cell);
      if (p) prefix = p;
      const exp = ksParseExpiryCell(cell);
      if (exp) expires = exp;
    }
    if (name && prefix) records.push({ name, prefix, expiresAt: expires });
  });
  const lines = collectScanText().split(/\n+/).map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!ksLooksLikePageKeyName(lines[i])) continue;
    const prefix = ksKeyPrefixFromCell(lines[i + 1]);
    if (!prefix) continue;
    if (records.some((r) => r.prefix === prefix && r.name === lines[i])) continue;
    records.push({ name: lines[i], prefix, expiresAt: ksParseExpiryCell(lines[i + 2] || '') });
  }
  return records;
}

function ksLabelForKey(key) {
  const prefix = ksKeyPrefixFromCell(key) || String(key || '').slice(0, 8).toLowerCase();
  const hit = ksCollectPageKeyRecords().find((r) => prefix && prefix.startsWith(r.prefix));
  return hit || { name: '', prefix, expiresAt: '' };
}

let scanTimer = 0;
function scheduleScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = 0;
    scan();
  }, 200);
}

function scan() {
  if (domainDismissed) return;
  if (!document.body) return;
  const text = collectScanText();

  for (const provider of PROVIDERS) {
    const onDomain = isOnDomain(provider);
    if (provider.requiresDomain && !onDomain) continue;

    for (const regex of provider.patterns) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        if (m[0].length >= provider.minLen) handleMatch(m[0], provider, onDomain);
      }
    }
  }
}

function handleMatch(key, provider, onDomain) {
  if (URL_UUIDS.has(key.toLowerCase())) return;
  const prev = detectedKeys.get(key);
  if (prev && prev.saved === true) return;
  if (!prev) {
    detectedKeys.set(key, { provider, onDomain, saved: false });
    console.log(`[KeyShield] detected ${provider.name} key on ${HOST} (onDomain=${onDomain})`);
  }
  renderPanel();
  maybeAutoStore();
}

function detectIsArmed() {
  return !extensionContextDead && !!(autoStoreAllowed || loggedIn);
}

function isExtensionContextDead(detail) {
  return /Extension context invalidated|chrome\.runtime is not available|Cannot access a chrome\./i.test(
    String(detail || ''),
  );
}

function shouldRetryBackgroundSend(detail) {
  const text = String(detail || '');
  if (isExtensionContextDead(text)) return false;
  return /Receiving end does not exist|The message port closed/i.test(text);
}

function markExtensionContextDead() {
  extensionContextDead = true;
}

function reloadDeadDetectTab() {
  try {
    if (sessionStorage.getItem('ks_dead_reloaded') === '1') return;
    sessionStorage.setItem('ks_dead_reloaded', '1');
    location.reload();
  } catch { /* noop */ }
}

function takeOverStaleDetectPanel() {
  try {
    document.querySelectorAll('#keyshield-detection-notice').forEach((el) => el.remove());
    document.querySelectorAll('#keyshield-status-card').forEach((el) => {
      if (el !== panelEl) el.remove();
    });
  } catch { /* noop */ }
}

function runtimeGone() {
  try {
    return typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id;
  } catch {
    return true;
  }
}

function formatBulkSaveFailure(opts) {
  const saved = Math.max(0, Math.floor(Number(opts && opts.saved) || 0));
  const failed = Math.max(0, Math.floor(Number(opts && opts.failed) || 0));
  let text = `Saved ${saved}, ${failed} failed.`;
  const reason = String((opts && opts.reason) || '');
  const detail = String((opts && opts.detail) || '');
  if (isExtensionContextDead(detail) || reason === 'extension-dead') {
    return { text: `${text} Dead toast cannot save. New detect is writing the vault — keep this tab open.`, reload: true };
  }
  if (reason === 'extension' && isExtensionContextDead(detail)) {
    return { text: `${text} Dead toast cannot save. New detect is writing the vault — keep this tab open.`, reload: true };
  }
  if (reason === 'token-expired' || reason === 'no-token') {
    return { text: `${text} Sign in so saves land in your vault.`, reload: false };
  }
  if (reason === 'network') {
    return { text: `${text} Backend unreachable.`, reload: false };
  }
  if (reason === 'extension') {
    return { text: `${text} Extension messaging error${detail ? ` (${detail})` : ''}.`, reload: false };
  }
  if (reason) return { text: `${text} (${reason})`, reload: false };
  return { text: `${text} Click Retry or open DevTools.`, reload: false };
}

function loadAutoStorePref() {
  try {
    chrome.storage?.local?.get?.([AUTO_STORE_KEY, 'ks_token'], (out) => {
      autoStoreAllowed = !!(out && out[AUTO_STORE_KEY]);
      loggedIn = !!(out && out.ks_token);
      if (detectIsArmed()) maybeAutoStore();
    });
  } catch { /* fail closed — wait for Allow / Sign-in */ }
}

function watchAutoStorePref() {
  try {
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'local') return;
      if (changes[AUTO_STORE_KEY]) autoStoreAllowed = !!changes[AUTO_STORE_KEY].newValue;
      if (changes.ks_token) loggedIn = !!changes.ks_token.newValue;
      if (detectIsArmed()) {
        scheduleScan();
        maybeAutoStore();
      }
    });
  } catch { /* noop */ }
}

function grantAutoStore() {
  autoStoreAllowed = true;
  try { chrome.storage.local.set({ [AUTO_STORE_KEY]: true }); } catch { /* noop */ }
  return bulkSave();
}

function maybeAutoStore() {
  if (extensionContextDead || runtimeGone()) return;
  if (!detectIsArmed() || autoStoreInFlight) return;
  const unsaved = Array.from(detectedKeys.values()).filter((v) => v.saved !== true).length;
  if (unsaved === 0) return;
  autoStoreInFlight = true;
  Promise.resolve(bulkSave()).finally(() => { autoStoreInFlight = false; });
}

// ── Notification UI (multi-key panel) ───────────────────────────────────────
// A single floating panel accumulates every detected key. Each scan tick that
// finds a NEW key updates the panel in place (no notificationActive latch).
// "Save all N" bulk-POSTs each key serially with progress.

function injectStyleOnce() {
  if (document.getElementById('keyshield-style')) return;
  const style = document.createElement('style');
  style.id = 'keyshield-style';
  style.textContent = `
    @keyframes keyshield-slide { from { transform: translateY(-12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .ks-btn{cursor:pointer;border:1px solid transparent;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:500;transition:all .15s}
    .ks-btn-primary{background:#5b8cff;color:white;border-color:#5b8cff}
    .ks-btn-primary:hover{background:#7aa1ff}
    .ks-btn-primary:disabled{opacity:.6;cursor:default;background:#3d5fb8}
    .ks-btn-ghost{background:transparent;color:#71717a;border-color:#27272a}
    .ks-btn-ghost:hover{color:#fafafa;border-color:#3f3f46}
    #keyshield-status-card ul.ks-list,#keyshield-detection-notice ul.ks-list{list-style:none;margin:0;padding:0;max-height:170px;overflow-y:auto;display:flex;flex-direction:column;gap:5px}
    #keyshield-status-card ul.ks-list li,#keyshield-detection-notice ul.ks-list li{display:flex;align-items:center;gap:8px;padding:6px 8px;background:#020408;border:1px solid #131929;border-radius:6px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;color:#86efac}
    #keyshield-status-card ul.ks-list li.ks-saved,#keyshield-detection-notice ul.ks-list li.ks-saved{color:#71717a;background:#0a0d1a;border-color:#1c2238}
    #keyshield-status-card ul.ks-list li.ks-failed,#keyshield-detection-notice ul.ks-list li.ks-failed{color:#f87171;border-color:rgba(239,68,68,.3)}
    #keyshield-status-card ul.ks-list li .ks-badge,#keyshield-detection-notice ul.ks-list li .ks-badge{flex-shrink:0;background:#0e1430;padding:2px 6px;border-radius:4px;font-size:9px;color:#5b8cff;border:1px solid #1c2550;letter-spacing:.04em}
    #keyshield-status-card ul.ks-list li .ks-keytext,#keyshield-detection-notice ul.ks-list li .ks-keytext{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #keyshield-status-card ul.ks-list li .ks-state,#keyshield-detection-notice ul.ks-list li .ks-state{flex-shrink:0;font-size:11px}
  `;
  document.head.appendChild(style);
}

function maskKey(k) { return k.length <= 18 ? k : `${k.substring(0, 14)}••••••••${k.substring(k.length - 4)}`; }

function buildPanel() {
  panelEl = document.createElement('div');
  panelEl.id = 'keyshield-status-card';
  Object.assign(panelEl.style, {
    position: 'fixed', top: '20px', right: '20px', zIndex: '999999',
    backgroundColor: '#0a0d1a', border: '1px solid #1c2238', borderRadius: '12px',
    padding: '16px', width: '340px', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)',
    color: '#e4e4e7', fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    display: 'flex', flexDirection: 'column', gap: '12px', animation: 'keyshield-slide 0.18s ease-out',
  });
  document.body.appendChild(panelEl);
}

function closePanel() {
  for (const [k, v] of detectedKeys) {
    if (v.saved !== true) detectedKeys.delete(k);
  }
  if (panelEl && panelEl.parentNode) panelEl.remove();
  panelEl = null;
}

function setPanelStatus(text, kind) {
  if (!panelEl) return;
  const s = panelEl.querySelector('#ks-status');
  if (!s) return;
  s.textContent = text;
  s.style.display = 'block';
  const palette = ({
    ok:   ['rgba(16,185,129,.12)', '#34d399', 'rgba(16,185,129,.3)'],
    err:  ['rgba(239,68,68,.12)',  '#f87171', 'rgba(239,68,68,.3)'],
    info: ['rgba(91,140,255,.12)', '#93b4ff', 'rgba(91,140,255,.3)'],
  })[kind] || ['rgba(91,140,255,.12)', '#93b4ff', 'rgba(91,140,255,.3)'];
  s.style.background = palette[0]; s.style.color = palette[1]; s.style.border = `1px solid ${palette[2]}`;
}

function applyHarvestState(state) {
  takeOverStaleDetectPanel();
  if (state && Object.prototype.hasOwnProperty.call(state, 'signed')) {
    loggedIn = !!state.signed;
  }
  const keys = Array.isArray(state && state.keys) ? state.keys : [];
  for (const row of keys) {
    if (!row || !row.saved) continue;
    const mask = String(row.masked || '');
    const tail = mask.slice(-4);
    for (const [raw, info] of detectedKeys) {
      if (maskKey(raw) === mask || (tail && raw.endsWith(tail))) {
        detectedKeys.set(raw, { ...info, saved: true });
      }
    }
  }
  const filledN = Math.max(0, Math.floor(Number(state && state.filled) || 0));
  const ms = state && state.ms;
  const line = `${filledN === 1 ? '1 filled' : `${filledN} filled`} · ${
    ms == null || !isFinite(Number(ms)) || Number(ms) < 0 ? '—' : `${Math.round(Number(ms))}ms`
  }`;
  if (!panelEl && (keys.length || detectedKeys.size || (state && state.force))) buildPanel();
  if (panelEl) panelEl.dataset.ksFill = line;
  renderPanel({ force: true });
  const saved = Math.max(0, Math.floor(Number(state && state.saved) || 0));
  const failed = Math.max(0, Math.floor(Number(state && state.failed) || 0));
  if (saved > 0 && failed === 0) {
    setPanelStatus(`Saved ${saved} key${saved === 1 ? '' : 's'} to KeyShield vault.`, 'ok');
  } else if (saved || failed) {
    setPanelStatus(`Saved ${saved}, ${failed} failed.`, failed ? 'err' : 'ok');
  }
}

function renderPanel(opts) {
  takeOverStaleDetectPanel();
  injectStyleOnce();
  const all = Array.from(detectedKeys.entries());
  const force = !!(opts && opts.force);
  if (all.length === 0 && !force) { closePanel(); return; }
  if (!panelEl) buildPanel();

  const unsavedCount = all.filter(([, v]) => v.saved !== true).length;
  const listHtml = all.map(([k, v]) => {
    const cls = v.saved === true ? 'ks-saved' : v.saved === 'fail' ? 'ks-failed' : '';
    const state = v.saved === true ? '✓' : v.saved === 'fail' ? '×' : '·';
    return `<li class="${cls}"><span class="ks-badge">${v.provider.label}</span><span class="ks-keytext">${maskKey(k)}</span><span class="ks-state">${state}</span></li>`;
  }).join('');

  const savedCount = all.filter(([, v]) => v.saved === true).length;
  const collectedLabel = all.length === 1 ? '1 collected' : `${all.length} collected`;
  const signedLabel = loggedIn ? 'signed' : 'Sign in';
  const lastFill = (panelEl && panelEl.dataset.ksFill) || '0 filled · —';
  const btnText = unsavedCount === 0
    ? (all.length === 0 ? 'Detect on' : 'All saved')
    : detectIsArmed()
      ? (unsavedCount === 1 ? 'Save to vault' : `Save all ${unsavedCount}`)
      : 'Allow auto-save';

  panelEl.innerHTML = `
    <div style="font-size:14px;font-weight:600">KeyShield — Sovereign Vault</div>
    <div style="font-size:22px;font-weight:700;line-height:1.1">${signedLabel}</div>
    <div id="ks-collected" style="font-size:12px;color:#34d399">${collectedLabel}</div>
    <ul class="ks-list">${listHtml}</ul>
    <div id="ks-status" style="display:none;font-size:11px;padding:6px 8px;border-radius:6px;line-height:1.4"></div>
    <div id="ks-filled" style="font-size:12px;color:#a1a1aa">${lastFill}</div>
    <div style="font-size:12px;color:#34d399">detect on · ok 1.2.5</div>
    <div style="display:flex;gap:8px">
      <button id="ks-save-all" class="ks-btn ks-btn-primary" style="flex:1" ${unsavedCount === 0 ? 'disabled' : ''}>${btnText}</button>
    </div>
  `;

  const saveBtn = panelEl.querySelector('#ks-save-all');
  if (saveBtn) saveBtn.onclick = detectIsArmed() ? bulkSave : grantAutoStore;
  if (savedCount > 0 && unsavedCount === 0) {
    setPanelStatus(`Saved ${savedCount} key${savedCount === 1 ? '' : 's'} to KeyShield vault.`, 'ok');
  }
}

/** MV3: background may be cold; Chrome yields lastError — retry after short backoff. */
async function sendToBackground(message) {
  if (runtimeGone()) {
    markExtensionContextDead();
    return { ok: false, reason: 'extension-dead', detail: 'Extension context invalidated.' };
  }
  let lastDetail = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    /* eslint-disable no-await-in-loop */
    const response = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ __err: chrome.runtime.lastError.message || 'chrome.runtime.lastError' });
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        resolve({ __err: String(e) });
      }
    });
    if (response && typeof response === 'object' && '__err' in response) {
      lastDetail = response.__err;
      if (isExtensionContextDead(lastDetail)) {
        markExtensionContextDead();
        return { ok: false, reason: 'extension-dead', detail: lastDetail };
      }
      if (shouldRetryBackgroundSend(lastDetail) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 120 + attempt * 120));
        continue;
      }
      return { ok: false, reason: 'extension', detail: lastDetail };
    }
    return response !== undefined && response !== null ? response : { ok: false };
  }
  return { ok: false, reason: 'extension', detail: lastDetail || 'no response' };
}

async function bulkSave() {
  const unsaved = Array.from(detectedKeys.entries()).filter(([, v]) => v.saved !== true);
  if (unsaved.length === 0) return;

  let btn = panelEl && panelEl.querySelector('#ks-save-all');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  if (extensionContextDead || runtimeGone()) {
    markExtensionContextDead();
    setPanelStatus('Saving from the live detect card…', 'info');
    try { chrome.runtime.sendMessage({ type: 'INJECT_DETECT' }); } catch { /* sw harvest paints this card */ }
    return;
  }

  await sendToBackground({ type: 'KS_BG_READY' });

  let saved = 0, failed = 0, lastReason = null, lastExtra = '';
  for (let i = 0; i < unsaved.length; i++) {
    const [key, info] = unsaved[i];
    if (extensionContextDead) {
      detectedKeys.set(key, { ...info, saved: 'fail' });
      failed++;
      lastReason = 'extension-dead';
      lastExtra = 'Extension context invalidated.';
      continue;
    }
    setPanelStatus(`Saving ${i + 1}/${unsaved.length}: ${info.provider.name}…`, 'info');

    const result = await sendToBackground({
      type: 'SAVE_KEY',
      silent: true,
      payload: {
        upstream: info.provider.id,
        name:     ksLabelForKey(key).name || `${info.provider.name} (${HOST})`,
        value:    key,
        domain:   HOST,
        pageTitle: document.title || '',
        expires_at: ksLabelForKey(key).expiresAt || '',
      },
    });

    detectedKeys.set(key, { ...info, saved: result.ok ? true : 'fail' });
    if (result.ok) saved++;
    else {
      failed++;
      lastReason = result.reason;
      if (result.detail) lastExtra = String(result.detail);
      if (result.reason === 'extension-dead' || isExtensionContextDead(result.detail)) {
        markExtensionContextDead();
      }
    }
    renderPanel();
    const b = panelEl && panelEl.querySelector('#ks-save-all');
    if (b) { b.disabled = true; b.textContent = `Saving ${i + 1}/${unsaved.length}…`; }
    setPanelStatus(`Saving ${i + 1}/${unsaved.length}: ${info.provider.name}…`, 'info');
  }

  const b2 = panelEl && panelEl.querySelector('#ks-save-all');
  if (failed === 0) {
    setPanelStatus(`Saved ${saved} key${saved === 1 ? '' : 's'} to KeyShield vault.`, 'ok');
    if (b2) { b2.disabled = true; b2.textContent = 'All saved'; }
    const started = Date.now();
    try {
      const fill = await sendToBackground({ type: 'FILL_PAGE_NOW' });
      const n = fill && typeof fill.filled === 'number' ? fill.filled : 0;
      const line = `${n === 1 ? '1 filled' : `${n} filled`} · ${Date.now() - started}ms`;
      if (panelEl) {
        panelEl.dataset.ksFill = line;
        const el = panelEl.querySelector('#ks-filled');
        if (el) el.textContent = line;
      }
    } catch { /* keep last fill line */ }
  } else {
    const fail = formatBulkSaveFailure({
      saved,
      failed,
      reason: lastReason,
      detail: lastExtra,
    });
    setPanelStatus(fail.text, fail.reload ? 'info' : 'err');
    if (b2 && !fail.reload) {
      b2.disabled = false;
      b2.textContent = `Retry ${failed} failed`;
    }
    if (fail.reload) {
      try { chrome.runtime.sendMessage({ type: 'INJECT_DETECT' }); } catch { /* harvest paints */ }
    }
  }
}

// ── Legacy single-key API (no longer used; kept for grep stability) ─────────
function showNotification(_key, _provider, _onDomain) { renderPanel(); }

// ── Auto-fill: 🔑 floating button on detected key inputs ────────────────────
// Per-input anchored button (top-right of the input). Click → asks background
// for decrypted keys matching this page's domain. If multiple, shows a small
// inline dropdown attached to the same anchor.

const KS_FILL_ATTACHED = '__ksFillAttached';   // marker on inputs we've decorated
let   ksFillEnabled    = null;                 // null=unknown, true=have keys, false=skip
let   ksCachedKeys     = null;

const KS_FILL_INPUT_SEL = 'input[type=password], input[type=text], input:not([type]), textarea, '
  + 'input[name*=key i], input[placeholder*=key i], input[placeholder*=API i], '
  + 'input[name*=token i], input[placeholder*=token i], input[name*=secret i], '
  + 'input[aria-label*=key i], input[aria-label*=API i], textarea[name*=key i], '
  + '[contenteditable="true"], [role="textbox"]';

const KS_KEY_FIELD_RE = /\bkey\b|api[\s_-]?key|\bapi\b|\btoken\b|\bsecret\b|\bopenai\b|\banthropic\b|\bopenrouter\b|\bnvidia\b|\bnim\b|\bnvapi\b|\bgroq\b|\bhelius\b|\bcursor\b|\bclaude\b|\bkilo\b|\bbyok\b/;

function ksIsCursorFillHost(domain) {
  const host = String(domain || '').trim().toLowerCase().replace(/\.+$/, '');
  return host === 'cursor.com' || host.endsWith('.cursor.com')
    || host === 'cursor.sh' || host.endsWith('.cursor.sh')
    || host === 'cursor.demo.localhost';
}

function ksIsLocalFillDemo() {
  const path = String(location.pathname || '').toLowerCase();
  if (typeof location !== 'undefined' && String(location.protocol || '') === 'chrome-extension:') {
    return path.includes('cursor-settings-fill-demo')
      || path.includes('nvidia-fill-demo')
      || path.includes('/journey/cursor')
      || /(?:^|\/)cursor\.html$/.test(path);
  }
  return path.includes('cursor-settings-fill-demo')
    || path.includes('nvidia-fill-demo')
    || path.includes('/journey/cursor')
    || /(?:^|\/)cursor\.html$/.test(path)
    || path === '/story'
    || path.startsWith('/story/');
}

function ksIsCursorFillContext() {
  const host = location.hostname;
  const path = String(location.pathname || '').toLowerCase();
  const title = String(document.title || '').toLowerCase();
  if (ksIsCursorFillHost(host)) return true;
  if (ksIsLocalFillDemo()) return true;
  return title.includes('cursor') && /setting|api key|models/.test(`${path} ${title}`);
}

function ksIsKiloFillHost(domain) {
  const host = String(domain || '').trim().toLowerCase().replace(/\.+$/, '');
  return host === 'kilo.ai' || host.endsWith('.kilo.ai') || host === 'kilo.demo.localhost';
}

function ksKiloRouteBlob() {
  try {
    return `${location.pathname || ''} ${location.hash || ''} ${location.search || ''} ${location.href || ''}`;
  } catch {
    return String((typeof location !== 'undefined' && location.pathname) || '');
  }
}

function ksIsKiloByokPath(pathname) {
  const blob = `${pathname || ''} ${ksKiloRouteBlob()}`.toLowerCase();
  return blob.includes('/byok')
    || blob.includes('kilo-byok-fill-demo')
    || blob.includes('bring-your-own-key')
    || blob.includes('bring_your_own_key')
    || /[#?&=/]byok\b/.test(blob);
}

function ksIsNvidiaFillHost(domain) {
  const host = String(domain || '').trim().toLowerCase().replace(/\.+$/, '');
  return host === 'nvidia.com' || host.endsWith('.nvidia.com') || host === 'nvidia.demo.localhost';
}

function ksIsNvidiaFillContext() {
  if (ksIsNvidiaFillHost(location.hostname)) return true;
  return String(location.pathname || '').toLowerCase().includes('nvidia-fill-demo');
}

function ksIsKiloFillContext() {
  const host = location.hostname;
  if (ksIsKiloFillHost(host) && ksIsKiloByokPath(location.pathname)) return true;
  const local = host === '127.0.0.1' || host === 'localhost';
  if (typeof location !== 'undefined' && String(location.protocol || '') === 'chrome-extension:') {
    return ksIsKiloByokPath(location.pathname);
  }
  return local && ksIsKiloByokPath(location.pathname);
}

function ksAncestorHaystack(el) {
  const chunks = [];
  const item = el.closest && el.closest('.setting-item, [class*="setting-item"]');
  if (item) {
    const labeled = item.querySelector
      && item.querySelector('.setting-item-label, .setting-item-title, [class*="setting-item-label"], label');
    if (labeled && labeled !== el && !labeled.contains(el)) {
      chunks.push(String(labeled.textContent || '').slice(0, 240));
    }
    return chunks.join(' ');
  }
  let node = el;
  for (let depth = 0; depth < 6 && node; depth++) {
    const parent = node.parentElement;
    if (!parent) break;
    const labeled = parent.querySelector
      && parent.querySelector(':scope > .setting-item-label, :scope > label, :scope > .setting-item-title');
    if (labeled && labeled !== el && !labeled.contains(el)) {
      chunks.push(String(labeled.textContent || '').slice(0, 240));
    }
    const prev = el.previousElementSibling;
    if (depth === 0 && prev && /^(LABEL|SPAN|P|DIV|H[1-6])$/.test(prev.tagName)) {
      const t = String(prev.textContent || '').trim();
      if (t && t.length < 160) chunks.push(t);
    }
    node = parent;
    if (chunks.join(' ').length > 120) break;
  }
  return chunks.join(' ');
}

/** Kilo BYOK: the provider is picked in a <select> / Radix combobox next to the
 *  key box, not in the key input's label. Read it so the matching vault key fills. */
function ksKiloSelectedProvider(el) {
  try {
    const scope = (el.closest && el.closest('[role="dialog"], form')) || document;
    const pickers = scope.querySelectorAll('select, [role="combobox"], button[aria-haspopup="listbox"]');
    const out = [];
    pickers.forEach((p) => {
      if (p === el) return;
      if (p.tagName === 'SELECT') {
        const opt = p.options && p.options[p.selectedIndex];
        if (opt) out.push(String(opt.textContent || ''));
      } else {
        out.push(String(p.textContent || p.getAttribute('aria-label') || ''));
      }
    });
    return out.join(' ').slice(0, 160);
  } catch {
    return '';
  }
}

function ksInputHaystack(el) {
  const name = (el.getAttribute('name') || '').toLowerCase();
  const ph   = (el.getAttribute('placeholder') || '').toLowerCase();
  const id   = (el.getAttribute('id') || '').toLowerCase();
  const aria = (el.getAttribute('aria-label') || '').toLowerCase();
  let label = '';
  try {
    if (el.id && typeof CSS !== 'undefined' && CSS.escape) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) label += ` ${lab.textContent || ''}`;
    }
  } catch { /* ignore selector issues */ }
  const wrapped = el.closest && el.closest('label');
  if (wrapped) label += ` ${wrapped.textContent || ''}`;
  const prev = el.previousElementSibling;
  if (prev && /^(LABEL|SPAN|P|DIV|H[1-6])$/.test(prev.tagName)) {
    label += ` ${prev.textContent || ''}`;
  }
  label += ` ${ksAncestorHaystack(el)}`;
  if (ksIsKiloFillContext()) label += ` ${ksKiloSelectedProvider(el)}`;
  return `${name} ${ph} ${id} ${aria} ${label}`.toLowerCase();
}

function ksMatchUpstreamForHaystack(hay) {
  if (/\bcursor\b|\bcrsr\b/.test(hay)) return 'cursor';
  if (/\bnvidia\b|\bnim\b|\bnvapi\b/.test(hay)) return 'nvidia';
  if (/\bopenrouter\b|\bsk-or\b/.test(hay)) return 'openrouter';
  if (/\banthropic\b|\bclaude\b|\bsk-ant\b/.test(hay)) return 'anthropic';
  if (/\bopenai\b|\bchatgpt\b|\bgpt\b|\bsk-proj\b/.test(hay)) return 'openai';
  if (/\bgroq\b|\bgsk_/.test(hay)) return 'groq';
  if (/\bhelius\b/.test(hay)) return 'helius';
  if (/\bvercel\b/.test(hay)) return 'vercel';
  if (/\bgithub\b|\bghp_|\bgithub_pat_/.test(hay)) return 'github';
  // Kilo BYOK has no OpenRouter provider; the page name is not a provider hint.
  return null;
}

/** Kilo BYOK: the provider picker beats a static key label ("OpenRouter API Key"). */
function ksWantedUpstream(el, hay) {
  if (ksIsKiloFillContext()) {
    const picked = ksMatchUpstreamForHaystack(String(ksKiloSelectedProvider(el) || '').toLowerCase());
    if (picked) return picked;
  }
  return ksMatchUpstreamForHaystack(hay);
}

function ksLooksLikeLoginPassword(hay) {
  const text = String(hay || '').toLowerCase();
  if (/\b(sign[\s-]?in|log[\s-]?in|email|username|account password)\b/.test(text)) return true;
  return /\bpassword\b/.test(text) && !/\b(key|token|secret|api|openai|anthropic|cursor|claude|openrouter)\b/.test(text);
}

function ksLooksLikeKeyNameField(hay) {
  const text = String(hay || '').toLowerCase();
  return /api[\s_-]?key[\s_-]?name|key[\s_-]?name|name[\s_-]?your[\s_-]?key|display[\s_-]?name/.test(text);
}

function ksPreferredCursorFillKey(keys) {
  const order = ['cursor', 'openai', 'nvidia', 'openrouter', 'anthropic', 'groq'];
  for (const upstream of order) {
    const hit = keys.find((k) => k.upstream === upstream && k.value);
    if (hit) return hit;
  }
  return keys.find((k) => k.value) || null;
}

function ksPreferredKiloFillKey(keys) {
  // Kilo BYOK accepts Anthropic/OpenAI/NVIDIA keys, not OpenRouter (kilo.ai/docs/gateway/authentication).
  const order = ['anthropic', 'openai', 'nvidia', 'groq', 'openrouter', 'cursor'];
  for (const upstream of order) {
    const hit = keys.find((k) => k.upstream === upstream && k.value);
    if (hit) return hit;
  }
  return keys.find((k) => k.value) || null;
}

function ksPickKeyForInput(el, keys) {
  if (!keys || !keys.length) return null;
  const hay = ksInputHaystack(el);
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (ksLooksLikeKeyNameField(hay)) return null;
  const wanted = ksWantedUpstream(el, hay);
  if (wanted) {
    const labeled = keys.find((k) => k.upstream === wanted);
    if (labeled) return labeled;
  }
  if (ksLooksLikeLoginPassword(hay)) return null;
  if (ksIsNvidiaFillContext() || (ksIsNvidiaFillHost(location.hostname) && type === 'password')) {
    return keys.find((k) => k.upstream === 'nvidia' && k.value)
      || keys.find((k) => k.upstream === 'openrouter' && k.value)
      || keys.find((k) => k.value)
      || null;
  }
  if (ksIsKiloFillContext() || (ksIsKiloFillHost(location.hostname) && type === 'password' && ksIsKiloByokPath())) {
    return ksPreferredKiloFillKey(keys);
  }
  if (ksIsCursorFillContext() || (ksIsCursorFillHost(location.hostname) && type === 'password')) {
    return ksPreferredCursorFillKey(keys);
  }
  if (KS_KEY_FIELD_RE.test(hay)) return keys.find((k) => k.value) || null;
  const unique = new Set(keys.map((k) => k.upstream));
  if (unique.size === 1 || keys.length === 1) return keys.find((k) => k.value) || null;
  return null;
}

function ksLooksLikeCursorApiBlank(el, hay, type) {
  if (!ksIsCursorFillContext()) return false;
  if (ksLooksLikeLoginPassword(hay)) return false;
  if (ksLooksLikeKeyNameField(hay)) return false;
  if (KS_KEY_FIELD_RE.test(hay)) return true;
  return type === 'password' || !String(hay || '').trim();
}

function ksLooksLikeKiloApiBlank(el, hay, type) {
  if (!ksIsKiloFillContext()) return false;
  if (ksLooksLikeLoginPassword(hay)) return false;
  if (ksLooksLikeKeyNameField(hay)) return false;
  if (KS_KEY_FIELD_RE.test(hay)) return true;
  return type === 'password' || !String(hay || '').trim();
}

function ksLooksLikeKeyInput(el) {
  if (!el) return false;
  if (el.closest && (el.closest('#keyshield-status-card') || el.closest('#keyshield-detection-notice'))) return false;
  const editable = !!(el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true'));
  const textbox = el.getAttribute && el.getAttribute('role') === 'textbox';
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !editable && !textbox) return false;
  if (el.disabled || el.readOnly) return false;
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (el.tagName === 'INPUT' && (type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'submit')) {
    return false;
  }
  const hay = ksInputHaystack(el);
  const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (ac.includes('current-password') || ac.includes('username') || ac.includes('email')) return false;
  if (ksLooksLikeKeyNameField(hay)) return false;
  if (ksIsKiloFillContext() || ksIsCursorFillContext() || ksIsNvidiaFillContext()) {
    if (/\b(sign[\s-]?in|log[\s-]?in|email|username|account password)\b/.test(hay)) return false;
    if (KS_KEY_FIELD_RE.test(hay)) return true;
    return type === 'password' || type === 'text' || type === '' || el.tagName === 'TEXTAREA' || editable || textbox;
  }
  if (ksLooksLikeLoginPassword(hay)) return false;
  if (KS_KEY_FIELD_RE.test(hay)) return true;
  return ksLooksLikeCursorApiBlank(el, hay, type) || ksLooksLikeKiloApiBlank(el, hay, type);
}

function ksIsFillableInput(el) {
  if (!el || el.dataset && el.dataset[KS_FILL_ATTACHED]) return false;
  return ksLooksLikeKeyInput(el);
}

function ksCollectFillInputs(root) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    let list = [];
    try { list = node.querySelectorAll ? node.querySelectorAll(KS_FILL_INPUT_SEL) : []; }
    catch { list = []; }
    list.forEach((el) => out.push(el));
    let all = [];
    try { all = node.querySelectorAll ? node.querySelectorAll('*') : []; }
    catch { all = []; }
    for (const el of all) {
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(root || document);
  return out;
}

function ksCurrentInputValue(el) {
  if (!el) return '';
  if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true')) {
    return String(el.textContent || '').trim();
  }
  return String(el.value || '').trim();
}

const ksAutofilledValues = new WeakMap();

/** Kilo BYOK: provider picker changed → refill key inputs in the same dialog/form,
 *  but only when the current value is still exactly what KeyShield auto-filled. */
function ksRefillAfterProviderChange(picker) {
  if (!ksIsKiloFillContext() || !ksCachedKeys || !ksCachedKeys.length) return 0;
  const scope = (picker && picker.closest && picker.closest('[role="dialog"], form')) || document;
  let cleared = 0;
  ksCollectFillInputs(scope).forEach((input) => {
    if (!input.dataset || !input.dataset.ksAutofilled) return;
    const ours = ksAutofilledValues.get(input);
    if (!ours || ksCurrentInputValue(input) !== ours) return; // user typed: leave it
    delete input.dataset.ksAutofilled;
    ksAutofilledValues.delete(input);
    ksSetValue(input, '');
    cleared += 1;
  });
  return cleared ? ksAutoFillEmptyInputs(ksCachedKeys) : 0;
}

function ksOnProviderPickerEvent(ev) {
  const t = ev && ev.target;
  if (!t || !t.closest) return;
  if (ev.type === 'change' && t.tagName === 'SELECT') { ksRefillAfterProviderChange(t); return; }
  // Radix combobox: option click updates the trigger text a tick later.
  const opt = t.closest('[role="option"]');
  if (ev.type === 'click' && opt) {
    const trigger = document.querySelector('[role="combobox"][aria-expanded="true"], button[aria-haspopup="listbox"][aria-expanded="true"]');
    setTimeout(() => ksRefillAfterProviderChange(trigger || opt), 50);
  }
}
try {
  document.addEventListener('change', ksOnProviderPickerEvent, true);
  document.addEventListener('click', ksOnProviderPickerEvent, true);
} catch { /* noop */ }

function ksAutoFillEmptyInputs(keys) {
  if (!keys || !keys.length) return 0;
  const nodes = ksCollectFillInputs(document);
  const candidates = [];
  nodes.forEach((input) => {
    if (!ksLooksLikeKeyInput(input)) return;
    if (input.dataset && input.dataset.ksAutofilled) return;
    if (ksCurrentInputValue(input).length > 0) return;
    candidates.push(input);
  });
  const remaining = keys.filter((k) => k && k.value);
  let filled = 0;
  const take = (input, key) => {
    if (!key || !key.value) return false;
    ksSetValue(input, key.value);
    if (input.dataset) input.dataset.ksAutofilled = '1';
    ksAutofilledValues.set(input, key.value);
    const idx = remaining.findIndex((k) => k.value === key.value && k.upstream === key.upstream);
    if (idx >= 0) remaining.splice(idx, 1);
    filled += 1;
    return true;
  };
  for (const input of candidates) {
    if (ksCurrentInputValue(input)) continue;
    const hay = ksInputHaystack(input);
    const wanted = ksWantedUpstream(input, hay);
    if (!wanted) continue;
    const key = remaining.find((k) => k.upstream === wanted);
    take(input, key);
  }
  for (const input of candidates) {
    if (ksCurrentInputValue(input)) continue;
    const key = ksPickKeyForInput(input, remaining)
      || ((ksIsKiloFillContext() || ksIsCursorFillContext() || ksIsNvidiaFillContext()) ? remaining[0] : null);
    if (key) take(input, key);
  }
  return filled;
}

function ksFlashGreen(el) {
  const prev = {
    boxShadow:   el.style.boxShadow,
    transition:  el.style.transition,
    borderColor: el.style.borderColor,
  };
  el.style.transition  = 'box-shadow .2s, border-color .2s';
  el.style.boxShadow   = '0 0 0 2px #34d39988, 0 0 0 4px #34d39933';
  el.style.borderColor = '#34d399';
  setTimeout(() => {
    el.style.boxShadow   = prev.boxShadow;
    el.style.borderColor = prev.borderColor;
    el.style.transition  = prev.transition;
  }, 800);
}

function ksSetValue(el, value) {
  if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true')) {
    try { el.focus(); } catch { /* noop */ }
    el.textContent = value;
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: 'insertFromPaste' }));
    } catch {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    ksFlashGreen(el);
    return;
  }
  // React/Vue use a native value setter that bypasses property descriptors.
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value');
  const last = el.value;
  try {
    const tracker = el._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue(last);
  } catch { /* noop */ }
  if (setter && setter.set) setter.set.call(el, value);
  else el.value = value;
  try {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: 'insertFromPaste' }));
  } catch {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  ksFlashGreen(el);
}

function ksCollectHints() {
  const nodes = ksCollectFillInputs(document);
  const hints = [];
  let blanks = 0;
  nodes.forEach((el) => {
    if (!ksLooksLikeKeyInput(el)) return;
    hints.push(ksInputHaystack(el));
    if (!ksCurrentInputValue(el)) blanks += 1;
  });
  if (!hints.length) {
    const title = String(document.title || '');
    if (title) hints.push(title);
  }
  return { hints, hasKeyBlanks: blanks > 0 };
}

function ksRequestKeys() {
  const extra = ksCollectHints();
  return sendToBackground({
    type: 'GET_KEYS_FOR_DOMAIN',
    domain: location.hostname,
    pathname: location.pathname,
    title: document.title,
    url: location.href,
    hints: extra.hints,
    hasKeyBlanks: extra.hasKeyBlanks,
  }).then((response) => {
    if (!response || !response.ok) {
      return { ok: false, reason: response?.reason || 'extension', detail: response?.detail };
    }
    return { ok: true, keys: response.keys };
  });
}

async function ksFillPageNow() {
  const resp = await ksRequestKeys();
  if (!resp || !resp.ok || !Array.isArray(resp.keys) || !resp.keys.length) {
    return { ok: false, filled: 0, reason: resp?.reason || 'no-keys' };
  }
  ksFillEnabled = true;
  ksCachedKeys = resp.keys;
  let filled = 0;
  const waits = ksIsKiloFillContext() ? [0, 150, 400, 1200, 2500] : [0, 150];
  for (const wait of waits) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    ksScanForInputs();
    filled = Math.max(filled, ksAutoFillEmptyInputs(resp.keys));
    if (filled) break;
  }
  return { ok: true, filled, keys: resp.keys.length };
}
try { window.__ksFillPageNow = ksFillPageNow; } catch { /* isolated world */ }

function ksCloseDropdowns() {
  document.querySelectorAll('.ks-fill-dropdown').forEach((n) => n.remove());
}

function ksShowDropdown(anchor, input, keys) {
  ksCloseDropdowns();
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'ks-fill-dropdown';
  Object.assign(menu.style, {
    position:        'fixed',
    top:             `${Math.round(rect.bottom + 4)}px`,
    left:            `${Math.round(Math.max(8, rect.right - 220))}px`,
    width:           '220px',
    zIndex:          '999999',
    backgroundColor: '#0a0d1a',
    border:          '1px solid #1c2238',
    borderRadius:    '8px',
    padding:         '4px',
    boxShadow:       '0 10px 30px -8px rgba(0,0,0,0.6)',
    color:           '#e4e4e7',
    fontFamily:      '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    fontSize:        '12px',
  });
  for (const k of keys) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      padding:       '6px 8px',
      cursor:        'pointer',
      borderRadius:  '4px',
      display:       'flex',
      flexDirection: 'column',
      gap:           '2px',
    });
    row.onmouseenter = () => { row.style.background = '#131929'; };
    row.onmouseleave = () => { row.style.background = 'transparent'; };
    row.innerHTML = `
      <div style="font-weight:500">${(k.name || k.upstream || 'key').replace(/[<>&]/g, '')}</div>
      <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;color:#71717a">${k.upstream}</div>
    `;
    row.onclick = () => {
      ksSetValue(input, k.value);
      k.value = '';
      menu.remove();
    };
    menu.appendChild(row);
  }
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('mousedown', function onAway(ev) {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('mousedown', onAway);
      }
    });
  }, 0);
}

function ksAttachFillButton(input) {
  if (!ksIsFillableInput(input)) return;
  if (!input.dataset) return;
  input.dataset[KS_FILL_ATTACHED] = '1';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ks-fill-btn';
  btn.textContent = '🔑';
  btn.title = 'Fill saved key from KeyShield';
  Object.assign(btn.style, {
    position:        'absolute',
    zIndex:          '999998',
    width:           '22px',
    height:          '22px',
    padding:         '0',
    lineHeight:      '20px',
    fontSize:        '12px',
    cursor:          'pointer',
    background:      '#0a0d1a',
    border:          '1px solid #1c2550',
    borderRadius:    '6px',
    color:           '#5b8cff',
    boxShadow:       '0 2px 6px rgba(0,0,0,0.3)',
    display:         'none',
  });

  // Hover-only — do not park a 🔑 on every blank.
  let hoverOpen = false;
  const place = () => {
    const r = input.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { btn.style.display = 'none'; return; }
    btn.style.top     = `${Math.round(window.scrollY + r.top + (r.height - 22) / 2)}px`;
    btn.style.left    = `${Math.round(window.scrollX + r.right - 28)}px`;
    btn.style.position = 'absolute';
    btn.style.display = hoverOpen ? 'inline-block' : 'none';
  };
  const showBtn = () => { hoverOpen = true; place(); };
  const hideBtn = () => { hoverOpen = false; btn.style.display = 'none'; };
  place();
  document.body.appendChild(btn);
  input.addEventListener('mouseenter', showBtn);
  input.addEventListener('focus', showBtn);
  btn.addEventListener('mouseenter', showBtn);
  input.addEventListener('mouseleave', (ev) => {
    if (ev.relatedTarget === btn || (btn.contains && btn.contains(ev.relatedTarget))) return;
    if (document.activeElement !== input) hideBtn();
  });
  input.addEventListener('blur', () => { if (!btn.matches(':hover')) hideBtn(); });
  btn.addEventListener('mouseleave', (ev) => {
    if (ev.relatedTarget === input) return;
    if (document.activeElement !== input) hideBtn();
  });

  const repoInterval = setInterval(() => {
    if (!input.isConnected) { clearInterval(repoInterval); btn.remove(); return; }
    if (hoverOpen) place();
  }, 800);

  btn.onclick = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    // Don't overwrite a value the user is actively typing.
    if ((input.value || '').length >= 8) {
      ksFlashGreen(input);  // brief visual; keep value
      return;
    }
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = '…';
    const resp = await ksRequestKeys();
    btn.disabled = false;
    btn.textContent = prev;
    if (!resp || !resp.ok) {
      btn.title = resp && resp.reason ? `KeyShield: ${resp.reason}` : 'KeyShield: no keys';
      btn.style.opacity = '0.5';
      return;
    }
    if (resp.keys.length === 1) {
      ksSetValue(input, resp.keys[0].value);
      resp.keys[0].value = '';
    } else {
      ksShowDropdown(btn, input, resp.keys);
    }
  };
}

function ksScanForInputs() {
  const nodes = ksCollectFillInputs(document);
  nodes.forEach(ksAttachFillButton);
  if (ksCachedKeys && ksCachedKeys.length) ksAutoFillEmptyInputs(ksCachedKeys);
}

// Must match manifest externally_connectable. Used to skip Fill on the
// dashboard and to announce chrome.runtime.id so wallet login can push KS_TOKEN.
function isKeyShieldDashboardHost() {
  const host = location.host;
  const hostname = location.hostname;
  return (
    host === 'localhost:5173' || host === '127.0.0.1:5173' ||
    host === 'localhost:3000' || host === '127.0.0.1:3000' ||
    hostname === 'keyshield.dev' || hostname.endsWith('.keyshield.dev') ||
    hostname === 'app.ks.aileena.xyz' || hostname.endsWith('.aileena.xyz') ||
    hostname.endsWith('.up.railway.app') || hostname.endsWith('.vercel.app')
  );
}

// On load: ping background. Retry after login — a first miss used to disable
// fill forever, which left the Cursor Settings black space empty.
(function ksInitFillUI() {
  if (isKeyShieldDashboardHost() && !ksIsLocalFillDemo() && !ksIsKiloFillContext()) {
    ksFillEnabled = false;
    return;
  }
  const refresh = () => {
    ksRequestKeys().then((resp) => {
      if (resp && resp.ok && Array.isArray(resp.keys) && resp.keys.length > 0) {
        ksFillEnabled = true;
        ksCachedKeys = resp.keys;
        ksScanForInputs();
        ksAutoFillEmptyInputs(resp.keys);
      }
    });
  };
  function ksCaptureSecretFromText(raw) {
    const text = String(raw || '').trim();
    if (!text || /[•…]|\.{3}/.test(text)) return;
    for (const provider of PROVIDERS) {
      for (const re of provider.patterns) {
        re.lastIndex = 0;
        const found = text.match(re);
        if (!found || !found[0] || found[0].length < (provider.minLen || 12)) continue;
        sendToBackground({
          type: 'SAVE_KEY',
          silent: true,
          payload: {
            upstream: provider.id,
            name: ksLabelForKey(found[0]).name || `${provider.name} (${HOST})`,
            value: found[0],
            domain: HOST,
            pageTitle: document.title || '',
            expires_at: ksLabelForKey(found[0]).expiresAt || '',
          },
        }).then(() => refresh()).catch(() => {});
        return;
      }
    }
  }
  refresh();
  setInterval(() => {
    if (!ksCachedKeys || !ksCachedKeys.length) refresh();
    else ksScanForInputs();
  }, 1500);
  try {
    let scanTimer = 0;
    const mo = new MutationObserver(() => {
      if (scanTimer) return;
      scanTimer = window.setTimeout(() => {
        scanTimer = 0;
        if (!ksCachedKeys || !ksCachedKeys.length) {
          if (ksIsKiloFillContext()) refresh();
          return;
        }
        ksScanForInputs();
      }, 80);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch { /* noop */ }
  if (ksIsKiloFillHost(location.hostname) || ksIsKiloFillContext()) {
    window.addEventListener('hashchange', refresh);
    window.addEventListener('popstate', refresh);
  }
  try {
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area === 'local' && (changes.ks_token || changes.ks_pending_meta || changes.ks_zk)) refresh();
      if (area === 'session' && changes.ks_vault_key && changes.ks_vault_key.newValue) refresh();
    });
  } catch { /* noop */ }
  try {
    document.addEventListener('copy', () => {
      let t = '';
      try { t = String(window.getSelection ? window.getSelection() : ''); } catch { t = ''; }
      if (t) ksCaptureSecretFromText(t);
      else if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(ksCaptureSecretFromText).catch(() => {});
      }
    });
  } catch { /* noop */ }
  if (ksIsCursorFillHost(location.hostname)) {
    document.addEventListener('click', (ev) => {
      const hit = ev.target && ev.target.closest && ev.target.closest('button, [role="button"], [aria-label*="copy" i]');
      if (!hit) return;
      setTimeout(() => {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(ksCaptureSecretFromText).catch(() => {});
        }
      }, 250);
    }, true);
  }
  try {
    chrome.runtime?.onMessage?.addListener?.((msg, _sender, sendResponse) => {
      if (!msg) return false;
      if (msg.type === 'FILL_PAGE_NOW') {
        ksFillPageNow().then(sendResponse);
        return true;
      }
      if (msg.type === 'KS_DETECT_STATE') {
        applyHarvestState(msg.state || {});
        sendResponse({ ok: true });
        return true;
      }
      if (msg.type === 'KS_SHOW_DETECT_PANEL') {
        renderPanel({ force: true });
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });
  } catch { /* noop */ }
})();

// ── Bridge: announce extension ID to KeyShield dashboard ────────────────────
// Dashboard's auth/index.ts listens for {__ks_ext_announce} to push token +
// vault key. Manifest's externally_connectable gates who can actually message
// us — leaking the ID alone confers no privilege.
(function announceExtensionToDashboard() {
  if (!isKeyShieldDashboardHost()) return;
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
  const announce = () => {
    try { window.postMessage({ __ks_ext_announce: chrome.runtime.id }, location.origin); }
    catch { /* noop */ }
  };
  const capturePageToken = () => {
    let pageToken = '';
    let pageUser = '';
    try {
      pageToken = localStorage.getItem('ks_token') || '';
      pageUser = localStorage.getItem('ks_wallet') || localStorage.getItem('ks_passkey_user') || '';
    } catch { /* noop */ }
    if (!pageToken || pageToken.trim().length < 12) return;
    try {
      chrome.storage.local.get(['ks_token'], (stored) => {
        if (stored && stored.ks_token === pageToken) return;
        chrome.storage.local.set({
          ks_token: pageToken,
          ks_user: pageUser || null,
          ks_auto_store: true,
        });
      });
    } catch { /* noop */ }
  };
  const shareSession = () => {
    try {
      capturePageToken();
      chrome.storage.local.get(['ks_token', 'ks_user'], (stored) => {
        const token = stored && stored.ks_token;
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
    } catch { /* noop */ }
  };
  announce();
  shareSession();
  capturePageToken();
  [400, 1200, 3000, 8000].forEach((ms) => setTimeout(capturePageToken, ms));
  window.addEventListener('ks-auth-changed', capturePageToken);
  window.addEventListener('storage', capturePageToken);
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__ks_ext_request) announce();
    if (e.data.__ks_ext_request_session) shareSession();
    if (e.data.__ks_page_session || e.data.__ks_auth_changed) capturePageToken();
  });
})();

// ── Lifecycle ───────────────────────────────────────────────────────────────

function startDetectWatchers() {
  takeOverStaleDetectPanel();
  loadDismissedDomains();
  loadAutoStorePref();
  scheduleScan();
  if (globalThis.__ksDetectWired) return;
  globalThis.__ksDetectWired = true;
  watchAutoStorePref();
  setInterval(scheduleScan, 1500);
  const attachObserver = () => {
    if (!document.body) return;
    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) attachObserver();
  else document.addEventListener('DOMContentLoaded', attachObserver, { once: true });
  document.addEventListener('copy', () => scheduleScan());
  document.addEventListener('input', () => scheduleScan(), { capture: true });
  document.addEventListener('click', () => scheduleScan(), { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleScan();
  });
}

startDetectWatchers();

function ksExtractRequestUrl(args) {
  const first = args?.[0];
  if (!first) return '';
  if (typeof first === 'string') return first;
  if (first instanceof URL) return first.toString();
  if (typeof Request !== 'undefined' && first instanceof Request) return first.url || '';
  if (typeof first.url === 'string') return first.url;
  return '';
}

function ksExtractRequestHeaders(args) {
  const first = args?.[0];
  const second = args?.[1];
  const sources = [];
  if (first && typeof first === 'object' && first.headers) sources.push(first.headers);
  if (second && typeof second === 'object' && second.headers) sources.push(second.headers);
  const out = new Headers();
  for (const src of sources) {
    try {
      const h = new Headers(src);
      h.forEach((value, key) => out.set(key, value));
    } catch {
      // ignore malformed header containers
    }
  }
  return out;
}

function ksPromptQuickAuth(hostname, reason) {
  const now = Date.now();
  if (now - lastQuickAuthPromptAt < QUICK_AUTH_COOLDOWN_MS) return;
  lastQuickAuthPromptAt = now;
  injectStyleOnce();
  const toast = document.createElement('div');
  toast.id = 'keyshield-401-notice';
  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '999999',
    backgroundColor: '#0a0d1a',
    border: '1px solid #1c2238',
    borderRadius: '12px',
    padding: '16px',
    width: '320px',
    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)',
    color: '#e4e4e7',
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  });
  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="background:#0e1430;padding:6px 8px;border-radius:6px;font-size:10px;font-weight:700;color:#5b8cff;border:1px solid #1c2550;letter-spacing:.05em">401</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">Credential required for ${hostname}</div>
        <div style="color:#a1a1aa;font-size:11px;margin-top:2px">${reason}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button id="ks-401-auth" class="ks-btn ks-btn-primary" style="flex:1">Authorize now</button>
      <button id="ks-401-dismiss" class="ks-btn ks-btn-ghost">Dismiss</button>
    </div>
  `;
  document.body.appendChild(toast);
  toast.querySelector('#ks-401-auth').onclick = () => {
    sendToBackground({
      type: 'TRIGGER_QUICK_AUTH',
      hostname,
      reason,
    });
    toast.remove();
  };
  toast.querySelector('#ks-401-dismiss').onclick = () => toast.remove();
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 20000);
}

function ksX402PaymentHeader(response) {
  try {
    return response.headers.get('PAYMENT-REQUIRED')
      || response.headers.get('Payment-Required')
      || response.headers.get('X-Payment-Required')
      || '';
  } catch {
    return '';
  }
}

function ksIsX402Challenge(response) {
  if (!response || response.status !== 402) return false;
  const raw = String(ksX402PaymentHeader(response) || '').trim();
  return raw === 'x402' || raw.length > 0;
}

function ksParseX402Accept(first) {
  const row = first && typeof first === 'object' ? first : {};
  const raw = parseFloat(row.amount ?? row.maxAmountRequired ?? '0');
  return {
    amount_usd: Number.isFinite(raw) ? raw / 1_000_000 : 0,
    payTo: row.payTo || '',
    network: row.network || '',
    resource: row.resource || '',
  };
}

// ── x402 payment interceptor ────────────────────────────────────────────────
// Wraps window.fetch to detect 402 + x402 headers and show a payment prompt.
// Does NOT interfere with any other fetch — only intercepts 402 responses that
// carry X-Payment-Required: x402 or PAYMENT-REQUIRED (x402 v2).

(function () {
  if (window.__ksFetchWrapped) return;
  window.__ksFetchWrapped = true;
  const _origFetch = window.fetch.bind(window);

  window.fetch = async function (...args) {
    const requestUrl = ksExtractRequestUrl(args);
    let requestHost = '';
    try { requestHost = requestUrl ? new URL(requestUrl, location.href).hostname.toLowerCase() : ''; } catch { /* noop */ }
    const requestHeaders = ksExtractRequestHeaders(args);
    const hasAuthorization = requestHeaders.has('authorization');
    const response = await _origFetch(...args);

    if (
      response.status === 401 &&
      !hasAuthorization &&
      ksHostMatches(requestHost || location.hostname, QUICK_AUTH_TARGETS)
    ) {
      const sourceHost = requestHost || location.hostname;
      ksPromptQuickAuth(sourceHost, 'No bearer credential detected, KeyShield quick auth is available.');
    }

    if (
      ksIsX402Challenge(response) &&
      ksHostMatches(requestHost || location.hostname, PAYMENT_INTERCEPT_TARGETS)
    ) {
      // Clone so the caller still gets the original 402 body
      const clone = response.clone();

      (async () => {
        let amount_usd = 0;
        let payTo      = '';
        let network    = '';
        let resource   = '';

        try {
          let first = {};
          try {
            const body = await clone.json();
            first = body?.accepts?.[0] ?? {};
          } catch { /* empty 402 body — try PAYMENT-REQUIRED */ }
          if (!first.amount && !first.maxAmountRequired) {
            const header = ksX402PaymentHeader(response);
            if (header && header !== 'x402') {
              try {
                const decoded = JSON.parse(atob(header));
                first = decoded?.accepts?.[0] ?? {};
                if (!resource && decoded?.resource?.url) resource = decoded.resource.url;
              } catch { /* keep empty */ }
            }
          }
          const parsed = ksParseX402Accept(first);
          amount_usd  = parsed.amount_usd;
          payTo       = parsed.payTo;
          network     = parsed.network;
          resource    = parsed.resource || resource || (typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '');
        } catch {
          // malformed body — still show a prompt with $0.00
        }

        const hostname = (requestHost || location.hostname).toLowerCase();

        // Ask background if this domain is trusted + below threshold
        let autoPayApproved = false;
        try {
          const reply = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { type: 'X402_CHECK_TRUST', hostname, amount_usd },
              resolve,
            );
          });
          autoPayApproved = !!reply?.autoPayApproved;
        } catch { /* extension context gone — treat as not trusted */ }

        // Ensure our CSS is injected (reuse existing ks-style if present)
        if (!document.getElementById('keyshield-style')) {
          const style = document.createElement('style');
          style.id    = 'keyshield-style';
          style.textContent = `
            @keyframes keyshield-slide {
              from { transform: translateY(-12px); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
            .ks-btn{cursor:pointer;border:1px solid transparent;border-radius:8px;
              padding:9px 12px;font-size:12px;font-weight:500;transition:all .15s}
            .ks-btn-primary{background:#5b8cff;color:white;border-color:#5b8cff}
            .ks-btn-primary:hover{background:#7aa1ff}
            .ks-btn-ghost{background:transparent;color:#71717a;border-color:#27272a}
            .ks-btn-ghost:hover{color:#fafafa;border-color:#3f3f46}
          `;
          document.head.appendChild(style);
        }

        const amountStr = `$${amount_usd.toFixed(2)}`;
        const toast = document.createElement('div');
        toast.id = 'keyshield-x402-notice';
        Object.assign(toast.style, {
          position:        'fixed',
          top:             '20px',
          right:           '20px',
          zIndex:          '999999',
          backgroundColor: '#0a0d1a',
          border:          '1px solid #1c2238',
          borderRadius:    '12px',
          padding:         '16px',
          width:           '320px',
          boxShadow:       '0 20px 40px -10px rgba(0,0,0,0.6)',
          color:           '#e4e4e7',
          fontFamily:      '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          display:         'flex',
          flexDirection:   'column',
          gap:             '12px',
          animation:       'keyshield-slide 0.18s ease-out',
        });

        if (autoPayApproved) {
          let secsLeft = 3;
          toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="background:#0e1430;padding:6px 8px;border-radius:6px;
                          font-size:10px;font-weight:700;color:#5b8cff;
                          border:1px solid #1c2550;letter-spacing:.05em">402</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600">Auto-paying ${amountStr} to ${hostname}…</div>
                <div style="color:#a1a1aa;font-size:11px;margin-top:2px">Sending in <span id="ks-cd">${secsLeft}</span>s</div>
              </div>
            </div>
          `;
          document.body.appendChild(toast);

          const interval = setInterval(() => {
            secsLeft--;
            const cd = toast.querySelector('#ks-cd');
            if (cd) cd.textContent = String(secsLeft);
            if (secsLeft <= 0) {
              clearInterval(interval);
              chrome.runtime.sendMessage({
                type: 'INITIATE_X402_PAYMENT',
                amount_usd,
                hostname,
                payTo,
                network,
                resource,
              });
              toast.remove();
            }
          }, 1000);

          // Allow cancellation before countdown ends
          toast.addEventListener('click', () => {
            clearInterval(interval);
            toast.remove();
          }, { once: true });

        } else {
          toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
              <div style="background:#0e1430;padding:6px 8px;border-radius:6px;
                          font-size:10px;font-weight:700;color:#5b8cff;
                          border:1px solid #1c2550;letter-spacing:.05em">402</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600">x402 payment required — ${amountStr}</div>
                <div style="color:#a1a1aa;font-size:11px;margin-top:2px">${hostname}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button id="ks-x402-pay"     class="ks-btn ks-btn-primary" style="flex:1">Pay now</button>
              <button id="ks-x402-dismiss" class="ks-btn ks-btn-ghost">Dismiss</button>
            </div>
          `;
          document.body.appendChild(toast);

          toast.querySelector('#ks-x402-pay').onclick = () => {
            chrome.runtime.sendMessage({
              type: 'INITIATE_X402_PAYMENT',
              amount_usd,
              hostname,
              payTo,
              network,
              resource,
            });
            toast.remove();
          };

          toast.querySelector('#ks-x402-dismiss').onclick = () => toast.remove();

          // Auto-dismiss after 20s
          setTimeout(() => { if (toast.parentNode) toast.remove(); }, 20000);
        }
      })();
    }

    return response;
  };
})();
})();
