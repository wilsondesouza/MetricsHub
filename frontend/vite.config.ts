import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:7050';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // O frontend nunca chama o backend diretamente: mesma origem via proxy,
      // o que dispensa CORS em desenvolvimento e evita expor o token.
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    // O build é publicado em webapp/ na raiz do repositório: é o diretório que o
    // Flask serve em produção (uma única origem para API + SPA).
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
});
