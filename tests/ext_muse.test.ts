import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('browser API shim', () => {
  it('aliases Chrome and browser namespaces', () => {
    const source = readFileSync('src/extension/browser-api.js', 'utf8');
    for (const namespace of ['chrome', 'browser']) {
      const root = { [namespace]: { runtime: { id: 'local' } } };
      new Function('globalThis', source)(root);
      expect(root.chrome).toBe(root.browser);
    }
  });
});
