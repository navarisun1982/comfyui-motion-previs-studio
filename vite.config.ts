import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api/comfy': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/comfy/, ''),
      },
      '/ws': {
        target: 'ws://127.0.0.1:8188',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    // Pure engine/math tests run in plain Node (fast). Files that need a DOM
    // opt in with a `// @vitest-environment jsdom` pragma on their first line.
    environment: 'node',
    setupFiles: [],
  },
});
