/**
 * Production KeyShield sits on ks.aileena.xyz (app + api + sync worker).
 * Vite bake-time env can still be localhost if CI forgot vars — rewrite at
 * runtime so the dashboard, extension defaults, and Path A worker all agree.
 */
export function isAileenaProdDashboardHost(hostname: string): boolean {
  return (
    hostname === 'app.ks.aileena.xyz' ||
    hostname === 'ks.aileena.xyz' ||
    hostname.endsWith('.ks.aileena.xyz')
  );
}

const LOCALHOST_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i;

export function isLocalhostUrl(url: string): boolean {
  return LOCALHOST_RE.test(url.trim());
}

export const PROD_API_BASE = 'https://api.ks.aileena.xyz';
export const PROD_SYNC_URL = 'https://sync.ks.aileena.xyz';
