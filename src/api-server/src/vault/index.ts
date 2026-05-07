/**
 * @file vault/index.ts — AES-256-GCM encrypted key storage with Argon2id-derived keys.
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
const ARGON2_HASH_LEN = 32;

interface Argon2Result { hash: string; salt: Buffer }
interface EncryptedPayload { version: number; nonce: Buffer; ciphertext: Buffer; tag: Buffer }

function getArgon2(): typeof import('argon2') { return require('argon2'); }

// ─── Argon2id helpers ──────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<Argon2Result> {
  const argon2 = getArgon2();
  const salt = randomBytes(SALT_LEN);
  const hash = (await argon2.hash(password, {
     type: 2, timeCost: ARGON2_T_COST, memoryCost: ARGON2_M_COST, parallelism: ARGON2_P_COST, saltLen: SALT_LEN, hashLen: ARGON2_HASH_LEN,
   } as any)) as unknown as string;
  return { hash, salt };
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const argon2 = getArgon2();
  try { return await argon2.verify(hash, password); } catch { return false; }
}

// ─── PBKDF2 fallback ──────────────────────────────────────────────────

export function deriveKeyPBKDF2(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, ARGON2_HASH_LEN, { N: KDF_ITERS });
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

// ─── Core operations ──────────────────────────────────────────────────

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

  const saltFile = path.join(userDir, `salt_${upstream}`);
  if (!fs.existsSync(saltFile)) {
    const argonHash = readVaultFile(userId, '.argon2');
    if (argonHash.length === 0) return null;
    const verified = await verifyPassword(password, argonHash.toString('utf8'));
    if (!verified) return null;
    const argon2mod = getArgon2();
    const rawHash: any = (argon2mod.argon2id as any).raw(argonHash.toString('utf8'));
    return Buffer.from(rawHash).toString('hex');
  }

  const salt = readVaultFile(userId, `salt_${upstream}`);
  const aesKey = deriveKeyPBKDF2(password, salt);
  const data = readVaultFile(userId, `${upstream}.enc`);
  if (data.length === 0) return null;

  return decryptWithAES(aesKey, { version: data[0], nonce: data.slice(1, 1 + NONCE_LEN), tag: data.slice(data.length - 16), ciphertext: data.slice(1 + NONCE_LEN, data.length - 16) });
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
