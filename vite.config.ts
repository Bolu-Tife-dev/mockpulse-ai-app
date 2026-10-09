import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          monaco: ['monaco-editor'],
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['electron'],
  },
});
