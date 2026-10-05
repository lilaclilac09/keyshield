/**
 * OpenRouter chat interface inserted into Activity / Developer / Meter.
 * Matches `src/backend/proxy/openrouter_interface.py`.
 */
import { API_BASE, getToken } from './auth';

export const OPENROUTER_DEMO_UPSTREAM = 'openrouter';
export const OPENROUTER_DEMO_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
export const OPENROUTER_CHAT_PATH = 'api/v1/chat/completions';

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

export function openrouterCurlSnippet(token = '<TOKEN_HERE>', apiBase = API_BASE): string {
  return `curl -sS ${apiBase}/vproxy/openrouter/${OPENROUTER_CHAT_PATH} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "X-Mpp-Stream-Id: <STREAM_ID>" \\
  -d '${JSON.stringify(openrouterChatBody())}'`;
}

export function openrouterPythonSnippet(token = '<TOKEN_HERE>'): string {
  return `from keyshield_sdk import KeyShield
ks = KeyShield(token="${token}")
ks.store("openrouter", "sk-or-v1-paste-here")
r = ks.proxy("openrouter", "${OPENROUTER_CHAT_PATH}", json=${JSON.stringify(openrouterChatBody())})
print(r.json())`;
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
