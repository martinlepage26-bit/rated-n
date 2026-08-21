import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8788'
    }
  },
  build: {
    sourcemap: true
  },
  test: {
    include: ['worker/**/*.test.ts']
  }
});
