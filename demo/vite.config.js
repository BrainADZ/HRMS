// Builds the claude.ai demo: the whole app, server included, as one page.
// Node built-ins and the Anthropic SDK are swapped for the browser versions
// in demo/shims. Run with `npm run build:demo`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const shim = (f) => path.join(here, 'shims', f);

export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  // The server reads settings from process.env at call time (for example,
  // whether Claude is on); point it at the object demo/shims/env.js creates.
  define: { 'process.env': 'globalThis.process.env' },
  resolve: {
    alias: [
      { find: /^(?:\.\.\/server\/|\.\.\/|\.\/)db\.js$/, replacement: shim('db.js') },
      { find: /^(node:)?fs\/promises$/, replacement: shim('fs-promises.js') },
      { find: /^(node:)?fs$/, replacement: shim('fs.js') },
      { find: /^(node:)?path$/, replacement: shim('path.js') },
      { find: /^(node:)?crypto$/, replacement: shim('crypto.js') },
      { find: /^@anthropic-ai\/sdk$/, replacement: shim('anthropic.js') },
      { find: /^\.\.\/services\/resume\.js$/, replacement: shim('resume.js') },
    ],
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    // The demo targets current browsers and includes an already-built WASM
    // runtime. Avoid retranspiling/minifying that runtime with esbuild.
    target: 'esnext',
    minify: false,
    reportCompressedSize: false,
    modulePreload: false,
    cssCodeSplit: false,
    // Inline binaries after bundling so esbuild never has to parse enormous
    // base64 WASM/data literals. inline.js still produces one standalone HTML.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 20000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
