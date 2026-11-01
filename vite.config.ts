import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const VERSION = String(Date.now());

export default defineConfig({
  // version.json: la página lo compara con su propia versión para recargarse si se publicó una nueva (src/nucleo/version.ts)
  plugins: [preact(), { name: 'version', apply: 'build', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: VERSION }) }); } }],
  define: { __VERSION__: JSON.stringify(VERSION) },
  base: './',
  server: { port: 5173, strictPort: true },
});
