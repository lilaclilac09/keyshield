/**
 * Extension auto-detect / auto-store policy.
 *
 * After the user grants permission once (popup "Allow detect" or the
 * in-page Allow auto-save button), later detections must save without
 * another click. Local Sign-in stays on 127.0.0.1:5173?local=1.
 */

export function shouldAutoStore(opts: {
  permissionGranted: boolean;
  unsavedCount: number;
  alreadySaving: boolean;
}): boolean {
  return Boolean(opts.permissionGranted) && opts.unsavedCount > 0 && !opts.alreadySaving;
}

export function localDashboardSigninHref(base = 'http://127.0.0.1:5173'): string {
  const u = new URL(base);
  u.searchParams.set('local', '1');
  u.searchParams.set('ext', '1');
  return u.toString();
}

export function resolveSigninHref(opts: {
  pinnedLocal: boolean;
  hosted?: string;
  local?: string;
}): string {
  if (opts.pinnedLocal) {
    return localDashboardSigninHref(opts.local || 'http://127.0.0.1:5173');
  }
  const u = new URL(opts.hosted || 'https://app.ks.aileena.xyz');
  u.searchParams.set('ext', '1');
  return u.toString();
}

export const DETECT_DEMO_KEY = 'sk-proj-LOCALDETECTDEMOKEY1234567890abcd';
