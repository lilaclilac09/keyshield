import { describe, expect, it } from 'vitest';
import { frameworkSnippets } from '../src/web/lib/keychain';
import { openrouterCurlSnippet, openrouterPythonSnippet } from '../src/web/lib/openrouter-interface';

const apiBase = 'http://127.0.0.1:8000';
const token = '<YOUR_AGENT_TOKEN>';

describe('proxy-only examples', () => {
  it.each(['openai', 'openrouter', 'helius', ''])('keeps %s examples on vproxy without owner or provider credentials', upstream => {
    const snippets = frameworkSnippets(upstream, undefined, apiBase);
    for (const code of Object.values(snippets)) {
      expect(code).toContain(`${apiBase}/vproxy/${upstream || 'openrouter'}/`);
      expect(code).toContain(token);
      expect(code).not.toMatch(/\/manage\/|ks\.store\(|KS_VAULT_PASS|sk-proj-|sk-or-v1-/);
    }
    expect(snippets.python).toContain(upstream === 'helius' ? 'requests.post(' : 'requests.get(');
  });

  it('OpenRouter curl and Python use the same proxy route and do not store keys', () => {
    for (const code of [openrouterCurlSnippet(undefined, apiBase), openrouterPythonSnippet(undefined, apiBase)]) {
      expect(code).toContain(`${apiBase}/vproxy/openrouter/`);
      expect(code).toContain(token);
      expect(code).not.toMatch(/\/manage\/|ks\.store\(|sk-or-v1-/);
    }
  });
});
