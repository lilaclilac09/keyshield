/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ./src/lib/key-detector.ts
/**
 * Key Detection System
 * Detects API keys from form fields, clipboard, and screen content
 */
// Common API key patterns
const KEY_PATTERNS = [
    /^sk-[a-zA-Z0-9]{32,}$/, // Stripe, OpenAI secret keys
    /^pk_[a-zA-Z0-9]{32,}$/, // Stripe public keys
    /^sk_live_[a-zA-Z0-9]{24,}$/, // Stripe live keys
    /^pk_live_[a-zA-Z0-9]{24,}$/, // Stripe live public keys
    /^[a-zA-Z0-9]{32,}$/, // Generic long keys (32+ chars)
    /^Bearer\s+[a-zA-Z0-9\-_\.]+$/, // Bearer tokens
    /^x-api-key:\s*[a-zA-Z0-9]+$/i, // API key headers
    /^ghp_[a-zA-Z0-9]{36}$/, // GitHub personal access tokens
    /^gho_[a-zA-Z0-9]{36}$/, // GitHub OAuth tokens
    /^ghu_[a-zA-Z0-9]{36}$/, // GitHub user-to-server tokens
    /^ghs_[a-zA-Z0-9]{36}$/, // GitHub server-to-server tokens
    /^ghr_[a-zA-Z0-9]{76}$/, // GitHub refresh tokens
    /^AKIA[0-9A-Z]{16}$/, // AWS access key IDs
    /^AIza[0-9A-Za-z\-_]{35}$/, // Google API keys (includes Gemini)
    /^ya29\.[0-9A-Za-z\-_]+$/, // Google OAuth tokens
    // Helius API keys - typically 32-64 character alphanumeric strings
    // Helius keys are often base64-like or hex strings
    /^[a-zA-Z0-9]{32,64}$/, // Helius API keys (32-64 chars, alphanumeric)
    // Google Gemini API keys - same pattern as Google API keys but we'll detect by field name
    // The AIza pattern already covers this, but we'll add field name detection
];
// Field name patterns that likely contain API keys
const KEY_FIELD_PATTERNS = [
    /api[_-]?key/i,
    /apikey/i,
    /api[_-]?token/i,
    /access[_-]?token/i,
    /secret[_-]?key/i,
    /secret[_-]?token/i,
    /auth[_-]?token/i,
    /bearer[_-]?token/i,
    /private[_-]?key/i,
    // Helius-specific patterns
    /helius.*api.*key/i,
    /helius.*key/i,
    /helius.*token/i,
    // Google Gemini/Google AI patterns
    /gemini.*api.*key/i,
    /google.*ai.*key/i,
    /google.*gemini.*key/i,
    /gemini.*key/i,
];
class KeyDetector {
    /**
     * Detect keys in form fields
     */
    static detectFormFields() {
        const detected = [];
        const domain = window.location.hostname;
        // Find all input fields
        const inputs = document.querySelectorAll('input[type="text"], input[type="password"], input:not([type]), textarea');
        inputs.forEach((input) => {
            const value = input.value.trim();
            if (!value)
                return;
            const fieldName = input.name || input.id || input.className;
            const isKeyField = KEY_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
            // Check if value matches key patterns
            const matchesPattern = KEY_PATTERNS.some((pattern) => pattern.test(value));
            if (isKeyField || matchesPattern) {
                detected.push({
                    key: value,
                    source: 'form',
                    fieldName,
                    fieldType: input.type || 'text',
                    domain,
                    timestamp: Date.now(),
                });
            }
        });
        return detected;
    }
    /**
     * Detect key from clipboard content
     */
    static async detectClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (!text || text.length < 16)
                return null;
            const trimmed = text.trim();
            // Check if clipboard content matches key patterns
            for (const pattern of KEY_PATTERNS) {
                if (pattern.test(trimmed)) {
                    return {
                        key: trimmed,
                        source: 'clipboard',
                        domain: window.location.hostname,
                        timestamp: Date.now(),
                    };
                }
            }
            // Check for keys in multi-line content (e.g., .env files)
            const lines = trimmed.split('\n');
            for (const line of lines) {
                const match = line.match(/^\s*[A-Z_]+[=:]\s*(.+)$/);
                if (match) {
                    const value = match[1].trim().replace(/['"]/g, '');
                    for (const pattern of KEY_PATTERNS) {
                        if (pattern.test(value)) {
                            return {
                                key: value,
                                source: 'clipboard',
                                domain: window.location.hostname,
                                timestamp: Date.now(),
                            };
                        }
                    }
                }
            }
        }
        catch (error) {
            // Clipboard access denied or not available
            console.warn('Clipboard access denied:', error);
        }
        return null;
    }
    /**
     * Detect keys from text content (for OCR)
     */
    static detectFromText(text, domain) {
        const detected = [];
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.length < 16)
                continue;
            // Check direct pattern matches
            for (const pattern of KEY_PATTERNS) {
                if (pattern.test(trimmed)) {
                    detected.push({
                        key: trimmed,
                        source: 'ocr',
                        domain,
                        timestamp: Date.now(),
                    });
                    break;
                }
            }
            // Check for key=value patterns
            const keyValueMatch = trimmed.match(/^\s*[A-Z_]+[=:]\s*(.+)$/);
            if (keyValueMatch) {
                const value = keyValueMatch[1].trim().replace(/['"]/g, '');
                for (const pattern of KEY_PATTERNS) {
                    if (pattern.test(value)) {
                        detected.push({
                            key: value,
                            source: 'ocr',
                            domain,
                            timestamp: Date.now(),
                        });
                        break;
                    }
                }
            }
        }
        return detected;
    }
    /**
     * Monitor form submissions for key detection
     */
    static setupFormMonitoring(callback) {
        const handleSubmit = (e) => {
            const detected = this.detectFormFields();
            if (detected.length > 0) {
                callback(detected);
            }
        };
        // Monitor form submissions
        document.addEventListener('submit', handleSubmit, true);
        // Monitor input changes for password fields
        const handleInput = (e) => {
            const target = e.target;
            if (target.type === 'password' || target.type === 'text') {
                const detected = this.detectFormFields();
                if (detected.length > 0) {
                    callback(detected);
                }
            }
        };
        document.addEventListener('input', handleInput, true);
        // Return cleanup function
        return () => {
            document.removeEventListener('submit', handleSubmit, true);
            document.removeEventListener('input', handleInput, true);
        };
    }
    /**
     * Monitor clipboard for key detection
     */
    static setupClipboardMonitoring(callback, intervalMs = 1000) {
        let lastClipboard = '';
        const checkClipboard = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text !== lastClipboard) {
                    lastClipboard = text;
                    const detected = await this.detectClipboard();
                    if (detected) {
                        callback(detected);
                    }
                }
            }
            catch (error) {
                // Clipboard access denied
            }
        };
        const intervalId = setInterval(checkClipboard, intervalMs);
        // Return cleanup function
        return () => {
            clearInterval(intervalId);
        };
    }
    /**
     * Validate if a string is likely an API key
     */
    static isValidKey(key) {
        if (!key || key.length < 16)
            return false;
        return KEY_PATTERNS.some((pattern) => pattern.test(key.trim()));
    }
}

;// ./src/lib/key-injector.ts
/**
 * Secure Key Injector
 * Safely injects API keys into form fields without exposing plaintext
 */
class KeyInjector {
    /**
     * Inject key into form field securely
     */
    static injectKey(options) {
        const { field, key, triggerEvents = true } = options;
        // Store original value for undo
        const originalValue = field.value;
        // Set value directly (most secure method)
        field.value = key;
        // Trigger events if requested (for form validation)
        if (triggerEvents) {
            // Trigger input event
            field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            // Trigger change event
            field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            // Trigger focus/blur for some frameworks
            field.focus();
            field.dispatchEvent(new Event('focus', { bubbles: true }));
            field.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        // Clear key from memory after a short delay
        setTimeout(() => {
            // Note: In JavaScript, we can't truly clear strings from memory,
            // but we can minimize exposure by not keeping references
            if (field.value === key) {
                // Value was successfully set
                console.log('Key injected successfully');
            }
        }, 100);
    }
    /**
     * Find input fields that might need key injection
     */
    static findKeyFields(domain) {
        const candidates = [];
        // Find all input and textarea elements
        const inputs = document.querySelectorAll('input[type="text"], input[type="password"], input:not([type]), textarea');
        const keyFieldPatterns = [
            { pattern: /api[_-]?key/i, confidence: 0.9 },
            { pattern: /apikey/i, confidence: 0.9 },
            { pattern: /api[_-]?token/i, confidence: 0.85 },
            { pattern: /access[_-]?token/i, confidence: 0.85 },
            { pattern: /secret[_-]?key/i, confidence: 0.9 },
            { pattern: /secret[_-]?token/i, confidence: 0.85 },
            { pattern: /auth[_-]?token/i, confidence: 0.8 },
            { pattern: /bearer[_-]?token/i, confidence: 0.8 },
            { pattern: /private[_-]?key/i, confidence: 0.9 },
            { pattern: /password/i, confidence: 0.3 }, // Lower confidence
        ];
        inputs.forEach((field) => {
            const fieldName = (field.name || field.id || field.className || '').toLowerCase();
            const placeholder = (field.placeholder || '').toLowerCase();
            // Check field name patterns
            for (const { pattern, confidence } of keyFieldPatterns) {
                if (pattern.test(fieldName) || pattern.test(placeholder)) {
                    candidates.push({
                        field,
                        confidence,
                        fieldName: field.name || field.id || 'unnamed',
                    });
                    break;
                }
            }
            // Check if it's a password field (lower priority)
            if (field.type === 'password' && candidates.every(c => c.field !== field)) {
                candidates.push({
                    field,
                    confidence: 0.4,
                    fieldName: field.name || field.id || 'password',
                });
            }
        });
        // Sort by confidence (highest first)
        return candidates.sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Inject key into the best matching field
     */
    static injectIntoBestField(key, domain) {
        const candidates = this.findKeyFields(domain);
        if (candidates.length === 0) {
            return {
                success: false,
                error: 'No suitable field found',
            };
        }
        // Use the highest confidence field
        const bestField = candidates[0];
        this.injectKey({
            field: bestField.field,
            key,
            triggerEvents: true,
        });
        return {
            success: true,
            fieldName: bestField.fieldName,
        };
    }
    /**
     * Inject key into specific field by selector
     */
    static injectIntoField(selector, key) {
        try {
            const field = document.querySelector(selector);
            if (!field) {
                return {
                    success: false,
                    error: `Field not found: ${selector}`,
                };
            }
            this.injectKey({
                field,
                key,
                triggerEvents: true,
            });
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || 'Injection failed',
            };
        }
    }
    /**
     * Get domain from current URL
     */
    static getCurrentDomain() {
        return window.location.hostname;
    }
    /**
     * Check if domain matches (with subdomain support)
     */
    static domainMatches(storedDomain, currentDomain) {
        // Exact match
        if (storedDomain === currentDomain) {
            return true;
        }
        // Subdomain match (e.g., api.example.com matches example.com)
        if (currentDomain.endsWith(`.${storedDomain}`)) {
            return true;
        }
        // Parent domain match (e.g., example.com matches api.example.com)
        if (storedDomain.endsWith(`.${currentDomain}`)) {
            return true;
        }
        return false;
    }
}

;// ./src/content/save-dialog.ts
/**
 * Save Dialog Overlay
 *
 * In-page overlay dialog that appears when API keys are detected.
 * Non-intrusive, positioned in bottom-right corner with slide-in animation.
 */
class SaveDialog {
    constructor() {
        this.overlay = null;
        this.dialog = null;
        this.options = null;
        this.autoDismissTimer = null;
    }
    /**
     * Show save dialog overlay
     */
    show(options) {
        try {
            // Remove existing dialog if any
            this.hide();
            this.options = options;
            const { detectedKey } = options;
            console.log('[KeyShield SaveDialog] Showing dialog for key type:', detectedKey.key.substring(0, 10) + '...');
            // Create overlay backdrop
            this.overlay = document.createElement('div');
            this.overlay.id = 'keyshield-save-dialog-overlay';
            this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999998;
      pointer-events: none;
    `;
            // Create dialog container
            this.dialog = document.createElement('div');
            this.dialog.id = 'keyshield-save-dialog';
            this.dialog.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 380px;
      max-width: calc(100vw - 40px);
      background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e0e0e0;
      transform: translateY(100px);
      opacity: 0;
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
      pointer-events: auto;
    `;
            // Get key type info
            const keyType = this.detectKeyType(detectedKey.key, detectedKey.fieldName);
            const keyTypeInfo = this.getKeyTypeInfo(keyType);
            // Mask key preview (first 4 chars + "...")
            const maskedKey = this.maskKey(detectedKey.key);
            // Build dialog HTML
            this.dialog.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
        <div style="
          width: 40px;
          height: 40px;
          background: ${keyTypeInfo.color}20;
          border: 1px solid ${keyTypeInfo.color}40;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <span style="font-size: 20px;">${keyTypeInfo.icon}</span>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 4px;
            color: #fff;
          ">API Key Detected</div>
          <div style="
            font-size: 12px;
            color: #888;
            margin-bottom: 8px;
          ">${keyTypeInfo.name} • ${this.formatSource(detectedKey.source)}</div>
          <div style="
            font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
            font-size: 11px;
            color: #aaa;
            background: rgba(0, 0, 0, 0.3);
            padding: 6px 8px;
            border-radius: 4px;
            word-break: break-all;
          ">${maskedKey}</div>
        </div>
        <button id="keyshield-dialog-close" style="
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          padding: 4px;
          font-size: 18px;
          line-height: 1;
          transition: color 0.2s;
        ">×</button>
      </div>

      <div style="
        font-size: 11px;
        color: #666;
        margin-bottom: 16px;
        padding: 8px;
        background: rgba(139, 92, 246, 0.1);
        border-radius: 6px;
        border: 1px solid rgba(139, 92, 246, 0.2);
      ">
        <strong style="color: #a78bfa;">KeyShield</strong> detected an API key. Save it to your encrypted vault?
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button id="keyshield-dialog-save" style="
          flex: 1;
          padding: 10px 16px;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          border: none;
          border-radius: 6px;
          color: white;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        ">Save to Vault</button>
        <button id="keyshield-dialog-dismiss" style="
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #ccc;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        ">Dismiss</button>
      </div>

      <label style="
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: #888;
        cursor: pointer;
        user-select: none;
      ">
        <input type="checkbox" id="keyshield-dialog-dont-ask" style="
          width: 14px;
          height: 14px;
          cursor: pointer;
        ">
        <span>Don't ask again for ${this.getDomain()}</span>
      </label>
    `;
            // Append to body
            if (!document.body) {
                console.error('[KeyShield SaveDialog] document.body is null');
                return;
            }
            document.body.appendChild(this.overlay);
            document.body.appendChild(this.dialog);
            // Animate in
            requestAnimationFrame(() => {
                if (this.dialog) {
                    this.dialog.style.transform = 'translateY(0)';
                    this.dialog.style.opacity = '1';
                    console.log('[KeyShield SaveDialog] Dialog shown successfully');
                }
            });
        }
        catch (error) {
            console.error('[KeyShield SaveDialog] Error showing dialog:', error);
        }
        // Add event listeners
        this.attachEventListeners();
        // Auto-dismiss after 30 seconds
        this.autoDismissTimer = window.setTimeout(() => {
            this.hide();
        }, 30000);
    }
    /**
     * Hide save dialog overlay
     */
    hide() {
        if (this.autoDismissTimer) {
            clearTimeout(this.autoDismissTimer);
            this.autoDismissTimer = null;
        }
        if (this.dialog) {
            // Animate out
            this.dialog.style.transform = 'translateY(100px)';
            this.dialog.style.opacity = '0';
            setTimeout(() => {
                if (this.dialog && this.dialog.parentNode) {
                    this.dialog.parentNode.removeChild(this.dialog);
                }
                if (this.overlay && this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                }
                this.dialog = null;
                this.overlay = null;
                this.options = null;
            }, 300);
        }
    }
    /**
     * Attach event listeners to dialog buttons
     */
    attachEventListeners() {
        if (!this.dialog || !this.options)
            return;
        // Save button
        const saveBtn = this.dialog.querySelector('#keyshield-dialog-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.options?.onSave();
                this.hide();
            });
            saveBtn.addEventListener('mouseenter', () => {
                saveBtn.style.transform = 'translateY(-1px)';
                saveBtn.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
            });
            saveBtn.addEventListener('mouseleave', () => {
                saveBtn.style.transform = 'translateY(0)';
                saveBtn.style.boxShadow = 'none';
            });
        }
        // Dismiss button
        const dismissBtn = this.dialog.querySelector('#keyshield-dialog-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                const dontAskCheckbox = this.dialog?.querySelector('#keyshield-dialog-dont-ask');
                if (dontAskCheckbox?.checked && this.options?.onDontAskAgain) {
                    this.options.onDontAskAgain(this.getDomain());
                }
                this.options?.onDismiss();
                this.hide();
            });
            dismissBtn.addEventListener('mouseenter', () => {
                dismissBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            dismissBtn.addEventListener('mouseleave', () => {
                dismissBtn.style.background = 'rgba(255, 255, 255, 0.05)';
            });
        }
        // Close button
        const closeBtn = this.dialog.querySelector('#keyshield-dialog-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.options?.onDismiss();
                this.hide();
            });
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.color = '#fff';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.color = '#888';
            });
        }
        // Click overlay to dismiss
        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.options?.onDismiss();
                    this.hide();
                }
            });
        }
    }
    /**
     * Detect key type from key string and field name
     */
    detectKeyType(key, fieldName) {
        const lowerFieldName = (fieldName || '').toLowerCase();
        if (/helius/.test(lowerFieldName)) {
            return 'helius';
        }
        if (/gemini/.test(lowerFieldName) || /google.*ai/.test(lowerFieldName)) {
            return 'gemini';
        }
        if (/github/.test(lowerFieldName)) {
            return 'github';
        }
        // Check key patterns
        if (/^ghp_|^gho_|^ghu_|^ghs_|^ghr_/.test(key)) {
            return 'github';
        }
        if (/^AIza/.test(key)) {
            return 'gemini';
        }
        if (/^[a-zA-Z0-9]{32,64}$/.test(key) && !/^AIza/.test(key)) {
            return 'helius';
        }
        return 'generic';
    }
    /**
     * Get key type info (icon, color, name)
     */
    getKeyTypeInfo(type) {
        switch (type) {
            case 'github':
                return { icon: '🔑', color: '#24292e', name: 'GitHub Token' };
            case 'helius':
                return { icon: '⚡', color: '#8b5cf6', name: 'Helius API Key' };
            case 'gemini':
                return { icon: '🤖', color: '#4285f4', name: 'Google Gemini Key' };
            default:
                return { icon: '🔐', color: '#666', name: 'API Key' };
        }
    }
    /**
     * Mask key for preview (first 4 chars + "...")
     */
    maskKey(key) {
        if (key.length <= 8) {
            return '•'.repeat(key.length);
        }
        return key.slice(0, 4) + '...' + key.slice(-4);
    }
    /**
     * Format source for display
     */
    formatSource(source) {
        switch (source) {
            case 'form':
                return 'Form field';
            case 'clipboard':
                return 'Clipboard';
            case 'ocr':
                return 'Screen capture';
            default:
                return source;
        }
    }
    /**
     * Get current domain
     */
    getDomain() {
        return window.location.hostname;
    }
}
// Export singleton instance
const saveDialog = new SaveDialog();

;// ./src/content/content-script.ts
/**
 * Content Script
 * Injected into web pages for key detection and auto-fill
 */



// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
});
/**
 * Handle key detection request
 */
async function handleDetectKeys(sendResponse) {
    try {
        // Detect from form fields
        const formKeys = KeyDetector.detectFormFields();
        // Detect from clipboard
        const clipboardKey = await KeyDetector.detectClipboard();
        const detected = [...formKeys];
        if (clipboardKey) {
            detected.push(clipboardKey);
        }
        sendResponse({ success: true, detected });
    }
    catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}
/**
 * Handle key injection request
 */
function handleInjectKey(payload, sendResponse) {
    try {
        const { key, selector } = payload;
        const domain = KeyInjector.getCurrentDomain();
        let result;
        if (selector) {
            result = KeyInjector.injectIntoField(selector, key);
        }
        else {
            result = KeyInjector.injectIntoBestField(key, domain);
        }
        sendResponse({ success: result.success, fieldName: result.fieldName, error: result.error });
    }
    catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}
/**
 * Handle find fields request
 */
function handleFindFields(sendResponse) {
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
    }
    catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}
/**
 * Get CSS selector for a field
 */
function getFieldSelector(field) {
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
let lastDetectedKeys = new Set();
let detectionDebounceTimer = null;
const DETECTION_DEBOUNCE_MS = 1000; // 1 second debounce
/**
 * Check if domain should show save dialog
 */
async function shouldShowDialog(domain) {
    try {
        const result = await chrome.storage.local.get(['blockedDomains']);
        const blockedDomains = result.blockedDomains || [];
        return !blockedDomains.includes(domain);
    }
    catch (error) {
        return true; // Default to showing if check fails
    }
}
/**
 * Handle detected keys with debouncing and duplicate prevention
 */
function handleDetectedKeys(detected) {
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
        // Get the first detected key (or most relevant)
        const primaryKey = newKeys[0];
        // Show save dialog
        try {
            console.log('[KeyShield] Showing save dialog for key:', primaryKey.key.substring(0, 10) + '...');
            saveDialog.show({
                detectedKey: primaryKey,
                onSave: () => {
                    console.log('[KeyShield] Save button clicked');
                    // Send save request to background
                    chrome.runtime.sendMessage({
                        type: 'SAVE_DETECTED_KEY',
                        payload: { detectedKey: primaryKey },
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('[KeyShield] Error saving key:', chrome.runtime.lastError);
                        }
                        else if (response && !response.success) {
                            console.error('[KeyShield] Save failed:', response.error);
                            alert(`Failed to save key: ${response.error}`);
                        }
                        else {
                            console.log('[KeyShield] Key saved successfully');
                        }
                    });
                },
                onDismiss: () => {
                    console.log('[KeyShield] Dialog dismissed');
                },
                onDontAskAgain: (domain) => {
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
        }
        catch (error) {
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
            }
            catch (error) {
                console.error('[KeyShield] Error detecting clipboard:', error);
            }
        }, 100);
    });
    // Monitor input events for form fields (enhanced)
    let inputDebounceTimer = null;
    document.addEventListener('input', (e) => {
        const target = e.target;
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
        }
        catch (error) {
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
    });
}
// Initialize auto-detection when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAutoDetection);
}
else {
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

/******/ })()
;