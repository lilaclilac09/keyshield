import { originPattern, permissionFor } from './lib/policy.js';

const $ = (id) => document.getElementById(id);
let selected = null;
let pendingUpdate = null;
let pageGrant = null;
let selectedGrant = null;
let pageOrigin = null;
let listedEntries = [];
function showStatus(message, tone = 'info') {
  $('status').textContent = message;
  $('status').className = `status status--${tone}`;
}
async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Vault unavailable — reopen the extension');
  return response;
}
function clearPending() {
  selected = null;
  selectedGrant = null;
  pendingUpdate = null;
  $('confirmation').hidden = true;
  $('confirm').hidden = true;
  $('preview').textContent = '';
}
function showPending(pending) {
  selected = pending;
  selectedGrant = { origins: [originPattern(pending.origin)] };
  pendingUpdate = null;
  $('preview').textContent = pending.preview;
  $('origin').textContent = pending.origin;
  $('provider').replaceChildren(...pending.providers.map((provider) => new Option(provider, provider)));
  $('provider').value = pending.provider;
  $('confirmation').hidden = false;
  $('confirm').hidden = true;
  showStatus(pending.permissionNeeded ? `Permission needed for ${pending.origin}` : 'Confirm provider and label, then Save. Nothing saved yet.');
}
function describeFill() {
  const entry = listedEntries.find((entry) => entry.id === $('entries').value);
  const unavailable = entry && (!pageGrant || entry.origin !== pageOrigin);
  $('fill-availability').textContent = entry
    ? `${unavailable ? 'Not available on this site. ' : ''}Fill only on ${entry.origin}`
    : 'No saved key selected. Unlock or add a key.';
  $('fill-availability').className = `availability${unavailable ? ' unavailable' : ''}`;
}
function renderEntries(entries) {
  if (!$('entries')) return;
  listedEntries = entries;
  $('entries').replaceChildren(...entries.map((entry) => new Option(
    `${entry.label || entry.provider} · ${entry.preview} · ${entry.origin}`, entry.id,
  )));
  $('entry-list').replaceChildren(...entries.map((entry) => {
    const row = document.createElement('li');
    row.className = 'saved-key';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'This device only';
    const name = document.createElement('p');
    name.className = 'saved-key-name';
    name.textContent = `${entry.label || entry.provider} · ${entry.preview}`;
    const origin = document.createElement('p');
    origin.className = 'saved-key-origin';
    origin.textContent = `Fill only on ${entry.origin}`;
    row.append(badge, name, origin);
    if (!pageGrant || entry.origin !== pageOrigin) {
      const notice = document.createElement('p');
      notice.className = 'unavailable';
      notice.textContent = 'Not available on this site';
      row.append(notice);
    }
    return row;
  }));
  describeFill();
}
async function refresh() {
  try { renderEntries((await send({ type: 'LIST' })).entries); }
  catch { renderEntries([]); }
}
function action(id, handler, permission = null) {
  $(id).addEventListener('click', async () => {
    try {
      const grant = permission === 'page' ? pageGrant : selectedGrant;
      const request = permission && grant ? chrome.permissions.request(grant) : null;
      $(id).disabled = true;
      if (permission && (!request || !await request)) throw new Error('not a supported provider page');
      await handler();
    }
    catch (error) { showStatus(error.message, error.message.includes('Unlock') ? 'locked' : 'error'); }
    finally { $(id).disabled = false; }
  });
}
action('unlock', async () => {
  const passphrase = $('passphrase').value;
  $('passphrase').value = '';
  renderEntries((await send({ type: 'UNLOCK', passphrase })).entries);
  showStatus('Vault unlocked on this device', 'success');
});
action('lock', async () => {
  await send({ type: 'LOCK' });
  renderEntries([]);
  showStatus('Vault locked', 'locked');
});
action('set-idle', async () => {
  await send({ type: 'IDLE', seconds: Number($('idle').value) });
  showStatus('Idle lock updated for this session', 'success');
});
action('add', async () => {
  const value = $('key-value').value;
  $('key-value').value = '';
  if (selected) await send({ type: 'CANCEL', id: selected.id });
  clearPending();
  showPending((await send({ type: 'ADD', value })).pending);
}, 'page');
$('provider').addEventListener('change', () => {
  pendingUpdate = null;
  $('confirm').hidden = true;
});
async function save(confirmDuplicate) {
  if (!selected) throw new Error('Add or select one key first');
  const payload = confirmDuplicate ? pendingUpdate : {
    type: 'SAVE', id: selected.id, provider: $('provider').value, label: $('label').value || $('provider').value,
  };
  if (!payload) throw new Error('Choose Save first');
  const result = await send({ ...payload, confirmDuplicate });
  if (result.duplicate) {
    pendingUpdate = payload;
    $('confirm').hidden = false;
    showStatus('Already saved — Update label? Confirm to change only the label.');
  } else {
    clearPending();
    await refresh();
    showStatus('Saved encrypted on this device', 'success');
  }
}
action('save', () => save(false), 'selection');
action('confirm', () => save(true), 'selection');
action('cancel', async () => {
  const id = selected?.id;
  clearPending();
  await send({ type: 'CANCEL', id, audit: true });
  showStatus('Cancelled — nothing saved');
});
if ($('fill')) action('fill', async () => {
  await send({ type: 'FILL', id: $('entries').value });
  showStatus('Filled focused input on the saved origin', 'success');
}, 'page');
if ($('entries')) $('entries').addEventListener('change', describeFill);
window.addEventListener('pagehide', () => {
  if (selected) chrome.runtime.sendMessage({ type: 'CANCEL', id: selected.id }).catch(() => {});
  clearPending();
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.vault) refresh();
});
if (location.pathname === '/confirm.html') $('add-form').hidden = true;
else {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  try { pageOrigin = new URL(tab?.url).origin; } catch { pageOrigin = null; }
  const permission = permissionFor(tab?.url);
  pageGrant = permission ? { origins: [permission] } : null;
}
try { showPending((await send({ type: 'PENDING' })).pending); }
catch (error) { if (location.pathname === '/confirm.html') showStatus(error.message, 'error'); }
await refresh();
