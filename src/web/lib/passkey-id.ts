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
