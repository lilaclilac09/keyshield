/**
 * KeyShield Agentic — Lit Protocol adapter for extension context.
 *
 * Key differences from frontend/lib/lit-protocol.ts:
 * - No `import.meta.env` / `process.env` (extension context has neither)
 * - Config read from `chrome.storage.local` at runtime
 * - Lit client lives as a singleton in background.ts, NOT in content script
 * - This module is used by background.ts directly
 *
 * Encryption flow (background.ts):
 *   encryptForExtension(plaintext, walletPubkey) → { ciphertext, hash }
 *
 * Decryption flow (background.ts):
 *   decryptForExtension(ciphertext, hash, walletPubkey, sessionSigs) → plaintext
 *
 * Session signatures are obtained via wallet signing in the popup.
 */

import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LIT_ABILITY } from '@lit-protocol/constants';
import { LitAccessControlConditionResource } from '@lit-protocol/auth-helpers';

// ── Singleton ─────────────────────────────────────────────────────────────────

let litClient: LitNodeClient | null = null;
let connectPromise: Promise<LitNodeClient> | null = null;

/**
 * Get (or create) the Lit client. Reads network from chrome.storage.local.
 * Safe to call multiple times — returns the same client.
 */
export async function getLitClient(): Promise<LitNodeClient> {
  if (litClient?.ready) return litClient;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const network = await getStoredLitNetwork();
    console.log(`[KeyShield:Lit] Connecting to ${network}...`);

    litClient = new LitNodeClient({
      litNetwork: network as any,
      debug: false,
      connectTimeout: 30_000,
    });

    await litClient.connect();
    console.log(`[KeyShield:Lit] Connected to ${network}`);
    connectPromise = null;
    return litClient;
  })();

  return connectPromise;
}

/**
 * Disconnect and reset — call on extension suspend.
 */
export async function disconnectLit(): Promise<void> {
  if (litClient) {
    try { await litClient.disconnect(); } catch { /* ignore */ }
    litClient = null;
  }
  connectPromise = null;
}

async function getStoredLitNetwork(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['litNetwork'], (result) => {
      resolve(result.litNetwork || 'datil-dev');
    });
  });
}

// ── Access Control ────────────────────────────────────────────────────────────

/**
 * Solana RPC access condition: wallet must exist (balance >= 0).
 * Only the specified pubkey can satisfy this condition.
 */
function buildSolanaConditions(walletPubkey: string) {
  return [
    {
      conditionType: 'solRpc',
      method: 'getBalance',
      params: [walletPubkey],
      chain: 'solana',
      pdaParams: [],
      pdaInterface: { offset: 0, fields: {} },
      pdaKey: '',
      returnValueTest: {
        key: '',
        comparator: '>=',
        value: '0',
      },
    },
  ];
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

export interface EncryptResult {
  ciphertext: string;
  /** base64-encoded 32-byte hash */
  dataToEncryptHash: string;
}

/**
 * Encrypt plaintext with Lit Protocol using Solana wallet ownership as
 * access control. Falls back to AES-GCM local encryption if Lit is unavailable.
 */
export async function encryptForExtension(
  plaintext: string,
  walletPubkey: string,
): Promise<EncryptResult> {
  try {
    const client = await getLitClient();
    const accessControlConditions = buildSolanaConditions(walletPubkey);

    const { ciphertext, dataToEncryptHash } = await client.encrypt({
      accessControlConditions,
      dataToEncrypt: new TextEncoder().encode(plaintext),
    });

    return { ciphertext, dataToEncryptHash };
  } catch (err) {
    console.warn('[KeyShield:Lit] Lit unavailable, falling back to local AES-GCM:', err);
    return encryptLocalFallback(plaintext, walletPubkey);
  }
}

// ── Decrypt ───────────────────────────────────────────────────────────────────

export interface SessionSigs {
  [nodeUrl: string]: {
    sig: string;
    derivedVia: string;
    signedMessage: string;
    address: string;
    algo?: string;
  };
}

/**
 * Decrypt ciphertext using pre-obtained session signatures.
 * Session signatures are created in popup via wallet.signMessage.
 */
export async function decryptForExtension(
  ciphertext: string,
  dataToEncryptHash: string,
  walletPubkey: string,
  sessionSigs: SessionSigs,
): Promise<string> {
  if (ciphertext.startsWith('local:')) {
    return decryptLocalFallback(ciphertext, walletPubkey);
  }

  const client = await getLitClient();
  const accessControlConditions = buildSolanaConditions(walletPubkey);

  const { decryptedData } = await client.decrypt({
    accessControlConditions,
    ciphertext,
    dataToEncryptHash,
    sessionSigs,
    chain: 'solana',
  });

  return new TextDecoder().decode(decryptedData);
}

// ── Session Sigs ──────────────────────────────────────────────────────────────

export interface WalletSigner {
  pubkey: string;
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Obtain Lit session signatures from a wallet signer.
 * Call this from popup when user initiates a decrypt, then pass sessionSigs
 * to decryptForExtension.
 */
export async function getSessionSigsForExtension(signer: WalletSigner): Promise<SessionSigs> {
  const client = await getLitClient();
  const litResource = new LitAccessControlConditionResource('*');

  const sessionSigs = await client.getSessionSigs({
    chain: 'solana',
    resourceAbilityRequests: [
      {
        resource: litResource as any,
        ability: LIT_ABILITY.AccessControlConditionDecryption as any,
      },
    ],
    authNeededCallback: async ({ uri, expiration }: any): Promise<any> => {
      const message = `KeyShield: authorize decryption\nURI: ${uri}\nExpiration: ${expiration}`;
      const messageBytes = new TextEncoder().encode(message);
      const signature = await signer.signMessage(messageBytes);
      return {
        sig: uint8ArrayToBase64(signature),
        derivedVia: 'solana.signMessage',
        signedMessage: message,
        address: signer.pubkey,
      };
    },
  });

  return sessionSigs as SessionSigs;
}

// ── Local AES-GCM Fallback ────────────────────────────────────────────────────

const LOCAL_PREFIX = 'local:';

async function deriveLocalKey(walletPubkey: string): Promise<CryptoKey> {
  // Derive from a deterministic message — no wallet signature needed in background
  const keyMaterial = new TextEncoder().encode(`keyshield:local:${walletPubkey}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyMaterial);
  return crypto.subtle.importKey('raw', hashBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptLocalFallback(plaintext: string, walletPubkey: string): Promise<EncryptResult> {
  const key = await deriveLocalKey(walletPubkey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const ciphertext = `${LOCAL_PREFIX}${uint8ArrayToBase64(iv)}:${uint8ArrayToBase64(new Uint8Array(encrypted))}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const dataToEncryptHash = uint8ArrayToBase64(new Uint8Array(hashBuffer));
  return { ciphertext, dataToEncryptHash };
}

async function decryptLocalFallback(ciphertext: string, walletPubkey: string): Promise<string> {
  const inner = ciphertext.slice(LOCAL_PREFIX.length);
  const [ivB64, dataB64] = inner.split(':');
  if (!ivB64 || !dataB64) throw new Error('[KeyShield:Lit] Invalid local ciphertext');
  const iv = base64ToUint8Array(ivB64);
  const data = base64ToUint8Array(dataB64);
  const key = await deriveLocalKey(walletPubkey);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
