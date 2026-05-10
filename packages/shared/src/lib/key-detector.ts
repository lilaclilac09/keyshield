
// API key detector: regex patterns for 15+ providers

export interface KeyMatch {
  provider: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  offset?: number;
}

const PATTERNS: Array<{ provider: string; regex: RegExp; confidence: KeyMatch['confidence'] }> = [
  { provider: 'OpenAI', regex: /sk-[a-zA-Z0-9]{20,}/g, confidence: 'high' },
  { provider: 'Anthropic', regex: /sk-ant-[a-zA-Z0-9-_]{20,}/g, confidence: 'high' },
  { provider: 'Google AI', regex: /AIza[a-zA-Z0-9_-]{35,}/g, confidence: 'high' },
  { provider: 'Groq', regex: /gsk_[a-zA-Z0-9]{20,}/g, confidence: 'high' },
  { provider: 'Cohere', regex: /[a-zA-Z0-9]{40}/g, confidence: 'medium' },
  { provider: 'Mistral', regex: /[a-zA-Z0-9]{32}/g, confidence: 'medium' },
  { provider: 'Together AI', regex: /[a-zA-Z0-9]{40,}/g, confidence: 'low' },
  { provider: 'DeepSeek', regex: /sk-[a-zA-Z0-9]{32,}/g, confidence: 'medium' },
  { provider: 'Perplexity', regex: /pplx-[a-zA-Z0-9]{20,}/g, confidence: 'high' },
  { provider: 'Fireworks', regex: /fw_[a-zA-Z0-9]{20,}/g, confidence: 'high' },
  { provider: 'AWS Key', regex: /AKIA[0-9A-Z]{16}/g, confidence: 'high' },
  { provider: 'AWS Secret', regex: /[a-zA-Z0-9/+=]{40}/g, confidence: 'low' },
  { provider: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/g, confidence: 'high' },
  { provider: 'Stripe Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g, confidence: 'high' },
  { provider: 'HuggingFace', regex: /hf_[a-zA-Z0-9]{34}/g, confidence: 'high' },
  { provider: 'Replicate', regex: /r8_[a-zA-Z0-9]{20,}/g, confidence: 'high' },
  { provider: 'Databricks', regex: /dapi[a-zA-Z0-9]{32,}/g, confidence: 'high' },
  { provider: 'Azure OpenAI', regex: /[a-f0-9]{32}/g, confidence: 'low' },
];

export function detectKeys(text: string): KeyMatch[] {
  const results: KeyMatch[] = [];
  const seen = new Set<string>();

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      if (seen.has(value)) continue;
      // Filter very short matches from low-confidence patterns
      if (pattern.confidence === 'low' && value.length < 24) continue;
      seen.add(value);
      results.push({ provider: pattern.provider, value, confidence: pattern.confidence, offset: match.index });
    }
  }

  return results.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });
}

export function scanDomForKeys(root: Document | Element = document): KeyMatch[] {
  const texts: string[] = [];

  // Scan input values
  const inputs = root.querySelectorAll('input, textarea');
  inputs.forEach((el) => {
    const val = (el as HTMLInputElement).value;
    if (val && val.length > 16) texts.push(val);
  });

  // Scan code blocks and pre elements
  const codeEls = root.querySelectorAll('code, pre, [data-code]');
  codeEls.forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 16) texts.push(text);
  });

  // Scan all text nodes in the body
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    const text = node.textContent?.trim();
    if (text && text.length > 16 && text.length < 2000) {
      texts.push(text);
    }
  }

  const results: KeyMatch[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const match of detectKeys(text)) {
      if (!seen.has(match.value)) {
        seen.add(match.value);
        results.push(match);
      }
    }
  }

  return results;
}
