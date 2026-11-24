import './browser-api.js';
import { PROVIDER_ORIGINS, originPattern, permissionFor, requireProvider } from './lib/policy.js';
import { PATTERNS, recognizeValue } from './lib/recognize.js';
import { LocalVault, audit } from './lib/vault.js';

const vault = new LocalVault(chrome.storage.local);
const providers = [...new Set(PATTERNS.map((pattern) => pattern.provider))];
const menuOptions = {
  id: 'save-selection', title: 'Save selection to KeyShield', contexts: ['selection'],
  documentUrlPatterns: PROVIDER_ORIGINS.flatMap((origin) => {
    const pattern = originPattern(origin);
    return origin === 'https://github.com'
      ? [pattern.replace('/*', '/settings'), pattern.replace('/*', '/settings/*')] : [pattern];
  }),
};
let pending = null;
let serial = (async () => {
  const stored = await chrome.storage.local.get(null);
  const legacy = Object.keys(stored).filter((key) => !['vault', 'auditLog'].includes(key));
  if (legacy.length) await chrome.storage.local.remove(legacy);
})();

function pendingMetadata() {
  if (!pending) throw new Error('No pending value — add or select a key again');
  if (pending.error) throw new Error(pending.error);
  const { id, provider, preview, origin, permissionNeeded } = pending;
  return { id, provider, preview, origin, permissionNeeded, providers };
}

function prepare(value, tab, origin, permissionNeeded = false) {
  pending = null;
  const candidate = recognizeValue(value);
  if (!candidate) throw new Error('Not a recognised key, nothing saved');
  pending = { ...candidate, id: crypto.randomUUID(), tabId: tab.id, origin, permissionNeeded };
  return pendingMetadata();
}

async function handleSelection(info, tab) {
  if (info.menuItemId !== menuOptions.id) return;
  pending = null;
  try {
    const permission = permissionFor(tab?.url);
    if (!permission || !tab?.id) throw new Error('not a supported provider page');
    const granted = await chrome.permissions.contains({ origins: [permission] });
    prepare(info.selectionText, tab, new URL(tab.url).origin, !granted);
  } catch (error) {
    pending = { id: crypto.randomUUID(), error: error.message };
  }
  const selected = pending;
  try {
    const window = await chrome.windows.create({ url: chrome.runtime.getURL('confirm.html'), type: 'popup', width: 410, height: 750 });
    if (pending === selected) pending.windowId = window.id;
  } catch (error) {
    pending = null;
    throw error;
  }
  return { ok: !selected.error, error: selected.error };
}

async function registerMenu() {
  if (!chrome.contextMenus) return;
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create(menuOptions);
}
chrome.runtime.onInstalled.addListener(registerMenu);
chrome.runtime.onStartup.addListener(registerMenu);
chrome.contextMenus?.onClicked.addListener((info, tab) => {
  serial = serial.catch(() => {}).then(() => handleSelection(info, tab));
});
chrome.windows?.onRemoved.addListener((id) => {
  if (pending?.windowId === id) pending = null;
});

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
    case 'ADD': {
      pending = null;
      const { tab, origin } = await activeTab();
      return { pending: prepare(message.value, tab, origin) };
    }
    case 'PENDING':
      return { pending: pendingMetadata() };
    case 'CANCEL': {
      if (!pending || pending.id !== message.id) return {};
      const cancelled = pending;
      pending = null;
      if (!cancelled.error && message.audit === true) await audit(chrome.storage.local, 'declined', cancelled);
      return {};
    }
    case 'SAVE': {
      vault.requireUnlocked();
      pendingMetadata();
      if (pending.id !== message.id) throw new Error('No pending value — add or select a key again');
      const selected = pending;
      const tab = await chrome.tabs.get(selected.tabId);
      const origin = await requireProvider(tab.url, chrome.permissions);
      if (origin !== selected.origin) throw new Error('Page changed — add or select the key again');
      const { value, preview } = selected;
      const provider = message.provider;
      if (!providers.includes(provider)) throw new Error('Choose a supported provider');
      const result = await vault.save({ provider, value, preview, origin }, message.label, message.confirmDuplicate === true);
      if (result.saved) {
        pending = null;
        await audit(chrome.storage.local, 'saved', { provider, origin });
      }
      return result;
    }
    case 'FILL': {
      const entry = vault.get(message.id);
      const { tab, origin } = await activeTab();
      if (origin !== entry.origin) throw new Error('Fill refused: this key belongs to another origin');
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
  if (sender.id !== chrome.runtime.id || !['popup.html', 'confirm.html'].some((page) => sender.url === chrome.runtime.getURL(page))) return false;
  serial = serial.catch(() => {}).then(async () => {
    try { respond({ ok: true, ...await handle(message) }); }
    catch (error) { respond({ ok: false, error: error.message }); }
  });
  return true;
});
