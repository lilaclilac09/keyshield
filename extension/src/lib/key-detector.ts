/**
 * Key Detection System
 * Detects API keys from form fields, clipboard, and screen content
 */

export interface DetectedKey {
  key: string;
  source: 'form' | 'clipboard' | 'ocr' | 'dom';
  fieldName?: string;
  fieldType?: string;
  domain: string;
  timestamp: number;
  provider?: string; // API provider name (e.g., 'Helius', 'bloXroute')
}

// API Pattern Interface
interface API_PATTERN {
  name: string;
  regex: RegExp;
  priority?: number; // Higher = more important (Solana ecosystem first)
}

// Solana Ecosystem API Patterns (Priority Order)
const API_PATTERNS: API_PATTERN[] = [
  // ===== TIER 1: Solana RPC & Infrastructure Providers =====
  {
    name: 'Helius',
    regex: /(?:api-key=|X-API-Key:\s*)([a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})/i,
    priority: 10
  },
  {
    name: 'QuickNode',
    regex: /\.(?:quicknode\.pro|quicknode\.com)\/([A-Za-z0-9]{30,})/i,
    priority: 9
  },
  {
    name: 'Alchemy',
    regex: /\.(?:alchemy\.com|alchemyapi\.io)\/v2\/([A-Za-z0-9_-]{32,})/i,
    priority: 9
  },
  {
    name: 'Ankr',
    regex: /(?:ankr\.com\/([A-Za-z0-9_]{40,})|X-API-Key:\s*([A-Za-z0-9_]{40,}))/i,
    priority: 8
  },
  {
    name: 'GetBlock',
    regex: /Authorization:\s*Bearer\s+([A-Za-z0-9]{40,})/i,
    priority: 8
  },
  {
    name: 'Chainstack',
    regex: /\.(?:chainstack\.com|chainstacklabs\.com)\/([A-Za-z0-9]{32,})/i,
    priority: 8
  },

  // ===== TIER 2: Solana Data & Analytics APIs =====
  {
    name: 'Shyft',
    regex: /x-api-key[:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 7
  },
  {
    name: 'SolanaFM',
    regex: /(?:solanafm\.com|api\.solanafm\.com).*?[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 6
  },
  {
    name: 'Solscan',
    regex: /(?:solscan\.io|api\.solscan\.io).*?[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 6
  },

  // ===== TIER 3: Trading & MEV Protection APIs =====
  {
    name: 'bloXroute',
    regex: /(?:Authorization|X-Authorization):\s*([A-Za-z0-9+/=]{80,})/i,
    priority: 9 // High priority - high-value trading key
  },
  {
    name: '0x API',
    regex: /(?:0x-api-key|X-API-Key):\s*([a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})/i,
    priority: 8 // High priority - trading/DeFi key
  },

  // ===== TIER 4: Additional Solana Services =====
  {
    name: 'Moralis',
    regex: /(?:moralis\.io|api\.moralis\.io).*?[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 5
  },
  {
    name: 'Tatum',
    regex: /(?:tatum\.io|api\.tatum\.io).*?[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*([A-Za-z0-9]{32,})/i,
    priority: 5
  },

  // ===== Classic Dev APIs (Still Important) =====
  {
    name: 'OpenAI/Anthropic/Groq',
    regex: /sk-(?:live|test|proj|ant)_[A-Za-z0-9]{48}/i,
    priority: 4
  },
  {
    name: 'GitHub PAT',
    regex: /gh[pousr]_[A-Za-z0-9]{36,}/i,
    priority: 4
  },
  {
    name: 'Stripe',
    regex: /[rs]k_(?:live|test)_[A-Za-z0-9]{24,}/i,
    priority: 3
  },
  {
    name: 'AWS',
    regex: /AKIA[0-9A-Z]{16}/i,
    priority: 3
  },
  {
    name: 'Google Cloud',
    regex: /AIza[0-9A-Za-z_-]{35}/i,
    priority: 3
  },
  {
    name: 'Twilio',
    regex: /SK[0-9a-fA-F]{32}/i,
    priority: 2
  },
  {
    name: 'Cloudflare',
    regex: /v1\/[0-9a-f]{40}/i,
    priority: 2
  },
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
  // Solana RPC providers
  /helius.*api.*key/i,
  /helius.*key/i,
  /helius.*token/i,
  /quicknode.*api.*key/i,
  /quicknode.*key/i,
  /alchemy.*api.*key/i,
  /ankr.*api.*key/i,
  /getblock.*api.*key/i,
  /chainstack.*api.*key/i,
  // Solana data APIs
  /shyft.*api.*key/i,
  /solanafm.*api.*key/i,
  /solscan.*api.*key/i,
  // Trading/MEV APIs
  /bloxroute.*api.*key/i,
  /0x.*api.*key/i,
  // Google Gemini/Google AI patterns
  /gemini.*api.*key/i,
  /google.*ai.*key/i,
  /google.*gemini.*key/i,
  /gemini.*key/i,
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
      let matchedProvider: string | undefined;
      for (const pattern of API_PATTERNS) {
        const match = value.match(pattern.regex);
        if (match) {
          matchedProvider = pattern.name;
          detected.push({
            key: match[1] || match[0],
            source: 'form',
            fieldName,
            fieldType: input.type || 'text',
            domain,
            timestamp: Date.now(),
            provider: matchedProvider,
          });
          break;
        }
      }

      // Fallback: if no pattern matched but field name suggests API key
      if (!matchedProvider && isKeyField && value.length >= 16) {
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
      for (const pattern of API_PATTERNS) {
        const match = trimmed.match(pattern.regex);
        if (match) {
          return {
            key: match[1] || match[0],
            source: 'clipboard',
            domain: window.location.hostname,
            timestamp: Date.now(),
            provider: pattern.name,
          };
        }
      }

      // Check for keys in multi-line content (e.g., .env files)
      const lines = trimmed.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*[A-Z_]+[=:]\s*(.+)$/);
        if (match) {
          const value = match[1].trim().replace(/['"]/g, '');
          for (const pattern of API_PATTERNS) {
            const keyMatch = value.match(pattern.regex);
            if (keyMatch) {
              return {
                key: keyMatch[1] || keyMatch[0],
                source: 'clipboard',
                domain: window.location.hostname,
                timestamp: Date.now(),
                provider: pattern.name,
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
      for (const pattern of API_PATTERNS) {
        const match = trimmed.match(pattern.regex);
        if (match) {
          detected.push({
            key: match[1] || match[0],
            source: 'ocr',
            domain,
            timestamp: Date.now(),
            provider: pattern.name,
          });
          break;
        }
      }

      // Check for key=value patterns
      const keyValueMatch = trimmed.match(/^\s*[A-Z_]+[=:]\s*(.+)$/);
      if (keyValueMatch) {
        const value = keyValueMatch[1].trim().replace(/['"]/g, '');
        for (const pattern of API_PATTERNS) {
          const match = value.match(pattern.regex);
          if (match) {
            detected.push({
              key: match[1] || match[0],
              source: 'ocr',
              domain,
              timestamp: Date.now(),
              provider: pattern.name,
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
   * Detect keys from DOM content (innerHTML and innerText)
   * Scans page source for exposed API keys in code snippets
   */
  static detectFromDOMContent(): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const domain = window.location.hostname;
    const alerted = new Set<string>();

    try {
      // Scan visible text content
      const textContent = document.body.innerText || '';
      
      // Scan HTML source (catches code in <script> tags, attributes, etc.)
      const htmlContent = document.body.innerHTML || '';

      // Combine both for comprehensive scanning
      const combinedContent = textContent + '\n' + htmlContent;

      // Check each API pattern
      for (const pattern of API_PATTERNS) {
        const matches = [...combinedContent.matchAll(new RegExp(pattern.regex.source, 'gi'))];
        
        for (const match of matches) {
          const key = match[1] || match[0];
          if (!key || key.length < 16) continue;

          // Create unique ID to prevent duplicate alerts
          const keyId = `${pattern.name}:${key.slice(0, 12)}`;
          
          if (!alerted.has(keyId)) {
            alerted.add(keyId);
            
            detected.push({
              key: key.trim(),
              source: 'dom',
              domain,
              timestamp: Date.now(),
              provider: pattern.name,
            });
          }
        }
      }
    } catch (error) {
      console.warn('[KeyShield] Error scanning DOM content:', error);
    }

    return detected;
  }

  /**
   * Validate if a string is likely an API key
   */
  static isValidKey(key: string): boolean {
    if (!key || key.length < 16) return false;
    return API_PATTERNS.some((pattern) => pattern.regex.test(key.trim()));
  }
}
