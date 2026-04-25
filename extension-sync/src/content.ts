/**
 * KeyShield Agentic - Content Script
 * 
 * This script runs on all pages and:
 * 1. Detects API keys in forms, clipboard, and DOM
 * 2. Handles x402 payment responses
 * 3. Provides autofill functionality
 * 4. Monitors for HTTP 402 responses
 */

import { KeyDetector, type DetectedKey } from './lib/detector';
import { LitProtocol } from './lib/lit';
import { X402Handler } from './lib/x402';

// State management
let detectedKeys: DetectedKey[] = [];
let isMonitoring = false;
let lit: LitProtocol | null = null;
let x402: X402Handler | null = null;

/**
 * Initialize the content script
 */
async function init() {
  console.log('[KeyShield] Initializing content script...');
  
  // Initialize Lit Protocol for client-side encryption
  lit = new LitProtocol();
  await lit.init();
  
  // Initialize x402 handler
  x402 = new X402Handler();
  
  // Start detecting keys
  startDetection();
  
  // Setup x402 response listener
  setupX402Listener();
  
  console.log('[KeyShield] Content script initialized');
}

/**
 * Start key detection
 */
function startDetection() {
  if (isMonitoring) return;
  isMonitoring = true;
  
  // Initial scan
  setTimeout(() => {
    detectKeys();
  }, 1000);
  
  // Setup form monitoring
  const cleanup = KeyDetector.setupFormMonitoring((keys) => {
    handleDetectedKeys(keys);
  });
  
  // Setup clipboard monitoring (on demand)
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      const clipboardKey = await KeyDetector.detectClipboard();
      if (clipboardKey) {
        handleDetectedKeys([clipboardKey]);
      }
    }
  });
  
  // Monitor DOM changes for dynamic content
  const observer = new MutationObserver(() => {
    detectKeys();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Detect and handle keys
 */
function detectKeys() {
  try {
    const formKeys = KeyDetector.detectFormFields();
    const domKeys = KeyDetector.detectFromDOMContent();
    
    const allKeys = [...formKeys, ...domKeys];
    
    if (allKeys.length > 0) {
      handleDetectedKeys(allKeys);
    }
  } catch (error) {
    console.error('[KeyShield] Detection error:', error);
  }
}

/**
 * Handle detected keys
 */
function handleDetectedKeys(keys: DetectedKey[]) {
  // Filter out duplicates
  const newKeys = keys.filter(key => 
    !detectedKeys.some(existing => 
      existing.key === key.key && existing.provider === key.provider
    )
  );
  
  if (newKeys.length === 0) return;
  
  detectedKeys = [...detectedKeys, ...newKeys];
  
  // Notify background script
  chrome.runtime.sendMessage({
    type: 'KEYS_DETECTED',
    keys: newKeys,
  });
  
  // Show notification for high-confidence detections
  newKeys.forEach(key => {
    if (key.confidence >= 70) {
      showSavePrompt(key);
    }
  });
}

/**
 * Show save prompt
 */
function showSavePrompt(key: DetectedKey) {
  // Check if user has enabled auto-save
  chrome.storage.local.get(['autoSaveEnabled'], (result) => {
    if (result.autoSaveEnabled) {
      autoSaveKey(key);
    } else {
      showNotification(key);
    }
  });
}

/**
 * Show notification to save key
 */
function showNotification(key: DetectedKey) {
  // Create a floating button
  const button = document.createElement('div');
  button.id = 'keyshield-save-prompt';
  button.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease;
    ">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span>🔑 ${key.provider || 'API Key'} detected! Save to KeyShield?</span>
      <button id="keyshield-save" style="
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      ">Save</button>
      <button id="keyshield-dismiss" style="
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.7);
        cursor: pointer;
        font-size: 18px;
      ">×</button>
    </div>
    <style>
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    </style>
  `;
  
  document.body.appendChild(button);
  
  // Add event listeners
  document.getElementById('keyshield-save')?.addEventListener('click', () => {
    autoSaveKey(key);
    button.remove();
  });
  
  document.getElementById('keyshield-dismiss')?.addEventListener('click', () => {
    button.remove();
  });
  
  // Auto-dismiss after 10 seconds
  setTimeout(() => button.remove(), 10000);
}

/**
 * Auto-save key to vault
 */
async function autoSaveKey(key: DetectedKey) {
  if (!lit) {
    console.error('[KeyShield] Lit not initialized');
    return;
  }
  
  try {
    // Encrypt the key using Lit Protocol
    const encrypted = await lit.encrypt(key.key, {
      accessControl: {
        // Owner can access with wallet signature
        conditionType: 'evmBasic',
        chain: 'solana',
        method: 'eth_getBalance',
        parameters: [':userAddress'],
      },
    });
    
    // Send to background for storage
    chrome.runtime.sendMessage({
      type: 'STORE_KEY',
      key: {
        ...key,
        encryptedData: encrypted.encryptedData,
        encryptedSymmetricKey: encrypted.encryptedSymmetricKey,
      },
    });
    
    console.log('[KeyShield] Key saved:', key.provider);
  } catch (error) {
    console.error('[KeyShield] Failed to save key:', error);
  }
}

/**
 * Setup x402 payment response listener
 */
function setupX402Listener() {
  // Listen for fetch requests
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    
    // Check for 402 Payment Required
    if (response.status === 402) {
      handle402Response(response);
    }
    
    return response;
  };
  
  // Also check for x402 headers
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.addEventListener('load', () => {
      if (this.status === 402) {
        handle402Response({
          status: 402,
          headers: this.getAllResponseHeaders(),
          url: url as string,
        } as unknown as Response);
      }
    });
    return originalXHROpen.call(this, method, url, ...rest);
  };
}

/**
 * Handle HTTP 402 response
 */
async function handle402Response(response: Response) {
  // Check for x402 headers
  const paymentHeader = response.headers.get('X-Payment-Required');
  const amountHeader = response.headers.get('X-Payment-Amount');
  const memoHeader = response.headers.get('X-Payment-Memo');
  
  if (paymentHeader === 'x402' && amountHeader) {
    show402PaymentPrompt({
      amount: parseFloat(amountHeader),
      memo: memoHeader || 'API Payment',
      url: response.url,
    });
  }
}

/**
 * Show x402 payment prompt
 */
function show402PaymentPrompt(payment: { amount: number; memo: string; url: string }) {
  const prompt = document.createElement('div');
  prompt.id = 'keyshield-402-prompt';
  prompt.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="
        background: white;
        padding: 32px;
        border-radius: 16px;
        max-width: 420px;
        text-align: center;
      ">
        <div style="
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <h2 style="margin: 0 0 8px; color: #1a1a1a;">Payment Required</h2>
        <p style="color: #666; margin: 0 0 24px;">
          This service requires payment via x402 protocol.
        </p>
        <div style="
          background: #f5f5f5;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 24px;
          text-align: left;
        ">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #666;">Amount:</span>
            <span style="font-weight: 600;">$${payment.amount.toFixed(4)} USDC</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #666;">Service:</span>
            <span style="font-weight: 600; word-break: break-all;">${new URL(payment.url).hostname}</span>
          </div>
        </div>
        <button id="keyshield-pay-streaming" style="
          width: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          color: white;
          padding: 14px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 12px;
        ">Pay with KeyShield (Streaming)</button>
        <button id="keyshield-pay-once" style="
          width: 100%;
          background: #f5f5f5;
          border: 1px solid #ddd;
          color: #333;
          padding: 14px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          margin-bottom: 12px;
        ">Pay Once</button>
        <button id="keyshield-402-dismiss" style="
          background: transparent;
          border: none;
          color: #999;
          cursor: pointer;
          font-size: 14px;
        ">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(prompt);
  
  // Event listeners
  document.getElementById('keyshield-pay-streaming')?.addEventListener('click', () => {
    handleStreamingPayment(payment);
    prompt.remove();
  });
  
  document.getElementById('keyshield-pay-once')?.addEventListener('click', () => {
    handleOneTimePayment(payment);
    prompt.remove();
  });
  
  document.getElementById('keyshield-402-dismiss')?.addEventListener('click', () => {
    prompt.remove();
  });
}

/**
 * Handle streaming payment setup
 */
async function handleStreamingPayment(payment: { amount: number; memo: string; url: string }) {
  chrome.runtime.sendMessage({
    type: 'INITIATE_STREAMING_PAYMENT',
    payment,
  });
  
  showNotification({
    key: '',
    source: 'form',
    domain: window.location.hostname,
    timestamp: Date.now(),
    provider: 'x402 Streaming',
    confidence: 100,
  });
}

/**
 * Handle one-time payment
 */
async function handleOneTimePayment(payment: { amount: number; memo: string; url: string }) {
  chrome.runtime.sendMessage({
    type: 'INITIATE_PAYMENT',
    payment,
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for testing
export { init, detectKeys, handle402Response };
