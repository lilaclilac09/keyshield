/**
 * Client-side WebAuthn PRF → HKDF.
 *
 * Hardware path: navigator.credentials.get({ extensions.prf.eval.first })
 * returns a deterministic output from the authenticator (Touch ID / Face ID).
 *
 * Demo-soft path: HMAC-SHA256(local device secret, salt) when no authenticator
 * is present. Labeled `demo-soft` — this is NOT hardware PRF and is NOT
 * Solana-native Passkey verification.
 *
 * Secrets never leave this module as hex/base64. Callers get CryptoKey
 * (non-extractable) plus public commitments only.
 */

import { sha256, te, toHex, zeroize } from './bytes';

export type PrfSource = 'hardware' | 'demo-soft';

export class PasskeyCancelledError extends Error {
  constructor() {
    super('Passkey cancelled');
    this.name = 'PasskeyCancelledError';
  }
}

const PRF_SALT_LABEL = 'ks-prf-salt-v1';
const HKDF_SALT = te('keyshield-v1-salt');
const INFO_DECRYPT = te('credential-decrypt');
const INFO_WITNESS = te('circuit-witness');
const INFO_MASTER = te('ks-master-key-v1');
const INFO_VAULT_ID = te('ks-vault-id-v1');
const SOFT_KEY = 'ks.demo.prf.device-secret';

let saltCache: ArrayBuffer | null = null;
let softSecretMem: Uint8Array | null = null;

export async function prfSalt(): Promise<ArrayBuffer> {
  if (saltCache) return saltCache;
  saltCache = await crypto.subtle.digest('SHA-256', te(PRF_SALT_LABEL));
  return saltCache;
}

export interface PublicPrfView {
  source: PrfSource;
  /** Client / proxy-layer only. Not an on-chain Passkey verify. */
  verifyLayer: 'client-layer';
  vaultId: string;
  witnessCommitment: string;
  prfCommitment: string;
}

export interface DerivedMaterial {
  view: PublicPrfView;
  sessionKey: CryptoKey;
  /** Caller MUST zeroize after proof generation. */
  witness: Uint8Array;
}

async function hkdfBits(prfOutput: BufferSource, info: Uint8Array, bits: number): Promise<ArrayBuffer> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info }, ikm, bits);
}

export async function deriveSessionKey(prfOutput: BufferSource): Promise<CryptoKey> {
  const bits = await hkdfBits(prfOutput, INFO_DECRYPT, 256);
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function deriveWitness(prfOutput: BufferSource): Promise<Uint8Array> {
  const bits = await hkdfBits(prfOutput, INFO_WITNESS, 256);
  return new Uint8Array(bits);
}

/** Path A compatible master (domain-separated from session/witness). */
export async function derivePathAMaster(prfOutput: BufferSource): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: INFO_MASTER },
    ikm,
    256,
  );
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function deriveVaultId(prfOutput: BufferSource): Promise<string> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: INFO_VAULT_ID },
    ikm,
    128,
  );
  return toHex(bits);
}

export async function deriveFromPrf(prfOutput: BufferSource, source: PrfSource): Promise<DerivedMaterial> {
  const [sessionKey, witness, vaultId, prfCommitment] = await Promise.all([
    deriveSessionKey(prfOutput),
    deriveWitness(prfOutput),
    deriveVaultId(prfOutput),
    sha256(prfOutput).then(toHex),
  ]);
  const witnessCommitment = toHex(await sha256(witness));
  return {
    sessionKey,
    witness,
    view: {
      source,
      verifyLayer: 'client-layer',
      vaultId,
      witnessCommitment,
      prfCommitment,
    },
  };
}

function extractPrfOutput(cred: PublicKeyCredential): BufferSource | null {
  const ext = cred.getClientExtensionResults() as AuthenticationExtensionsClientOutputs;
  return ext.prf?.results?.first ?? null;
}

async function hardwarePrf(): Promise<BufferSource> {
  const salt = await prfSalt();
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  let cred: PublicKeyCredential | null = null;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 30_000,
        userVerification: 'required',
        rpId,
        allowCredentials: [],
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      throw new PasskeyCancelledError();
    }
    throw err;
  }

  if (!cred) throw new Error('Passkey returned empty credential');
  const out = extractPrfOutput(cred);
  if (!out) throw new Error('Passkey did not return PRF — device unsupported');
  return out;
}

async function loadOrCreateSoftSecret(): Promise<Uint8Array> {
  if (softSecretMem) return softSecretMem.slice();
  if (typeof window !== 'undefined') {
    const existing = localStorage.getItem(SOFT_KEY);
    if (existing) {
      const raw = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
      if (raw.length === 32) {
        softSecretMem = raw;
        return raw.slice();
      }
    }
  }
  const next = crypto.getRandomValues(new Uint8Array(32));
  softSecretMem = next;
  if (typeof window !== 'undefined') {
    let bin = '';
    for (const b of next) bin += String.fromCharCode(b);
    localStorage.setItem(SOFT_KEY, btoa(bin));
  }
  return next.slice();
}

/** Deterministic stand-in: HMAC-SHA256(deviceSecret, prfSalt). */
export async function demoSoftPrf(): Promise<ArrayBuffer> {
  const secret = await loadOrCreateSoftSecret();
  const salt = new Uint8Array(await prfSalt());
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, salt);
  zeroize(secret);
  return mac;
}

/**
 * Try hardware PRF first. `allowDemoSoft` only after a non-cancel failure
 * (no authenticator). User cancel never silently falls through.
 */
export async function runClientPrf(opts?: { allowDemoSoft?: boolean }): Promise<DerivedMaterial> {
  const allowDemoSoft = opts?.allowDemoSoft !== false;
  if (typeof window !== 'undefined' && window.PublicKeyCredential) {
    try {
      const prf = await hardwarePrf();
      return deriveFromPrf(prf, 'hardware');
    } catch (err) {
      if (err instanceof PasskeyCancelledError) throw err;
      if (!allowDemoSoft) throw err;
    }
  }
  if (!allowDemoSoft) throw new Error('WebAuthn PRF unavailable');
  const prf = await demoSoftPrf();
  return deriveFromPrf(prf, 'demo-soft');
}
