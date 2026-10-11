/**
 * Domain → vault upstreams for extension auto-fill.
 * cursor.com Settings blanks take OpenAI / Anthropic / OpenRouter / Groq / Cursor.
 */

export const CURSOR_FILL_UPSTREAMS = [
  'cursor',
  'openai',
  'anthropic',
  'openrouter',
  'groq',
] as const;

const DOMAIN_TO_UPSTREAMS: Record<string, readonly string[]> = {
  'openrouter.ai': ['openrouter'],
  'scvd.store': ['openrouter'],
  'platform.openai.com': ['openai'],
  'openai.com': ['openai'],
  'console.anthropic.com': ['anthropic'],
  'anthropic.com': ['anthropic'],
  'console.groq.com': ['groq'],
  'groq.com': ['groq'],
  'console.mistral.ai': ['mistral'],
  'mistral.ai': ['mistral'],
  'dashboard.cohere.com': ['cohere'],
  'cohere.com': ['cohere'],
  'cohere.ai': ['cohere'],
  'dashboard.helius.dev': ['helius'],
  'helius.dev': ['helius'],
  'helius.xyz': ['helius'],
  'dashboard.0x.org': ['0x'],
  '0x.org': ['0x'],
  'dashboard.alchemy.com': ['alchemy'],
  'alchemy.com': ['alchemy'],
  'vercel.com': ['vercel'],
  'vercel.demo.localhost': ['vercel'],
  'github.com': ['github'],
  'github.demo.localhost': ['github'],
  'openrouter.demo.localhost': ['openrouter'],
  'cursor.com': CURSOR_FILL_UPSTREAMS,
  'www.cursor.com': CURSOR_FILL_UPSTREAMS,
  'cursor.sh': CURSOR_FILL_UPSTREAMS,
  'cursor.demo.localhost': CURSOR_FILL_UPSTREAMS,
  'devin.demo.localhost': ['openrouter'],
};

const INPUT_UPSTREAM_HINTS: Array<{ re: RegExp; upstream: string }> = [
  { re: /\bcursor\b|\bcrsr\b/, upstream: 'cursor' },
  { re: /\bopenrouter\b|\bsk-or\b/, upstream: 'openrouter' },
  { re: /\banthropic\b|\bclaude\b|\bsk-ant\b/, upstream: 'anthropic' },
  { re: /\bopenai\b|\bchatgpt\b|\bgpt\b|\bsk-proj\b/, upstream: 'openai' },
  { re: /\bgroq\b|\bgsk_/, upstream: 'groq' },
  { re: /\bhelius\b/, upstream: 'helius' },
  { re: /\bvercel\b/, upstream: 'vercel' },
  { re: /\bgithub\b|\bghp_|\bgithub_pat_/, upstream: 'github' },
];

export function normalizeHostname(input: string): string {
  return String(input || '').trim().toLowerCase().replace(/\.+$/, '');
}

export function upstreamsForHostname(domain: string): string[] {
  const normalized = normalizeHostname(domain);
  if (!normalized) return [];
  if (DOMAIN_TO_UPSTREAMS[normalized]) return [...DOMAIN_TO_UPSTREAMS[normalized]];
  for (const [host, ups] of Object.entries(DOMAIN_TO_UPSTREAMS)) {
    if (normalized === host || normalized.endsWith(`.${host}`)) return [...ups];
  }
  return [];
}

export function matchInputToUpstream(haystack: string): string | null {
  const text = String(haystack || '').toLowerCase();
  if (!text.trim()) return null;
  for (const row of INPUT_UPSTREAM_HINTS) {
    if (row.re.test(text)) return row.upstream;
  }
  return null;
}

export type FillKey = { id?: string; upstream: string; name?: string; value: string };

export function pickKeyForInput(haystack: string, keys: FillKey[]): FillKey | null {
  if (!keys.length) return null;
  const wanted = matchInputToUpstream(haystack);
  if (wanted) {
    return keys.find((k) => k.upstream === wanted) ?? null;
  }
  const text = String(haystack || '').toLowerCase();
  if (/\bpassword\b/.test(text) && !/\b(key|token|secret|api)\b/.test(text)) {
    return null;
  }
  if (keys.length === 1) return keys[0];
  return null;
}

export function shouldAutoFillInput(currentValue: string): boolean {
  return String(currentValue || '').trim().length === 0;
}
