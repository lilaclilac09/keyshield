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

// Network header scanning for API keys
// Listen to outgoing requests to detect API keys in headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Only scan requests from tabs (not extension pages)
    if (!details.tabId || details.tabId < 0) {
      return;
    }

    // Scan headers for API keys
    if (details.requestHeaders) {
      const detectedKeys: Array<{ key: string; header: string; url: string }> = [];

      for (const header of details.requestHeaders) {
        const headerName = header.name.toLowerCase();
        const headerValue = header.value || '';

        // Check common API key header names
        if (
          headerName === 'authorization' ||
          headerName === 'x-api-key' ||
          headerName === '0x-api-key' ||
          headerName === 'api-key' ||
          headerName === 'x-auth-token'
        ) {
          // Extract potential key from header value
          let potentialKey = headerValue;

          // Handle Bearer token format
          if (headerName === 'authorization' && headerValue.startsWith('Bearer ')) {
            potentialKey = headerValue.substring(7);
          } else if (headerName === 'authorization' && headerValue.startsWith('token ')) {
            potentialKey = headerValue.substring(6);
          }

          // Check if it looks like an API key (length and pattern)
          if (potentialKey && potentialKey.length >= 16 && /^[a-zA-Z0-9_\-+/=]+$/.test(potentialKey)) {
            detectedKeys.push({
              key: potentialKey,
              header: headerName,
              url: details.url,
            });
          }
        }
      }

      // Process detected keys
      if (detectedKeys.length > 0) {
        detectedKeys.forEach(async (detected) => {
          // Get tab URL for context
          try {
            const tab = await chrome.tabs.get(details.tabId!);
            const domain = new URL(tab.url || details.url).hostname;

            // Send KEY_DETECTED message (same as DOM detection)
            handleKeyDetected(
              {
                provider: detectProviderFromHeader(detected.header, detected.key),
                key: detected.key,
                url: tab.url || details.url,
              },
              () => {} // No response needed for async detection
            );
          } catch (error) {
            console.error('[KeyShield] Error processing header-detected key:', error);
          }
        });
      }
    }
  },
  {
    urls: ['<all_urls>'],
  },
  ['requestHeaders']
);

/**
 * Detect provider from header name and key pattern
 */
function detectProviderFromHeader(headerName: string, key: string): string {
  const lowerHeader = headerName.toLowerCase();

  if (lowerHeader === '0x-api-key') {
    return '0x API';
  }
  if (lowerHeader.includes('bloxroute') || lowerHeader.includes('blox')) {
    return 'bloXroute';
  }
  if (lowerHeader.includes('helius')) {
    return 'Helius';
  }
  if (lowerHeader.includes('github')) {
    return 'GitHub';
  }
  if (lowerHeader.includes('openai')) {
    return 'OpenAI';
  }

  // Try to detect from key pattern
  if (/^ghp_/.test(key)) {
    return 'GitHub';
  }
  if (/^sk-/.test(key)) {
    return 'OpenAI';
  }
  if (/^AIza/.test(key)) {
    return 'Google Gemini';
  }

  return 'API Key';
}

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
  sender: chrome.runtime.MessageSender | undefined,
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

      case 'SAVE_DETECTED_KEY':
        await handleSaveDetectedKey(message.payload, sendResponse);
        break;

      case 'SAVE_MULTIPLE_KEYS':
        await handleSaveMultipleKeys(message.payload, sendResponse);
        break;

      case 'KEY_DETECTED':
        await handleKeyDetected(
          { provider: message.provider, key: message.key, url: message.url },
          sendResponse
        );
        break;

      case 'CONNECT_WALLET':
        await handleConnectWallet(sendResponse);
        break;

      case 'DISCONNECT_WALLET':
        await handleDisconnectWallet(sendResponse);
        break;

      case 'GET_WALLET_STATUS':
        await handleGetWalletStatus(sendResponse);
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
    domain?: string;
    walletAddress: string;
    keyType?: number; // 0=Generic, 1=GitHub, 2=Helius, 3=GoogleGemini
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

    // Store full ciphertext off-chain (IndexedDB)
    // The ciphertext is typically 1-5 KB, too large for on-chain storage
    await storage.storeCiphertext(dataToEncryptHash, ciphertext);

    // Convert hash to bytes for on-chain storage (32 bytes)
    // dataToEncryptHash is a base64 string from Lit Protocol
    const hashBytes = Uint8Array.from(atob(dataToEncryptHash), c => c.charCodeAt(0));

    // Generate placeholders (would use actual Bonsol/Arcium in production)
    const zkCommit = new Uint8Array(32);
    crypto.getRandomValues(zkCommit);
    const mpcHash = new Uint8Array(32);
    crypto.getRandomValues(mpcHash);

    // Build instruction
    const owner = new PublicKey(payload.walletAddress);
    const timestamp = Date.now();
    const keyType = payload.keyType || 0; // Default to Generic
    const instruction = await vaultClient.buildStoreKeyInstruction(
      owner,
      hashBytes, // Store hash on-chain, not full ciphertext
      zkCommit,
      mpcHash,
      timestamp,
      keyType
    );

    // Store vault metadata locally
    await storage.storeVaultMetadata({
      vaultId: owner.toString(),
      owner: payload.walletAddress,
      domain: payload.domain || (sender?.tab?.url ? new URL(sender.tab.url).hostname : 'unknown'),
      keyName: payload.keyName,
      createdAt: timestamp,
      keyType,
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
 * Handle detected keys (notification only, dialog is shown by content script)
 */
async function handleKeysDetected(
  payload: { detected: DetectedKey[] },
  sendResponse: (response: any) => void
) {
  // Optional: Show notification (dialog is already shown by content script)
  // chrome.notifications.create({
  //   type: 'basic',
  //   iconUrl: 'icons/icon48.png',
  //   title: 'KeyShield: Keys Detected',
  //   message: `Found ${payload.detected.length} potential API key(s).`,
  // });

  sendResponse({ success: true });
}

/**
 * Handle save detected key request from save dialog
 */
async function handleSaveDetectedKey(
  payload: { detectedKey: DetectedKey },
  sendResponse: (response: any) => void
) {
  try {
    // Check if wallet is connected
    if (!currentSession || !currentSession.walletAddress) {
      sendResponse({ 
        success: false, 
        error: 'Wallet not connected',
        requiresWallet: true 
      });
      return;
    }

    // Check if session is valid
    if (currentSession.expiresAt < Date.now()) {
      sendResponse({ 
        success: false, 
        error: 'Session expired. Please authenticate again.',
        requiresAuth: true 
      });
      return;
    }

    const { detectedKey } = payload;
    const walletAddress = currentSession.walletAddress;

    // Determine key type (use provider if available)
    const keyType = detectKeyTypeFromKey(
      detectedKey.key, 
      detectedKey.fieldName,
      detectedKey.provider
    );

    // Store key using existing STORE_KEY handler logic
    await handleStoreKey(
      {
        apiKey: detectedKey.key,
        keyName: `${detectedKey.source}-${detectedKey.fieldName || 'unknown'}-${detectedKey.domain}`,
        walletAddress,
        keyType,
        domain: detectedKey.domain,
      },
      sendResponse
    );
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle save multiple keys request (batch processing)
 */
async function handleSaveMultipleKeys(
  payload: { detectedKeys: DetectedKey[] },
  sendResponse: (response: any) => void
) {
  try {
    // Check if wallet is connected
    if (!currentSession || !currentSession.walletAddress) {
      sendResponse({ 
        success: false, 
        error: 'Wallet not connected',
        requiresWallet: true 
      });
      return;
    }

    // Check if session is valid
    if (currentSession.expiresAt < Date.now()) {
      sendResponse({ 
        success: false, 
        error: 'Session expired. Please authenticate again.',
        requiresAuth: true 
      });
      return;
    }

    const { detectedKeys } = payload;
    const walletAddress = currentSession.walletAddress;

    if (detectedKeys.length === 0) {
      sendResponse({ success: false, error: 'No keys selected' });
      return;
    }

    // Process keys in parallel (batch encryption)
    const savePromises = detectedKeys.map(async (detectedKey) => {
      const keyType = detectKeyTypeFromKey(
        detectedKey.key, 
        detectedKey.fieldName,
        detectedKey.provider
      );
      
      return new Promise((resolve, reject) => {
        handleStoreKey(
          {
            apiKey: detectedKey.key,
            keyName: `${detectedKey.source}-${detectedKey.fieldName || 'unknown'}-${detectedKey.domain}`,
            walletAddress,
            keyType,
            domain: detectedKey.domain,
          },
          (response) => {
            if (response.success) {
              resolve(response);
            } else {
              reject(new Error(response.error || 'Failed to save key'));
            }
          }
        );
      });
    });

    // Wait for all saves to complete
    const results = await Promise.allSettled(savePromises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
      sendResponse({ 
        success: true, 
        partial: true,
        saved: successful,
        failed: failed,
        message: `Saved ${successful} of ${detectedKeys.length} keys${failed > 0 ? ` (${failed} failed)` : ''}`
      });
    } else {
      sendResponse({ 
        success: true, 
        saved: successful,
        message: `Successfully saved ${successful} key(s)`
      });
    }
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Detect key type from key string, field name, and provider
 * Returns keyType enum value (0=Generic, 1=GitHub, 2=Helius, 3=GoogleGemini, etc.)
 * Note: May need to expand enum for additional Solana providers
 */
function detectKeyTypeFromKey(key: string, fieldName?: string, provider?: string): number {
  const lowerFieldName = (fieldName || '').toLowerCase();
  const lowerProvider = (provider || '').toLowerCase();
  
  // Priority 1: Use provider name if available (most accurate)
  if (provider) {
    // Solana RPC Providers
    if (lowerProvider.includes('helius')) return 2; // Helius
    if (lowerProvider.includes('quicknode')) return 4; // QuickNode (new type)
    if (lowerProvider.includes('alchemy')) return 5; // Alchemy (new type)
    if (lowerProvider.includes('ankr')) return 6; // Ankr (new type)
    if (lowerProvider.includes('getblock')) return 7; // GetBlock (new type)
    if (lowerProvider.includes('chainstack')) return 8; // Chainstack (new type)
    
    // Solana Data APIs
    if (lowerProvider.includes('shyft')) return 9; // Shyft (new type)
    if (lowerProvider.includes('solanafm')) return 10; // SolanaFM (new type)
    if (lowerProvider.includes('solscan')) return 11; // Solscan (new type)
    
    // Trading/MEV APIs
    if (lowerProvider.includes('bloxroute')) return 12; // bloXroute (new type)
    if (lowerProvider.includes('0x')) return 13; // 0x API (new type)
    
    // Additional Services
    if (lowerProvider.includes('moralis')) return 14; // Moralis (new type)
    if (lowerProvider.includes('tatum')) return 15; // Tatum (new type)
    
    // Classic APIs
    if (lowerProvider.includes('github')) return 1; // GitHub
    if (lowerProvider.includes('gemini') || lowerProvider.includes('google')) return 3; // Google Gemini
  }
  
  // Priority 2: Check field name patterns
  if (/helius/.test(lowerFieldName)) {
    return 2; // Helius
  }
  if (/quicknode/.test(lowerFieldName)) {
    return 4; // QuickNode
  }
  if (/alchemy/.test(lowerFieldName)) {
    return 5; // Alchemy
  }
  if (/ankr/.test(lowerFieldName)) {
    return 6; // Ankr
  }
  if (/getblock/.test(lowerFieldName)) {
    return 7; // GetBlock
  }
  if (/chainstack/.test(lowerFieldName)) {
    return 8; // Chainstack
  }
  if (/shyft/.test(lowerFieldName)) {
    return 9; // Shyft
  }
  if (/bloxroute/.test(lowerFieldName)) {
    return 12; // bloXroute
  }
  if (/0x/.test(lowerFieldName)) {
    return 13; // 0x API
  }
  if (/gemini/.test(lowerFieldName) || /google.*ai/.test(lowerFieldName)) {
    return 3; // Google Gemini
  }
  if (/github/.test(lowerFieldName)) {
    return 1; // GitHub
  }
  
  // Priority 3: Check key patterns
  if (/^ghp_|^gho_|^ghu_|^ghs_|^ghr_/.test(key)) {
    return 1; // GitHub
  }
  if (/^AIza/.test(key)) {
    return 3; // Google Gemini
  }
  // UUID format (Helius, 0x API)
  if (/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key)) {
    return 2; // Likely Helius or 0x (default to Helius)
  }
  // Long alphanumeric (Helius, QuickNode, etc.)
  if (/^[a-zA-Z0-9]{32,64}$/.test(key) && !/^AIza/.test(key)) {
    return 2; // Helius (heuristic)
  }
  // Very long strings (bloXroute)
  if (/^[A-Za-z0-9+/=]{80,}$/.test(key)) {
    return 12; // bloXroute
  }
  
  return 0; // Generic
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

/**
 * Get dashboard URL from storage (default: localhost:3000 for dev)
 */
async function getDashboardUrl(): Promise<string> {
  const result = await chrome.storage.local.get(['dashboardUrl']);
  return result.dashboardUrl || 'http://localhost:3000';
}

/**
 * Handle key detected from DOM/content scan
 * Creates notification and opens dashboard for save/reveal
 */
async function handleKeyDetected(
  payload: { provider: string; key: string; url: string },
  sendResponse: (response: any) => void
) {
  try {
    const { provider, key, url } = payload;
    const domain = new URL(url).hostname;
    const preview = key.slice(0, 20) + '...';
    
    // Check if we've already notified for this key (prevent spam)
    const notificationKey = `${provider}:${key.slice(0, 12)}`;
    const notifiedKeys = await storage.getSetting('notifiedKeys') || [];
    
    if (notifiedKeys.includes(notificationKey)) {
      sendResponse({ success: true, alreadyNotified: true });
      return;
    }

    // Mark as notified
    notifiedKeys.push(notificationKey);
    // Keep only last 100 to prevent storage bloat
    if (notifiedKeys.length > 100) {
      notifiedKeys.shift();
    }
    await storage.setSetting('notifiedKeys', notifiedKeys);

    // Determine if this is a high-value trading key
    const isHighValue = ['bloXroute', '0x API'].includes(provider);
    const warningText = isHighValue 
      ? ' High-value trading key — exposure risks MEV/front-running. Open dashboard to save securely.'
      : '';

    // Create notification (create returns notification ID string in MV3)
    const notificationId = (await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'KeyShield: API Key Detected!',
      message: `${provider} key (${preview}) found on ${domain}.${warningText}`,
      buttons: [{ title: 'Open Dashboard to Save' }],
      priority: isHighValue ? 2 : 1,
    })) as string;

    const openDashboard = async () => {
      const dashboardUrl = await getDashboardUrl();
      chrome.tabs.create({ url: dashboardUrl });
    };

    // Handle notification button click
    chrome.notifications.onButtonClicked.addListener((clickedNotificationId, buttonIndex) => {
      if (clickedNotificationId === notificationId && buttonIndex === 0) {
        openDashboard();
        chrome.notifications.clear(clickedNotificationId);
      }
    });

    // Handle notification body click (same action as button)
    chrome.notifications.onClicked.addListener((clickedNotificationId) => {
      if (clickedNotificationId === notificationId) {
        openDashboard();
        chrome.notifications.clear(clickedNotificationId);
      }
    });

    sendResponse({ success: true, notificationId });
  } catch (error: any) {
    console.error('[KeyShield] Error handling key detection:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle wallet connection (Phantom)
 * In extension context, we inject into the active tab to access Phantom
 */
async function handleConnectWallet(sendResponse: (response: any) => void) {
  try {
    // Get active tab to inject connection script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      // Can't inject into chrome:// pages, open a new tab for connection
      const connectionPage = chrome.runtime.getURL('wallet-connect.html');
      chrome.tabs.create({ url: connectionPage });
      sendResponse({ 
        success: false, 
        error: 'Opening connection page. Please connect your wallet there.',
        requiresPage: true 
      });
      return;
    }

    try {
      // Inject script to connect to Phantom wallet
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          // Check if Phantom is available
          if (typeof (window as any).solana !== 'undefined' && (window as any).solana.isPhantom) {
            try {
              const resp = await (window as any).solana.connect({ onlyIfTrusted: false });
              return { success: true, publicKey: resp.publicKey.toString() };
            } catch (err: any) {
              return { success: false, error: err.message || 'Connection rejected' };
            }
          }
          return { success: false, error: 'Phantom wallet not found. Please install Phantom extension.' };
        },
      });

      const result = results[0]?.result;
      if (result?.success && result.publicKey) {
        // Store wallet address in session
        if (currentSession) {
          currentSession.walletAddress = result.publicKey;
        }
        // Also store in chrome.storage for persistence
        await chrome.storage.local.set({ walletAddress: result.publicKey });
        sendResponse({ success: true, address: result.publicKey });
      } else {
        sendResponse({ success: false, error: result?.error || 'Failed to connect to Phantom wallet' });
      }
    } catch (error: any) {
      // If injection fails, guide user to install Phantom
      sendResponse({ 
        success: false, 
        error: 'Please install Phantom wallet extension from https://phantom.app and refresh this page',
        requiresInstall: true 
      });
    }
  } catch (error: any) {
    sendResponse({ success: false, error: error.message || 'Failed to connect wallet' });
  }
}

/**
 * Handle wallet disconnection
 */
async function handleDisconnectWallet(sendResponse: (response: any) => void) {
  try {
    if (currentSession) {
      currentSession.walletAddress = undefined;
    }
    await chrome.storage.local.remove('walletAddress');
    sendResponse({ success: true });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get wallet connection status
 */
async function handleGetWalletStatus(sendResponse: (response: any) => void) {
  try {
    const walletData = await chrome.storage.local.get('walletAddress');
    const address = walletData.walletAddress || (currentSession?.walletAddress);
    
    if (address) {
      sendResponse({ 
        success: true, 
        connected: true, 
        address 
      });
    } else {
      sendResponse({ 
        success: true, 
        connected: false 
      });
    }
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

// Initialize storage on load
storage.initialize().catch(console.error);
