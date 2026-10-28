import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; set BASE_PATH in CI.
  base: process.env.BASE_PATH || '/',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  test: { exclude: ['tests/e2e/**', 'node_modules/**'] },
});
