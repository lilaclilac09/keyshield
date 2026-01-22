/**
 * Key Detection System
 * Detects API keys from form fields, clipboard, and screen content
 */

export interface DetectedKey {
  key: string;
  source: 'form' | 'clipboard' | 'ocr';
  fieldName?: string;
  fieldType?: string;
  domain: string;
  timestamp: number;
}

// Common API key patterns
const KEY_PATTERNS = [
  /^sk-[a-zA-Z0-9]{32,}$/,                    // Stripe, OpenAI secret keys
  /^pk_[a-zA-Z0-9]{32,}$/,                    // Stripe public keys
  /^sk_live_[a-zA-Z0-9]{24,}$/,              // Stripe live keys
  /^pk_live_[a-zA-Z0-9]{24,}$/,              // Stripe live public keys
  /^[a-zA-Z0-9]{32,}$/,                       // Generic long keys (32+ chars)
  /^Bearer\s+[a-zA-Z0-9\-_\.]+$/,            // Bearer tokens
  /^x-api-key:\s*[a-zA-Z0-9]+$/i,            // API key headers
  /^ghp_[a-zA-Z0-9]{36}$/,                    // GitHub personal access tokens
  /^gho_[a-zA-Z0-9]{36}$/,                    // GitHub OAuth tokens
  /^ghu_[a-zA-Z0-9]{36}$/,                    // GitHub user-to-server tokens
  /^ghs_[a-zA-Z0-9]{36}$/,                    // GitHub server-to-server tokens
  /^ghr_[a-zA-Z0-9]{76}$/,                    // GitHub refresh tokens
  /^AKIA[0-9A-Z]{16}$/,                       // AWS access key IDs
  /^AIza[0-9A-Za-z\-_]{35}$/,                 // Google API keys
  /^ya29\.[0-9A-Za-z\-_]+$/,                  // Google OAuth tokens
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
];

export class KeyDetector {
  /**
   * Detect keys in form fields
   */
  static detectFormFields(): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const domain = window.location.hostname;

    // Find all input fields
    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="password"], input:not([type]), textarea'
    );

    inputs.forEach((input) => {
      const value = input.value.trim();
      if (!value) return;

      const fieldName = input.name || input.id || input.className;
      const isKeyField = KEY_FIELD_PATTERNS.some((pattern) =>
        pattern.test(fieldName)
      );

      // Check if value matches key patterns
      const matchesPattern = KEY_PATTERNS.some((pattern) =>
        pattern.test(value)
      );

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
  static async detectClipboard(): Promise<DetectedKey | null> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.length < 16) return null;

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
    } catch (error) {
      // Clipboard access denied or not available
      console.warn('Clipboard access denied:', error);
    }

    return null;
  }

  /**
   * Detect keys from text content (for OCR)
   */
  static detectFromText(text: string, domain: string): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 16) continue;

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
  static setupFormMonitoring(
    callback: (detected: DetectedKey[]) => void
  ): () => void {
    const handleSubmit = (e: Event) => {
      const detected = this.detectFormFields();
      if (detected.length > 0) {
        callback(detected);
      }
    };

    // Monitor form submissions
    document.addEventListener('submit', handleSubmit, true);

    // Monitor input changes for password fields
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
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
  static setupClipboardMonitoring(
    callback: (detected: DetectedKey | null) => void,
    intervalMs: number = 1000
  ): () => void {
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
      } catch (error) {
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
  static isValidKey(key: string): boolean {
    if (!key || key.length < 16) return false;
    return KEY_PATTERNS.some((pattern) => pattern.test(key.trim()));
  }
}
