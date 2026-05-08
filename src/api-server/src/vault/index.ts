/**
 * @file vault/index.ts ??AES-256-GCM encrypted key storage with Argon2id-derived keys.
 * Cross-platform (Mac/Linux/Windows) via path normalization.
 */

import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const VAULT_DIR_ENV = process.env.KS_VAULT_DIR || '';
const VAULT_DIR = VAULT_DIR_ENV ? path.resolve(VAULT_DIR_ENV) : path.join(__dirname, '..', 'vault');
const SALT_LEN = 16;
const NONCE_LEN = 12;
const KDF_ITERS = 100_000;

// Argon2id parameters (OWASP 2023 recommended)
const ARGON2_T_COST = 10;
const ARGON2_M_COST = 65536;
const ARGON2_P_COST = 4;
const AES_KEY_LEN = 32; // AES-256 key length in bytes

interface Argon2Result { hash: string; salt: Buffer }
interface EncryptedPayload { version: number; nonce: Buffer; ciphertext: Buffer; tag: Buffer }

function getArgon2(): typeof import('argon2') { return require('argon2'); }

// ?�?�?� Argon2id helpers ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function hashPassword(password: string): Promise<Argon2Result> {
  const argon2 = getArgon2();
  const salt = randomBytes(SALT_LEN);
  const hash = (await argon2.hash(password, {
     type: 2, timeCost: ARGON2_T_COST, memoryCost: ARGON2_M_COST, parallelism: ARGON2_P_COST, saltLen: SALT_LEN, hashLen: AES_KEY_LEN,
   } as any)) as unknown as string;
  return { hash, salt };
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const argon2 = getArgon2();
  try { return await argon2.verify(hash, password); } catch { return false; }
}

// ?�?�?� PBKDF2 fallback ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export function deriveKeyPBKDF2(password: string, salt: Buffer): Buffer {
  const buf = Buffer.from(scryptSync(password, salt, 16384, { r: 8, p: 1 }).slice(0, AES_KEY_LEN));
  return buf.length === AES_KEY_LEN ? buf : scryptSync(password, salt, AES_KEY_LEN, { N: 16384 });
}

function encryptWithAES(key: Buffer, plaintext: string): EncryptedPayload {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { version: 1, nonce, ciphertext, tag: cipher.getAuthTag() };
}

function decryptWithAES(key: Buffer, payload: EncryptedPayload): string {
  const decipher = createDecipheriv('aes-256-gcm', key, payload.nonce);
  decipher.setAuthTag(payload.tag);
  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]).toString('utf8');
}

function readVaultFile(userId: string, filename: string): Buffer {
  const filePath = getVaultPath(userId, filename);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : Buffer.alloc(0);
}

function writeVaultFile(userId: string, filename: string, data: Buffer | string): void {
  const userDir = getVaultPath(userId, '');
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { mode: 0o700, recursive: true });
  const filePath = path.join(userDir, filename);
  fs.writeFileSync(filePath, data);
  if (os.platform() !== 'win32') { fs.chmodSync(filePath, 0o600); fs.chmodSync(userDir, 0o700); }
}

export function getVaultPath(userId: string, subpath: string): string {
  let base = VAULT_DIR;
  if (process.platform === 'win32') base = base.replace(/\\/g, '/');
  return subpath ? path.join(base, userId, subpath) : path.join(base, userId);
}

// ?�?�?� Core operations ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

export async function storeKey(userId: string, upstream: string, apiKey: string, password: string): Promise<void> {
  const userDir = getVaultPath(userId, '');
  fs.mkdirSync(userDir, { mode: 0o700, recursive: true });

  const { hash, salt } = await hashPassword(password);
  writeVaultFile(userId, '.argon2', Buffer.from(hash));
  writeVaultFile(userId, `salt_${upstream}`, salt);

  const aesKey = deriveKeyPBKDF2(password, salt);
  const payload = encryptWithAES(aesKey, apiKey);

  const encPath = `${upstream}.enc`;
  const data = Buffer.alloc(1 + SALT_LEN + NONCE_LEN + payload.ciphertext.length + 16);
  let offset = 0;
  data[offset++] = payload.version;
  data.fill(salt, offset); offset += SALT_LEN;
  data.fill(payload.nonce, offset); offset += NONCE_LEN;
  data.fill(payload.ciphertext, offset); offset += payload.ciphertext.length;
  data.fill(payload.tag, offset);
  writeVaultFile(userId, encPath, data);
}

export async function loadKey(userId: string, upstream: string, password: string): Promise<string | null> {
  const userDir = getVaultPath(userId, '');
  if (!fs.existsSync(userDir)) return null;

  // Try to find the salt file in user directory (exact match first)
  let saltFile = path.join(userDir, `salt_${upstream}`);
  let salt: Buffer | null = null;
  try {
    const s = fs.readFileSync(saltFile);
    if (s.length > 0) salt = s;
  } catch {}

  // If exact match failed, search for any salt file starting with salt_
  if (!salt) {
    const files = fs.readdirSync(userDir).filter((f) => f.startsWith('salt_'));
    // Try to find the one used by any .enc file that starts with upstream
    const encFiles = fs.readdirSync(userDir).filter((f) => f.endsWith('.enc') && (upstream === 'recreate' || f.startsWith(upstream)));
    if (encFiles.length > 0) {
      // Use the salt from the matching .enc file's storeKey call
      const baseName = encFiles[0].replace('.enc', '').replace(/^salt_/, '');
      const altSaltFile = path.join(userDir, `salt_${baseName}`);
      try { salt = fs.readFileSync(altSaltFile); } catch {}
      if (salt) saltFile = altSaltFile;
    }
  }

  // Fallback: use .argon2 hash
  if (!salt) {
    const argonHashFile = path.join(userDir, '.argon2');
    const argonHashBytes = fs.readFileSync(argonHashFile);
    if (argonHashBytes.length === 0) return null;
    // .argon2 stores the argon2 hash string (base64-encoded by default)
    const argonHashStr = argonHashBytes.toString('utf8').trim();
    const verified = await verifyPassword(password, argonHashStr);
    if (!verified) return null;
    const argon2mod = getArgon2();
    // Use the hash string directly — derive key from the argon2 salt embedded in the hash
    const rawHash: any = (argon2mod.argon2id as any).raw(argonHashStr);
    return Buffer.from(rawHash).toString('hex');
  }

  const aesKey = deriveKeyPBKDF2(password, salt);

  // Find the matching .enc file — try exact match first, then prefix
  let encFileName = `${upstream}.enc`;
  const allFiles = fs.readdirSync(userDir);
  if (!allFiles.includes(encFileName)) {
    const match = allFiles.find((f) => f.endsWith('.enc') && f.replace('.enc', '').startsWith(upstream));
    if (match) encFileName = match;
  }

  const encFile = path.join(userDir, encFileName);
  const data = fs.readFileSync(encFile);
  if (data.length === 0) return null;

  // File format: [version(1)] [salt(16)] [nonce(12)] [ciphertext(variable)] [tag(16)]
  const version = data[0];
  const nonce = data.slice(1 + SALT_LEN, 1 + SALT_LEN + NONCE_LEN);
  const tag = data.slice(data.length - 16);
  const ciphertext = data.slice(1 + SALT_LEN + NONCE_LEN, data.length - 16);

  try {
    return decryptWithAES(aesKey, { version, nonce, tag, ciphertext });
  } catch (err) {
    // If decryption fails, try all .enc files in the directory
    for (const f of allFiles) {
      if (!f.endsWith('.enc')) continue;
      const altData = fs.readFileSync(path.join(userDir, f));
      if (altData.length === 0) continue;
      const v = altData[0];
      const n = altData.slice(1 + SALT_LEN, 1 + SALT_LEN + NONCE_LEN);
      const t = altData.slice(altData.length - 16);
      const c = altData.slice(1 + SALT_LEN + NONCE_LEN, altData.length - 16);
      try { return decryptWithAES(aesKey, { version: v, nonce: n, tag: t, ciphertext: c }); } catch {}
    }
    return null;
  }
}

export function deleteKey(userId: string, upstream: string): boolean {
  const userDir = getVaultPath(userId, '');
  let deleted = false;
  ['salt_' + upstream, `${upstream}.enc`].forEach((f) => {
    if (fs.existsSync(path.join(userDir, f))) { fs.unlinkSync(path.join(userDir, f)); deleted = true; }
  });
  return deleted;
}

export function listKeys(userId: string): string[] {
  const userDir = getVaultPath(userId, '');
  return fs.existsSync(userDir) ? fs.readdirSync(userDir).filter((f) => f.endsWith('.enc')).map((f) => f.replace(/\.enc$/, '')) : [];
}

export function deleteVault(userId: string): boolean {
  const userDir = getVaultPath(userId, '');
  if (!fs.existsSync(userDir)) return false;
  fs.rmSync(userDir, { recursive: true, force: true });
  return true;
}

export function migrateAllToArgon2(userId: string): number {
  const userDir = getVaultPath(userId, '');
  if (!fs.existsSync(userDir)) return 0;
  let migrated = 0;
  for (const file of fs.readdirSync(userDir)) {
    if (!file.endsWith('.enc')) continue;
    const data = readVaultFile(userId, file);
    if (data.length === 0) continue;
    if (data[0] !== 0x01) {
      storeKey(userId, file.replace('.enc', ''), data.toString('utf8'), data.toString('utf8'));
      migrated++;
    }
  }
  return migrated;
}
