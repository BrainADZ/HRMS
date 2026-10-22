import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiTarget = process.env.HRMS_API_PROXY_TARGET || 'http://127.0.0.1:3000';

if (!/^https?:\/\//.test(apiTarget)) {
  throw new Error('HRMS_API_PROXY_TARGET must be an HTTP(S) URL');
}

export default defineConfig({
  root: here,
  envDir: path.join(here, '..'),
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: { '/api': apiTarget },
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
