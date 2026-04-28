/**
 * WebAuthn registration + assertion verification using
 * @simplewebauthn/server. Wraps the library so the route handlers
 * stay slim.
 *
 * The expected RP ID and origin are loaded from env so dev / prod
 * configurations differ only by Worker secrets, not code.
 */

import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';

// @simplewebauthn v11 keeps the JSON DTOs in @simplewebauthn/types
// (re-exported from /server's `deps` module but only via subpath
// imports). Pulling them directly is the path that survives both
// CJS and ESM resolution.
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';

export interface VerifyContext {
  expectedRPID: string;
  expectedOrigin: string | string[];
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  ctx: VerifyContext,
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ctx.expectedOrigin,
    expectedRPID: ctx.expectedRPID,
    requireUserVerification: true,
  });
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  publicKeyB64: string,
  counter: number,
  credentialId: string,
  ctx: VerifyContext,
): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ctx.expectedOrigin,
    expectedRPID: ctx.expectedRPID,
    requireUserVerification: true,
    credential: {
      id: credentialId,
      publicKey: base64ToBytes(publicKeyB64),
      counter,
    },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
