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
 *     - The popup writes ks_token via externally_connectable from the dashboard
 *       only. There's no "paste your token" form in the popup itself yet.
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

const PROVIDERS = [
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
];

// ── State ───────────────────────────────────────────────────────────────────

const detectedKeys = new Set();
let notificationActive = false;
let domainDismissed   = false;   // set asynchronously below
const HOST = window.location.hostname;

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
  return provider.domains.some(d => HOST === d || HOST.endsWith('.' + d));
}

// ── Scanner ─────────────────────────────────────────────────────────────────

function scan() {
  if (domainDismissed) return;
  // 1. Visible text
  const text = document.body?.innerText || '';
  // 2. Input values (often where keys are revealed via "Show" button)
  const inputs = Array.from(document.querySelectorAll('input, textarea, code, pre'));

  for (const provider of PROVIDERS) {
    const onDomain = isOnDomain(provider);
    if (provider.requiresDomain && !onDomain) continue;

    for (const regex of provider.patterns) {
      regex.lastIndex = 0;  // reset stateful flag
      let m;
      while ((m = regex.exec(text)) !== null) {
        if (m[0].length >= provider.minLen) handleMatch(m[0], provider, onDomain);
      }
      for (const el of inputs) {
        const v = (el.value || el.textContent || '');
        regex.lastIndex = 0;
        const im = regex.exec(v);
        if (im && im[0].length >= provider.minLen) handleMatch(im[0], provider, onDomain);
      }
    }
  }
}

function handleMatch(key, provider, onDomain) {
  if (detectedKeys.has(key)) return;
  detectedKeys.add(key);
  console.log(`[KeyShield] detected ${provider.name} key on ${HOST} (onDomain=${onDomain})`);
  showNotification(key, provider, onDomain);
}

// ── Notification UI ─────────────────────────────────────────────────────────

function showNotification(key, provider, onDomain) {
  if (notificationActive) return;
  notificationActive = true;

  const container = document.createElement('div');
  container.id = 'keyshield-detection-notice';
  Object.assign(container.style, {
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

  if (!document.getElementById('keyshield-style')) {
    const style = document.createElement('style');
    style.id = 'keyshield-style';
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
      .ks-conf{display:inline-flex;align-items:center;gap:4px;font-size:10px;
        padding:2px 6px;border-radius:4px;font-weight:600}
      .ks-conf-high{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
      .ks-conf-med{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
    `;
    document.head.appendChild(style);
  }

  const conf = onDomain ? 'high' : 'med';
  const confText = onDomain
    ? `HIGH confidence — you are on ${HOST}`
    : `Detected, please verify provider`;

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="background:#0e1430;padding:6px 8px;border-radius:6px;
                  font-size:10px;font-weight:700;color:#5b8cff;
                  border:1px solid #1c2550;letter-spacing:.05em">${provider.label}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">API key detected</div>
        <div style="color:#a1a1aa;font-size:11px;margin-top:2px">${provider.name} · ${HOST}</div>
      </div>
      <span class="ks-conf ks-conf-${conf}">${onDomain ? '✓ MATCH' : '? CHECK'}</span>
    </div>
    <div style="background:#020408;padding:10px 12px;border-radius:6px;
                font-family:'JetBrains Mono',monospace;font-size:11px;
                color:#86efac;border:1px solid #131929;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      ${key.substring(0, 14)}••••••••${key.substring(key.length - 4)}
    </div>
    <div style="font-size:10px;color:#71717a;line-height:1.5">
      ${confText}
    </div>
    <div id="ks-status" style="display:none;font-size:11px;padding:6px 8px;
         border-radius:6px;line-height:1.4"></div>
    <div style="display:flex;gap:8px">
      <button id="ks-save"   class="ks-btn ks-btn-primary" style="flex:1">
        Save to vault as <strong>${provider.id}</strong>
      </button>
      <button id="ks-ignore" class="ks-btn ks-btn-ghost">Dismiss</button>
    </div>
    <div style="display:flex;justify-content:flex-end">
      <a id="ks-hide-domain" href="#"
         style="font-size:10px;color:#71717a;text-decoration:none;
                cursor:pointer;border-bottom:1px dotted #3f3f46">
        Hide for this domain
      </a>
    </div>
  `;

  document.body.appendChild(container);

  const status = container.querySelector('#ks-status');
  const setStatus = (text, kind) => {
    status.textContent = text;
    status.style.display = 'block';
    if (kind === 'ok') {
      status.style.background = 'rgba(16,185,129,.12)';
      status.style.color = '#34d399';
      status.style.border = '1px solid rgba(16,185,129,.3)';
    } else if (kind === 'err') {
      status.style.background = 'rgba(239,68,68,.12)';
      status.style.color = '#f87171';
      status.style.border = '1px solid rgba(239,68,68,.3)';
    } else {
      status.style.background = 'rgba(91,140,255,.12)';
      status.style.color = '#93b4ff';
      status.style.border = '1px solid rgba(91,140,255,.3)';
    }
  };

  let autoCloseTimer = setTimeout(() => closeNotice(), 12000);
  function closeNotice() {
    clearTimeout(autoCloseTimer);
    if (container.parentNode) container.remove();
    notificationActive = false;
  }

  const saveBtn = container.querySelector('#ks-save');
  saveBtn.onclick = () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    setStatus('Sending to your vault…', 'info');

    // Pause the auto-close while a save is in flight; we want the user to
    // actually see the success/failure toast.
    clearTimeout(autoCloseTimer);

    try {
      chrome.runtime.sendMessage(
        {
          type:    'SAVE_KEY',
          payload: {
            upstream: provider.id,                  // backend upstream name
            name:     `${provider.name} (${HOST})`,
            value:    key,
            domain:   HOST,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            setStatus(`Could not reach extension: ${chrome.runtime.lastError.message}`, 'err');
            saveBtn.disabled = false;
            saveBtn.innerHTML = `Retry save as <strong>${provider.id}</strong>`;
            return;
          }
          if (response && response.ok) {
            setStatus(`Saved ${provider.name} key to KeyShield vault`, 'ok');
            autoCloseTimer = setTimeout(closeNotice, 2200);
          } else {
            const why =
              response && response.reason === 'no-token'      ? 'Sign in to KeyShield first.'
              : response && response.reason === 'token-expired' ? 'Session expired — sign in again.'
              : response && response.reason === 'network'     ? 'Backend unreachable. Opened the dashboard.'
              : 'Save failed. Opened the dashboard.';
            setStatus(why, 'err');
            // The background opens the dashboard tab in fallback mode, so we can
            // close this notice after a short read.
            autoCloseTimer = setTimeout(closeNotice, 4000);
          }
        },
      );
    } catch (e) {
      setStatus(`Extension not available: ${String(e)}`, 'err');
      saveBtn.disabled = false;
    }
  };

  container.querySelector('#ks-ignore').onclick = closeNotice;

  container.querySelector('#ks-hide-domain').onclick = (ev) => {
    ev.preventDefault();
    dismissThisDomain();
    setStatus(`Auto-detect muted on ${HOST}.`, 'info');
    autoCloseTimer = setTimeout(closeNotice, 1200);
  };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

loadDismissedDomains();

scan();
setInterval(scan, 3000);

const observer = new MutationObserver(() => scan());
observer.observe(document.body, { childList: true, subtree: true });

// User pressed copy on a page — likely just copied a key. Re-scan.
document.addEventListener('copy', () => setTimeout(scan, 300));

// User typed/pasted in a field — likely revealing a key.
document.addEventListener('input', () => setTimeout(scan, 300), { capture: true });
