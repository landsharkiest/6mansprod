import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Overridable so the e2e harness can point the dev proxy at a throwaway API instance
// (port 3101, its own test database) without touching the checkout most people use on 3001.
const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the API is same-origin through this proxy, so cookies work without CORS fuss.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the two heaviest, page-scoped dependencies out of both the entry chunk and each
        // other's page chunk. recharts (DistributionChart/StatsPage) and framer-motion (HomePage)
        // each get their own chunk, fetched only by whichever lazy-loaded page imports them —
        // Home is the exception since it's eager and uses framer-motion directly, so that chunk
        // loads on first paint regardless, but it no longer bloats the main JS file itself.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // recharts alone pulls in victory-vendor (d3-*) and lodash, which together dwarf the
          // rest of the app — split those out from the "recharts" label itself so no single
          // chunk creeps past the 450 KB budget the bundle-size test enforces.
          if (id.includes('victory-vendor') || id.includes('d3-')) return 'vendor-d3';
          if (id.includes('lodash')) return 'vendor-lodash';
          if (id.includes('recharts')) return 'vendor-recharts';
          if (id.includes('framer-motion')) return 'vendor-framer-motion';
          return undefined;
        },
      },
    },
  },
});
