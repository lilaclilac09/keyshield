import { defineConfig, mergeConfig } from 'vite';
import dashboard from '../../src/web/vite.config';

// Local-server boundary only: proxy to real processes, never synthesize responses.
export default defineConfig(env => mergeConfig(dashboard(env), {
  // The dashboard checks typeof process before reading Vite's literal defines.
  // Keep those configured local URLs reachable instead of its :8001 fallback.
  plugins: [{
    name: 'tutorial-process-env',
    transformIndexHtml: () => [{
      tag: 'script', injectTo: 'head-prepend',
      children: `globalThis.process = ${JSON.stringify({ env: {
        KEYSHIELD_API_URL: process.env.KEYSHIELD_API_URL,
        KEYSHIELD_SYNC_URL: process.env.KEYSHIELD_SYNC_URL,
        KEYSHIELD_PUBLIC_API_BASE: process.env.KEYSHIELD_PUBLIC_API_BASE,
        KEYSHIELD_PUBLIC_SYNC_URL: process.env.KEYSHIELD_PUBLIC_SYNC_URL,
      } })};`,
    }],
  }],
  server: {
    proxy: {
      '/__sync': { target: 'http://127.0.0.1:8788', rewrite: (path: string) => path.replace(/^\/__sync/, '') },
    },
  },
}));
