/**
 * Content Script
 * Injected into web pages for key detection and auto-fill
 */

import { KeyDetector, DetectedKey } from '../lib/key-detector';
import { KeyInjector } from '../lib/key-injector';
import { saveDialog } from './save-dialog';

// Message types
interface Message {
  type: string;
  payload?: any;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    switch (message.type) {
      case 'DETECT_KEYS':
        handleDetectKeys(sendResponse);
        return true; // Keep channel open for async response

      case 'INJECT_KEY':
        handleInjectKey(message.payload, sendResponse);
        return true;

      case 'FIND_FIELDS':
        handleFindFields(sendResponse);
        return true;

      default:
        return false;
    }
  }
);

/**
 * Handle key detection request
 */
async function handleDetectKeys(sendResponse: (response: any) => void) {
  try {
    // Detect from form fields
    const formKeys = KeyDetector.detectFormFields();

    // Detect from clipboard
    const clipboardKey = await KeyDetector.detectClipboard();

    const detected: DetectedKey[] = [...formKeys];
    if (clipboardKey) {
      detected.push(clipboardKey);
    }

    sendResponse({ success: true, detected });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle key injection request
 */
function handleInjectKey(
  payload: { key: string; selector?: string },
  sendResponse: (response: any) => void
) {
  try {
    const { key, selector } = payload;
    const domain = KeyInjector.getCurrentDomain();

    let result;
    if (selector) {
      result = KeyInjector.injectIntoField(selector, key);
    } else {
      result = KeyInjector.injectIntoBestField(key, domain);
    }

    sendResponse({ success: result.success, fieldName: result.fieldName, error: result.error });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle find fields request
 */
function handleFindFields(sendResponse: (response: any) => void) {
  try {
    const domain = KeyInjector.getCurrentDomain();
    const fields = KeyInjector.findKeyFields(domain);

    sendResponse({
      success: true,
      fields: fields.map((f) => ({
        selector: getFieldSelector(f.field),
        fieldName: f.fieldName,
        confidence: f.confidence,
      })),
    });
  } catch (error: any) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get CSS selector for a field
 */
function getFieldSelector(field: HTMLElement): string {
  if (field.id) {
    return `#${field.id}`;
  }
  if (field.name) {
    return `[name="${field.name}"]`;
  }
  if (field.className) {
    return `.${field.className.split(' ')[0]}`;
  }
  return field.tagName.toLowerCase();
}

// Detection state
let lastDetectedKeys: Set<string> = new Set();
let detectionDebounceTimer: number | null = null;
const DETECTION_DEBOUNCE_MS = 1000; // 1 second debounce

/**
 * Check if domain should show save dialog
 */
async function shouldShowDialog(domain: string): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(['blockedDomains']);
    const blockedDomains = result.blockedDomains || [];
    return !blockedDomains.includes(domain);
  } catch (error) {
    return true; // Default to showing if check fails
  }
}

/**
 * Handle detected keys with debouncing and duplicate prevention
 */
function handleDetectedKeys(detected: DetectedKey[]): void {
  // Clear existing debounce timer
  if (detectionDebounceTimer) {
    clearTimeout(detectionDebounceTimer);
  }

  // Debounce detection to prevent spam
  detectionDebounceTimer = window.setTimeout(async () => {
    // Filter out duplicates (same key detected recently)
    const newKeys = detected.filter((key) => {
      const keyId = `${key.key}-${key.source}`;
      if (lastDetectedKeys.has(keyId)) {
        return false;
      }
      lastDetectedKeys.add(keyId);
      return true;
    });

    if (newKeys.length === 0) {
      return;
    }

    // Check if we should show dialog for this domain
    const domain = window.location.hostname;
    const shouldShow = await shouldShowDialog(domain);

    if (!shouldShow) {
      return;
    }

    // Show save dialog with all detected keys (for multi-select)
    try {
      console.log('[KeyShield] Showing save dialog for', newKeys.length, 'detected key(s)');
      saveDialog.show({
        detectedKeys: newKeys,
        onSave: (selectedKeys: DetectedKey[]) => {
          console.log('[KeyShield] Save button clicked for', selectedKeys.length, 'selected key(s)');
          // Send batch save request to background
          chrome.runtime.sendMessage({
            type: 'SAVE_MULTIPLE_KEYS',
            payload: { detectedKeys: selectedKeys },
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[KeyShield] Error saving keys:', chrome.runtime.lastError);
            } else if (response && !response.success) {
              console.error('[KeyShield] Save failed:', response.error);
              alert(`Failed to save keys: ${response.error}`);
            } else {
              console.log('[KeyShield] Keys saved successfully');
            }
          });
        },
        onDismiss: () => {
          console.log('[KeyShield] Dialog dismissed');
        },
        onDontAskAgain: (domain: string) => {
          console.log('[KeyShield] Blocking domain:', domain);
          // Add domain to blocked list
          chrome.storage.local.get(['blockedDomains'], (result) => {
            const blockedDomains = result.blockedDomains || [];
            if (!blockedDomains.includes(domain)) {
              blockedDomains.push(domain);
              chrome.storage.local.set({ blockedDomains });
            }
          });
        },
      });
    } catch (error) {
      console.error('[KeyShield] Error showing save dialog:', error);
    }

    // Also send to background for notification (optional)
    chrome.runtime.sendMessage({
      type: 'KEYS_DETECTED',
      payload: { detected: newKeys },
    });

    // Clean up old detections after 5 minutes
    setTimeout(() => {
      newKeys.forEach((key) => {
        const keyId = `${key.key}-${key.source}`;
        lastDetectedKeys.delete(keyId);
      });
    }, 5 * 60 * 1000);
  }, DETECTION_DEBOUNCE_MS);
}

/**
 * Setup automatic key detection monitoring
 */
function setupAutoDetection() {
  // Monitor form submissions
  const cleanup = KeyDetector.setupFormMonitoring((detected) => {
    if (detected.length > 0) {
      console.log('[KeyShield] Keys detected from form:', detected.length);
      handleDetectedKeys(detected);
    }
  });

  // DOM content scanning for exposed API keys in page source
  let domScanInterval: number | null = null;
  let lastDomScan = 0;
  const DOM_SCAN_INTERVAL_MS = 5000; // Scan every 5 seconds
  const DOM_SCAN_DEBOUNCE_MS = 2000; // Debounce rapid DOM changes

  const performDOMScan = () => {
    const now = Date.now();
    if (now - lastDomScan < DOM_SCAN_DEBOUNCE_MS) {
      return; // Debounce rapid scans
    }
    lastDomScan = now;

    try {
      const domKeys = KeyDetector.detectFromDOMContent();
      if (domKeys.length > 0) {
        console.log('[KeyShield] Keys detected from DOM content:', domKeys.length);
        
        // Send individual KEY_DETECTED messages for each key
        domKeys.forEach((detectedKey) => {
          chrome.runtime.sendMessage({
            type: 'KEY_DETECTED',
            provider: detectedKey.provider || 'Unknown',
            key: detectedKey.key,
            url: location.href,
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[KeyShield] Error sending KEY_DETECTED:', chrome.runtime.lastError);
            }
          });
        });

        // Also handle through existing flow
        handleDetectedKeys(domKeys);
      }
    } catch (error) {
      console.error('[KeyShield] Error in DOM scan:', error);
    }
  };

  // Initial DOM scan - multiple attempts for reliability
  const performInitialScans = () => {
    // Immediate scan (if DOM ready)
    if (document.body && document.body.children.length > 0) {
      performDOMScan();
    }
    
    // Retry after 1s
    setTimeout(performDOMScan, 1000);
    
    // Retry after 2s
    setTimeout(performDOMScan, 2000);
    
    // Retry after 5s (for slow-loading content)
    setTimeout(performDOMScan, 5000);
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    performInitialScans();
  } else {
    document.addEventListener('DOMContentLoaded', performInitialScans);
    window.addEventListener('load', () => {
      setTimeout(performDOMScan, 1000);
    });
  }

  // Periodic DOM scanning (every 5 seconds)
  domScanInterval = window.setInterval(performDOMScan, DOM_SCAN_INTERVAL_MS);

  // Use MutationObserver for dynamic content changes
  const domObserver = new MutationObserver(() => {
    // Debounce rapid DOM changes
    if (domScanInterval) {
      clearInterval(domScanInterval);
      domScanInterval = window.setInterval(performDOMScan, DOM_SCAN_INTERVAL_MS);
    }
  });

  domObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  // Monitor clipboard on paste events (improved)
  document.addEventListener('paste', async (e) => {
    console.log('[KeyShield] Paste event detected');
    // Small delay to ensure clipboard is updated
    setTimeout(async () => {
      try {
        const detected = await KeyDetector.detectClipboard();
        if (detected) {
          console.log('[KeyShield] Key detected from clipboard:', detected.key.substring(0, 10) + '...');
          handleDetectedKeys([detected]);
        }
      } catch (error) {
        console.error('[KeyShield] Error detecting clipboard:', error);
      }
    }, 100);
  });

  // Monitor input events for form fields (enhanced)
  let inputDebounceTimer: number | null = null;
  document.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target && (target.type === 'password' || target.type === 'text' || target.tagName === 'TEXTAREA')) {
      // Debounce input detection
      if (inputDebounceTimer) {
        clearTimeout(inputDebounceTimer);
      }
      inputDebounceTimer = window.setTimeout(() => {
        const detected = KeyDetector.detectFormFields();
        if (detected.length > 0) {
          handleDetectedKeys(detected);
        }
      }, 2000); // Wait 2 seconds after user stops typing
    }
  }, true); // Use capture phase to catch all inputs

  // Monitor clipboard changes (periodic check as fallback)
  let lastClipboardCheck = '';
  const clipboardCheckInterval = setInterval(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text !== lastClipboardCheck && text.length >= 16) {
        lastClipboardCheck = text;
        const detected = await KeyDetector.detectClipboard();
        if (detected) {
          handleDetectedKeys([detected]);
        }
      }
    } catch (error) {
      // Clipboard access denied or not available
      clearInterval(clipboardCheckInterval);
    }
  }, 3000); // Check every 3 seconds

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    cleanup();
    if (clipboardCheckInterval) {
      clearInterval(clipboardCheckInterval);
    }
    if (detectionDebounceTimer) {
      clearTimeout(detectionDebounceTimer);
    }
    if (inputDebounceTimer) {
      clearTimeout(inputDebounceTimer);
    }
    if (domScanInterval) {
      clearInterval(domScanInterval);
    }
    domObserver.disconnect();
  });
}

// Initialize auto-detection when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAutoDetection);
} else {
  setupAutoDetection();
}

// Keyboard shortcut for manual trigger (Ctrl+Shift+K)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'K') {
    e.preventDefault();
    chrome.runtime.sendMessage({
      type: 'TRIGGER_AUTO_FILL',
      payload: { domain: window.location.hostname },
    });
  }
});
