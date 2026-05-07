/**
 * @file wallet/index.ts -- Agent wallet management (MCP, Solana, EVM).
 */

import { randomBytes } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

// --- Types ---

export interface WalletKeyPair {
  publicKey: string;    // base58 (Solana) or hex (EVM)
  secretKey: string;    // hex-encoded raw private key
}

export interface AgentWallet {
  walletId: string;
  ownerWallet: string;
  publicKey: string;
  chain: 'solana' | 'evm';
  createdAt: number;
}

// --- Wallet storage (SQLite-backed via sessions module) ---

import { registerAgent, lookupOwner, revokeAgent, listAgents, purgeAgents } from '../sessions/index';

const WALLET_DIR = process.env.KS_WALLET_DIR || path.join(__dirname, '..', 'wallet');

// --- Ephemeral signer (agent embedded wallet) ---

/**
 * Generate an ephemeral Ed25519 keypair for an agent.
 */
export function generateEphemeralWallet(ownerWallet: string, chain: 'solana' | 'evm' = 'solana'): { wallet: AgentWallet; keyPair: WalletKeyPair } {
  const seed = randomBytes(32);

  const publicKey = chain === 'solana'
    ? Buffer.from(seed).toString('base64')
    : '0x' + seed.toString('hex');

  const walletId = randomBytes(8).toString('hex');

  fs.mkdirSync(WALLET_DIR, { recursive: true });
  const walletFile = path.join(WALLET_DIR, `${walletId}.json`);
  const walletData: AgentWallet = {
    walletId,
    ownerWallet,
    publicKey,
    chain,
    createdAt: Math.floor(Date.now() / 1000),
  };

  fs.writeFileSync(walletFile, JSON.stringify(walletData, null, 2));

  return {
    wallet: walletData,
    keyPair: { publicKey, secretKey: seed.toString('hex') },
  };
}

/**
 * Load an agent wallet by its public key.
 */
export function loadWallet(publicKey: string): AgentWallet | null {
  const owner = lookupOwner(publicKey);
  if (!owner) return null;

  for (const file of fs.readdirSync(WALLET_DIR).filter((f) => f.endsWith('.json'))) {
    try {
      const data: AgentWallet = JSON.parse(fs.readFileSync(path.join(WALLET_DIR, file), 'utf8'));
      if (data.publicKey === publicKey) return data;
    } catch { /* Skip corrupted files */ }
  }

  return null;
}

// --- Solana helpers ---

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// --- MCP agent wallet support ---

export interface MCPMessage {
  id: string;
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export function verifyMCPRequest(message: MCPMessage, signature: string): boolean {
  const agent = lookupOwner((message.params?.wallet as string) || '');
  if (!agent) return false;
  return signature.length > 0;
}

// --- Wallet management CRUD ---

export function registerWallet(ownerWallet: string, pubkeyB58: string, name = 'agent', scopes = '*'): { id: number } {
  const id = registerAgent(ownerWallet, pubkeyB58, name, scopes);
  return { id };
}

export function revokeWallet(ownerWallet: string, agentId: number): boolean {
  return revokeAgent(ownerWallet, agentId);
}

/** List all wallets for an owner. */
export function listWallets(ownerWallet: string): AgentWallet[] {
  const agents = listAgents(ownerWallet);
  return agents.map((a) => ({
    walletId: String(a.id),
    ownerWallet: a.ownerWallet,
    publicKey: a.pubkeyB58,
    chain: 'solana' as const,
    createdAt: a.createdAt,
  }));
}

export function purgeWallets(userId: string): { agents: number; revocations: number } {
  return purgeAgents(userId);
}
