/**
 * Background Service Worker
 * Handles authentication, decryption, and communication
 */

import { SecureStorage } from '../storage/secure-storage';
import { AuthService } from '../lib/auth';
import { ExtensionVaultClient, Vault } from '../lib/vault-client';
import { PublicKey } from '@solana/web3.js';
import { OCRService } from '../lib/ocr-service';
import { DetectedKey } from '../lib/key-detector';

// Initialize services
const storage = new SecureStorage();
const vaultClient = new ExtensionVaultClient();
const ocrService = new OCRService();

// Current session
let currentSession: {
  sessionId: string;
  expiresAt: number;
  walletAddress?: string;
} | null = null;

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  await storage.initialize();
  console.log('KeyShield extension installed');
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  await storage.initialize();
});

// Message handler
chrome.runtime.onMessage.addListener(
  (message: any, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // Keep channel open for async
  }
);

/**
 * Handle messages from content scripts and popup
 */
async function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  try {
    switch (message.type) {
      case 'AUTHENTICATE':
        await handleAuthenticate(message.payload, sendResponse);
        break;

      case 'CHECK_SESSION':
        await handleCheckSession(sendResponse);
        break;

      case 'STORE_KEY':
        await handleStoreKey(message.payload, sendResponse);
        break;

      case 'GET_VAULT':
        await handleGetVault(message.payload, sendResponse);
        break;

      case 'DECRYPT_KEY':
        await handleDecryptKey(message.payload, sendResponse);
        break;

      case 'KEYS_DETECTED':
        await handleKeysDetected(message.payload, sendResponse);
        break;

      case 'TRIGGER_AUTO_FILL':
        await handleTriggerAutoFill(message.payload, sender, sendResponse);
        break;

      case 'DETECT_KEYS':
        await handleDetectKeys(sender, sendResponse);
        break;

      case 'INJECT_KEY':
        await handleInjectKey(message.payload, sender, sendResponse);
        break;

      case 'OCR_CAPTURE':
        await handleOCRCapture(message.payload, sendResponse);
        break;

      case 'GET_VAULTS_BY_DOMAIN':
        await handleGetVaultsByDomain(message.payload, sendResponse);
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle authentication
 */
async function handleAuthenticate(
  payload: { method: 'webauthn' | 'password'; password?: string },
  sendResponse: (response: any) => void
) {
  try {
    let authResult;

    if (payload.method === 'webauthn') {
      authResult = await AuthService.authenticateWithWebAuthn();
    } else if (payload.method === 'password' && payload.password) {
      // Get stored password hash
      const storedHash = await storage.getSetting('masterPasswordHash');
      authResult = await AuthService.authenticateWithPassword(
        payload.password,
        storedHash
      );
    } else {
      sendResponse({ success: false, error: 'Invalid authentication method' });
      return;
    }

    if (!authResult.success || !authResult.sessionToken) {
      sendResponse(authResult);
      return;
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = AuthService.getSessionExpiration();

    currentSession = {
      sessionId,
      expiresAt,
    };

    // Store session
    await storage.storeSession(sessionId, {
      sessionToken: authResult.sessionToken,
      decryptedKeys: new Map(),
      expiresAt,
    });

    sendResponse({ success: true, sessionId, expiresAt });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Check if session is valid
 */
async function handleCheckSession(sendResponse: (response: any) => void) {
  if (!currentSession) {
    sendResponse({ success: false, authenticated: false });
    return;
  }

  if (currentSession.expiresAt < Date.now()) {
    currentSession = null;
    sendResponse({ success: false, authenticated: false });
    return;
  }

  sendResponse({ success: true, authenticated: true, expiresAt: currentSession.expiresAt });
}

/**
 * Store key in vault
 */
async function handleStoreKey(
  payload: {
    apiKey: string;
    keyName: string;
    domain: string;
    walletAddress: string;
  },
  sendResponse: (response: any) => void
) {
  try {
    // Check authentication
    if (!currentSession || currentSession.expiresAt < Date.now()) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }

    // Encrypt with Lit Protocol
    const { ciphertext, dataToEncryptHash } = await vaultClient.encryptWithLit(
      payload.apiKey,
      payload.walletAddress
    );

    // Convert to bytes
    const encryptedKeyBytes = new TextEncoder().encode(ciphertext);
    const encryptedKey = new Uint8Array(128);
    const copyLength = Math.min(encryptedKeyBytes.length, 128);
    encryptedKey.set(encryptedKeyBytes.slice(0, copyLength));

    // Generate placeholders (would use actual Bonsol/Arcium in production)
    const zkCommit = new Uint8Array(32);
    crypto.getRandomValues(zkCommit);
    const mpcHash = new Uint8Array(32);
    crypto.getRandomValues(mpcHash);

    // Build instruction
    const owner = new PublicKey(payload.walletAddress);
    const timestamp = Date.now();
    const instruction = await vaultClient.buildStoreKeyInstruction(
      owner,
      encryptedKey,
      zkCommit,
      mpcHash,
      timestamp
    );

    // Store vault metadata locally
    await storage.storeVaultMetadata({
      vaultId: owner.toString(),
      owner: payload.walletAddress,
      domain: payload.domain,
      keyName: payload.keyName,
      createdAt: timestamp,
    });

    sendResponse({
      success: true,
      instruction: {
        programId: instruction.programId.toString(),
        keys: instruction.keys.map((k) => ({
          pubkey: k.pubkey.toString(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: Array.from(instruction.data),
      },
    });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get vault from on-chain
 */
async function handleGetVault(
  payload: { walletAddress: string },
  sendResponse: (response: any) => void
) {
  try {
    const owner = new PublicKey(payload.walletAddress);
    const vault = await vaultClient.getVault(owner);

    if (!vault) {
      sendResponse({ success: true, vault: null });
      return;
    }

    sendResponse({
      success: true,
      vault: {
        owner: vault.owner.toString(),
        createdAt: vault.createdAt,
        accessFlags: vault.accessFlags,
      },
    });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Decrypt key for auto-fill
 */
async function handleDecryptKey(
  payload: { vaultId: string; walletAddress: string },
  sendResponse: (response: any) => void
) {
  try {
    // Check authentication
    if (!currentSession || currentSession.expiresAt < Date.now()) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get vault from on-chain
    const owner = new PublicKey(payload.walletAddress);
    const vault = await vaultClient.getVault(owner);

    if (!vault) {
      sendResponse({ success: false, error: 'Vault not found' });
      return;
    }

    // Decrypt with Lit Protocol
    // Note: In production, you'd need to get sessionSigs from Lit
    // For now, this is a placeholder
    const ciphertext = new TextDecoder().decode(vault.encryptedKey);
    const dataToEncryptHash = ''; // Would get from vault metadata

    // TODO: Get sessionSigs from Lit Protocol
    const sessionSigs = {}; // Placeholder

    const decryptedKey = await vaultClient.decryptWithLit(
      ciphertext,
      dataToEncryptHash,
      payload.walletAddress,
      sessionSigs
    );

    sendResponse({ success: true, key: decryptedKey });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle detected keys
 */
async function handleKeysDetected(
  payload: { detected: DetectedKey[] },
  sendResponse: (response: any) => void
) {
  // Show notification to user
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'KeyShield: Keys Detected',
    message: `Found ${payload.detected.length} potential API key(s). Click to save.`,
  });

  sendResponse({ success: true });
}

/**
 * Trigger auto-fill
 */
async function handleTriggerAutoFill(
  payload: { domain: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  try {
    // Check authentication
    if (!currentSession || currentSession.expiresAt < Date.now()) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get vaults for this domain
    const vaults = await storage.getVaultsByDomain(payload.domain);

    if (vaults.length === 0) {
      sendResponse({ success: false, error: 'No keys found for this domain' });
      return;
    }

    // For now, use the first vault
    // In production, show user a selection UI
    const vault = vaults[0];

    // Decrypt key
    const decryptResult = await handleDecryptKey(
      { vaultId: vault.vaultId, walletAddress: vault.owner },
      () => {}
    );

    if (!decryptResult.success) {
      sendResponse(decryptResult);
      return;
    }

    // Send injection message to content script
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'INJECT_KEY',
        payload: { key: decryptResult.key },
      });
    }

    sendResponse({ success: true });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle detect keys request
 */
async function handleDetectKeys(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  if (sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'DETECT_KEYS' }, (response) => {
      sendResponse(response);
    });
  } else {
    sendResponse({ success: false, error: 'No tab found' });
  }
}

/**
 * Handle inject key request
 */
async function handleInjectKey(
  payload: { key: string; selector?: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  if (sender.tab?.id) {
    chrome.tabs.sendMessage(
      sender.tab.id,
      { type: 'INJECT_KEY', payload },
      (response) => {
        sendResponse(response);
      }
    );
  } else {
    sendResponse({ success: false, error: 'No tab found' });
  }
}

/**
 * Handle OCR capture request
 */
async function handleOCRCapture(
  payload: { domain: string },
  sendResponse: (response: any) => void
) {
  try {
    await ocrService.initialize();
    const detected = await ocrService.captureScreenAndDetectKeys(payload.domain);
    sendResponse({ success: true, detected });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle get vaults by domain request
 */
async function handleGetVaultsByDomain(
  payload: { domain: string },
  sendResponse: (response: any) => void
) {
  try {
    if (!storage) {
      await storage.initialize();
    }
    const vaults = await storage.getVaultsByDomain(payload.domain);
    sendResponse({ success: true, vaults });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

// Initialize storage on load
storage.initialize().catch(console.error);
