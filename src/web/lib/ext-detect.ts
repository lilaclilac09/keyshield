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

/** Popup must show this exact line after Remove + Load unpacked 1.2.3. */
export const DETECT_READY_VERSION = '1.2.3';
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

/** After Sign-in, keep scanning and save every new match. */
export function shouldArmLiveScan(opts: {
  loggedIn: boolean;
  autoStorePref?: boolean;
}): boolean {
  return Boolean(opts.loggedIn) || Boolean(opts.autoStorePref);
}
