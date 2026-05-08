/**
 * @file sessions/index.ts — Self-contained session tokens with HMAC expiry + CRL.
 * Token format: <base64url-payload>.<hmac-signature>
 */

import { createHmac, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { SessionPayload, SessionInfo, RevocationEntry } from '../types/index';

const SESSION_TTL = 24 * 3600;
const DB_DIR = path.join(__dirname, '..', 'data');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function _readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fs.writeFileSync(file, JSON.stringify(typeof fallback === 'function' ? (fallback as () => any)() : fallback));
    return typeof fallback === 'function' ? (fallback as () => any)() : fallback;
  }
}

function _writeJson<T>(file: string, data: T): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Password encryption (AES-256-GCM) ---

const { createCipheriv, createDecipheriv } = require('crypto');

function _serverSecret(): Buffer {
  return Buffer.from(process.env.SERVER_SECRET || 'CHANGE-ME-IN-PROD-32-BYTES-MIN!!');
}

function encryptPassword(password: string): string {
  const key = createHmac('sha256', _serverSecret()).digest();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  // Include auth tag in the stored data
  return Buffer.from(Buffer.concat([nonce, encrypted, cipher.getAuthTag()])).toString('base64url');
}

function decryptPassword(data: string): string {
  const buf = Buffer.from(data, 'base64url');
  const key = createHmac('sha256', _serverSecret()).digest();
  const nonce = buf.slice(0, 12);
  const authTag = buf.slice(-16);
  const ciphertext = buf.slice(12, -16);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// --- Token helpers ---

function b64encode(data: Buffer): string {
  return data.toString('base64url');
}

function b64decode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

function makePayload(userId: string, expiresAt: number): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: expiresAt,
    iat: Math.floor(Date.now() / 1000),
    nbf: Math.floor(Date.now() / 1000),
  };
  return b64encode(Buffer.from(JSON.stringify(payload)));
}

function signToken(payload: string): string {
  const sig = createHmac('sha256', _serverSecret()).update(payload).digest();
  return b64encode(sig);
}

// --- Session operations ---

const FILE_DB = path.join(DB_DIR, 'sessions.json');

interface SessionEntry { token: string; user_id: string; enc_pass: string; expires_at: number }

function getSessions(): SessionEntry[] {
  return _readJson(FILE_DB, []);
}

function saveSessions(entries: SessionEntry[]): void {
  _writeJson(FILE_DB, entries);
}

export function createToken(userId: string, password: string, ttl = SESSION_TTL): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const payloadStr = makePayload(userId, expiresAt);
  const sig = signToken(payloadStr);
  const token = `${payloadStr}.${sig}`;

  const entries = getSessions();
  // Replace existing entry for same userId to avoid duplicates
  const filtered = entries.filter((e) => !(e.user_id === userId && e.expires_at <= expiresAt));
  filtered.push({ token, user_id: userId, enc_pass: encryptPassword(password), expires_at: expiresAt });
  saveSessions(filtered);

  return token;
}

export function getToken(token: string): SessionInfo | null {
  if (!token || !token.includes('.')) return null;

  const parts = token.split('.');
  const payloadStr = parts[0];
  const sig = parts[1];

  const expectedSig = signToken(payloadStr);
  if (sig !== expectedSig) return null;

  let data: SessionPayload;
  try {
    data = JSON.parse(b64decode(payloadStr).toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > data.exp) return null;
  if (now < data.nbf) return null;

  // Check soft-delete — also reject if user was deleted after token creation
  const deletedFile = path.join(DB_DIR, 'deleted_users.json');
  let deletedUsers: string[] = [];
  if (fs.existsSync(deletedFile)) {
    deletedUsers = JSON.parse(fs.readFileSync(deletedFile, 'utf8'));
  }
  if (deletedUsers.includes(data.uid)) return null;

  const entries = getSessions();
  // Find the first matching entry with valid expiry
  const entry = entries.find((e) => e.token === token && e.expires_at >= now);
  if (!entry) return null;

  try {
    return {
      userId: data.uid,
      password: decryptPassword(entry.enc_pass),
      valid: true,
      expiresAt: data.exp,
    };
  } catch {
    return null;
  }
}

export function verifyToken(token: string): { valid: boolean; error?: string } {
  if (!token || !token.includes('.')) return { valid: false, error: 'malformed' };

  const parts = token.split('.');
  const payloadStr = parts[0];
  const sig = parts[1];

  const expectedSig = signToken(payloadStr);
  if (sig !== expectedSig) return { valid: false, error: 'tampered' };

  let data: SessionPayload;
  try {
    data = JSON.parse(b64decode(payloadStr).toString('utf8'));
  } catch {
    return { valid: false, error: 'malformed' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > data.exp) return { valid: false, error: 'expired' };
  if (now < data.nbf) return { valid: false, error: 'not_yet_valid' };
  if (now < data.nbf) return { valid: false, error: 'not_yet_valid' };

  return { valid: true };
}

export function deleteToken(token: string): void {
  const entries = getSessions();
  const filtered = entries.filter((e) => e.token !== token);
  saveSessions(filtered);
}

export function deleteAllForUser(userId: string): number {
  const entries = getSessions();
  const original = entries.length;
  const filtered = entries.filter((e) => e.user_id !== userId);
  saveSessions(filtered);
  return original - filtered.length;
}

export function markDeleted(userId: string): void {
  const deletedFile = path.join(DB_DIR, 'deleted_users.json');
  let users: string[] = [];
  if (fs.existsSync(deletedFile)) {
    try { users = JSON.parse(fs.readFileSync(deletedFile, 'utf8')); } catch {}
  }
  if (!users.includes(userId)) {
    users.push(userId);
    fs.writeFileSync(deletedFile, JSON.stringify(users));
  }
}

export function isDeleted(userId: string): boolean {
  const deletedFile = path.join(DB_DIR, 'deleted_users.json');
  if (!fs.existsSync(deletedFile)) return false;
  try {
    return JSON.parse(fs.readFileSync(deletedFile, 'utf8')).includes(userId);
  } catch {
    return false;
  }
}

// --- Agent management ---

const AGENTS_FILE = path.join(DB_DIR, 'agents.json');

function getAgents(): { agents: Array<{ id: number; owner_wallet: string; pubkey_b58: string; name: string; scopes: string; created_at: number; last_used_at: number | null }>; revocations: Array<{ owner_wallet: string; pubkey_b58: string; revoked_at: number; reason: string }> } {
  const data = _readJson(AGENTS_FILE, { agents: [], revocations: [] }) as any;
  return data;
}

function saveAgents(data: ReturnType<typeof getAgents>): void {
  _writeJson(AGENTS_FILE, data);
}

export function registerAgent(ownerWallet: string, pubkeyB58: string, name = 'agent', scopes = '*'): number {
  const data = getAgents();
  const id = data.agents.length > 0 ? Math.max(...data.agents.map((a) => a.id)) + 1 : 1;
  data.agents.push({ id, owner_wallet: ownerWallet, pubkey_b58: pubkeyB58, name: name.slice(0, 64), scopes, created_at: Math.floor(Date.now() / 1000), last_used_at: null });
  saveAgents(data);
  return id;
}

export function lookupOwner(pubkeyB58: string): { id: number; ownerWallet: string; name: string; scopes: string } | null {
  const data = getAgents();
  const isRevoked = data.revocations.some((r) => r.pubkey_b58 === pubkeyB58);
  if (isRevoked) return null;

  const agent = data.agents.find((a) => a.pubkey_b58 === pubkeyB58);
  if (!agent) return null;

  return { id: agent.id, ownerWallet: agent.owner_wallet, name: agent.name, scopes: agent.scopes };
}

export function revokeAgent(ownerWallet: string, agentId: number, reason = ''): boolean {
  const data = getAgents();
  const agent = data.agents.find((a) => a.id === agentId && a.owner_wallet === ownerWallet);
  if (!agent) return false;

  const exists = data.revocations.some((r) => r.owner_wallet === ownerWallet && r.pubkey_b58 === agent.pubkey_b58);
  if (!exists) {
    data.revocations.push({ owner_wallet: ownerWallet, pubkey_b58: agent.pubkey_b58, revoked_at: Math.floor(Date.now() / 1000), reason: reason.slice(0, 256) });
    saveAgents(data);
  }

  return true;
}

export function revokeByPubkey(ownerWallet: string, pubkeyB58: string, reason = ''): boolean {
  const data = getAgents();
  const exists = data.agents.some((a) => a.owner_wallet === ownerWallet && a.pubkey_b58 === pubkeyB58);
  if (!exists) return false;

  const revoked = data.revocations.some((r) => r.owner_wallet === ownerWallet && r.pubkey_b58 === pubkeyB58);
  if (!revoked) {
    data.revocations.push({ owner_wallet: ownerWallet, pubkey_b58: pubkeyB58, revoked_at: Math.floor(Date.now() / 1000), reason });
    saveAgents(data);
  }

  return true;
}

export function unrevokeAgent(ownerWallet: string, pubkeyB58: string): boolean {
  const data = getAgents();
  const before = data.revocations.length;
  data.revocations = data.revocations.filter((r) => !(r.owner_wallet === ownerWallet && r.pubkey_b58 === pubkeyB58));
  saveAgents(data);
  return data.revocations.length < before;
}

export function listAgents(ownerWallet: string): Array<{ id: number; pubkeyB58: string; ownerWallet: string; name: string; scopes: string; createdAt: number; lastUsedAt: number | null }> {
  const data = getAgents();
  const agents = data.agents.filter((a) => a.owner_wallet === ownerWallet);
  return agents.sort((a, b) => b.created_at - a.created_at).map((a) => ({
    id: a.id, pubkeyB58: a.pubkey_b58, ownerWallet: a.owner_wallet, name: a.name, scopes: a.scopes, createdAt: a.created_at, lastUsedAt: a.last_used_at,
  }));
}

export function listRevoked(ownerWallet: string): RevocationEntry[] {
  const data = getAgents();
  return data.revocations.filter((r) => r.owner_wallet === ownerWallet) as any;
}

export function touchAgent(pubkeyB58: string): void {
  const data = getAgents();
  for (const agent of data.agents) {
    if (agent.pubkey_b58 === pubkeyB58) {
      agent.last_used_at = Math.floor(Date.now() / 1000);
      saveAgents(data);
      break;
    }
  }
}

export function deleteAgent(ownerWallet: string, agentId: number): boolean {
  const data = getAgents();
  const before = data.agents.length;
  data.agents = data.agents.filter((a) => !(a.id === agentId && a.owner_wallet === ownerWallet));
  saveAgents(data);
  return data.agents.length < before;
}

export function purgeAgents(userId: string): { agents: number; revocations: number } {
  const data = getAgents();
  const agentN = data.agents.filter((a) => a.owner_wallet === userId).length;
  const revokedN = data.revocations.filter((r) => r.owner_wallet === userId).length;
  data.agents = data.agents.filter((a) => a.owner_wallet !== userId);
  data.revocations = data.revocations.filter((r) => r.owner_wallet !== userId);
  saveAgents(data);
  return { agents: agentN, revocations: revokedN };
}

// --- Usage tracking ---

const USAGE_FILE = path.join(DB_DIR, 'usage.json');

function getUsage(): { logs: any[]; balances: Record<string, number> } {
  return _readJson(USAGE_FILE, { logs: [], balances: {} });
}

function saveUsage(data: ReturnType<typeof getUsage>): void {
  _writeJson(USAGE_FILE, data);
}

export const COST_PER_1K: Record<string, [number, number]> = {
  openai: [0.003, 0.012], anthropic: [0.003, 0.015], groq: [0.0006, 0.0008], mistral: [0.0002, 0.0006],
  cohere: [0.001, 0.002], helius: [0, 0], '0x': [0, 0], titan: [0, 0], pyth: [0, 0], alchemy: [0, 0],
};

const FLAT_COST_PER_CALL: Record<string, number> = { helius: 0.00001, alchemy: 0.00001 };

export function extractTokenUsage(upstream: string, content: Buffer): [number, number, number] {
  if (!content.length) return [0, 0, FLAT_COST_PER_CALL[upstream] || 0];
  try {
    const data = JSON.parse(content.toString('utf8'));
    const usage = typeof data === 'object' && data ? (data as any).usage : undefined;
    const tokIn = typeof usage === 'object' && usage ? (usage.prompt_tokens || usage.input_tokens || 0) : 0;
    const tokOut = typeof usage === 'object' && usage ? (usage.completion_tokens || usage.output_tokens || 0) : 0;
    const rates = COST_PER_1K[upstream] || [0, 0];
    const cost = tokIn / 1000 * rates[0] + tokOut / 1000 * rates[1];
    return [tokIn, tokOut, cost === 0 ? (FLAT_COST_PER_CALL[upstream] || 0) : cost];
  } catch {
    return [0, 0, FLAT_COST_PER_CALL[upstream] || 0];
  }
}

export function logCall(userId: string, upstream: string, keyType: string, method: string, uri: string, tokensIn: number, tokensOut: number, costUsd: number, latencyMs: number, statusCode: number): void {
  const data = getUsage();
  data.logs.push({ userId, upstream, keyType, method, uri, tokensIn, tokensOut, costUsd, latencyMs, statusCode, ts: Math.floor(Date.now() / 1000) });
  saveUsage(data);

  if (keyType === 'platform' && costUsd > 0) {
    const balance = data.balances[userId] || 0.1;
    data.balances[userId] = Math.max(0, balance - costUsd);
    saveUsage(data);
  }
}

export function getBalance(userId: string): number {
  const data = getUsage();
  return Math.round((data.balances[userId] || 0.1) * 1_000_000) / 1_000_000;
}

export function topupBalance(userId: string, amountUsd: number): number {
  const data = getUsage();
  data.balances[userId] = (data.balances[userId] || 0.1) + amountUsd;
  saveUsage(data);
  return Math.round((data.balances[userId]) * 1_000_000) / 1_000_000;
}
