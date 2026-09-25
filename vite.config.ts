import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for deployment (e.g. /NexusB2B/ on GitHub Pages); override with B2B_BASE.
  base: process.env.B2B_BASE || '/',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
});
