import { defineConfig } from 'vitest/config';

// Plain Node — the storage adapter and platform shims we test here
// don't touch the React Native runtime. UI components live in
// src/screens/ and are rendered by Metro on a real device; their
// tests will need react-native-testing-library + a Jest jsdom-like
// preset, which is V1.2 work.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/lib/**/*.test.ts',
      'src/storage/**/*.test.ts',
    ],
  },
});
