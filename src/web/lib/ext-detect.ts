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

/** Emergency one-liner HTML is not the user-facing popup. */
export function isCompactPopupHtml(html: string): boolean {
  const text = String(html || '');
  return (
    !text.includes('<details') ||
    !text.includes('id="fingerprint"') ||
    !text.includes('id="saved-count"')
  );
}

export function looksLikeSessionToken(raw: string | null | undefined): boolean {
  return String(raw || '').trim().length >= 12;
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
