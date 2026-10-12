/**
 * Provider labels for vault + Home stored APIs.
 * Detect pages already show a human name — store the same plus prefix,
 * host, product, and expiry so four Helius cards are not identical.
 */

export type ProviderFamily = 'AI' | 'RPC' | 'INFRA' | 'GIT' | 'DEX';

export type ProviderMeta = {
  id: string;
  name: string;
  family: ProviderFamily;
  product: string;
  domain: string;
  tags: string[];
};

export const PROVIDER_CATALOG: Record<string, ProviderMeta> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    family: 'AI',
    product: 'GPT',
    domain: 'platform.openai.com',
    tags: ['AI', 'GPT', 'OPENAI'],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    family: 'AI',
    product: 'Claude',
    domain: 'console.anthropic.com',
    tags: ['AI', 'CLAUDE', 'ANTHROPIC'],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    family: 'AI',
    product: 'Groq LPU',
    domain: 'console.groq.com',
    tags: ['AI', 'GROQ', 'FAST'],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    family: 'AI',
    product: 'NVIDIA Nemotron',
    domain: 'openrouter.ai',
    tags: ['AI', 'NEMOTRON', 'OPENROUTER'],
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    family: 'AI',
    product: 'Mistral',
    domain: 'console.mistral.ai',
    tags: ['AI', 'MISTRAL'],
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    family: 'AI',
    product: 'Command',
    domain: 'dashboard.cohere.com',
    tags: ['AI', 'COHERE'],
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    family: 'AI',
    product: 'Cursor',
    domain: 'cursor.com',
    tags: ['AI', 'CURSOR'],
  },
  helius: {
    id: 'helius',
    name: 'Helius RPC',
    family: 'RPC',
    product: 'Solana RPC',
    domain: 'dashboard.helius.dev',
    tags: ['RPC', 'SOLANA', 'HELIUS'],
  },
  '0x': {
    id: '0x',
    name: '0x Protocol',
    family: 'DEX',
    product: '0x Swap',
    domain: 'dashboard.0x.org',
    tags: ['DEX', '0X'],
  },
  alchemy: {
    id: 'alchemy',
    name: 'Alchemy',
    family: 'RPC',
    product: 'EVM RPC',
    domain: 'dashboard.alchemy.com',
    tags: ['RPC', 'ALCHEMY'],
  },
  vercel: {
    id: 'vercel',
    name: 'Vercel',
    family: 'INFRA',
    product: 'Vercel',
    domain: 'vercel.com',
    tags: ['INFRA', 'VERCEL'],
  },
  github: {
    id: 'github',
    name: 'GitHub',
    family: 'GIT',
    product: 'GitHub PAT',
    domain: 'github.com',
    tags: ['GIT', 'GITHUB'],
  },
};

export function providerMeta(upstream: string): ProviderMeta {
  const id = String(upstream || '').toLowerCase().trim();
  return (
    PROVIDER_CATALOG[id] || {
      id: id || 'custom',
      name: id || 'API',
      family: 'INFRA',
      product: 'API key',
      domain: '',
      tags: ['KEY'],
    }
  );
}

export function maskPrefix(raw: string): string {
  const text = String(raw || '').trim();
  if (text.length < 10) return '••••';
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

export function inferProduct(upstream: string, raw = ''): string {
  const text = String(raw || '').trim();
  if (text.startsWith('sk-or-')) return 'NVIDIA Nemotron';
  if (text.startsWith('sk-ant-')) return 'Claude';
  if (text.startsWith('sk-proj-')) return 'GPT project';
  if (text.startsWith('sk-svcacct-')) return 'OpenAI service account';
  if (text.startsWith('sk-admin-')) return 'OpenAI admin';
  if (text.startsWith('gsk_')) return 'Groq LPU';
  if (text.startsWith('key_') || /^crsr[_-]/i.test(text)) return 'Cursor';
  if (text.startsWith('github_pat_') || text.startsWith('ghp_')) return 'GitHub PAT';
  if (text.startsWith('vercel_') || text.startsWith('vcp_')) return 'Vercel';
  if (text.startsWith('helius_auth_') || /^[0-9a-f-]{36}$/i.test(text)) return 'Solana RPC';
  return providerMeta(upstream).product;
}

export function isGenericVaultName(name: string, upstream: string): boolean {
  const n = String(name || '').trim().toLowerCase();
  const up = String(upstream || '').trim().toLowerCase();
  if (!n || n === 'unnamed' || n === 'untitled' || n === 'key') return true;
  if (n === up || n === `${up} key` || n === `${up}key`) return true;
  return n.endsWith(' key') && n.startsWith(up);
}

export function vaultStoreName(opts: {
  upstream: string;
  value: string;
  host?: string;
  pageTitle?: string;
  name?: string;
}): string {
  const prefix = maskPrefix(opts.value);
  const meta = providerMeta(opts.upstream);
  const given = String(opts.name || '').trim();
  if (given && !isGenericVaultName(given, opts.upstream)) {
    return given.includes(prefix) ? given : `${given} · ${prefix}`;
  }
  const parts = [meta.name];
  const product = inferProduct(opts.upstream, opts.value);
  if (product && !meta.name.toLowerCase().includes(product.toLowerCase())) {
    parts.push(product);
  }
  parts.push(prefix);
  const host = String(opts.host || '').trim();
  if (host) parts.push(host);
  const title = String(opts.pageTitle || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  if (title && !parts.some((p) => title.toLowerCase().includes(p.toLowerCase()))) {
    parts.push(title);
  }
  return parts.filter(Boolean).join(' · ');
}

export function formatExpiry(iso?: string | null): string {
  if (!iso) return 'no expiry';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'no expiry';
  const days = (ms - Date.now()) / 86_400_000;
  const date = new Date(ms).toISOString().slice(0, 10);
  if (days < 0) return `expired ${date}`;
  if (days <= 14) return `expires ${date} · soon`;
  return `expires ${date}`;
}

export function formatCreated(iso?: string | null, epochMs?: number): string {
  const ms = iso ? Date.parse(iso) : epochMs;
  if (!ms || !Number.isFinite(ms)) return '';
  return `saved ${new Date(ms).toISOString().slice(0, 10)}`;
}

export function catalogTags(upstream: string, extra: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of [...providerMeta(upstream).tags, ...extra]) {
    const t = String(tag || '').trim();
    if (!t) continue;
    const key = t.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
