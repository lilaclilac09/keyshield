import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local dev: proxy /metrics → KeyShield backend to avoid CORS
      '/api/metrics': {
        target: process.env.VITE_METRICS_URL ?? 'http://localhost:8001',
        rewrite: (path) => path.replace(/^\/api\/metrics/, '/metrics'),
        changeOrigin: true,
      },
    },
  },
});
