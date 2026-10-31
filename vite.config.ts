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
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('@react-three')) {
              return 'vendor-three';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }
            if (id.includes('react-dom') || id.includes('react/') || id.includes('scheduler')) {
              return 'vendor-react';
            }
          }
        },
      },
    },
  },
});
