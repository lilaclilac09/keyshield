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
      'process.env.KEYSHIELD_API_URL': JSON.stringify(env.KEYSHIELD_API_URL ?? 'http://127.0.0.1:8001'),
      'process.env.KEYSHIELD_SYNC_URL': JSON.stringify(env.KEYSHIELD_SYNC_URL ?? 'http://localhost:8787'),
      'process.env.KEYSHIELD_PUBLIC_API_BASE': JSON.stringify(
        env.KEYSHIELD_PUBLIC_API_BASE ?? 'https://keyshield-production.up.railway.app',
      ),
      'process.env.KEYSHIELD_PUBLIC_SYNC_URL': JSON.stringify(env.KEYSHIELD_PUBLIC_SYNC_URL ?? ''),
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
      // No manualChunks — the previous split lumped circularly-dependent
      // node_modules into different chunks, breaking module init order
      // (TDZ 'Cannot access X before initialization' in production).
      // Letting Rollup auto-split keeps circular partners in the same
      // chunk and respects evaluation order.
    },
  };
});
