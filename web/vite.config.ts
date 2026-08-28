import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Windows may retain a handle on a previous static asset after server shutdown.
    // Content-hashed assets keep serving deterministic output without deleting runtime files.
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          exceljs: ['exceljs'],
          socket: ['socket.io-client'],
        },
      },
    },
  },
});
