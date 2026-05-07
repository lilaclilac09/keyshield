/**
 * Ed25519 signing and verification utilities.
 * Compatible with Python `ed25519` and Rust `ed25519-dalek`.
 */

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SignedMessage {
  message: Uint8Array;
  signature: Uint8Array;
}

/**
 * Generate a new Ed25519 keypair.
 * Returns 64 bytes: first 32 = public key, last 32 = secret key.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'Ed25519',
    },
    true,
    ['sign', 'verify']
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const secretKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.privateKey));
  return { publicKey, secretKey };
}

/**
 * Sign a message using Ed25519.
 * @param message - Message bytes
 * @param secretKey - 32-byte secret key
 * @returns 64-byte signature
 */
export async function sign(message: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('Ed25519', key, message);
  return new Uint8Array(signature);
}

/**
 * Verify an Ed25519 signature.
 * @param message - Original message bytes
 * @param signature - 64-byte signature
 * @param publicKey - 32-byte public key
 * @returns true if valid
 */
export async function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    publicKey,
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('Ed25519', key, signature, message);
}
