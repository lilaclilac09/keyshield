import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vite config for the KeyShield popup SPA. The wider extension build
// (manifest.json, service worker, content script, icons) is wrapped in
// scripts/build-extension.mjs which calls `vite build` first and then
// bundles the rest with esbuild. `npm run dev` still serves the popup
// alone for fast UI iteration.
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/popup'),
  // Relative asset paths so the popup loads correctly when served from
  // chrome-extension://<id>/popup.html — absolute "/assets/..." would
  // be resolved against the extension root, which is fragile if we
  // ever move popup.html into a subdir.
  base: './',
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
