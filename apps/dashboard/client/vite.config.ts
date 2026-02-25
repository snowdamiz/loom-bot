import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
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
