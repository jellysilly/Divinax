import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  // сборка без git
}

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 1500 },
  define: {
    __DX_VERSION__: JSON.stringify(pkg.version + (commit ? ' · ' + commit : '')),
  },
});
