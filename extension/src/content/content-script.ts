/**
 * Content Script
 * Injected into web pages for key detection and auto-fill
 */

import { KeyDetector, DetectedKey } from '../lib/key-detector';
import { KeyInjector } from '../lib/key-injector';

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

/**
 * Setup automatic key detection monitoring
 */
function setupAutoDetection() {
  // Monitor form submissions
  const cleanup = KeyDetector.setupFormMonitoring((detected) => {
    // Send detected keys to background script
    chrome.runtime.sendMessage({
      type: 'KEYS_DETECTED',
      payload: { detected },
    });
  });

  // Monitor clipboard (with user permission)
  // Note: Clipboard monitoring requires user interaction
  document.addEventListener('paste', async () => {
    const detected = await KeyDetector.detectClipboard();
    if (detected) {
      chrome.runtime.sendMessage({
        type: 'KEYS_DETECTED',
        payload: { detected: [detected] },
      });
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
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
