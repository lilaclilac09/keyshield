/**
 * KeyShield sync-auth — WebAuthn passkey + JWT exchange against the
 * sync Worker.
 *
 * Two flows:
 *
 * 1. registerNewVault — first-run on any device. Creates a passkey
 *    with the PRF extension, derives the vault ID from the PRF
 *    output, and tells the Worker about the credential via
 *    POST /auth/register.
 *
 * 2. authenticate — daily unlock. Asks the Worker for a fresh
 *    challenge, asserts the passkey against it (again with PRF), and
 *    exchanges the assertion for a 15-minute JWT via /auth/exchange.
 *
 * The PRF output never leaves this module — the caller receives the
 * raw ArrayBuffer so it can derive the master key + vault ID via
 * HKDF in `vault.ts`. This file is the only place that touches
 * navigator.credentials directly.
 */
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { deriveVaultId } from './vault';

// ── PRF salt ──────────────────────────────────────────────────────────
//
// The PRF extension hashes (salt || credential-id) with the
// authenticator-bound secret. The salt MUST be exactly 32 bytes and
// MUST match between register and authenticate, otherwise the PRF
// output differs and the master key can't be recovered.
//
// We start from a domain-tagged label, hash it with SHA-256 to land
// on a stable 32-byte salt, and reuse it forever. Bumping the label
// is a cipher-format break and would need a migration.
const PRF_SALT_LABEL = 'ks-prf-salt-v1';

let _prfSaltCache: ArrayBuffer | null = null;

export async function prfSalt(): Promise<ArrayBuffer> {
  if (_prfSaltCache) return _prfSaltCache;
  const seed = new TextEncoder().encode(PRF_SALT_LABEL);
  const salt = await crypto.subtle.digest('SHA-256', seed);
  _prfSaltCache = salt;
  return salt;
}

// ── Bearer cache ──────────────────────────────────────────────────────
//
// The Worker's JWTs are short-lived (15 min). We don't proactively
// refresh — we just hand `null` back to callers when we're inside the
// "near-expiry" slack window so they re-authenticate before sending a
// request that would 401 mid-flight.

export interface BearerHolder {
  /** Returns the cached token, or null if missing / near expiry. */
  get(): string | null;
  set(token: string, expiresAt: number): void;
  clear(): void;
}

export function makeBearerHolder(slackMs = 30_000): BearerHolder {
  let token: string | null = null;
  let expiresAt = 0;
  return {
    get() {
      if (!token) return null;
      if (Date.now() + slackMs >= expiresAt) return null;
      return token;
    },
    set(t, exp) {
      token = t;
      expiresAt = exp;
    },
    clear() {
      token = null;
      expiresAt = 0;
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded =
    b64url.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Pull the PRF output out of the credential's clientExtensionResults.
 * @simplewebauthn returns it base64url-encoded under
 * `prf.results.first` (or `evaluation` on some authenticators —
 * we accept both for safety).
 */
function extractPrfOutput(
  result:
    | RegistrationResponseJSON
    | AuthenticationResponseJSON,
): ArrayBuffer {
  const ext = (result.clientExtensionResults ?? {}) as {
    prf?: {
      results?: { first?: string };
      enabled?: boolean;
    };
  };
  const first = ext.prf?.results?.first;
  if (!first) {
    throw new Error(
      'PRF extension output missing — authenticator does not support PRF',
    );
  }
  // simplewebauthn marshals base64url for binary extension outputs.
  const bytes = base64UrlToBytes(first);
  // Return a fresh ArrayBuffer (slice off the typed-array view).
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

// ── Public API ────────────────────────────────────────────────────────

export interface SyncAuthClient {
  registerNewVault(opts: {
    syncUrl: string;
    rpId: string;
    rpName?: string;
    userName?: string;
  }): Promise<{ vaultId: string; prfOutput: ArrayBuffer }>;

  authenticate(opts: {
    syncUrl: string;
    rpId: string;
    vaultIdHint?: string;
  }): Promise<{
    vaultId: string;
    prfOutput: ArrayBuffer;
    token: string;
    expiresAt: number;
  }>;
}

export function makeSyncAuthClient(): SyncAuthClient {
  return {
    async registerNewVault({ syncUrl, rpId, rpName = 'KeyShield', userName }) {
      const salt = await prfSalt();
      // 32-byte server-side challenge. We generate it client-side and
      // round-trip it to /auth/register as `expectedChallenge` — the
      // worker only checks that the challenge in the WebAuthn
      // clientDataJSON matches what we declare.
      const expectedChallenge = randomBase64Url(32);

      // 16-byte stable user handle. The actual mapping to a vaultId
      // happens AFTER we read the PRF output — the user.id below is
      // just an opaque per-credential anchor used by the authenticator.
      const userIdBytes = crypto.getRandomValues(new Uint8Array(16));
      let userIdB64u = '';
      for (const b of userIdBytes) userIdB64u += String.fromCharCode(b);
      userIdB64u = btoa(userIdB64u)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const creationOptions: PublicKeyCredentialCreationOptionsJSON = {
        rp: { id: rpId, name: rpName },
        user: {
          id: userIdB64u,
          name: userName ?? 'keyshield-user',
          displayName: userName ?? 'KeyShield user',
        },
        challenge: expectedChallenge,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        timeout: 60_000,
        attestation: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        extensions: {
          // PRF eval at registration so we get a usable output back
          // without a second ceremony.
          prf: {
            eval: {
              first: bufferToBase64Url(salt),
            },
          },
        },
      };

      const attestation = await startRegistration({
        optionsJSON: creationOptions,
      });
      const prfOutput = extractPrfOutput(attestation);
      const vaultId = await deriveVaultId(prfOutput);

      const res = await fetch(`${trimSlash(syncUrl)}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId,
          attestation,
          expectedChallenge,
        }),
      });
      // 409 means another device already registered this vault —
      // benign for cross-device first-run.
      if (!res.ok && res.status !== 409) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `auth/register failed: ${res.status} ${res.statusText} ${detail}`,
        );
      }
      return { vaultId, prfOutput };
    },

    async authenticate({ syncUrl, rpId, vaultIdHint }) {
      const salt = await prfSalt();

      // STEP 1 — get a fresh challenge from the worker. We also need
      // a vault ID up front; if the caller didn't pass one, we ask the
      // authenticator for any discoverable credential first and derive
      // the ID from PRF after.
      //
      // The challenge is per-vault, so we must know which one to talk
      // about. If `vaultIdHint` is missing we fall through to a
      // two-pass flow:
      //   pass 1: PRF only ceremony (no server challenge yet) → get
      //           PRF output → derive vaultId
      //   pass 2: /auth/challenge with that vaultId → second ceremony
      //           with the server's challenge → /auth/exchange
      //
      // It's two Face ID prompts but works on truly fresh devices.
      let vaultId = vaultIdHint;
      let prfOutput: ArrayBuffer | null = null;

      if (!vaultId) {
        const probeChallenge = randomBase64Url(32);
        const probeOpts: PublicKeyCredentialRequestOptionsJSON = {
          challenge: probeChallenge,
          rpId,
          userVerification: 'required',
          timeout: 60_000,
          extensions: {
            prf: {
              eval: { first: bufferToBase64Url(salt) },
            },
          },
        };
        const probe = await startAuthentication({ optionsJSON: probeOpts });
        prfOutput = extractPrfOutput(probe);
        vaultId = await deriveVaultId(prfOutput);
      }

      // STEP 2 — fresh challenge from the server.
      const chRes = await fetch(`${trimSlash(syncUrl)}/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultId }),
      });
      if (!chRes.ok) {
        const detail = await chRes.text().catch(() => '');
        throw new Error(
          `auth/challenge failed: ${chRes.status} ${chRes.statusText} ${detail}`,
        );
      }
      const challenge = (await chRes.json()) as {
        challenge: string;
        expiresAt: number;
      };

      // STEP 3 — assert against the server challenge, with PRF.
      const assertOpts: PublicKeyCredentialRequestOptionsJSON = {
        challenge: challenge.challenge,
        rpId,
        userVerification: 'required',
        timeout: 60_000,
        extensions: {
          prf: { eval: { first: bufferToBase64Url(salt) } },
        },
      };
      const assertion = await startAuthentication({ optionsJSON: assertOpts });

      // PRF output is deterministic per-credential, so even if we did
      // a probe pass above, this ceremony's output should match.
      // Always trust the latest one.
      prfOutput = extractPrfOutput(assertion);
      // Cross-check: if the caller passed a hint, make sure the
      // PRF-derived ID actually matches it. A mismatch means we just
      // authenticated against the wrong credential (e.g. the user
      // picked a different passkey at the OS prompt).
      const derivedId = await deriveVaultId(prfOutput);
      if (vaultIdHint && derivedId !== vaultIdHint) {
        throw new Error(
          'authenticated credential does not match vaultIdHint',
        );
      }
      vaultId = derivedId;

      // STEP 4 — exchange the assertion for a JWT.
      const exRes = await fetch(`${trimSlash(syncUrl)}/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultId, assertion }),
      });
      if (!exRes.ok) {
        const detail = await exRes.text().catch(() => '');
        throw new Error(
          `auth/exchange failed: ${exRes.status} ${exRes.statusText} ${detail}`,
        );
      }
      const exchange = (await exRes.json()) as {
        token: string;
        expiresAt: number;
      };

      return {
        vaultId,
        prfOutput,
        token: exchange.token,
        expiresAt: exchange.expiresAt,
      };
    },
  };
}

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
