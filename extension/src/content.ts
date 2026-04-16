/**
 * KeyShield Agentic - Content Script
 *
 * Runs on all pages. Responsibilities:
 * 1. Detect API keys in forms, clipboard, and DOM
 * 2. Handle x402 payment responses (manual prompt + auto-pay for trusted domains)
 * 3. Provide autofill functionality via shield icon on input fields
 * 4. Monitor for HTTP 402 Payment Required responses
 *
 * Encryption is handled in background.ts (holds the Lit singleton).
 * Content script sends plaintext to background over chrome.runtime — this is
 * extension-internal messaging (same browser process), not a network call.
 */

import { KeyDetector, type DetectedKey } from './lib/detector';
import { X402Handler } from './lib/x402';

// ── State ─────────────────────────────────────────────────────────────────────

let detectedKeys: DetectedKey[] = [];
const MAX_DETECTED_KEYS = 50; // cap to prevent unbounded growth
let isMonitoring = false;
let x402: X402Handler | null = null;

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  console.log('[KeyShield] Initializing content script...');

  x402 = new X402Handler();

  startDetection();
  setupX402Listener();
  setupAutofill();

  console.log('[KeyShield] Content script initialized');
}

// ── Key Detection ─────────────────────────────────────────────────────────────

function startDetection() {
  if (isMonitoring) return;
  isMonitoring = true;

  // Initial scan after page settles
  setTimeout(detectKeys, 1000);

  // Monitor form inputs as they change
  KeyDetector.setupFormMonitoring((keys) => {
    handleDetectedKeys(keys);
  });

  // Clipboard: detect on paste
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      const clipboardKey = await KeyDetector.detectClipboard();
      if (clipboardKey) handleDetectedKeys([clipboardKey]);
    }
  });

  // DOM mutations (dynamic SPAs)
  const observer = new MutationObserver(() => detectKeys());
  observer.observe(document.body, { childList: true, subtree: true });
}

function detectKeys() {
  try {
    const formKeys = KeyDetector.detectFormFields();
    const domKeys = KeyDetector.detectFromDOMContent();
    const allKeys = [...formKeys, ...domKeys];
    if (allKeys.length > 0) handleDetectedKeys(allKeys);
  } catch (error) {
    console.error('[KeyShield] Detection error:', error);
  }
}

function handleDetectedKeys(keys: DetectedKey[]) {
  // Deduplicate against already-tracked keys
  const newKeys = keys.filter(
    (k) => !detectedKeys.some((e) => e.key === k.key && e.provider === k.provider)
  );
  if (newKeys.length === 0) return;

  // Cap list size
  detectedKeys = [...detectedKeys, ...newKeys].slice(-MAX_DETECTED_KEYS);

  // Tell background — it will check for rotation and store metadata
  chrome.runtime.sendMessage({ type: 'KEYS_DETECTED', keys: newKeys });

  // Show save prompt for high-confidence detections
  newKeys.forEach((key) => {
    if (key.confidence >= 70) showSavePrompt(key);
  });
}

// ── Save Prompt ───────────────────────────────────────────────────────────────

function showSavePrompt(key: DetectedKey) {
  chrome.storage.local.get(['autoSaveEnabled'], (result) => {
    if (result.autoSaveEnabled) {
      storeKey(key);
    } else {
      showNotificationBadge(key);
    }
  });
}

function showNotificationBadge(key: DetectedKey) {
  // Remove any existing prompt first
  document.getElementById('keyshield-save-prompt')?.remove();

  const badge = document.createElement('div');
  badge.id = 'keyshield-save-prompt';
  badge.innerHTML = `
    <div style="
      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
      background: linear-gradient(135deg, #1e1f20 0%, #2a2b2c 100%);
      color: white; padding: 14px 20px; border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); border: 1px solid #3a3b3c;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px; display: flex; align-items: center; gap: 10px;
      animation: ks-slide-in 0.25s ease;
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6200" stroke-width="2.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span style="color:#ccc;">${key.provider || 'API Key'} detected</span>
      <button id="ks-save-btn" style="
        background: #ff6200; border: none; color: white; padding: 6px 14px;
        border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 12px;
      ">Secure</button>
      <button id="ks-dismiss-btn" style="
        background: transparent; border: none; color: #666; cursor: pointer; font-size: 16px;
      ">×</button>
    </div>
    <style>
      @keyframes ks-slide-in { from { transform: translateX(110%); opacity: 0; } to { transform: none; opacity: 1; } }
    </style>
  `;

  document.body.appendChild(badge);

  document.getElementById('ks-save-btn')?.addEventListener('click', () => {
    storeKey(key);
    badge.remove();
  });
  document.getElementById('ks-dismiss-btn')?.addEventListener('click', () => badge.remove());

  setTimeout(() => badge.remove(), 10000);
}

/**
 * Send key to background for encryption + storage.
 * Background holds the Lit singleton and handles the encrypt → store flow.
 */
function storeKey(key: DetectedKey) {
  chrome.runtime.sendMessage(
    { type: 'STORE_KEY', key },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[KeyShield] STORE_KEY port error:', chrome.runtime.lastError.message);
        return;
      }
      if (response?.success) {
        console.log('[KeyShield] Key stored:', key.provider);
      } else {
        console.error('[KeyShield] STORE_KEY failed:', response?.error);
      }
    }
  );
}

// ── Autofill ──────────────────────────────────────────────────────────────────

const API_INPUT_SELECTORS = [
  'input[name*="api"]', 'input[name*="key"]', 'input[name*="token"]', 'input[name*="secret"]',
  'input[id*="api"]', 'input[id*="key"]', 'input[id*="token"]', 'input[id*="secret"]',
  'input[placeholder*="API"]', 'input[placeholder*="Key"]', 'input[placeholder*="Token"]',
  'input[type="password"]',
];

let activeInput: HTMLInputElement | null = null;
let triggerIcon: HTMLElement | null = null;
let fillMenu: HTMLElement | null = null;

function setupAutofill() {
  attachAutofillListeners();
  // Re-attach when DOM changes (SPAs)
  new MutationObserver(() => attachAutofillListeners()).observe(document.body, {
    childList: true, subtree: true,
  });
}

function attachAutofillListeners() {
  const inputs = document.querySelectorAll<HTMLInputElement>('input:not([data-ks-active])');
  inputs.forEach((input) => {
    const isTarget = API_INPUT_SELECTORS.some((sel) => input.matches(sel));
    if (!isTarget) return;
    input.setAttribute('data-ks-active', 'true');
    input.addEventListener('focus', () => {
      activeInput = input;
      createTriggerIcon(input);
    });
    input.addEventListener('blur', () => setTimeout(cleanupAutofillUI, 200));
  });
}

function createTriggerIcon(input: HTMLInputElement) {
  triggerIcon?.remove();
  triggerIcon = document.createElement('div');
  triggerIcon.id = 'ks-trigger';
  triggerIcon.setAttribute('role', 'button');
  triggerIcon.setAttribute('aria-label', 'Open KeyShield vault');
  triggerIcon.tabIndex = 0;

  const rect = input.getBoundingClientRect();
  Object.assign(triggerIcon.style, {
    position: 'absolute',
    top: `${window.scrollY + rect.top + rect.height / 2 - 10}px`,
    left: `${window.scrollX + rect.left + rect.width - 26}px`,
    width: '20px', height: '20px', zIndex: '2147483647',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1e1f20', border: '1px solid #3a3b3c', borderRadius: '4px',
  });

  triggerIcon.innerHTML = `
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ff6200" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>`;

  const toggle = (e: Event) => { e.preventDefault(); e.stopPropagation(); toggleFillMenu(); };
  triggerIcon.addEventListener('mousedown', toggle);
  triggerIcon.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') toggle(e);
  });

  document.body.appendChild(triggerIcon);
}

function toggleFillMenu() {
  if (fillMenu) { fillMenu.remove(); fillMenu = null; return; }

  chrome.runtime.sendMessage({ type: 'GET_VAULT_ITEMS' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[KeyShield] GET_VAULT_ITEMS error:', chrome.runtime.lastError.message);
      return;
    }
    if (response?.items) renderFillMenu(response.items);
  });
}

function renderFillMenu(items: Array<{ id: string; name: string; provider: string }>) {
  fillMenu = document.createElement('div');
  fillMenu.id = 'ks-fill-menu';

  const rect = triggerIcon!.getBoundingClientRect();
  Object.assign(fillMenu.style, {
    position: 'absolute',
    top: `${window.scrollY + rect.bottom + 4}px`,
    left: `${window.scrollX + rect.left - 190}px`,
    width: '210px', maxHeight: '220px', overflowY: 'auto',
    background: '#1e1f20', border: '1px solid #3a3b3c', borderRadius: '6px',
    boxShadow: '0 12px 24px rgba(0,0,0,0.5)', zIndex: '2147483647',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });

  if (items.length === 0) {
    fillMenu.innerHTML = `<div style="padding:14px;color:#666;font-size:12px;">No keys in vault</div>`;
  } else {
    items.forEach((item) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        padding: '10px 14px', cursor: 'pointer', fontSize: '12px', color: '#ccc',
        borderBottom: '1px solid #2a2b2c', display: 'flex', alignItems: 'center', gap: '8px',
      });
      row.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff6200" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>${item.name}</span>
        <span style="color:#555;font-size:10px;margin-left:auto">${item.provider || ''}</span>`;
      row.addEventListener('mouseenter', () => { row.style.background = '#2a2b2c'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        autofillKey(item.id);
        fillMenu?.remove(); fillMenu = null;
      });
      fillMenu!.appendChild(row);
    });
  }

  document.body.appendChild(fillMenu);
}

function autofillKey(itemId: string) {
  chrome.runtime.sendMessage({ type: 'DECRYPT_KEY', id: itemId }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[KeyShield] DECRYPT_KEY error:', chrome.runtime.lastError.message);
      return;
    }
    if (response?.value && activeInput) {
      // Inject into the focused input
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      nativeInputValueSetter?.call(activeInput, response.value);
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

function cleanupAutofillUI() {
  triggerIcon?.remove(); triggerIcon = null;
  fillMenu?.remove(); fillMenu = null;
}

// ── x402 Payment Interception ─────────────────────────────────────────────────

function setupX402Listener() {
  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    let response: Response;
    try {
      response = await originalFetch(...args);
    } catch (err) {
      // chrome:// or other blocked URLs — pass through
      throw err;
    }
    if (response.status === 402) {
      handle402Response(response).catch(() => {/* non-blocking */});
    }
    return response;
  };

  // Intercept XHR
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      this.addEventListener('load', () => {
        if (this.status === 402) {
          handle402ResponseFromXHR(this).catch(() => {/* non-blocking */});
        }
      });
    } catch {
      // Ignore — some environments block XHR listener addition
    }
    return originalOpen.call(this, method, url as string, ...(rest as [boolean?, string?, string?]));
  };
}

async function handle402Response(response: Response) {
  const paymentHeader = response.headers.get('X-Payment-Required');
  const amountHeader = response.headers.get('X-Payment-Amount');
  const memoHeader = response.headers.get('X-Payment-Memo');

  if (paymentHeader !== 'x402' || !amountHeader) return; // Not an x402 payment

  const payment = {
    amount: parseFloat(amountHeader),
    memo: memoHeader || 'API Payment',
    url: response.url,
  };

  // Check if domain is trusted for auto-pay
  const trusted = await isTrustedDomain(new URL(response.url).hostname, payment.amount);
  if (trusted) {
    initiatePayment(payment, 'streaming');
  } else {
    show402Modal(payment);
  }
}

async function handle402ResponseFromXHR(xhr: XMLHttpRequest) {
  const headers = xhr.getAllResponseHeaders();
  const isX402 = headers.includes('x-payment-required: x402');
  const amountMatch = headers.match(/x-payment-amount:\s*([\d.]+)/i);
  const memoMatch = headers.match(/x-payment-memo:\s*(.+)/i);

  if (!isX402 || !amountMatch) return;

  const payment = {
    amount: parseFloat(amountMatch[1]),
    memo: memoMatch?.[1]?.trim() || 'API Payment',
    url: xhr.responseURL || window.location.href,
  };

  const trusted = await isTrustedDomain(new URL(payment.url).hostname, payment.amount);
  if (trusted) {
    initiatePayment(payment, 'streaming');
  } else {
    show402Modal(payment);
  }
}

async function isTrustedDomain(hostname: string, amount: number): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['trustedDomains', 'autoPayThreshold'], (result) => {
      const trusted: string[] = result.trustedDomains || [];
      const threshold: number = result.autoPayThreshold ?? 0.01; // default $0.01
      resolve(trusted.includes(hostname) && amount <= threshold);
    });
  });
}

function show402Modal(payment: { amount: number; memo: string; url: string }) {
  document.getElementById('ks-402-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'ks-402-modal';
  modal.innerHTML = `
    <div style="
      position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="
        background: #1e1f20; border: 1px solid #3a3b3c; border-radius: 14px;
        padding: 28px; max-width: 400px; width: 90%; text-align: center; color: white;
      ">
        <div style="
          width: 52px; height: 52px; margin: 0 auto 16px;
          background: linear-gradient(135deg, #ff6200, #ff8c42);
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
        ">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h2 style="margin: 0 0 6px; font-size: 18px;">Payment Required</h2>
        <p style="color: #888; font-size: 13px; margin: 0 0 20px;">
          This service requires a micropayment via x402.
        </p>
        <div style="
          background: #2a2b2c; border-radius: 8px; padding: 14px;
          margin-bottom: 20px; text-align: left;
        ">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px;">
            <span style="color: #888;">Amount</span>
            <span style="font-weight: 600;">$${payment.amount.toFixed(4)} USDC</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px;">
            <span style="color: #888;">Service</span>
            <span style="font-weight: 600;">${new URL(payment.url).hostname}</span>
          </div>
        </div>
        <button id="ks-pay-streaming" style="
          width: 100%; background: #ff6200; border: none; color: white;
          padding: 12px; border-radius: 8px; font-size: 14px; font-weight: 600;
          cursor: pointer; margin-bottom: 8px;
        ">Pay with KeyShield (Streaming)</button>
        <button id="ks-pay-once" style="
          width: 100%; background: #2a2b2c; border: 1px solid #3a3b3c; color: #ccc;
          padding: 12px; border-radius: 8px; font-size: 14px; cursor: pointer; margin-bottom: 8px;
        ">Pay Once</button>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #888; cursor: pointer; justify-content: center; margin-bottom: 10px;">
          <input type="checkbox" id="ks-trust-domain" style="cursor:pointer;"/>
          Always auto-pay ${new URL(payment.url).hostname} under $0.01
        </label>
        <button id="ks-402-cancel" style="
          background: transparent; border: none; color: #666; cursor: pointer; font-size: 13px;
        ">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  document.getElementById('ks-pay-streaming')?.addEventListener('click', () => {
    saveTrustIfChecked(payment.url);
    initiatePayment(payment, 'streaming');
    modal.remove();
  });
  document.getElementById('ks-pay-once')?.addEventListener('click', () => {
    saveTrustIfChecked(payment.url);
    initiatePayment(payment, 'once');
    modal.remove();
  });
  document.getElementById('ks-402-cancel')?.addEventListener('click', () => modal.remove());
}

function saveTrustIfChecked(url: string) {
  const checked = (document.getElementById('ks-trust-domain') as HTMLInputElement)?.checked;
  if (!checked) return;
  const hostname = new URL(url).hostname;
  chrome.storage.local.get(['trustedDomains'], (result) => {
    const trusted: string[] = result.trustedDomains || [];
    if (!trusted.includes(hostname)) {
      chrome.storage.local.set({ trustedDomains: [...trusted, hostname] });
    }
  });
}

function initiatePayment(
  payment: { amount: number; memo: string; url: string },
  mode: 'streaming' | 'once'
) {
  chrome.runtime.sendMessage(
    { type: 'INITIATE_PAYMENT', payment, mode },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('[KeyShield] Payment error:', chrome.runtime.lastError.message);
        return;
      }
      console.log('[KeyShield] Payment initiated:', response);
    }
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, detectKeys, handle402Response };
