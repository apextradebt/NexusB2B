/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

// Commit the app is built from, sent with the recognition feedback.
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
})();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_COMMIT__: JSON.stringify(commit) },
  // Base path for deployment (e.g. /NexusB2B/ on GitHub Pages); override with B2B_BASE.
  base: process.env.B2B_BASE || '/',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // training/ holds a Python venv, the base model and a llama.cpp checkout: not watched, not tested.
  server: {
    port: 5174,
    watch: { ignored: ['**/training/**'] },
  },
  test: {
    exclude: [...configDefaults.exclude, 'training/**'],
  },
});
