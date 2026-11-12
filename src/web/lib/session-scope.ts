/** Owner vs proxy-only session, derived from the ksv2 token payload. */

export type SessionScope = 'owner' | 'proxy';

export const SESSION_SCOPE_KEY = 'ks_session_scope';
export const AUTH_METHOD_KEY = 'ks_auth_method';

export type AuthMethod =
  | 'password'
  | 'google'
  | 'passkey'
  | 'wallet'
  | 'agent'
  | 'demo'
  | 'token';

export function isEmailAccountId(id: string | null | undefined): boolean {
  return Boolean(id && id.includes('@'));
}

/** Gmail/email identities must not drive the Face ID / passkey panel. */
export function passkeyIdentityFrom(id: string | null | undefined): string | null {
  const value = (id ?? '').trim();
  if (!value || isEmailAccountId(value)) return null;
  return value;
}

export function readTokenScope(token: string | null | undefined): SessionScope {
  if (!token) return 'owner';
  try {
    const payload = token.split('.')[0] || '';
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(b64 + pad)) as { scp?: string };
    return json.scp === 'proxy' ? 'proxy' : 'owner';
  } catch {
    return 'owner';
  }
}

export function authMethodLabel(method: AuthMethod | null, accountId: string | null): string {
  if (method === 'password' || isEmailAccountId(accountId)) return 'Google email · password';
  if (method === 'google') return 'Google';
  if (method === 'agent') return 'Agent · ed25519 · proxy token';
  if (method === 'passkey') return 'Passkey · WebAuthn';
  if (method === 'demo') return 'Demo session';
  if (method === 'token') return 'Session token';
  return 'Solana wallet · ed25519';
}
