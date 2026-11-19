import './browser-api.js';
import { requireProvider } from './lib/policy.js';
import { PATTERNS, detectPage, pairAWS } from './lib/detect.js';
import { LocalVault, audit } from './lib/vault.js';

const vault = new LocalVault(chrome.storage.local);
let serial = (async () => {
  const stored = await chrome.storage.local.get(null);
  const legacy = Object.keys(stored).filter((key) => !['vault', 'auditLog'].includes(key));
  if (legacy.length) await chrome.storage.local.remove(legacy);
})();

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) throw new Error('not a supported provider page');
  const origin = await requireProvider(tab.url, chrome.permissions);
  return { tab, origin };
}

async function handle(message) {
  switch (message.type) {
    case 'UNLOCK':
      await vault.unlock(message.passphrase);
      return { entries: vault.list() };
    case 'LOCK':
      vault.lock();
      return {};
    case 'IDLE':
      if (!Number.isFinite(message.seconds) || message.seconds < 1 || message.seconds > 3600) throw new Error('Idle lock must be 1–3600 seconds');
      vault.requireUnlocked();
      vault.idleMs = message.seconds * 1000;
      vault.touch();
      return {};
    case 'LIST':
      return { entries: vault.list() };
    case 'FIND': {
      const { tab, origin } = await activeTab();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: detectPage, args: [PATTERNS, origin],
      });
      return { candidates: pairAWS(results[0]?.result || []), origin, tabId: tab.id };
    }
    case 'DECLINE': {
      const { origin } = await activeTab();
      await audit(chrome.storage.local, 'declined', { provider: message.provider, origin });
      return {};
    }
    case 'SAVE': {
      vault.requireUnlocked();
      const { tab, origin } = await activeTab();
      if (origin !== message.origin || tab.id !== message.tabId) throw new Error('Page changed — find keys again');
      const { provider, value, preview } = message.candidate || {};
      if (typeof value !== 'string' || !value || typeof provider !== 'string') throw new Error('Select a candidate first');
      const result = await vault.save({ provider, value, preview, origin }, message.label, message.confirmDuplicate === true);
      if (result.saved) await audit(chrome.storage.local, 'saved', { provider, origin });
      return result;
    }
    case 'FILL': {
      const entry = vault.get(message.id);
      const { tab, origin } = await activeTab();
      if (origin !== entry.origin) throw new Error('Fill refused: this key belongs to another origin');
      if (entry.provider === 'aws') throw new Error('AWS pairs cannot fill a single input');
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (value, boundOrigin) => {
          if (location.origin !== boundOrigin) return false;
          const input = document.activeElement;
          if (!(input instanceof HTMLInputElement) || input.disabled || input.readOnly || !input.getClientRects().length || !['text', 'password', 'search', 'url', 'email', 'tel'].includes(input.type)) return false;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        },
        args: [entry.value, entry.origin],
      });
      if (!results[0]?.result) throw new Error('Focus an editable input on the saved origin first');
      await audit(chrome.storage.local, 'filled', entry);
      return {};
    }
    default:
      throw new Error('Unknown action');
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  serial = serial.catch(() => {}).then(async () => {
    try { respond({ ok: true, ...await handle(message) }); }
    catch (error) { respond({ ok: false, error: error.message }); }
  });
  return true;
});
