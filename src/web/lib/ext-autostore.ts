/**
 * Extension auto-detect / auto-store policy + Sign-in URL choice.
 *
 * After the user grants permission once (popup "Allow detect" or the
 * in-page Allow auto-save button), later detections must save without
 * another click.
 *
 * Sign-in default is the hosted dashboard. 127.0.0.1:5173 is only used
 * when the user pinned local AND that port is actually accepting
 * connections. A refused 5173 (Vite not running) must not open a dead tab.
 */

export const HOSTED_DASHBOARD = 'https://app.ks.aileena.xyz';
export const LOCAL_DASHBOARD = 'http://127.0.0.1:5173';
export const DETECT_DEMO_KEY = 'sk-proj-LOCALDETECTDEMOKEY1234567890abcd';

export function shouldAutoStore(opts: {
  permissionGranted: boolean;
  unsavedCount: number;
  alreadySaving: boolean;
  loggedIn?: boolean;
}): boolean {
  const armed = Boolean(opts.permissionGranted) || Boolean(opts.loggedIn);
  return armed && opts.unsavedCount > 0 && !opts.alreadySaving;
}

export function shouldUseLocalDashboard(opts: {
  pinnedLocal: boolean;
  localLive: boolean;
}): boolean {
  return Boolean(opts.pinnedLocal) && Boolean(opts.localLive);
}

export function hostedSigninHref(base = HOSTED_DASHBOARD, demo = 'shop'): string {
  const u = new URL(base);
  u.searchParams.set('ext', '1');
  if (demo) u.searchParams.set('demo', demo);
  return u.toString();
}

export function localDashboardSigninHref(base = LOCAL_DASHBOARD): string {
  const u = new URL(base);
  u.searchParams.set('local', '1');
  u.searchParams.set('ext', '1');
  u.searchParams.set('demo', 'shop');
  return u.toString();
}

export function resolveSigninHref(opts: {
  pinnedLocal: boolean;
  localLive?: boolean;
  hosted?: string;
  local?: string;
}): string {
  const live = opts.localLive !== false;
  if (shouldUseLocalDashboard({ pinnedLocal: opts.pinnedLocal, localLive: live })) {
    return localDashboardSigninHref(opts.local || LOCAL_DASHBOARD);
  }
  return hostedSigninHref(opts.hosted || HOSTED_DASHBOARD);
}

export async function resolveReachableSigninHref(opts: {
  pinnedLocal: boolean;
  hosted?: string;
  local?: string;
  probe?: (url: string) => Promise<boolean>;
}): Promise<{ href: string; usedLocal: boolean }> {
  const localBase = opts.local || LOCAL_DASHBOARD;
  if (opts.pinnedLocal) {
    const probe = opts.probe || defaultProbe;
    const live = await probe(localBase);
    if (live) {
      return { href: localDashboardSigninHref(localBase), usedLocal: true };
    }
  }
  return { href: hostedSigninHref(opts.hosted || HOSTED_DASHBOARD), usedLocal: false };
}

async function defaultProbe(url: string): Promise<boolean> {
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 400) : null;
    await fetch(url, { method: 'GET', cache: 'no-store', signal: ctrl?.signal });
    if (timer) clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}
