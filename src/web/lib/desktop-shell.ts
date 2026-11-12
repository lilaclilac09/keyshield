/**
 * Detect the KeyShield Mac / desktop Electron shell.
 * The live website never sets window.keyshieldDesktop.
 */
export function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false;
  if (Boolean(window.keyshieldDesktop?.isDesktop)) return true;
  // Preload can fail to inject in a sandboxed asar; Electron UA still means
  // this is the Mac app, so AuthScreen must show the session-token fallback.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /Electron/i.test(ua);
}

/** Keep the login window in front after a sign-in gesture. */
export function focusLoginWindow(): void {
  try {
    window.keyshieldDesktop?.focusMainWindow?.();
  } catch {
    /* web dashboard — no desktop bridge */
  }
}

export function openDesktopExternal(url: string): void {
  try {
    if (window.keyshieldDesktop?.openExternal) {
      window.keyshieldDesktop.openExternal(url);
      return;
    }
  } catch {
    /* fall through */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
