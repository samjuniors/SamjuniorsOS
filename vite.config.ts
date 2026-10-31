import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'src/main.tsx', 'src/os/**/*.{ts,tsx}', 'src/sofia/**/*.{ts,tsx}'],
  },
  server: {
    port: 3000,
    watch: {
      ignored: ['**/old/**', '**/upload/**', '**/.agent/**', '**/.agents/**', '**/artifacts/**'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const nid = id.replace(/\\/g, '/');
          if (nid.includes('node_modules')) {
            if (nid.includes('/three/') || nid.includes('/@react-three/')) {
              return 'vendor-three';
            }
            if (nid.includes('/lucide-react/')) {
              return 'vendor-icons';
            }
            if (nid.includes('/@radix-ui/')) {
              return 'vendor-radix';
            }
            if (nid.includes('/recharts/') || nid.includes('/d3-')) {
              return 'vendor-charts';
            }
            if (nid.includes('/framer-motion/') || nid.includes('/motion/')) {
              return 'vendor-motion';
            }
            if (nid.includes('/react/') || nid.includes('/react-dom/') || nid.includes('/scheduler/')) {
              return 'vendor-react';
            }
          }
        },
      },
    },
  },
});
