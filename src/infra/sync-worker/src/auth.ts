/**
 * Bearer-token verification + issuance (Step 2 wired the issuance
 * routes — see src/index.ts /auth/*).
 *
 * The JWT payload:
 *   { sub: vaultId, iat, exp }
 *
 * The `sub` claim must equal the URL's :id segment — i.e. a token
 * issued for vault A cannot mutate vault B even if leaked.
 *
 * `issueJwt` is no longer test-only — /auth/exchange calls it after a
 * successful WebAuthn assertion verification. The function is kept
 * generic so unit tests can mint tokens directly when they don't want
 * to go through the full WebAuthn dance.
 */

import { jwtVerify, SignJWT } from 'jose';

export interface JwtClaims {
  sub: string; // vaultId
  iat: number;
  exp: number;
}

/**
 * Verify a Bearer token against the worker's JWT_SECRET. Returns the
 * decoded claims on success or throws on any failure.
 */
export async function verifyJwt(
  token: string,
  secret: string,
  issuer: string,
): Promise<JwtClaims> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, {
    issuer,
    algorithms: ['HS256'],
  });
  if (typeof payload.sub !== 'string') {
    throw new Error('JWT missing sub claim');
  }
  return {
    sub: payload.sub,
    iat: payload.iat ?? 0,
    exp: payload.exp ?? 0,
  };
}

/**
 * Issue a short-lived JWT bound to a vaultId. Called by /auth/exchange
 * after a successful WebAuthn assertion verification, and by tests
 * when they want a token without the full dance.
 */
export async function issueJwt(
  vaultId: string,
  secret: string,
  issuer: string,
  ttlSecs = 900,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(vaultId)
    .setIssuer(issuer)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSecs)
    .sign(key);
}

/** @deprecated alias kept while old tests transition. Use `issueJwt`. */
export const issueJwtForTest = issueJwt;

/**
 * Extract a "Bearer xxx" token from an incoming request. Returns null
 * if the header is missing or malformed.
 */
export function extractBearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const match = /^Bearer (.+)$/.exec(h);
  return match ? match[1] : null;
}
