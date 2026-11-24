import { describe, expect, it } from 'vitest';
import { frameworkSnippets } from '../src/web/lib/keychain';
import { OPENROUTER_CHAT_PATH, openrouterChatBody, openrouterCurlSnippet, openrouterPythonSnippet } from '../src/web/lib/openrouter-interface';

const apiBase = 'http://127.0.0.1:8000';
const token = '<YOUR_AGENT_TOKEN>';

describe('proxy-only examples', () => {
  it.each(['openai', 'anthropic', 'groq', 'mistral', 'openrouter', 'helius', 'helius-rpc', ''])('keeps %s examples on vproxy without owner or provider credentials', upstream => {
    const snippets = frameworkSnippets(upstream, undefined, apiBase);
    for (const code of Object.values(snippets)) {
      expect(code).toContain(`${apiBase}/vproxy/${upstream || 'openrouter'}/`);
      expect(code).toContain(token);
      expect(code).not.toMatch(/\/manage\/|ks\.store\(|KS_VAULT_PASS|sk-proj-|sk-or-v1-/);
    }
    const up = upstream || 'openrouter';
    const isHelius = up === 'helius' || up === 'helius-rpc';
    const body = up === 'openrouter' ? JSON.stringify(openrouterChatBody())
      : isHelius ? '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}' : null;
    const path = up === 'openrouter' ? OPENROUTER_CHAT_PATH : isHelius ? '' : up === 'groq' ? 'openai/v1/models' : 'v1/models';
    for (const code of Object.values(snippets)) {
      expect(code).toContain(`${apiBase}/vproxy/${up}/${path}`);
    }
    expect(snippets.python).toContain(body ? 'requests.post(' : 'requests.get(');
    expect(snippets.js).toContain(`method: "${body ? 'POST' : 'GET'}"`);
    if (body) {
      expect(snippets.curl).toContain('-X POST');
      expect(snippets.curl).toContain('Content-Type: application/json');
      expect(snippets.curl).toContain(`-d '${body}'`);
      expect(snippets.python).toContain(`json=${body}`);
      expect(snippets.js).toContain('"Content-Type": "application/json"');
      expect(snippets.js).toContain(`body: JSON.stringify(${body})`);
    } else {
      expect(snippets.curl).not.toContain(' -X POST');
      expect(snippets.curl).not.toContain(' -d ');
      expect(snippets.python).not.toContain('json=');
      expect(snippets.js).not.toContain('body:');
    }
  });

  it('OpenRouter curl and Python use the same proxy route and do not store keys', () => {
    for (const code of [openrouterCurlSnippet(undefined, apiBase), openrouterPythonSnippet(undefined, apiBase)]) {
      expect(code).toContain(`${apiBase}/vproxy/openrouter/`);
      expect(code).toContain(token);
      expect(code).not.toMatch(/\/manage\/|ks\.store\(|sk-or-v1-/);
    }
  });
});
