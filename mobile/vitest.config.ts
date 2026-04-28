import { defineConfig } from 'vitest/config';

// Plain Node — we test the storage adapter, the platform shims, and
// pure helpers extracted from the screens (vaultListHelpers,
// sessionFormat). The screen components themselves render RN
// primitives, which Metro renders on-device; UI rendering tests
// would need react-native-testing-library + a Jest preset and are
// out of scope for this workspace's vitest runner.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/lib/**/*.test.ts',
      'src/storage/**/*.test.ts',
      'src/screens/**/*.test.ts',
      'src/components/**/*.test.ts',
    ],
  },
});
