/**
 * OpenRouter chat interface inserted into Activity / Developer / Docs / Meter.
 * Matches `src/backend/proxy/openrouter_interface.py`.
 *
 * Free Nemotron still needs YOUR OpenRouter key + a KeyShield session.
 * This is not a public unauthenticated proxy.
 */
import { API_BASE, apiFetch, getToken } from './auth';
import { saveKeyOnDevice } from './device-save';
import { getDecryptedKey } from './vault-session';

export const OPENROUTER_DEMO_UPSTREAM = 'openrouter';
export const OPENROUTER_DEMO_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
export const OPENROUTER_CHAT_PATH = 'api/v1/chat/completions';
export const OPENROUTER_MODEL_URL = `https://openrouter.ai/${OPENROUTER_DEMO_MODEL}`;

export interface OpenRouterStatus {
  upstream: string;
  model: string;
  chat_path: string;
  model_url: string;
  key_configured: boolean;
  key_source: string;
  key_prefix: string | null;
  public_unauthenticated_proxy: boolean;
  requires_session: boolean;
  requires_openrouter_key: boolean;
  anyone_can_call: boolean;
}

export function looksLikeOpenRouterKey(raw: string): boolean {
  const text = raw.trim();
  return text.startsWith('sk-or-') && text.length >= 16;
}

export function maskOpenRouterKey(raw: string): string {
  const text = raw.trim();
  if (text.length < 12) return 'sk-or-••••';
  return `${text.slice(0, 7)}…${text.slice(-4)}`;
}

export function extractOpenRouterKey(raw: string): string {
  const text = raw.trim();
  const urlMatch = text.match(/sk-or-[A-Za-z0-9_-]+/);
  if (urlMatch) return urlMatch[0];
  return text;
}

export function openrouterChatBody(
  prompt = 'KeyShield demo ping',
  model = OPENROUTER_DEMO_MODEL,
  maxTokens = 8,
): Record<string, unknown> {
  return {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
}

export function openrouterCurlSnippet(token = '<YOUR_AGENT_TOKEN>', apiBase = API_BASE): string {
  return `curl -sS ${apiBase}/vproxy/openrouter/${OPENROUTER_CHAT_PATH} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "X-Mpp-Stream-Id: <STREAM_ID>" \\
  -d '${JSON.stringify(openrouterChatBody())}'`;
}

export function openrouterPythonSnippet(token = '<YOUR_AGENT_TOKEN>', apiBase = API_BASE): string {
  return `import requests
r = requests.post(
    "${apiBase}/vproxy/openrouter/${OPENROUTER_CHAT_PATH}",
    headers={"Authorization": "Bearer ${token}"},
    json=${JSON.stringify(openrouterChatBody())},
)
print(r.json())`;
}

function deviceOpenRouterStatus(key: string): OpenRouterStatus {
  return {
    upstream: OPENROUTER_DEMO_UPSTREAM, model: OPENROUTER_DEMO_MODEL,
    chat_path: OPENROUTER_CHAT_PATH, model_url: OPENROUTER_MODEL_URL,
    key_configured: true, key_source: 'device-local', key_prefix: maskOpenRouterKey(key),
    public_unauthenticated_proxy: false, requires_session: true,
    requires_openrouter_key: true, anyone_can_call: false,
  };
}

export async function fetchOpenRouterStatus(): Promise<OpenRouterStatus> {
  const localKey = getDecryptedKey(OPENROUTER_DEMO_UPSTREAM);
  if (localKey) return deviceOpenRouterStatus(localKey);
  const r = await apiFetch('/demo/openrouter');
  const status: OpenRouterStatus = r.ok ? await r.json() : {
      upstream: OPENROUTER_DEMO_UPSTREAM,
      model: OPENROUTER_DEMO_MODEL,
      chat_path: OPENROUTER_CHAT_PATH,
      model_url: OPENROUTER_MODEL_URL,
      key_configured: false,
      key_source: 'none',
      key_prefix: null,
      public_unauthenticated_proxy: false,
      requires_session: true,
      requires_openrouter_key: true,
      anyone_can_call: false,
    };
  const savedKey = getDecryptedKey(OPENROUTER_DEMO_UPSTREAM);
  return savedKey ? deviceOpenRouterStatus(savedKey) : status;
}

export async function connectOpenRouter(apiKey?: string): Promise<OpenRouterStatus> {
  const key = extractOpenRouterKey(apiKey || '');
  if (key) {
    if (!looksLikeOpenRouterKey(key)) {
      throw new Error('Paste an OpenRouter key (sk-or-…) from https://openrouter.ai/keys');
    }
    await saveKeyOnDevice(OPENROUTER_DEMO_UPSTREAM, key, { name: 'OpenRouter', domain: 'openrouter.ai' });
    window.dispatchEvent(new CustomEvent('ks-openrouter-connected'));
    return deviceOpenRouterStatus(key);
  }
  return fetchOpenRouterStatus();
}

export async function readOpenRouterKeyFromClipboard(): Promise<string> {
  try {
    const clip = await navigator.clipboard.readText();
    const key = extractOpenRouterKey(clip);
    return looksLikeOpenRouterKey(key) ? key : '';
  } catch {
    return '';
  }
}

export async function vproxyChat(
  upstream: string,
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}/vproxy/${upstream}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
