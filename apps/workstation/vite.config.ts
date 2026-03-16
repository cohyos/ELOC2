import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

function gitRevision(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return process.env.BUILD_REVISION || 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_REVISION__: JSON.stringify(gitRevision()),
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  test: {
    passWithNoTests: true,
  },
});
