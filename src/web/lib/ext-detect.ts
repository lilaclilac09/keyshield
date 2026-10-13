/**
 * Shared API-key shapes for the extension toast.
 * A visible key on any page must match one of these and pop the panel.
 */

import { formatStoredApiCard } from './provider-catalog';

export type DetectedShape = {
  upstream: string;
  key: string;
};

const SHAPES: { upstream: string; re: RegExp }[] = [
  { upstream: 'nvidia', re: /nvapi-[A-Za-z0-9_-]{16,}/ },
  { upstream: 'openrouter', re: /sk-or-[A-Za-z0-9_-]{12,}/ },
  { upstream: 'anthropic', re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/ },
  { upstream: 'groq', re: /gsk_[A-Za-z0-9]{32,}/ },
  { upstream: 'helius', re: /helius_auth_[A-Za-z0-9]{16,}/ },
  { upstream: 'helius', re: /(?<![0-9a-f-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f-])/i },
  { upstream: 'cursor', re: /(?:key_|crsr[_-])[A-Za-z0-9_-]{12,}/ },
  { upstream: 'openai', re: /sk-(?:proj-|svcacct-|admin-)?(?!or-|ant-)[A-Za-z0-9_-]{20,}/ },
];

export function classifyDetectedKey(raw: string): DetectedShape | null {
  const text = String(raw || '');
  for (const row of SHAPES) {
    const found = text.match(row.re);
    if (found && found[0]) return { upstream: row.upstream, key: found[0] };
  }
  return null;
}

function isHeliusDashboardHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase().replace(/\.+$/, '');
  return host === 'dashboard.helius.dev' || host === 'helius.dev' || host.endsWith('.helius.dev')
    || host === 'helius.xyz' || host.endsWith('.helius.xyz');
}

function looksMaskedSecret(raw: string): boolean {
  return /•|…|\.{3}/.test(String(raw || ''));
}

/** All visible keys on a page. Helius UUIDs only on dashboard.helius.dev. */
export function harvestKeysFromPageText(opts: {
  text: string;
  hostname: string;
  href?: string;
}): DetectedShape[] {
  const text = String(opts.text || '');
  const hostname = String(opts.hostname || '').toLowerCase();
  const href = String(opts.href || '');
  const skipUuid = new Set(
    (href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [])
      .map((s) => s.toLowerCase()),
  );
  const out: DetectedShape[] = [];
  const seen = new Set<string>();
  for (const row of SHAPES) {
    const flags = row.re.flags.includes('g') ? row.re.flags : `${row.re.flags}g`;
    const re = new RegExp(row.re.source, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const key = match[0];
      if (!key || looksMaskedSecret(key)) continue;
      if (row.upstream === 'helius' && key.includes('-')) {
        if (!isHeliusDashboardHost(hostname)) continue;
        if (skipUuid.has(key.toLowerCase())) continue;
      }
      const id = `${row.upstream}:${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ upstream: row.upstream, key });
    }
  }
  return out;
}

export function formatHarvestSaveResult(opts: {
  saved: number;
  failed: number;
  queued?: number;
}): string {
  const saved = Math.max(0, Math.floor(Number(opts.saved) || 0));
  const failed = Math.max(0, Math.floor(Number(opts.failed) || 0));
  const queued = Math.max(0, Math.floor(Number(opts.queued) || 0));
  const inVault = saved + queued;
  if (inVault > 0) {
    return `Saved ${inVault} key${inVault === 1 ? '' : 's'} to KeyShield vault.`;
  }
  if (saved > 0 && failed === 0) {
    return `Saved ${saved} key${saved === 1 ? '' : 's'} to KeyShield vault.`;
  }
  if (saved > 0) return `Saved ${saved}, ${failed} failed.`;
  return `Saved 0, ${failed} failed.`;
}

export function shouldPopupForKey(opts: {
  alreadySaved: boolean;
  panelOpen: boolean;
}): boolean {
  return !opts.alreadySaved;
}

/** Popup must show this exact line after Remove + Load unpacked 1.2.5. Leftover 1.2.4 still counts as ready. */
export const DETECT_READY_VERSION = '1.2.5';
export const DETECT_READY_OK = `ok ${DETECT_READY_VERSION} <all_urls>`;
export const DETECT_READY_LEGACY = '1.2.4';

export function formatDetectReadyLine(opts: {
  version: string;
  hasAllUrls: boolean;
}): { ok: boolean; text: string } {
  const ver = String(opts.version || '').trim();
  if ((ver === DETECT_READY_VERSION || ver === DETECT_READY_LEGACY) && opts.hasAllUrls) {
    return { ok: true, text: `ok ${ver} <all_urls>` };
  }
  if (!opts.hasAllUrls) {
    return { ok: false, text: `need Remove + Load unpacked · v${ver || '?'} missing <all_urls>` };
  }
  return { ok: false, text: `need Remove + Load unpacked · v${ver} (want ${DETECT_READY_VERSION})` };
}

/** Signed-in popup hero: "0 saved" / "1 saved" / "3 saved". */
export function formatSavedCount(n: number): string {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? '1 saved' : `${count} saved`;
}

/** Popup collected row: "0 collected" / "1 collected" / "N collected". */
export function formatCollectedCount(n: number): string {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? '1 collected' : `${count} collected`;
}

/** Vault list length wins over a stale detect-session 0. */
export function listedVaultCount(apis: unknown, listedDomRows = 0): number {
  const fromApis = Array.isArray(apis) ? apis.length : 0;
  const fromDom = Math.max(0, Math.floor(Number(listedDomRows) || 0));
  return Math.max(fromApis, fromDom);
}

export function popupVaultHero(n: number): { saved: string; collected: string } {
  return { saved: formatSavedCount(n), collected: formatCollectedCount(n) };
}

/** Leftover 1.2.4 painted LIST_SAVED_APIS rows but left the 22px hero at "0 saved". */
export function popupHeroAgreesWithListed(hero: string, listedCount: number): boolean {
  return String(hero || '').trim() === formatSavedCount(listedCount);
}

export function formatFilledCount(n: number): string {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? '1 filled' : `${count} filled`;
}

export function formatPopupMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) < 0) return '—';
  return `${Math.max(0, Math.round(Number(ms)))}ms`;
}

export function formatFilledLine(opts: { filled: number; ms?: number | null }): string {
  return `${formatFilledCount(opts.filled)} · ${formatPopupMs(opts.ms)}`;
}

export function formatSignedStatus(signed: boolean): string {
  return signed ? 'signed' : 'Sign in';
}

export const DETECT_STATUS_CARD_ID = 'keyshield-status-card';
export const DETECT_STALE_NOTICE_ID = 'keyshield-detection-notice';

/** Toolbar click opens popup.html. Leftover 1.2.4 stamps still drop the ugly extra popup. */
export function manifestHasDefaultPopup(man: {
  action?: { default_popup?: string } | unknown;
  browser_action?: { default_popup?: string } | unknown;
}): boolean {
  const action = man && typeof man.action === 'object' && man.action
    ? (man.action as { default_popup?: string }).default_popup
    : '';
  const browser = man && typeof man.browser_action === 'object' && man.browser_action
    ? (man.browser_action as { default_popup?: string }).default_popup
    : '';
  return action === 'popup.html' || browser === 'popup.html';
}

/** @deprecated leftover stamps still drop default_popup. Repo 1.2.5 keeps it. */
export function manifestDropsDefaultPopup(man: {
  action?: { default_popup?: string } | unknown;
  browser_action?: { default_popup?: string } | unknown;
}): boolean {
  return !manifestHasDefaultPopup(man);
}

export function shouldShowDetectSignin(signed: boolean): boolean {
  return !signed;
}

export function formatDetectPanelTitle(n: number): string {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? '1 API key' : `${count} API keys`;
}

export function buildDetectPanelModel(opts: {
  signed: boolean;
  collected: Array<{ upstream: string; masked: string; saved?: boolean }>;
  saved: number;
  failed: number;
  queued?: number;
  filled: number;
  ms?: number | null;
}): {
  signed: string;
  collected: string;
  filled: string;
  save: string;
  showSignin: boolean;
} {
  const rows = Array.isArray(opts.collected) ? opts.collected : [];
  const saved = Math.max(0, Math.floor(Number(opts.saved) || 0));
  const failed = Math.max(0, Math.floor(Number(opts.failed) || 0));
  const queued = Math.max(0, Math.floor(Number(opts.queued) || 0));
  return {
    signed: formatSignedStatus(!!opts.signed),
    collected: formatCollectedCount(rows.length),
    filled: formatFilledLine({ filled: opts.filled, ms: opts.ms }),
    save: formatHarvestSaveResult({ saved, failed, queued }),
    showSignin: shouldShowDetectSignin(!!opts.signed),
  };
}

export const THREE_LINE_UI_MARK = 'data-ui="three-line"';

const LEFTOVER_POPUP_CLUTTER = [
  '<details',
  'Register token',
  'Fill this tab',
  'Use hosted',
  'Copy key for Cursor',
  'Sign in to KeyShield',
  'Allow detect + auto-save',
];

/** True when the popup is the 3-row UI (signed/collected, detect, filled + ms). */
export function isCompactPopupHtml(html: string): boolean {
  const text = String(html || '');
  if (LEFTOVER_POPUP_CLUTTER.some((mark) => text.includes(mark))) return false;
  return (
    text.includes(THREE_LINE_UI_MARK) &&
    text.includes('id="row-auth"') &&
    text.includes('id="row-detect"') &&
    text.includes('id="row-copy"') &&
    text.includes('id="signed-pane"') &&
    text.includes('id="signed-status"') &&
    text.includes('id="saved-count"') &&
    text.includes('id="saved-apis"') &&
    text.includes('id="collected-line"') &&
    text.includes('id="detect-line"') &&
    text.includes('id="copy-status"') &&
    text.includes('id="filled-line"') &&
    text.includes('id="fill-ms"') &&
    !text.includes('<details')
  );
}

/** Leftover full Settings / Register token must be overwritten. */
export function shouldRewritePopupHtml(html: string): boolean {
  return !isCompactPopupHtml(html);
}

export function looksLikeSessionToken(raw: string | null | undefined): boolean {
  return String(raw || '').trim().length >= 12;
}

export const SESSION_BRIDGE_SCRIPT = 'session-bridge.js';

export const SESSION_BRIDGE_CONTENT_SCRIPT = {
  matches: [
    'https://app.ks.aileena.xyz/*',
    'https://*.aileena.xyz/*',
    'https://keyshield.dev/*',
    'https://*.keyshield.dev/*',
    'https://*.up.railway.app/*',
    'https://*.vercel.app/*',
    'http://127.0.0.1:5173/*',
    'http://localhost:5173/*',
    'http://127.0.0.1:3000/*',
    'http://localhost:3000/*',
  ],
  js: [SESSION_BRIDGE_SCRIPT],
  run_at: 'document_start',
} as const;

export const DETECT_CONTENT_SCRIPT = {
  matches: ['<all_urls>'],
  js: ['content.js'],
  run_at: 'document_idle',
  all_frames: true,
} as const;

export function manifestHasSessionBridge(man: {
  content_scripts?: Array<{ js?: string[] }>;
}): boolean {
  return (man.content_scripts || []).some((row) => (row.js || []).includes(SESSION_BRIDGE_SCRIPT));
}

/** Loaded leftover 1.2.4: version + <all_urls> ok, but only content.js — Sign-in never reaches chrome.storage. */
export function isLeftoverContentOnlyManifest(man: {
  content_scripts?: Array<{ js?: string[] }>;
}): boolean {
  const scripts = man.content_scripts || [];
  if (manifestHasSessionBridge(man)) return false;
  return scripts.some((row) => (row.js || []).includes('content.js'));
}

/** Leftover 1.2.4 stamps often keep only content.js on <all_urls>. */
export function ensureManifestContentScripts<T extends { content_scripts?: unknown }>(man: T): T {
  man.content_scripts = [SESSION_BRIDGE_CONTENT_SCRIPT, DETECT_CONTENT_SCRIPT];
  return man;
}

/** After Sign-in, keep scanning and save every new match. */
export function shouldArmLiveScan(opts: {
  loggedIn: boolean;
  autoStorePref?: boolean;
}): boolean {
  return Boolean(opts.loggedIn) || Boolean(opts.autoStorePref);
}

export type SavedApiRow = {
  id: string;
  upstream: string;
  name: string;
  masked: string;
  family: string;
  product: string;
  domain: string;
  expires_at: string | null;
  created_at: string | null;
  notes: string;
};

export function formatApiRowTitle(api: SavedApiRow): string {
  return formatStoredApiCard({
    name: api.name,
    upstream: api.upstream,
    masked: api.masked,
    family: api.family,
    product: api.product,
    domain: api.domain,
    expires_at: api.expires_at,
    created_at: api.created_at,
    notes: api.notes,
  }).title;
}

export function formatApiRowNote(api: SavedApiRow): string {
  if (api.notes) return api.notes;
  const card = formatStoredApiCard({
    name: api.name,
    upstream: api.upstream,
    masked: api.masked,
    family: api.family,
    product: api.product,
    domain: api.domain,
    expires_at: api.expires_at,
    created_at: api.created_at,
  });
  return `${card.subtitle} · ${card.meta}`;
}

/** Signed-in popup lists only these — never raw `value`. */
export function summarizeSavedApis(data: unknown): SavedApiRow[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? (Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { keys?: unknown }).keys)
          ? (data as { keys: unknown[] }).keys
          : [])
      : [];
  const out: SavedApiRow[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as {
      id?: string;
      upstream?: string;
      name?: string;
      masked_value?: string;
      cipher?: string;
      value?: string;
      family?: string;
      product?: string;
      domain?: string;
      expires_at?: string | null;
      created_at?: string | null;
      notes?: string;
      prefix?: string;
    };
    const upstream = String(it.upstream || '').toLowerCase().trim();
    if (!upstream) continue;
    let masked = String(it.masked_value || it.prefix || '').trim();
    if (!masked) masked = it.cipher ? 'encrypted' : 'saved';
    out.push({
      id: String(it.id || upstream),
      upstream,
      name: String(it.name || `${upstream} key`),
      masked,
      family: String(it.family || ''),
      product: String(it.product || ''),
      domain: String(it.domain || ''),
      expires_at: it.expires_at ? String(it.expires_at) : null,
      created_at: it.created_at ? String(it.created_at) : null,
      notes: String(it.notes || ''),
    });
  }
  return out;
}

/** Stale content.js after Remove + Load unpacked — retries cannot revive it. */
export function isExtensionContextDead(detail: unknown): boolean {
  return /Extension context invalidated|chrome\.runtime is not available|Cannot access a chrome\./i.test(
    String(detail || ''),
  );
}

/** Cold MV3 worker can be retried. Invalidated context cannot. */
export function shouldRetryBackgroundSend(detail: unknown): boolean {
  const text = String(detail || '');
  if (isExtensionContextDead(text)) return false;
  return /Receiving end does not exist|The message port closed/i.test(text);
}

export function formatBulkSaveFailure(opts: {
  saved: number;
  failed: number;
  reason?: string | null;
  detail?: string;
}): { text: string; reload: boolean } {
  const saved = Math.max(0, Math.floor(Number(opts.saved) || 0));
  const failed = Math.max(0, Math.floor(Number(opts.failed) || 0));
  let text = `Saved ${saved}, ${failed} failed.`;
  const reason = String(opts.reason || '');
  const detail = String(opts.detail || '');
  if (isExtensionContextDead(detail) || reason === 'extension-dead') {
    return {
      text: `${text} Dead toast cannot save. New detect is writing the vault — keep this tab open.`,
      reload: true,
    };
  }
  if (reason === 'extension' && isExtensionContextDead(detail)) {
    return {
      text: `${text} Dead toast cannot save. New detect is writing the vault — keep this tab open.`,
      reload: true,
    };
  }
  if (reason === 'token-expired' || reason === 'no-token') {
    return { text: `${text} Sign in so saves land in your vault.`, reload: false };
  }
  if (reason === 'network') {
    return { text: `${text} Backend unreachable.`, reload: false };
  }
  if (reason === 'extension') {
    return {
      text: `${text} Extension messaging error${detail ? ` (${detail})` : ''}.`,
      reload: false,
    };
  }
  if (reason) return { text: `${text} (${reason})`, reload: false };
  return { text: `${text} Click Retry or open DevTools.`, reload: false };
}
