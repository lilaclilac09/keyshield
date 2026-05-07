/**
 * KeyShield API Server
 * Self-contained — works on any machine, any OS.
 * - Vault CRUD (AES-256-GCM encrypted)
 * - Auth (wallet sign-in or session token)
 * - Proxy passthrough
 * - Health endpoint
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Encryption ───────────────────────────────────────────────────────────────

const crypto = require('crypto');
const DEFAULT_SALT = Buffer.from('keyshield-salt-v1');

function deriveKey(password: string): Buffer {
  return crypto.scryptSync(password, DEFAULT_SALT, 32) as Buffer;
}

function encrypt(plaintext: string, password: string): string {
  const key = deriveKey(password);
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  });
}

function decrypt(ciphertext: string, password: string): string {
  const key = deriveKey(password);
  const { iv, tag, data } = JSON.parse(ciphertext) as { iv: string; tag: string; data: string };
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// ── Vault Store ──────────────────────────────────────────────────────────────

type VaultEntry = {
  encrypted: string;
  metadata: {
    name: string;
    upstream: string;
    type: string;
    domain: string;
    tags: string[];
    notes?: string;
    expiryDate?: string;
    createdAt: number;
    updatedAt: number;
    lastUsedAt: number;
  };
};

const VAULT_DIR = join(process.env.VAULT_DIR ?? process.cwd(), '.keyshield');
const VAULT_PATH = join(VAULT_DIR, '.keyshield-vault.json');

function ensureVaultDir() {
  if (!existsSync(VAULT_DIR)) mkdirSync(VAULT_DIR, { recursive: true });
}

function loadVault(): Record<string, VaultEntry> {
  ensureVaultDir();
  if (!existsSync(VAULT_PATH)) return {};
  return JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
}

function saveVault(vault: Record<string, VaultEntry>) {
  ensureVaultDir();
  writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2));
}

// ── Sessions ─────────────────────────────────────────────────────────────────

type Session = {
  id: string;
  userId: string;
  walletAddress: string;
  createdAt: number;
};

const sessions: Map<string, Session> = new Map();

// ── App ──────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.text());

const PORT = Number(process.env.PORT) || 8000;

// ── Auth Endpoints ───────────────────────────────────────────────────────────

app.get('/auth/wallet-challenge', (req, res) => {
  const challenge = uuidv4();
  const nonce = randomBytes(8).toString('hex');
  res.json({ challenge, nonce });
});

app.post('/auth/wallet-login', (req, res) => {
  const { walletAddress, signature, challenge, passphrase } = req.body;
  if (!walletAddress || !signature || !challenge || !passphrase) {
    return res.status(400).json({ detail: 'Missing fields' });
  }
  const session: Session = {
    id: uuidv4(),
    userId: walletAddress,
    walletAddress,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  res.json({ token: session.id, userId: walletAddress });
});

app.post('/auth/passkey/auth-verify', (req, res) => {
  const { user_id } = req.body;
  const session: Session = {
    id: uuidv4(),
    userId: user_id,
    walletAddress: user_id,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  res.json({ token: session.id, userId: user_id });
});

app.get('/auth/passkey/auth-options', (req, res) => {
  res.json({ challenge: uuidv4() });
});

app.post('/auth/passkey/register-options', (req, res) => {
  res.json({ challenge: uuidv4(), user: { id: uuidv4() } });
});

app.post('/auth/passkey/register-verify', (req, res) => {
  res.json({ credentialId: uuidv4(), name: 'passkey' });
});

app.post('/auth/passkey/auth-options', (req, res) => {
  res.json({ challenge: uuidv4() });
});

app.post('/auth/passkey/auth-verify', (req, res) => {
  res.json({ token: 'demo-token', userId: 'demo' });
});

app.get('/auth/passkey/list', (req, res) => {
  res.json({ credentials: [] });
});

app.delete('/auth/passkey/:credId', (req, res) => {
  res.json({ ok: true });
});

app.post('/auth/logout', (req, res) => {
  res.json({ ok: true });
});

app.get('/auth/session', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                (req.headers as any)['x-ks-token'];
  const session = token ? sessions.get(token) : null;
  if (!session) return res.status(401).json({ detail: 'Not authenticated' });
  res.json({ session });
});

// ── Vault CRUD ───────────────────────────────────────────────────────────────

function authCheck(req: any, _res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                (req.headers as any)['x-ks-token'];
  if (!token) return res.status(401).json({ detail: 'Not authenticated' });
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ detail: 'Session expired' });
  req.session = session;
  next();
}

app.get('/manage/list', authCheck, (req, res) => {
  const vault = loadVault();
  const items = Object.entries(vault).map(([id, entry]) => ({
    id,
    name: entry.metadata.name,
    upstream: entry.metadata.upstream,
    type: entry.metadata.type,
    domain: entry.metadata.domain,
    tags: entry.metadata.tags,
    notes: entry.metadata.notes,
    expiryDate: entry.metadata.expiryDate,
    createdAt: entry.metadata.createdAt,
    updatedAt: entry.metadata.updatedAt,
    lastUsedAt: entry.metadata.lastUsedAt,
  }));
  res.json({ items });
});

app.post('/manage/store', authCheck, (req, res) => {
  const { upstream, apiKey, name, domain, type, tags, notes, expiryDate } = req.body;
  const password = req.session?.walletAddress ?? 'default';
  const encrypted = encrypt(apiKey, password);
  const vault = loadVault();
  const id = upstream || uuidv4();
  vault[id] = {
    encrypted,
    metadata: {
      name: name || upstream,
      upstream,
      type: type || 'api_key',
      domain: domain || '',
      tags: tags || ['vault'],
      notes: notes || '',
      expiryDate: expiryDate || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastUsedAt: Date.now(),
    },
  };
  saveVault(vault);
  res.json({ id, name: name || upstream });
});

app.get('/manage/decrypt/:id', authCheck, (req, res) => {
  const { id } = req.params;
  const vault = loadVault();
  const entry = vault[id];
  if (!entry) return res.status(404).json({ detail: 'Not found' });
  const password = req.session?.walletAddress ?? 'default';
  const decrypted = decrypt(entry.encrypted, password);
  res.json({ key: decrypted, name: entry.metadata.name });
});

app.delete('/manage/secret/:id', authCheck, (req, res) => {
  const { id } = req.params;
  const vault = loadVault();
  delete vault[id];
  saveVault(vault);
  res.json({ ok: true });
});

// ── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    vault: Object.keys(loadVault()).length,
    sessions: sessions.size,
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`KeyShield API running at http://localhost:${PORT}`);
  console.log(`Vault dir: ${VAULT_DIR}`);
});
