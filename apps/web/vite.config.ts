import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the API is same-origin through this proxy, so cookies work without CORS fuss.
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
