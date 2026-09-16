import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
 root: 'desktop', base: '/', publicDir: '../public',
 plugins: [react()],
 resolve: { alias: [
  { find: '@', replacement: path.resolve('.') },
  { find: /^studio$/, replacement: path.resolve('packages/studio/src/desktop.ts') },
  { find: '@heis/core', replacement: path.resolve('packages/core/src/index.ts') },
 ], dedupe: ['react', 'react-dom'] },
 build: { outDir: '../dist-desktop', emptyOutDir: true },
 server: { host: '127.0.0.1' },
});