/**
 * PRF / HKDF buffer lifecycle.
 *
 * WebCrypto cannot pin pages, but callers can still wipe every
 * Uint8Array view of intermediate bits after import. Concurrent
 * signature requests for the same context hash are refused so a
 * transient nonce cannot be reused across an in-flight ceremony.
 */

const inFlight = new Map<string, number>();

export function wipeBytes(buf: Uint8Array | null | undefined): void {
  if (!buf) return;
  buf.fill(0);
}

export function wipeArrayBuffer(buf: ArrayBuffer | null | undefined): void {
  if (!buf) return;
  new Uint8Array(buf).fill(0);
}

export async function importAesGcmAndWipe(bits: ArrayBuffer): Promise<CryptoKey> {
  const view = new Uint8Array(bits);
  try {
    return await crypto.subtle.importKey(
      'raw',
      view,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    view.fill(0);
  }
}

export function acquireSignatureNonce(contextAnchor: string): string {
  if (!contextAnchor) {
    throw new Error('prf-wipe: empty context anchor');
  }
  if (inFlight.has(contextAnchor)) {
    throw new Error('prf-wipe: concurrent signature request for the same context');
  }
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  let hex = '';
  for (const b of nonce) hex += b.toString(16).padStart(2, '0');
  inFlight.set(contextAnchor, Date.now());
  wipeBytes(nonce);
  return hex;
}

export function releaseSignatureNonce(contextAnchor: string): void {
  inFlight.delete(contextAnchor);
}

export function resetSignatureNonces(): void {
  inFlight.clear();
}

export function inFlightSignatureCount(): number {
  return inFlight.size;
}
