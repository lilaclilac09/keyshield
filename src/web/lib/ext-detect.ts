/**
 * Shared API-key shapes for the extension toast.
 * A visible key on any page must match one of these and pop the panel.
 */

export type DetectedShape = {
  upstream: string;
  key: string;
};

const SHAPES: { upstream: string; re: RegExp }[] = [
  { upstream: 'openrouter', re: /sk-or-[A-Za-z0-9_-]{12,}/ },
  { upstream: 'anthropic', re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/ },
  { upstream: 'groq', re: /gsk_[A-Za-z0-9]{32,}/ },
  { upstream: 'helius', re: /helius_auth_[A-Za-z0-9]{16,}/ },
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

export function shouldPopupForKey(opts: {
  alreadySaved: boolean;
  panelOpen: boolean;
}): boolean {
  return !opts.alreadySaved;
}

/** Popup must show this exact line after Remove + Load unpacked 1.2.4. */
export const DETECT_READY_VERSION = '1.2.4';
export const DETECT_READY_OK = `ok ${DETECT_READY_VERSION} <all_urls>`;

export function formatDetectReadyLine(opts: {
  version: string;
  hasAllUrls: boolean;
}): { ok: boolean; text: string } {
  const ver = String(opts.version || '').trim();
  if (ver === DETECT_READY_VERSION && opts.hasAllUrls) {
    return { ok: true, text: DETECT_READY_OK };
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

export const THREE_LINE_UI_MARK = 'data-ui="three-line"';

/** True when the popup is the 3-line UI (not leftover Settings / token clutter). */
export function isCompactPopupHtml(html: string): boolean {
  const text = String(html || '');
  return (
    text.includes(THREE_LINE_UI_MARK) &&
    text.includes('id="signed-pane"') &&
    text.includes('id="saved-count"') &&
    text.includes('id="saved-apis"') &&
    !text.includes('<details')
  );
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
};

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
    };
    const upstream = String(it.upstream || '').toLowerCase().trim();
    if (!upstream) continue;
    let masked = String(it.masked_value || '').trim();
    if (!masked) masked = it.cipher ? 'encrypted' : 'saved';
    out.push({
      id: String(it.id || upstream),
      upstream,
      name: String(it.name || `${upstream} key`),
      masked,
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
      text: `${text} Extension was reloaded. Refresh this tab, then Save again.`,
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
