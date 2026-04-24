import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Plain Node — our lib code takes crypto / storage / WebAuthn as
    // injectable dependencies so we don't need jsdom.
    environment: 'node',
    include: ['src/lib/**/*.test.ts'],
  },
});
