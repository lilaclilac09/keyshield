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

export function isCursorFillHost(domain: string): boolean {
  const host = normalizeHostname(domain);
  return (
    host === 'cursor.com' || host.endsWith('.cursor.com')
    || host === 'cursor.sh' || host.endsWith('.cursor.sh')
    || host === 'cursor.demo.localhost'
  );
}

export function isCursorSettingsPath(pathname: string, title = ''): boolean {
  const path = String(pathname || '').toLowerCase();
  const head = String(title || '').toLowerCase();
  return /setting|account|dashboard|models|\/api|key|cursor-settings-fill-demo/.test(path)
    || /setting|api key|models/.test(head);
}

/** Which keys may be sent to the page. Do not unlock on a spoofed document.title. */
export function isCursorKeyFetchContext(opts?: { hostname?: string; pathname?: string }): boolean {
  if (isCursorFillHost(opts?.hostname || '')) return true;
  const host = normalizeHostname(opts?.hostname || '');
  const path = String(opts?.pathname || '').toLowerCase();
  const local = host === '127.0.0.1' || host === 'localhost';
  return local && path.includes('cursor-settings-fill-demo');
}

/** Which blanks on an already-authorized page should take a Cursor/model key. */
export function isCursorFillContext(opts?: { hostname?: string; pathname?: string; title?: string }): boolean {
  if (isCursorKeyFetchContext(opts)) return true;
  const path = String(opts?.pathname || '').toLowerCase();
  const title = String(opts?.title || '').toLowerCase();
  if (path.includes('cursor-settings-fill-demo')) return true;
  return title.includes('cursor') && isCursorSettingsPath(path, title);
}

const KEY_FIELD_RE = /\bkey\b|api[\s_-]?key|\bapi\b|\btoken\b|\bsecret\b|\bopenai\b|\banthropic\b|\bopenrouter\b|\bgroq\b|\bhelius\b|\bcursor\b|\bclaude\b/;

export function looksLikeKeyField(haystack: string): boolean {
  return KEY_FIELD_RE.test(String(haystack || '').toLowerCase());
}

export function looksLikeLoginPassword(haystack: string): boolean {
  const text = String(haystack || '').toLowerCase();
  if (/\b(sign[\s-]?in|log[\s-]?in|email|username|account password)\b/.test(text)) return true;
  return /\bpassword\b/.test(text) && !/\b(key|token|secret|api|openai|anthropic|cursor|claude|openrouter)\b/.test(text);
}

export function looksLikeCursorApiBlank(opts: {
  haystack?: string;
  hostname?: string;
  pathname?: string;
  title?: string;
  inputType?: string;
}): boolean {
  if (!isCursorFillContext(opts)) return false;
  const hay = String(opts.haystack || '');
  if (looksLikeLoginPassword(hay)) return false;
  if (looksLikeKeyField(hay)) return true;
  const type = String(opts.inputType || '').toLowerCase();
  const onSettings = isCursorSettingsPath(opts.pathname || '', opts.title || '')
    || isCursorFillHost(opts.hostname || '')
    || String(opts.pathname || '').toLowerCase().includes('cursor-settings-fill-demo');
  if (!onSettings) return false;
  return type === 'password' || !hay.trim();
}

export function preferredCursorFillKey(keys: FillKey[]): FillKey | null {
  const order = ['cursor', 'openai', 'openrouter', 'anthropic', 'groq'];
  for (const upstream of order) {
    const hit = keys.find((k) => k.upstream === upstream && k.value);
    if (hit) return hit;
  }
  return keys.find((k) => k.value) ?? null;
}

export type FillInputHint = { haystack: string; inputType?: string };

export function pickKeyForInput(
  haystack: string,
  keys: FillKey[],
  opts?: { hostname?: string; pathname?: string; title?: string; inputType?: string },
): FillKey | null {
  if (!keys.length) return null;
  const wanted = matchInputToUpstream(haystack);
  if (wanted) {
    const labeled = keys.find((k) => k.upstream === wanted);
    if (labeled) return labeled;
  }
  if (looksLikeLoginPassword(haystack)) return null;
  if (isCursorFillContext(opts) || looksLikeCursorApiBlank({ ...opts, haystack })) {
    return preferredCursorFillKey(keys);
  }
  if (keys.length === 1) return keys[0];
  return null;
}

/** One saved key per blank. Extra unlabeled Cursor boxes take the next leftover key. */
export function assignKeysToInputs(
  inputs: FillInputHint[],
  keys: FillKey[],
  opts?: { hostname?: string; pathname?: string; title?: string },
): Array<FillKey | null> {
  const remaining = keys.filter((k) => k.value);
  return inputs.map((input) => {
    const picked = pickKeyForInput(input.haystack, remaining, {
      hostname: opts?.hostname,
      pathname: opts?.pathname,
      title: opts?.title,
      inputType: input.inputType,
    });
    if (picked) {
      const idx = remaining.findIndex((k) => k.value === picked.value && k.upstream === picked.upstream);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    return picked;
  });
}

export function shouldAutoFillInput(currentValue: string): boolean {
  return String(currentValue || '').trim().length === 0;
}
