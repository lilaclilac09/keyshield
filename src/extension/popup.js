import { permissionFor } from './lib/policy.js';

const $ = (id) => document.getElementById(id);
let selected = null;
let pendingUpdate = null;
async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Vault unavailable — reopen the extension');
  return response;
}
function clearPending() {
  selected = null;
  pendingUpdate = null;
  $('confirmation').hidden = true;
  $('confirm').hidden = true;
  $('preview').textContent = '';
}
function showPending(pending) {
  selected = pending;
  pendingUpdate = null;
  $('preview').textContent = pending.preview;
  $('origin').textContent = pending.origin;
  $('provider').replaceChildren(...pending.providers.map((provider) => new Option(provider, provider)));
  $('provider').value = pending.provider;
  $('confirmation').hidden = false;
  $('confirm').hidden = true;
  $('status').textContent = 'Confirm provider and label, then Save. Nothing saved yet.';
}
function renderEntries(entries) {
  $('entries').replaceChildren(...entries.map((entry) => new Option(
    `${entry.label || entry.provider} · ${entry.preview} · ${entry.origin}`, entry.id,
  )));
}
async function refresh() {
  try { renderEntries((await send({ type: 'LIST' })).entries); }
  catch { renderEntries([]); }
}
function action(id, handler) {
  $(id).addEventListener('click', async () => {
    $(id).disabled = true;
    try { await handler(); }
    catch (error) { $('status').textContent = error.message; }
    finally { $(id).disabled = false; }
  });
}
action('unlock', async () => {
  const passphrase = $('passphrase').value;
  $('passphrase').value = '';
  renderEntries((await send({ type: 'UNLOCK', passphrase })).entries);
  $('status').textContent = 'Vault unlocked on this device';
});
action('lock', async () => {
  await send({ type: 'LOCK' });
  renderEntries([]);
  $('status').textContent = 'Vault locked';
});
action('set-idle', async () => {
  await send({ type: 'IDLE', seconds: Number($('idle').value) });
  $('status').textContent = 'Idle lock updated for this session';
});
action('add', async () => {
  const value = $('key-value').value;
  $('key-value').value = '';
  if (selected) await send({ type: 'CANCEL', id: selected.id });
  clearPending();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const permission = permissionFor(tab?.url);
  if (!permission) throw new Error('not a supported provider page');
  const grant = { origins: [permission] };
  if (!await chrome.permissions.contains(grant) && !await chrome.permissions.request(grant)) {
    throw new Error('not a supported provider page');
  }
  showPending((await send({ type: 'ADD', value })).pending);
});
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
    $('status').textContent = 'Already saved — Update label? Confirm to change only the label.';
  } else {
    clearPending();
    await refresh();
    $('status').textContent = 'Saved encrypted on this device';
  }
}
action('save', () => save(false));
action('confirm', () => save(true));
action('cancel', async () => {
  const id = selected?.id;
  clearPending();
  await send({ type: 'CANCEL', id, audit: true });
  $('status').textContent = 'Cancelled — nothing saved';
});
action('fill', async () => {
  await send({ type: 'FILL', id: $('entries').value });
  $('status').textContent = 'Filled focused input on the saved origin';
});
window.addEventListener('pagehide', () => {
  if (selected) chrome.runtime.sendMessage({ type: 'CANCEL', id: selected.id }).catch(() => {});
  clearPending();
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.vault) refresh();
});
if (location.pathname === '/confirm.html') $('add-form').hidden = true;
try { showPending((await send({ type: 'PENDING' })).pending); }
catch (error) { if (location.pathname === '/confirm.html') $('status').textContent = error.message; }
await refresh();
