export const PATTERNS = Object.freeze([
  { provider: 'openai', source: 'sk-(?:proj-|svcacct-)[A-Za-z0-9_-]{20,}' },
  { provider: 'anthropic', source: 'sk-ant-api03-[A-Za-z0-9_-]{20,}' },
  { provider: 'stripe', source: 'sk_(?:test|live)_[A-Za-z0-9]{24,}' },
  { provider: 'github', source: '(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})' },
  { provider: 'aws_access', source: '(?:AKIA|ASIA)[A-Z0-9]{16}' },
  { provider: 'aws_secret', source: '(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\\s*[=:]\\s*["\']?([A-Za-z0-9/+=]{40})["\']?', group: 1 },
]);

export function recognizeValue(input, patterns = PATTERNS) {
  if (typeof input !== 'string' || input.length > 8192) return null;
  const text = input.trim();
  if (!text || /[•●*…]/.test(text) || /YOUR[_ -]|PLACEHOLDER|EXAMPLE_KEY/i.test(text)) return null;
  for (const pattern of patterns) {
    const match = new RegExp(`^(?:${pattern.source})$`).exec(text);
    if (match && match[0].length === text.length) {
      const value = match[pattern.group || 0];
      return { provider: pattern.provider, preview: `••••${value.slice(-4)}`, value };
    }
  }
  return null;
}
