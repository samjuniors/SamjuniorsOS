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
    entries: ['index.html', 'src/**/*.{ts,tsx}'],
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
  },
});
