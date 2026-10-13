/**
 * Original dashboard names (Panthermaze, Heronplanet) + expiry, then
 * helius1 / helius2 when the page name is missing or duplicated.
 */

import { isGenericVaultName, providerMeta } from './provider-catalog';

export type PageKeyRecord = {
  name: string;
  prefix: string;
  expiresAt?: string;
};

const PAGE_NAME_RE = /^[A-Za-z][A-Za-z0-9 _-]{2,47}$/;
const PAGE_NAME_BLOCK = new Set([
  'name', 'names', 'api key', 'api keys', 'key', 'keys', 'expires',
  'expiry', 'created', 'status', 'actions', 'type', 'product',
]);

export function looksLikePageKeyName(name: string, upstream = ''): boolean {
  const text = String(name || '').trim();
  if (!text || PAGE_NAME_BLOCK.has(text.toLowerCase())) return false;
  if (/https?:/i.test(text) || /[•…]/.test(text)) return false;
  if (/sk-|gsk_|helius_auth_|github_pat_|ghp_/i.test(text)) return false;
  if (/^[0-9a-f-]{8,}$/i.test(text)) return false;
  if (/\b(key|keys|rpc|api)$/i.test(text)) return false;
  const up = String(upstream || '').trim().toLowerCase();
  if (up && (text.toLowerCase() === up || text.toLowerCase() === providerMeta(up).name.toLowerCase())) return false;
  return PAGE_NAME_RE.test(text);
}

export function keyPrefixFromCell(text: string): string {
  const cell = String(text || '').trim();
  const uuid = cell.match(/[0-9a-f]{8}(?:-[0-9a-f*]{4}){3}-[0-9a-f*]{12}/i);
  if (uuid) return uuid[0].slice(0, 8).toLowerCase();
  const auth = cell.match(/helius_auth_[A-Za-z0-9]{8,}/i);
  if (auth) return auth[0].slice(0, 16).toLowerCase();
  const sk = cell.match(/sk-[A-Za-z0-9_-]{8,}/);
  if (sk) return sk[0].slice(0, 10);
  return '';
}

export function parseExpiryCell(text: string): string | undefined {
  const cell = String(text || '').trim();
  const iso = cell.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const us = cell.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!us) return undefined;
  const a = Number(us[1]);
  const b = Number(us[2]);
  const y = us[3];
  const month = a > 12 ? b : a;
  const day = a > 12 ? a : b;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function extractPageKeyRecords(text: string): PageKeyRecord[] {
  const lines = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const out: PageKeyRecord[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i];
    if (!looksLikePageKeyName(name)) continue;
    const next = lines[i + 1] || '';
    const prefix = keyPrefixFromCell(next) || keyPrefixFromCell(name);
    if (!prefix) continue;
    const expiresAt = parseExpiryCell(lines[i + 2] || '') || parseExpiryCell(next);
    const id = `${name.toLowerCase()}:${prefix}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ name, prefix, expiresAt });
  }
  return out;
}

export function labelForDetectedKey(key: string, records: PageKeyRecord[]): string {
  const prefix = keyPrefixFromCell(key) || String(key || '').slice(0, 8).toLowerCase();
  if (!prefix) return '';
  const hit = records.find((row) => row.prefix && prefix.startsWith(row.prefix));
  return hit?.name || '';
}

export function uniquifyVaultName(name: string, upstream: string, taken: string[]): string {
  const given = String(name || '').trim();
  const up = String(upstream || 'api').trim().toLowerCase() || 'api';
  const takenLower = new Set(taken.map((row) => String(row || '').trim().toLowerCase()).filter(Boolean));
  if (looksLikePageKeyName(given, up) && !takenLower.has(given.toLowerCase())) return given;
  if (looksLikePageKeyName(given, up)) {
    const stem = given.replace(/\s+\d+$/, '');
    let i = 2;
    while (takenLower.has(`${stem} ${i}`.toLowerCase()) || takenLower.has(`${stem}${i}`.toLowerCase())) i += 1;
    return `${stem} ${i}`;
  }
  let i = 1;
  while (takenLower.has(`${up}${i}`) || takenLower.has(`${up} ${i}`)) i += 1;
  return `${up}${i}`;
}

export function isProviderHostLabel(name: string, upstream: string): boolean {
  const n = String(name || '').trim().toLowerCase();
  const meta = providerMeta(upstream).name.toLowerCase();
  if (!n) return true;
  if (n === meta || n.startsWith(`${meta} (`)) return true;
  return isGenericVaultName(name, upstream);
}
