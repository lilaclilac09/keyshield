/**
 * When the dashboard is served from a real hostname but the bundle still
 * bakes a localhost API/sync URL (CI forgot KEYSHIELD_API_URL / SYNC), route to
 * a public control plane. Defaults are OSS-friendly; override per deploy:
 *
 * - KEYSHIELD_PUBLIC_API_BASE — FastAPI (default: public Railway URL in repo)
 * - KEYSHIELD_PUBLIC_SYNC_URL — CF worker for Path A sync (optional)
 */

const _e = typeof process !== 'undefined' ? process.env : {};

export function isLocalDevHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0'
  );
}

const LOCALHOST_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i;

export function isLocalhostUrl(url: string): boolean {
  return LOCALHOST_RE.test(url.trim());
}

// Hosts that used to be wired up but were never given DNS records, so any
// bundle that still bakes them in produces "API unreachable" at runtime.
// Treat as if the URL had not been provided and fall through to PROD_API_BASE.
const LEGACY_API_HOST_RE = /^https?:\/\/(api|sync)\.ks\.aileena\.xyz(\/|$)/i;

export function isLegacyBakedUrl(url: string): boolean {
  return LEGACY_API_HOST_RE.test(url.trim());
}

export const PROD_API_BASE: string =
  (_e.KEYSHIELD_PUBLIC_API_BASE as string) ||
  'https://keyshield-production.up.railway.app';

/** Hosted dashboard. Sign-in on 127.0.0.1:5173 must bounce here. */
export const PROD_DASHBOARD_URL = 'https://app.ks.aileena.xyz';

type Loc = Pick<Location, 'hostname' | 'port' | 'pathname' | 'search' | 'hash'>;

/** Vite login tab. `?local=1` keeps the clone for UI work. */
export function isLocalViteSigninHost(loc: Loc): boolean {
  if (/(?:^|[?&])local=1(?:&|$)/.test(loc.search || '')) return false;
  const host = loc.hostname;
  const port = loc.port;
  return (
    (host === '127.0.0.1' || host === 'localhost') &&
    (port === '5173' || port === '5174' || port === '')
  );
}

export function hostedDashboardHref(loc: Loc): string {
  const u = new URL(PROD_DASHBOARD_URL);
  u.pathname = loc.pathname || '/';
  u.search = loc.search || '';
  u.hash = loc.hash || '';
  u.searchParams.delete('local');
  return u.toString();
}

/** Returns true when this page is leaving for the hosted Sign-in. */
export function redirectLocalViteToHostedDashboard(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isLocalViteSigninHost(window.location)) return false;
  window.location.replace(hostedDashboardHref(window.location));
  return true;
}

/** Used only when `usePublicControlPlaneFallback` is true; leave empty if sync is not deployed. */
export const PROD_SYNC_URL: string = (_e.KEYSHIELD_PUBLIC_SYNC_URL as string) || '';

/** Dashboard on the public net but bundle still points at localhost / a stale
 *  legacy host with no DNS → use PROD_* fallbacks. */
export function usePublicControlPlaneFallback(
  hostname: string,
  bakedUrl: string,
): boolean {
  if (isLocalDevHostname(hostname)) return false;
  if (!bakedUrl) return true;
  return isLocalhostUrl(bakedUrl) || isLegacyBakedUrl(bakedUrl);
}
