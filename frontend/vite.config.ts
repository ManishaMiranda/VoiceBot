import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves at /VoiceBot/ — set base to match repo name
  base: process.env.GITHUB_ACTIONS ? '/VoiceBot/' : '/',
  build: {
    sourcemap: false,
  },
  server: {
    // Dev proxy — forwards /api/* to local Lambda URLs or a deployed endpoint
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
