/**
 * Preregistered passkey user id — survives tab jumps and stale-token 401s.
 * Face ID needs this id even when sessionStorage / ks_token is gone.
 */

export const PASSKEY_USER_KEY = 'ks_passkey_user';
export const WALLET_KEY = 'ks_wallet';

export function resolvePasskeyUserId(opts: {
  passkeyUser?: string | null;
  wallet?: string | null;
}): string | null {
  const passkey = (opts.passkeyUser ?? '').trim();
  if (passkey) return passkey;
  const wallet = (opts.wallet ?? '').trim();
  return wallet || null;
}

export function shouldShowPasskeyPanel(opts: {
  userId: string | null;
  preferWallet: boolean;
}): boolean {
  return Boolean(opts.userId) && !opts.preferWallet;
}

export function shortPasskeyLabel(userId: string): string {
  const id = userId.trim();
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}\u2026${id.slice(-4)}`;
}

export function readPasskeyUserIdFromStorage(storage?: Pick<Storage, 'getItem'>): string | null {
  const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  if (!store) return null;
  return resolvePasskeyUserId({
    passkeyUser: store.getItem(PASSKEY_USER_KEY),
    wallet: store.getItem(WALLET_KEY),
  });
}

/** Server JSON uses `error` (Python) or `detail` (FastAPI). Never drop either. */
export function readApiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return describePasskeyFailure('', fallback);
  const o = body as { detail?: unknown; error?: unknown; message?: unknown; code?: unknown };
  const code = typeof o.code === 'string' ? o.code : '';
  const raw = [o.detail, o.error, o.message].find(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  return describePasskeyFailure(code, raw || fallback);
}

export function describePasskeyFailure(code: string, raw: string): string {
  const blob = `${code} ${raw}`.toLowerCase();
  if (code === 'no_passkey' || /no passkey enrolled/.test(blob)) {
    return (
      'Face ID / Touch ID is saved on this Mac, but the server has no matching passkey for this account (common after a deploy). Use a different wallet, sign in, then enroll passkey again. ' +
      '指纹在这台 Mac 上，服务器没有对应 passkey。请改用钱包登录后再登记一次。'
    );
  }
  if (code === 'unknown_credential' || /unknown credential/.test(blob)) {
    return (
      'Face ID worked, but this fingerprint is not the passkey stored for this account. Forget this device, sign in with wallet, then enroll passkey again. ' +
      '指纹对了，但服务器上的 credential 对不上。点 Forget this device，用钱包登录后再登记。'
    );
  }
  if (code === 'challenge_expired' || /challenge expired|challenge.*not found/.test(blob)) {
    return (
      'Passkey challenge expired — tap Sign In again. Your fingerprint is still on this device. ' +
      '登录挑战过期了，再点一次 Sign In，指纹还在。'
    );
  }
  return raw;
}
