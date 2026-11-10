import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { openaiAuthPlugin } from './src/server/openaiAuthPlugin';

let buildGitSha = 'local';
let buildGitSummary = 'Local Studio Build';
try {
  buildGitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  buildGitSummary = execSync('git log -1 --format="%h • %s (%cr)"', { encoding: 'utf8' }).trim();
} catch {
  // ignore if git unavailable
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_GIT_SHA__: JSON.stringify(buildGitSha),
    __APP_GIT_SUMMARY__: JSON.stringify(buildGitSummary),
  },
  plugins: [react(), openaiAuthPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:8188',
        ws: true,
        changeOrigin: true,
        headers: {
          Origin: 'http://127.0.0.1:8188',
        },
      },
      '/api/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        headers: {
          Origin: 'http://127.0.0.1:11434',
        },
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
      },
      '/api/llamacpp': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llamacpp/, ''),
      },
      '/api/lmstudio': {
        target: 'http://127.0.0.1:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/lmstudio/, ''),
      },
      '/api/openai-proxy': {
        target: 'https://api.openai.com/v1',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/openai-proxy/, ''),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/') || id.includes('node_modules/@types/three/')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/mp4-muxer/')) {
            return 'vendor-muxer';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/zustand/')
          ) {
            return 'vendor-react';
          }
        },
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
