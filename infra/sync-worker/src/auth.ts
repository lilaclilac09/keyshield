/**
 * Bearer-token auth — Step 2 fills in the real WebAuthn challenge /
 * exchange flow. For Step 1 we only need the JWT *verification* path
 * because the routes need to gate on something. JWTs will be issued
 * by /auth/exchange in Step 2.
 *
 * The JWT payload looks like:
 *   { sub: vaultId, iat, exp }
 *
 * The `sub` claim must equal the URL's :id segment — i.e. a token
 * issued for vault A cannot mutate vault B even if leaked.
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
 * Test-only helper: issue a JWT bound to a given vaultId. Step 2 will
 * provide the real issuer that signs after a WebAuthn challenge.
 *
 * Production code calls /auth/exchange — this is exposed only so the
 * route tests can construct valid tokens without going through the
 * full WebAuthn flow.
 */
export async function issueJwtForTest(
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
