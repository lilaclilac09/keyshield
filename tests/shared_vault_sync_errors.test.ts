import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('does not swallow shared delete conflicts or update-required errors after refreshing the list', () => {
  const source = readFileSync(new URL('../packages/shared/src/hooks/use-vaults.ts', import.meta.url), 'utf8');
  expect(source).toMatch(/await removeEntry\(id\);\s*} catch \(error\) {\s*refresh\(\);\s*throw error;/);
});
