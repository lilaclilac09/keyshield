/**
 * Domain → vault upstreams for extension auto-fill.
 * cursor.com Settings blanks take OpenAI / Anthropic / OpenRouter / Groq / Cursor.
 * app.kilo.ai/byok pastes a saved OpenRouter / NVIDIA / OpenAI / Anthropic / Groq key.
 */

export const CURSOR_FILL_UPSTREAMS = [
  'cursor',
  'openai',
  'anthropic',
  'openrouter',
  'nvidia',
  'groq',
] as const;

export const KILO_FILL_UPSTREAMS = [
  'openrouter',
  'nvidia',
  'openai',
  'anthropic',
  'groq',
] as const;

export const NVIDIA_FILL_UPSTREAMS = ['nvidia', 'openrouter'] as const;

export const AI_FILL_UPSTREAMS = [
  'nvidia',
  'openrouter',
  'openai',
  'anthropic',
  'groq',
  'cursor',
] as const;

const DOMAIN_TO_UPSTREAMS: Record<string, readonly string[]> = {
  'openrouter.ai': ['openrouter'],
  'build.nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'integrate.api.nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'api.nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'nim.nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'catalog.ngc.nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'ngc.nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'nvidia.com': NVIDIA_FILL_UPSTREAMS,
  'nvidia.demo.localhost': NVIDIA_FILL_UPSTREAMS,
  'scvd.store': ['openrouter'],
  'kilo.ai': KILO_FILL_UPSTREAMS,
  'app.kilo.ai': KILO_FILL_UPSTREAMS,
  'www.kilo.ai': KILO_FILL_UPSTREAMS,
  'kilo.demo.localhost': KILO_FILL_UPSTREAMS,
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
  { re: /\bnvidia\b|\bnim\b|\bnvapi\b/, upstream: 'nvidia' },
  { re: /\bopenrouter\b|\bsk-or\b/, upstream: 'openrouter' },
  { re: /\banthropic\b|\bclaude\b|\bsk-ant\b/, upstream: 'anthropic' },
  { re: /\bopenai\b|\bchatgpt\b|\bgpt\b|\bsk-proj\b/, upstream: 'openai' },
  { re: /\bgroq\b|\bgsk_/, upstream: 'groq' },
  { re: /\bhelius\b/, upstream: 'helius' },
  { re: /\bvercel\b/, upstream: 'vercel' },
  { re: /\bgithub\b|\bghp_|\bgithub_pat_/, upstream: 'github' },
  { re: /\bkilo\b|\bbyok\b/, upstream: 'openrouter' },
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

/** Local Vite / extension fixtures that stand in for Cursor Settings blanks. */
export function isLocalFillDemoPath(pathname: string): boolean {
  const path = String(pathname || '').toLowerCase();
  return (
    path.includes('cursor-settings-fill-demo')
    || path.includes('nvidia-fill-demo')
    || path.includes('/journey/cursor')
    || /(?:^|\/)cursor\.html$/.test(path)
    || path === '/story'
    || path.startsWith('/story/')
  );
}

export function isKiloFillHost(domain: string): boolean {
  const host = normalizeHostname(domain);
  return host === 'kilo.ai' || host.endsWith('.kilo.ai') || host === 'kilo.demo.localhost';
}

/** Path, hash, or query that means Kilo Bring-Your-Own-Key — not a spoofed title. */
export function isKiloByokPath(pathname: string, href = ''): boolean {
  const blob = `${pathname || ''} ${href || ''}`.toLowerCase();
  return (
    blob.includes('/byok')
    || blob.includes('kilo-byok-fill-demo')
    || blob.includes('bring-your-own-key')
    || blob.includes('bring_your_own_key')
    || /[#?&=/]byok\b/.test(blob)
  );
}

export function isNvidiaFillHost(domain: string): boolean {
  const host = normalizeHostname(domain);
  return host === 'nvidia.com' || host.endsWith('.nvidia.com')
    || host === 'nvidia.demo.localhost';
}

export function isNvidiaDemoPath(pathname: string): boolean {
  return String(pathname || '').toLowerCase().includes('nvidia-fill-demo');
}

export function isNvidiaKeyFetchContext(opts?: { hostname?: string; pathname?: string; url?: string }): boolean {
  if (isNvidiaFillHost(opts?.hostname || '')) return true;
  if (isNvidiaDemoPath(opts?.pathname || '')) return true;
  try {
    if (opts?.url && new URL(opts.url).pathname.toLowerCase().includes('nvidia-fill-demo')) return true;
  } catch { /* noop */ }
  return false;
}

function hintsText(hints?: string[] | string): string {
  return (Array.isArray(hints) ? hints.join(' ') : String(hints || '')).toLowerCase();
}

export function hintsWantNvidia(hints?: string[] | string): boolean {
  return /\bnvidia\b|\bnim\b|\bnvapi\b/.test(hintsText(hints));
}

export function hintsWantAi(hints?: string[] | string): boolean {
  return /\bapi[\s_-]?key\b|\btoken\b|\bsecret\b|\bnvidia\b|\bnim\b|\bnvapi\b|\bopenai\b|\banthropic\b|\bopenrouter\b|\bgroq\b|\bcursor\b/.test(hintsText(hints));
}

export function vaultItemMatchesWanted(
  item: { upstream?: string; name?: string; product?: string; family?: string; value?: string },
  wanted: Iterable<string>,
): boolean {
  const set = new Set([...wanted].map((u) => String(u || '').toLowerCase()));
  const up = String(item.upstream || '').toLowerCase();
  if (set.has(up)) return true;
  const blob = `${item.name || ''} ${item.product || ''} ${item.family || ''} ${item.value || ''}`.toLowerCase();
  if (set.has('nvidia') && (/\bnvidia\b|\bnim\b|\bnvapi\b/.test(blob) || /^nvapi-/.test(String(item.value || '')))) {
    return true;
  }
  return false;
}

/** Which vault upstreams the page may receive. Never unlock on a spoofed title alone. */
export function unlockUpstreamsForFill(opts?: {
  hostname?: string;
  pathname?: string;
  url?: string;
  hints?: string[] | string;
  hasKeyBlanks?: boolean;
}): string[] {
  const mapped = upstreamsForHostname(opts?.hostname || '');
  if (mapped.length) return mapped;
  if (isKiloKeyFetchContext(opts)) return [...KILO_FILL_UPSTREAMS];
  if (isNvidiaKeyFetchContext(opts) || hintsWantNvidia(opts?.hints)) return [...NVIDIA_FILL_UPSTREAMS];
  if (isCursorKeyFetchContext(opts)) return [...CURSOR_FILL_UPSTREAMS];
  if (opts?.hasKeyBlanks && hintsWantAi(opts.hints)) return [...AI_FILL_UPSTREAMS];
  return [];
}

/** Unlock AI vault keys for Kilo BYOK hosts or the local BYOK fixture — never a spoofed title. */
export function isKiloKeyFetchContext(opts?: { hostname?: string; pathname?: string; url?: string }): boolean {
  if (isKiloFillHost(opts?.hostname || '')) return true;
  try {
    if (opts?.url) {
      const parsed = new URL(opts.url);
      if (parsed.protocol === 'chrome-extension:' && isKiloByokPath(parsed.pathname, opts.url)) return true;
    }
  } catch { /* noop */ }
  const host = normalizeHostname(opts?.hostname || '');
  const local = host === '127.0.0.1' || host === 'localhost';
  return local && isKiloByokPath(opts?.pathname || '', opts?.url || '');
}

export function isKiloFillContext(opts?: { hostname?: string; pathname?: string; title?: string; url?: string }): boolean {
  const path = opts?.pathname || '';
  const href = opts?.url || '';
  if (isKiloFillHost(opts?.hostname || '') && isKiloByokPath(path, href)) return true;
  const host = normalizeHostname(opts?.hostname || '');
  if (host && !isKiloFillHost(host) && host !== '127.0.0.1' && host !== 'localhost') return false;
  return isKiloByokPath(path, href);
}

/** http(s) pages plus our own chrome-extension fill demo. */
export function isFillablePageUrl(url: string): boolean {
  const raw = String(url || '');
  if (/^https?:/i.test(raw)) return true;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'chrome-extension:'
      && (isLocalFillDemoPath(parsed.pathname) || isKiloByokPath(parsed.pathname));
  } catch {
    return false;
  }
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
  const local = host === '127.0.0.1' || host === 'localhost';
  return local && isLocalFillDemoPath(opts?.pathname || '');
}

/** Which blanks on an already-authorized page should take a Cursor/model key. */
export function isCursorFillContext(opts?: { hostname?: string; pathname?: string; title?: string }): boolean {
  if (isCursorKeyFetchContext(opts)) return true;
  const path = String(opts?.pathname || '').toLowerCase();
  const title = String(opts?.title || '').toLowerCase();
  if (isLocalFillDemoPath(path)) return true;
  return title.includes('cursor') && isCursorSettingsPath(path, title);
}

const KEY_FIELD_RE = /\bkey\b|api[\s_-]?key|\bapi\b|\btoken\b|\bsecret\b|\bopenai\b|\banthropic\b|\bopenrouter\b|\bnvidia\b|\bnim\b|\bnvapi\b|\bgroq\b|\bhelius\b|\bcursor\b|\bclaude\b|\bkilo\b|\bbyok\b/;

export function looksLikeKeyField(haystack: string): boolean {
  return KEY_FIELD_RE.test(String(haystack || '').toLowerCase());
}

export function looksLikeLoginPassword(haystack: string): boolean {
  const text = String(haystack || '').toLowerCase();
  if (/\b(sign[\s-]?in|log[\s-]?in|email|username|account password)\b/.test(text)) return true;
  return /\bpassword\b/.test(text) && !/\b(key|token|secret|api|openai|anthropic|cursor|claude|openrouter)\b/.test(text);
}

/** Cursor dashboard "Enter User API Key Name" is a label, not a secret box. */
export function looksLikeKeyNameField(haystack: string): boolean {
  const text = String(haystack || '').toLowerCase();
  return /api[\s_-]?key[\s_-]?name|key[\s_-]?name|name[\s_-]?your[\s_-]?key|display[\s_-]?name/.test(text);
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
  if (looksLikeKeyNameField(hay)) return false;
  if (looksLikeKeyField(hay)) return true;
  const type = String(opts.inputType || '').toLowerCase();
  const onSettings = isCursorSettingsPath(opts.pathname || '', opts.title || '')
    || isCursorFillHost(opts.hostname || '')
    || isLocalFillDemoPath(opts.pathname || '');
  if (!onSettings) return false;
  return type === 'password' || !hay.trim();
}

export function preferredCursorFillKey(keys: FillKey[]): FillKey | null {
  const order = ['cursor', 'openai', 'nvidia', 'openrouter', 'anthropic', 'groq'];
  for (const upstream of order) {
    const hit = keys.find((k) => k.upstream === upstream && k.value);
    if (hit) return hit;
  }
  return keys.find((k) => k.value) ?? null;
}

export function preferredKiloFillKey(keys: FillKey[]): FillKey | null {
  const order = ['openrouter', 'nvidia', 'openai', 'anthropic', 'groq', 'cursor'];
  for (const upstream of order) {
    const hit = keys.find((k) => k.upstream === upstream && k.value);
    if (hit) return hit;
  }
  return keys.find((k) => k.value) ?? null;
}

export function looksLikeKiloApiBlank(opts: {
  haystack?: string;
  hostname?: string;
  pathname?: string;
  title?: string;
  inputType?: string;
  url?: string;
}): boolean {
  if (!isKiloFillContext(opts)) return false;
  const hay = String(opts.haystack || '');
  if (looksLikeLoginPassword(hay)) return false;
  if (looksLikeKeyNameField(hay)) return false;
  if (looksLikeKeyField(hay)) return true;
  const type = String(opts.inputType || '').toLowerCase();
  const onByok = isKiloByokPath(opts.pathname || '', opts.url || '');
  if (!onByok) return false;
  return type === 'password' || !hay.trim();
}

export type FillInputHint = { haystack: string; inputType?: string };

export function pickKeyForInput(
  haystack: string,
  keys: FillKey[],
  opts?: { hostname?: string; pathname?: string; title?: string; inputType?: string },
): FillKey | null {
  if (!keys.length) return null;
  const wanted = matchInputToUpstream(haystack);
  if (looksLikeKeyNameField(haystack)) return null;
  if (wanted) {
    const labeled = keys.find((k) => k.upstream === wanted);
    if (labeled) return labeled;
  }
  if (looksLikeLoginPassword(haystack)) return null;
  if (isNvidiaFillHost(opts?.hostname || '') || String(opts?.pathname || '').includes('nvidia-fill-demo')) {
    return keys.find((k) => k.upstream === 'nvidia' && k.value)
      || keys.find((k) => k.upstream === 'openrouter' && k.value)
      || keys.find((k) => k.value)
      || null;
  }
  if (isKiloFillContext(opts) || looksLikeKiloApiBlank({ ...opts, haystack })) {
    return preferredKiloFillKey(keys);
  }
  if (isCursorFillContext(opts) || looksLikeCursorApiBlank({ ...opts, haystack })) {
    return preferredCursorFillKey(keys);
  }
  if (looksLikeKeyField(haystack)) return keys.find((k) => k.value) ?? null;
  const unique = new Set(keys.map((k) => k.upstream));
  if (unique.size === 1 || keys.length === 1) return keys.find((k) => k.value) ?? null;
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
