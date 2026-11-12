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
