import { permissionFor } from './lib/policy.js';

const $ = (id) => document.getElementById(id);
let found = null;
let pendingUpdate = null;
async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Vault unavailable — reopen the extension');
  return response;
}
function clearCandidates() {
  found = null;
  pendingUpdate = null;
  $('candidate').replaceChildren();
  $('candidates').hidden = true;
  $('confirm').hidden = true;
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
  clearCandidates();
  renderEntries([]);
  $('status').textContent = 'Vault locked';
});
action('set-idle', async () => {
  await send({ type: 'IDLE', seconds: Number($('idle').value) });
  $('status').textContent = 'Idle lock updated for this session';
});
action('find', async () => {
  clearCandidates();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const permission = permissionFor(tab?.url);
  if (!permission) throw new Error('not a supported provider page');
  const grant = { origins: [permission] };
  if (!await chrome.permissions.contains(grant) && !await chrome.permissions.request(grant)) {
    throw new Error('not a supported provider page');
  }
  found = await send({ type: 'FIND' });
  $('candidate').replaceChildren(...found.candidates.map((item, index) => new Option(
    `${item.provider} · ${item.preview}`, String(index),
  )));
  $('candidates').hidden = !found.candidates.length;
  $('status').textContent = found.candidates.length ? 'Select a candidate, then Save. Nothing saved yet.' : 'No visible keys found';
});
$('candidate').addEventListener('change', () => {
  pendingUpdate = null;
  $('confirm').hidden = true;
});
async function save(confirmDuplicate) {
  if (!found) throw new Error('Find keys first');
  const candidate = found.candidates[Number($('candidate').value)];
  const payload = confirmDuplicate ? pendingUpdate : {
    type: 'SAVE', candidate, label: $('label').value || candidate.provider,
    origin: found.origin, tabId: found.tabId,
  };
  if (!payload) throw new Error('Choose Save first');
  const result = await send({ ...payload, confirmDuplicate });
  if (result.duplicate) {
    pendingUpdate = payload;
    $('confirm').hidden = false;
    $('status').textContent = 'Already saved — Update label? Confirm to change only the label.';
  } else {
    clearCandidates();
    await refresh();
    $('status').textContent = 'Saved encrypted on this device';
  }
}
action('save', () => save(false));
action('confirm', () => save(true));
action('decline', async () => {
  const candidate = found?.candidates[Number($('candidate').value)];
  clearCandidates();
  if (candidate) await send({ type: 'DECLINE', provider: candidate.provider });
  $('status').textContent = 'Declined — nothing saved';
});
action('fill', async () => {
  await send({ type: 'FILL', id: $('entries').value });
  $('status').textContent = 'Filled focused input on the saved origin';
});
window.addEventListener('pagehide', clearCandidates);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.vault) refresh();
});
await refresh();
