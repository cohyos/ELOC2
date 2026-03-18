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

function buildTimestamp(): string {
  return process.env.BUILD_TIMESTAMP || new Date().toISOString();
}

function buildBranch(): string {
  if (process.env.BUILD_BRANCH) return process.env.BUILD_BRANCH;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_REVISION__: JSON.stringify(gitRevision()),
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp()),
    __BUILD_BRANCH__: JSON.stringify(buildBranch()),
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
