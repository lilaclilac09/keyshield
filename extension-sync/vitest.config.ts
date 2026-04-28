import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two test universes:
//   - src/lib/**/*.test.ts        runs in plain Node (no DOM)
//   - src/popup/**/*.test.tsx     runs in jsdom for React components
//
// We unify them under one config by:
//   - including both globs
//   - defaulting to jsdom (cheap when not used)
//   - the lib tests don't touch document/window so they don't care
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/lib/**/*.test.ts', 'src/popup/**/*.test.tsx'],
  },
});
