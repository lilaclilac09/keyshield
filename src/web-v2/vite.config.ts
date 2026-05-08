import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.KEYSHIELD_API_URL': JSON.stringify(env.KEYSHIELD_API_URL ?? 'http://localhost:8000'),
      'process.env.KEYSHIELD_PROGRAM_ID': JSON.stringify(env.KEYSHIELD_PROGRAM_ID ?? ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['@solana/web3.js'],
    },
    optimizeDeps: {
      include: ['@solana/web3.js', '@solana/wallet-adapter-react', '@solana/wallet-adapter-react-ui', 'buffer'],
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
