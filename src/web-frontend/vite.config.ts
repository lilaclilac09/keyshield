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
        'process.env.KEYSHIELD_API_URL':    JSON.stringify(env.KEYSHIELD_API_URL ?? 'http://localhost:8000'),
        'process.env.KEYSHIELD_PROGRAM_ID': JSON.stringify(env.KEYSHIELD_PROGRAM_ID ?? ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
