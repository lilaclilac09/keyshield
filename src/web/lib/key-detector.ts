export interface DetectedKey {
  key: string; source: 'form' | 'clipboard' | 'ocr' | 'dom';
  fieldName?: string; fieldType?: string; domain: string; timestamp: number; provider?: string;
}

interface API_PATTERN { name: string; regex: RegExp; priority?: number; }

const API_PATTERNS: API_PATTERN[] = [
  { name: 'Helius', regex: /(?:api-key=|X-API-Key:\\s*)([a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})/i, priority: 10 },
  { name: 'OpenAI/Anthropic/Groq', regex: /sk-(?:live|test|proj|ant)_[A-Za-z0-9]{48}/i, priority: 4 },
  { name: 'GitHub PAT', regex: /gh[pousr]_[A-Za-z0-9]{36,}/i, priority: 4 },
  { name: 'Stripe', regex: /[rs]k_(?:live|test)_[A-Za-z0-9]{24,}/i, priority: 3 },
  { name: 'AWS', regex: /AKIA[0-9A-Z]{16}/i, priority: 3 },
];

const KEY_FIELD_PATTERNS = [/api[_-]?key/i, /apikey/i, /api[_-]?token/i, /secret[_-]?key/i];

export class KeyDetector {
  static detectFormFields(): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const domain = window.location.hostname;
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="password"], input:not([type]), textarea');
    inputs.forEach((input) => {
      const value = input.value.trim();
      if (!value) return;
      const fieldName = input.name || input.id || input.className;
      const isKeyField = KEY_FIELD_PATTERNS.some((p) => p.test(fieldName));
      for (const pattern of API_PATTERNS) {
        const match = value.match(pattern.regex);
        if (match) { detected.push({ key: match[1] || match[0], source: 'form', fieldName, fieldType: input.type || 'text', domain, timestamp: Date.now(), provider: pattern.name }); break; }
      }
      if (!detected.length && isKeyField && value.length >= 16) { detected.push({ key: value, source: 'form', fieldName, fieldType: input.type || 'text', domain, timestamp: Date.now() }); }
    });
    return detected;
  }

  static async detectClipboard(): Promise<DetectedKey | null> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.length < 16) return null;
      for (const pattern of API_PATTERNS) {
        const match = text.trim().match(pattern.regex);
        if (match) return { key: match[1] || match[0], source: 'clipboard', domain: window.location.hostname, timestamp: Date.now(), provider: pattern.name };
      }
    } catch { /* denied */ }
    return null;
  }

  static detectFromText(text: string, domain: string): DetectedKey[] {
    const detected: DetectedKey[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 16) continue;
      for (const pattern of API_PATTERNS) {
        const match = trimmed.match(pattern.regex);
        if (match) { detected.push({ key: match[1] || match[0], source: 'ocr', domain, timestamp: Date.now(), provider: pattern.name }); break; }
      }
    }
    return detected;
  }
}
