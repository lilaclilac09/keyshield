/**
 * Dashboard ↔ extension session merge.
 *
 * The page keeps ks_token in localStorage. The extension keeps the same
 * token in chrome.storage.local. Opening Sign-in should land already
 * logged in when either side already has a session.
 *
 * Page token wins when both exist (Face ID / wallet on this origin is
 * newer than a leftover extension token). Extension token fills an empty
 * page so AuthScreen is skipped.
 */

export type SessionSides = {
  pageToken: string | null;
  pageUser: string | null;
  extensionToken: string | null;
  extensionUser: string | null;
};

export type MergedSession = {
  token: string;
  user: string | null;
  applyToPage: boolean;
  pushToExtension: boolean;
};

function trimOrNull(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  return t ? t : null;
}

export function mergeSessionSides(sides: SessionSides): MergedSession | null {
  const page = trimOrNull(sides.pageToken);
  const ext = trimOrNull(sides.extensionToken);
  if (page) {
    return {
      token: page,
      user: trimOrNull(sides.pageUser),
      applyToPage: false,
      pushToExtension: ext !== page,
    };
  }
  if (ext) {
    return {
      token: ext,
      user: trimOrNull(sides.extensionUser),
      applyToPage: true,
      pushToExtension: false,
    };
  }
  return null;
}

export function parseExtensionSession(data: unknown): { token: string; user: string | null } | null {
  if (!data || typeof data !== 'object') return null;
  const session = (data as { __ks_ext_session?: unknown }).__ks_ext_session;
  if (!session || typeof session !== 'object') return null;
  const token = (session as { token?: unknown }).token;
  if (typeof token !== 'string' || !token.trim()) return null;
  const user = (session as { user?: unknown }).user;
  return {
    token: token.trim(),
    user: typeof user === 'string' && user.trim() ? user.trim() : null,
  };
}
