import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
        manifest: {
          name: 'KeyShield — Zero-Trust API Key Vault',
          short_name: 'KeyShield',
          description: 'Encrypted secrets, injected per-request. Zero-trust API key management.',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    define: {
      'process.env.KEYSHIELD_API_URL': JSON.stringify(env.KEYSHIELD_API_URL ?? 'http://localhost:8000'),
      'process.env.KEYSHIELD_PROGRAM_ID': JSON.stringify(env.KEYSHIELD_PROGRAM_ID ?? ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // 强制重定向缺失的子路径到实际存在的文件（@noble/hashes v1.8.0）
        '@noble/hashes/sha256': '@noble/hashes/lib/esm/sha256.js',
        '@noble/hashes/sha3': '@noble/hashes/lib/esm/sha3.js',
        '@noble/hashes/utils': '@noble/hashes/lib/esm/utils.js',
        '@noble/hashes/hmac': '@noble/hashes/lib/esm/hmac.js',
      },
      dedupe: ['@solana/web3.js'],
    },
    optimizeDeps: {
      include: ['@solana/web3.js', '@solana/wallet-adapter-react', '@solana/wallet-adapter-react-ui', 'buffer'],
      exclude: ['@noble/hashes', '@noble/curves'],
    },
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@solana/') || id.includes('buffer') || id.includes('borsh')) return 'solana';
              if (id.includes('react') || id.includes('scheduler')) return 'vendor';
              if (id.includes('lucide')) return 'icons';
              return 'vendor-deps';
            }
          },
        },
      },
    },
  };
});