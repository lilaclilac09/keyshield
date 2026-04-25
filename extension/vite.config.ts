import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vite config for the KeyShield browser-extension popup.
//
// We don't ship a manifest.json + service-worker bundle yet — that's a
// follow-up once we pick a final extension framework. This config builds
// the popup as a stand-alone SPA you can `npm run dev` against, which is
// enough to develop the UI end-to-end.
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/popup'),
  // Resolve `chrome.*` namespace to a no-op shim during dev — see
  // src/popup/chrome-shim.ts. The shim only kicks in when there is no
  // real chrome.storage available (i.e. running outside the extension).
  resolve: {
    alias: {
      '@keyshield/extension/chrome-shim': resolve(
        __dirname,
        'src/popup/chrome-shim.ts',
      ),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/popup'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/popup/index.html'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
