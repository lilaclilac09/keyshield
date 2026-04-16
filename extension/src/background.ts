/**
 * KeyShield Agentic — Background Service Worker
 *
 * Trust boundary for the extension. All encryption/decryption happens here.
 * Content script and popup communicate via chrome.runtime.sendMessage.
 *
 * Message handlers:
 *   KEYS_DETECTED    — store key metadata, detect rotation, badge popup
 *   STORE_KEY        — encrypt with Lit → chrome.storage.local
 *   GET_VAULT_ITEMS  — return stored vault entries (metadata only, no plaintext)
 *   DECRYPT_KEY      — decrypt ciphertext via Lit → return plaintext
 *   INITIATE_PAYMENT — sign + send x402 payment
 *   GET_SESSION_SIGS — obtain Lit session sigs from wallet (called by popup)
 *   SET_WALLET       — store wallet pubkey + session for this session
 *   GET_SETTINGS     — return extension settings
 *   SET_SETTINGS     — update extension settings
 *   CHECK_HEALTH     — return Lit connection status
 */

// Lit Protocol is lazy-loaded — only imported when encrypt/decrypt is actually needed.
// This keeps background.js small (~200KB without Lit) so the extension loads fast.
// First encrypt/decrypt call pays the ~3s import cost; subsequent calls use the cached module.
import type { DetectedKey } from './lib/detector';
import { buildPaymentProofPayload, encodePaymentProof, type X402Payment } from './lib/x402';
import type { SessionSigs } from './lib/lit';

// Lazy Lit loader — returns cached module after first import
let _litModule: typeof import('./lib/lit') | null = null;
async function getLit(): Promise<typeof import('./lib/lit')> {
  if (!_litModule) _litModule = await import('./lib/lit');
  return _litModule;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface VaultEntry {
  id: string;
  name: string;
  provider: string;
  domain: string;
  ciphertext: string;
  dataToEncryptHash: string;
  walletPubkey: string;
  createdAt: number;
  updatedAt: number;
  /** Hostnames where this key has been seen */
  domains: string[];
  /** Whether stored with Lit (true) or local AES fallback (false) */
  encrypted: boolean;
}

interface KeyMetadata {
  /** SHA-256 prefix hash: provider + ':' + domain + ':' + key.slice(0,12) */
  hash: string;
  provider: string;
  domain: string;
  firstSeen: number;
  lastSeen: number;
  domains: string[];
}

interface ActiveSession {
  walletPubkey: string;
  sessionSigs?: SessionSigs;
  expiresAt: number;
}

// ── State ─────────────────────────────────────────────────────────────────────

let activeSession: ActiveSession | null = null;

/**
 * Pending sign resolver: set by handleGetSessionSigs/handleInitiatePayment when
 * they need the popup to perform a wallet.signMessage call.
 * Resolved by the SIGN_RESPONSE message handler.
 */
let pendingSignResolve: ((sig: Uint8Array) => void) | null = null;
let pendingSignReject: ((err: Error) => void) | null = null;

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[KeyShield:bg] Extension installed');
  // Pre-warm Lit connection (lazy-loaded, 3s delay so install doesn't block)
  setTimeout(() => {
    getLit().then(({ getLitClient }) => getLitClient()).catch((e) =>
      console.warn('[KeyShield:bg] Lit pre-warm failed:', e)
    );
  }, 3000);
  // Set defaults
  chrome.storage.local.get(['trustedDomains', 'autoPayThreshold', 'litNetwork'], (result) => {
    const defaults: Record<string, unknown> = {};
    if (!result.trustedDomains) {
      // Pre-seed with agentcash x402 services that work on Solana devnet
      defaults.trustedDomains = [
        'stableenrich.dev',  // Apollo, Exa, Firecrawl, Google Maps ($0.01–$0.05/call)
        'stablesocial.dev',  // Instagram, TikTok, YouTube, Reddit data
        'stablestudio.dev',  // AI image & video generation
        'localhost:4020',    // Local x402 mock server (run: node extension/x402-mock-server.js)
      ];
    }
    if (result.autoPayThreshold === undefined) defaults.autoPayThreshold = 0.01;
    if (!result.litNetwork) defaults.litNetwork = 'datil-dev';
    if (Object.keys(defaults).length) chrome.storage.local.set(defaults);
  });
});

chrome.runtime.onStartup.addListener(() => {
  getLit().then(({ getLitClient }) => getLitClient()).catch((e) =>
    console.warn('[KeyShield:bg] Lit startup warm failed:', e)
  );
});

// ── Message Router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: { type: string; [key: string]: unknown }, _sender, sendResponse) => {
    // Route to handler, all async
    handleMessage(message, sendResponse);
    return true; // keep the message channel open for async response
  }
);

async function handleMessage(
  message: { type: string; [key: string]: unknown },
  sendResponse: (r: unknown) => void,
) {
  console.log('[KeyShield:bg] message:', message.type);

  try {
    switch (message.type) {
      case 'KEYS_DETECTED':
        await handleKeysDetected(message.keys as DetectedKey[]);
        sendResponse({ success: true });
        break;

      case 'STORE_KEY':
        sendResponse(await handleStoreKey(message.key as DetectedKey));
        break;

      case 'GET_VAULT_ITEMS':
        sendResponse({ items: await getVaultItems() });
        break;

      case 'DECRYPT_KEY':
        sendResponse(await handleDecryptKey(message.id as string));
        break;

      case 'INITIATE_PAYMENT':
        sendResponse(
          await handleInitiatePayment(
            message.payment as X402Payment,
            message.mode as 'streaming' | 'once',
          )
        );
        break;

      case 'SET_WALLET':
        activeSession = {
          walletPubkey: message.pubkey as string,
          sessionSigs: message.sessionSigs as SessionSigs | undefined,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
        };
        sendResponse({ success: true });
        break;

      case 'GET_SESSION_SIGS':
        sendResponse(await handleGetSessionSigs());
        break;

      case 'SIGN_RESPONSE':
        // Popup just completed a wallet.signMessage — resolve pending callback
        if (pendingSignResolve) {
          const sig = new Uint8Array(message.signature as number[]);
          pendingSignResolve(sig);
          pendingSignResolve = null;
          pendingSignReject = null;
        }
        sendResponse({ success: true });
        break;

      case 'GET_SETTINGS':
        sendResponse(await getSettings());
        break;

      case 'SET_SETTINGS':
        await setSettings(message.settings as Record<string, unknown>);
        sendResponse({ success: true });
        break;

      case 'CHECK_HEALTH':
        sendResponse(await checkHealth());
        break;

      case 'UPDATE_VAULT_ENTRY':
        sendResponse(await handleUpdateVaultEntry(
          message.id as string,
          message.key as DetectedKey,
        ));
        break;

      default:
        sendResponse({ error: `Unknown message type: ${message.type}` });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[KeyShield:bg] handler error:', message.type, error);
    sendResponse({ success: false, error });
  }
}

// ── KEYS_DETECTED ─────────────────────────────────────────────────────────────

async function handleKeysDetected(keys: DetectedKey[]): Promise<void> {
  if (!keys?.length) return;

  const vault = await getVaultRaw();
  const rotations: Array<{ key: DetectedKey; oldEntry: VaultEntry }> = [];

  for (const key of keys) {
    if (!key.provider || !key.domain) continue;

    // Compute dedup hash
    const hash = await computeKeyHash(key.provider, key.domain, key.key);

    // Check if we already have an entry for this provider+domain
    const existing = vault.find(
      (e) => e.provider === key.provider && e.domain === key.domain
    );

    if (existing) {
      // Compare hashes to detect rotation
      if (existing.dataToEncryptHash !== hash) {
        rotations.push({ key, oldEntry: existing });
      }
      // Update domain list and lastSeen in metadata
      await updateKeyMetadata(key, hash);
    } else {
      // New key — save metadata for popup display
      await upsertKeyMetadata(key, hash);
    }
  }

  // Notify popup about rotations
  if (rotations.length > 0) {
    chrome.runtime.sendMessage({
      type: 'ROTATION_DETECTED',
      rotations: rotations.map(({ key, oldEntry }) => ({
        provider: key.provider,
        domain: key.domain,
        newKey: key,
        oldEntryId: oldEntry.id,
      })),
    }).catch(() => {/* popup may not be open */});
  }

  // Update extension badge
  const detected = await getPendingDetections();
  if (detected.length > 0) {
    chrome.action.setBadgeText({ text: String(detected.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#ff6200' });
  }
}

// ── STORE_KEY ─────────────────────────────────────────────────────────────────

async function handleStoreKey(key: DetectedKey): Promise<{ success: boolean; error?: string }> {
  if (!activeSession || Date.now() > activeSession.expiresAt) {
    return { success: false, error: 'No wallet session — connect your wallet in the popup' };
  }

  const { walletPubkey } = activeSession;
  const sanitizedValue = sanitizeKeyValue(key.key);
  if (!sanitizedValue) return { success: false, error: 'Invalid key value' };

  const { encryptForExtension } = await getLit();
  const { ciphertext, dataToEncryptHash } = await encryptForExtension(sanitizedValue, walletPubkey);

  const id = `ks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: VaultEntry = {
    id,
    name: `${key.provider || 'API Key'} — ${key.domain}`,
    provider: key.provider || 'Unknown',
    domain: key.domain,
    ciphertext,
    dataToEncryptHash,
    walletPubkey,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    domains: [key.domain],
    encrypted: !ciphertext.startsWith('local:'),
  };

  await appendToVault(entry);

  // Clear pending detection badge for this key
  await clearPendingDetection(key.provider, key.domain);
  const remaining = await getPendingDetections();
  chrome.action.setBadgeText({ text: remaining.length > 0 ? String(remaining.length) : '' });

  return { success: true };
}

// ── GET_VAULT_ITEMS ───────────────────────────────────────────────────────────

async function getVaultItems(): Promise<Array<{
  id: string;
  name: string;
  provider: string;
  domain: string;
  domains: string[];
  encrypted: boolean;
  createdAt: number;
  updatedAt: number;
}>> {
  const vault = await getVaultRaw();
  // Return metadata only — never return ciphertext to content script
  return vault.map(({ id, name, provider, domain, domains, encrypted, createdAt, updatedAt }) => ({
    id, name, provider, domain, domains, encrypted, createdAt, updatedAt,
  }));
}

// ── UPDATE_VAULT_ENTRY (rotation) ─────────────────────────────────────────────

async function handleUpdateVaultEntry(
  oldId: string,
  newKey: DetectedKey,
): Promise<{ success: boolean; error?: string }> {
  if (!activeSession || Date.now() > activeSession.expiresAt) {
    return { success: false, error: 'No wallet session' };
  }
  const sanitizedValue = sanitizeKeyValue(newKey.key);
  if (!sanitizedValue) return { success: false, error: 'Invalid key value' };

  const { encryptForExtension } = await getLit();
  const { ciphertext, dataToEncryptHash } = await encryptForExtension(
    sanitizedValue,
    activeSession.walletPubkey,
  );

  const vault = await getVaultRaw();
  const idx = vault.findIndex((e) => e.id === oldId);
  if (idx < 0) return { success: false, error: 'Entry not found' };

  vault[idx] = {
    ...vault[idx],
    ciphertext,
    dataToEncryptHash,
    updatedAt: Date.now(),
  };
  await new Promise<void>((resolve) => chrome.storage.local.set({ ks_vault: vault }, resolve));
  return { success: true };
}

// ── DECRYPT_KEY ───────────────────────────────────────────────────────────────

async function handleDecryptKey(id: string): Promise<{ value?: string; error?: string }> {
  if (!activeSession || Date.now() > activeSession.expiresAt) {
    return { error: 'No wallet session — connect your wallet in the popup' };
  }
  // sessionSigs only needed for Lit-encrypted keys; local: prefix uses AES fallback

  const vault = await getVaultRaw();
  const entry = vault.find((e) => e.id === id);
  if (!entry) return { error: 'Key not found in vault' };

  const { decryptForExtension } = await getLit();
  const value = await decryptForExtension(
    entry.ciphertext,
    entry.dataToEncryptHash,
    entry.walletPubkey,
    activeSession.sessionSigs ?? {},
  );

  return { value };
}

// ── INITIATE_PAYMENT ──────────────────────────────────────────────────────────

async function handleInitiatePayment(
  payment: X402Payment,
  mode: 'streaming' | 'once',
): Promise<{ success: boolean; signature?: string; error?: string }> {
  if (!activeSession || Date.now() > activeSession.expiresAt) {
    return { success: false, error: 'No wallet session' };
  }

  const { walletPubkey } = activeSession;
  const { preimage, nonce } = buildPaymentProofPayload(payment, walletPubkey);

  try {
    // Get Solana RPC from settings
    const rpcUrl = await getStoredRpc();
    const connection = new Connection(rpcUrl, 'confirmed');
    const payer = new PublicKey(walletPubkey);

    // For streaming: send a minimal 0-lamport memo tx as proof of wallet ownership
    // Real x402 implementations would transfer USDC — this is the scaffold
    const transaction = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 })
    );
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transaction.feePayer = payer;

    // In a real implementation, popup would sign via wallet adapter.
    // For now, send PAYMENT_SIGN_REQUEST to popup and wait for signed tx.
    const signResult = await requestPopupSign(transaction, preimage, nonce);
    if (!signResult.success) return { success: false, error: signResult.error };

    const proof = encodePaymentProof({
      signature: signResult.signature!,
      amount: payment.amount,
      nonce,
      payer: walletPubkey,
      version: '1',
    });

    // Retry the original request with payment proof header (fetch only, not XHR)
    const retryResponse = await fetch(payment.url, {
      headers: { 'X-Payment-Proof': proof },
    });

    if (retryResponse.ok) {
      console.log('[KeyShield:bg] x402 payment accepted, mode:', mode);
      return { success: true, signature: signResult.signature };
    }

    return { success: false, error: `Retry after payment returned ${retryResponse.status}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Ask the popup to sign a raw message. Returns base58 signature string or error. */
async function requestPopupSign(
  _transaction: Transaction,
  preimage: string,
  nonce: number,
): Promise<{ success: boolean; signature?: string; error?: string }> {
  const message = `KeyShield x402 payment\nPreimage: ${preimage}\nNonce: ${nonce}`;
  const messageBytes = new TextEncoder().encode(message);

  try {
    const sig = await requestWalletSign(messageBytes);
    // Encode as hex string for payment proof
    const signature = Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
    return { success: true, signature };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send a SIGN_REQUEST to the popup and wait for SIGN_RESPONSE.
 * The popup must be open and have its message listener active.
 * Rejects after 60 seconds.
 */
async function requestWalletSign(messageBytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // Clear any stale pending sign
    if (pendingSignReject) pendingSignReject(new Error('Superseded by new sign request'));

    pendingSignResolve = resolve;
    pendingSignReject = reject;

    // Send the sign request to the popup (popup must be open)
    chrome.runtime.sendMessage({
      type: 'SIGN_REQUEST',
      message: Array.from(messageBytes),
    }).catch((err) => {
      if (pendingSignReject) {
        pendingSignReject(new Error(`Popup unavailable: ${err?.message ?? err}`));
        pendingSignResolve = null;
        pendingSignReject = null;
      }
    });

    // 60-second timeout
    setTimeout(() => {
      if (pendingSignReject) {
        pendingSignReject(new Error('Sign request timed out — ensure popup is open'));
        pendingSignResolve = null;
        pendingSignReject = null;
      }
    }, 60_000);
  });
}

// ── GET_SESSION_SIGS ──────────────────────────────────────────────────────────

async function handleGetSessionSigs(): Promise<{ success: boolean; error?: string }> {
  if (!activeSession || Date.now() > activeSession.expiresAt) {
    return { success: false, error: 'No wallet session — connect wallet first' };
  }

  const { getSessionSigsForExtension } = await getLit();

  try {
    const sessionSigs = await getSessionSigsForExtension({
      pubkey: activeSession.walletPubkey,
      signMessage: async (msg: Uint8Array) => requestWalletSign(msg),
    });

    activeSession.sessionSigs = sessionSigs;
    console.log('[KeyShield:bg] Session sigs obtained');
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[KeyShield:bg] getSessionSigs failed:', error);
    return { success: false, error };
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function getSettings(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['litNetwork', 'trustedDomains', 'autoPayThreshold', 'autoSaveEnabled'],
      resolve,
    );
  });
}

async function setSettings(settings: Record<string, unknown>): Promise<void> {
  // Allowlist — only accept known keys
  const allowed = ['litNetwork', 'trustedDomains', 'autoPayThreshold', 'autoSaveEnabled'];
  const safe = Object.fromEntries(
    Object.entries(settings).filter(([k]) => allowed.includes(k))
  );
  return new Promise((resolve) => chrome.storage.local.set(safe, resolve));
}

async function getStoredRpc(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['rpcUrl'], (r) => {
      resolve(r.rpcUrl || 'https://api.devnet.solana.com');
    });
  });
}

// ── Health Check ──────────────────────────────────────────────────────────────

async function checkHealth(): Promise<{
  litConnected: boolean;
  walletConnected: boolean;
  sessionSigsObtained: boolean;
  vaultCount: number;
}> {
  let litConnected = false;
  try {
    const { getLitClient } = await getLit();
    const client = await getLitClient();
    litConnected = !!client?.ready;
  } catch { /* lit unavailable */ }

  const vault = await getVaultRaw();
  const walletConnected = !!activeSession && Date.now() < activeSession.expiresAt;
  const sessionSigsObtained = walletConnected &&
    !!activeSession?.sessionSigs &&
    Object.keys(activeSession.sessionSigs).length > 0;

  return {
    litConnected,
    walletConnected,
    sessionSigsObtained,
    vaultCount: vault.length,
  };
}

// ── Storage Helpers ───────────────────────────────────────────────────────────

async function getVaultRaw(): Promise<VaultEntry[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['ks_vault'], (r) => resolve(r.ks_vault || []));
  });
}

async function appendToVault(entry: VaultEntry): Promise<void> {
  const vault = await getVaultRaw();
  // Replace if same provider+domain exists, otherwise append
  const idx = vault.findIndex(
    (e) => e.provider === entry.provider && e.domain === entry.domain
  );
  if (idx >= 0) {
    vault[idx] = { ...entry, id: vault[idx].id, createdAt: vault[idx].createdAt };
  } else {
    // Prune oldest if at capacity (max 200 entries = ~400KB ciphertext)
    if (vault.length >= 200) vault.sort((a, b) => a.updatedAt - b.updatedAt).splice(0, 10);
    vault.push(entry);
  }
  return new Promise((resolve) => chrome.storage.local.set({ ks_vault: vault }, resolve));
}

/** Pending detections — keys seen but not yet stored by user */
async function getPendingDetections(): Promise<KeyMetadata[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['ks_pending'], (r) => resolve(r.ks_pending || []));
  });
}

async function upsertKeyMetadata(key: DetectedKey, hash: string): Promise<void> {
  const pending: KeyMetadata[] = await getPendingDetections();
  const existing = pending.find((m) => m.hash === hash);
  if (existing) {
    existing.lastSeen = Date.now();
    if (key.domain && !existing.domains.includes(key.domain)) {
      existing.domains = [...existing.domains, key.domain].slice(-10);
    }
  } else {
    pending.push({
      hash,
      provider: key.provider || 'Unknown',
      domain: key.domain,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      domains: [key.domain],
    });
  }
  return new Promise((resolve) => chrome.storage.local.set({ ks_pending: pending }, resolve));
}

async function updateKeyMetadata(key: DetectedKey, _hash: string): Promise<void> {
  const vault = await getVaultRaw();
  const entry = vault.find(
    (e) => e.provider === key.provider && e.domain === key.domain
  );
  if (!entry) return;
  entry.updatedAt = Date.now();
  if (key.domain && !entry.domains.includes(key.domain)) {
    entry.domains = [...entry.domains, key.domain].slice(-10);
  }
  return new Promise((resolve) => chrome.storage.local.set({ ks_vault: vault }, resolve));
}

async function clearPendingDetection(provider: string, domain: string): Promise<void> {
  const pending = await getPendingDetections();
  const filtered = pending.filter(
    (m) => !(m.provider === provider && m.domain === domain)
  );
  return new Promise((resolve) => chrome.storage.local.set({ ks_pending: filtered }, resolve));
}

// ── Utils ─────────────────────────────────────────────────────────────────────

/** Compute a dedup hash for a detected key: provider + domain + first 12 chars */
async function computeKeyHash(provider: string, domain: string, keyValue: string): Promise<string> {
  const input = `${provider}:${domain}:${keyValue.slice(0, 12)}`;
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

/** Strip null bytes and enforce max length */
function sanitizeKeyValue(value: string): string | null {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.replace(/\0/g, '').trim().slice(0, 512);
  return cleaned.length >= 8 ? cleaned : null;
}
