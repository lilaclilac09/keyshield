/**
 * Detect the KeyShield Mac / desktop Electron shell.
 * The live website never sets window.keyshieldDesktop.
 */
export function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.keyshieldDesktop?.isDesktop);
}
