import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, '');
  const target = process.env.HRMS_API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://127.0.0.1:3000';
  if (!/^https?:\/\//.test(target)) throw new Error('API_PROXY_TARGET must be an HTTP(S) URL');
  return {
  root: here,
  envDir: here,
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
    proxy: { '/api': target },
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  };
});
