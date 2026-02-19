import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Keep SSE connections alive
            if (req.headers['accept'] === 'text/event-stream') {
              proxyReq.setHeader('Connection', 'Keep-Alive');
            }
          });
        },
      },
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
});
