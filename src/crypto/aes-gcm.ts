import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-GCM encryption/decryption utilities.
 * Compatible with Python `cryptography` library implementation.
 */

const DEFAULT_SALT = Buffer.from('keyshield-salt-v1');

export interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

/**
 * Derive a 32-byte key from a password using scrypt.
 * @param password - User passphrase
 * @returns 32-byte Buffer
 */
export function deriveKey(password: string, salt: Buffer = DEFAULT_SALT): Buffer {
  return scryptSync(password, salt, 32) as Buffer;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * @param plaintext - Text to encrypt
 * @param password - Derivation passphrase
 * @returns JSON string with iv, tag, data (all hex)
 */
export function encrypt(plaintext: string, password: string): string {
  const key = deriveKey(password);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
  return JSON.stringify(payload);
}

/**
 * Decrypt AES-256-GCM payload.
 * @param ciphertext - JSON string with iv, tag, data
 * @param password - Derivation passphrase
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: string, password: string): string {
  const key = deriveKey(password);
  const { iv, tag, data } = JSON.parse(ciphertext) as EncryptedPayload;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
